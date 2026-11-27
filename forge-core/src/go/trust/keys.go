package trust

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"
	"slices"
	"strings"
	"time"
)

// The keys the trust root admits, and the one way each is written (FB-317), as
// forge_core.trust.keys in Python: an ECDSA key on one of profileCurves, as one PEM block
// with its label, base64 in its one spelling, and the SubjectPublicKeyInfo a device exports
// (the named curve, the uncompressed point). The check reads the key, writes it again and
// requires the same bytes, so two spellings of one key cannot both count and the two
// languages, whose parsers disagree on what else is a key, give one answer. Line breaks are
// free. Adding a key type is a new form of the anchor.

var admitted = "an ECDSA key on " + strings.Join(profileCurves, " or ")

// What each refusal says, the same words as Python.
var (
	notBase64       = "is not base64 in its one spelling"
	notAKey         = "is not " + admitted + " in its one encoding"
	notACertificate = "is not a certificate with " + admitted + " in its one encoding"
	keyTwice        = "one key is listed twice"
)

func notLabelled(label string) string { return "is not one PEM block labelled " + label }

// derOf is the bytes of one PEM block labelled label, written in base64's one spelling.
func derOf(text, label string) ([]byte, error) {
	lines := strings.Split(strings.TrimSuffix(text, "\n"), "\n")
	if len(lines) < 3 || lines[0] != "-----BEGIN "+label+"-----" || lines[len(lines)-1] != "-----END "+label+"-----" {
		return nil, errors.New(notLabelled(label))
	}
	der, err := base64.StdEncoding.Strict().DecodeString(strings.Join(lines[1:len(lines)-1], ""))
	if err != nil {
		return nil, errors.New(notBase64)
	}
	return der, nil
}

// canonical is an admitted key's one encoding; nil for any other key.
func canonical(key any) []byte {
	k, ok := key.(*ecdsa.PublicKey)
	if !ok || !slices.Contains(profileCurves, curveNames[k.Curve.Params().Name]) {
		return nil
	}
	der, err := x509.MarshalPKIXPublicKey(k)
	if err != nil {
		return nil
	}
	return der
}

// publicKeyDER is the one encoding of the admitted public key text holds.
func publicKeyDER(text string) ([]byte, error) {
	der, err := derOf(text, "PUBLIC KEY")
	if err != nil {
		return nil, err
	}
	key, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		return nil, errors.New(notAKey)
	}
	if again := canonical(key); again == nil || !bytes.Equal(again, der) {
		return nil, errors.New(notAKey)
	}
	return der, nil
}

// certificateShell is a certificate's structure and no more: enough to find the key it
// carries. x509.ParseCertificate also holds a certificate to rules that are the profile's to
// check (a key identifier marked critical, a name it cannot read), which Python's loader does
// not, so reading the anchor with it would refuse anchors Python builds.
type certificateShell struct {
	Raw asn1.RawContent
	TBS struct {
		Raw                asn1.RawContent
		Version            int `asn1:"optional,explicit,default:0,tag:0"`
		SerialNumber       *big.Int
		SignatureAlgorithm pkix.AlgorithmIdentifier
		Issuer             asn1.RawValue
		Validity           struct{ NotBefore, NotAfter time.Time }
		Subject            asn1.RawValue
		PublicKey          struct {
			Raw       asn1.RawContent
			Algorithm pkix.AlgorithmIdentifier
			PublicKey asn1.BitString
		}
		IssuerUniqueID  asn1.BitString   `asn1:"optional,tag:1"`
		SubjectUniqueID asn1.BitString   `asn1:"optional,tag:2"`
		Extensions      []pkix.Extension `asn1:"omitempty,optional,explicit,tag:3"`
	}
	SignatureAlgorithm pkix.AlgorithmIdentifier
	Signature          asn1.BitString
}

// certificateKeyDER is the one encoding of the admitted key the certificate text carries.
// The certificate must carry it in that encoding. Only the certificate's structure and its
// key are read here; whether it fits its role is the profile's check (checkCertificate).
func certificateKeyDER(text string) ([]byte, error) {
	der, err := derOf(text, "CERTIFICATE")
	if err != nil {
		return nil, err
	}
	var shell certificateShell
	if unmarshalAll(der, &shell) != nil {
		return nil, errors.New(notACertificate)
	}
	carried := []byte(shell.TBS.PublicKey.Raw)
	key, err := x509.ParsePKIXPublicKey(carried)
	if err != nil {
		return nil, errors.New(notACertificate)
	}
	if again := canonical(key); again == nil || !bytes.Equal(again, carried) {
		return nil, errors.New(notACertificate)
	}
	return carried, nil
}

// keysOnce holds every key the anchor names to an admitted key in its one encoding, and
// refuses a key named twice, in one role or in two: one device's key cannot stand for two
// certificate roots, two hubs' intermediates, or a freshness key and anything else (D-21
// FR-2: the freshness key signs nothing else).
func (a *Anchor) keysOnce() error {
	type slot struct {
		name string
		read func(string) ([]byte, error)
		text string
	}
	var slots []slot
	for _, r := range a.CertificateRoots {
		slots = append(slots, slot{"certificate root " + r.ID, certificateKeyDER, r.Certificate})
	}
	for n, h := range a.HubIntermediates {
		slots = append(slots, slot{fmt.Sprintf("hub intermediate %d (%s)", n+1, h.Hub), certificateKeyDER, h.Certificate})
	}
	slots = append(slots, slot{"the distribution key", publicKeyDER, a.DistributionKey})
	for n, k := range a.FreshnessKeys {
		slots = append(slots, slot{fmt.Sprintf("freshness key %d", n+1), publicKeyDER, k})
	}
	named := map[string]string{}
	for _, s := range slots {
		key, err := s.read(s.text)
		if err != nil {
			return fmt.Errorf("anchor: %s %w", s.name, err)
		}
		if first, twice := named[string(key)]; twice {
			return fmt.Errorf("anchor: %s: %s and %s", keyTwice, first, s.name)
		}
		named[string(key)] = s.name
	}
	return nil
}
