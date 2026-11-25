package trust

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha3"
	"crypto/sha512"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/binary"
	"errors"
	"fmt"
	"maps"
	"math/big"
	"slices"
	"time"
	"unicode/utf16"
	"unicode/utf8"
)

// Verify answers "is this certificate real?" (D-23 law 1): the leaf's identity and role, or
// a *Refused with one cause from a closed set and the position in the chain where it was
// found (0 is the leaf). The checks run in the fixed order of verify.py, so both verifiers
// give the same cause for the same chain:
//
//  1. the chain's shape: 1 to 4 certificates presented, the anchor's root may be included;
//  2. the root: a certificate root of the anchor issued the last certificate presented;
//  3. the roles: each certificate's role follows from its issuer's role and its id's form;
//  4. the intermediates: each CA below the root is a hub intermediate the anchor lists;
//  5. the profile, root first, every field in Field order;
//  6. the signatures, root first;
//  7. the identities: each in the anchor's deployment and under its issuer's;
//  8. time, root first: not yet valid, expired, validity inside the issuer's, lifetime cap.
//
// now is the hub's clock, passed in (one clock); nothing here reads the system clock. An
// error that is not a *Refused means the inputs cannot be used (no time, an anchor whose
// certificates cannot be read), not that the chain was judged.
func Verify(leaf *x509.Certificate, intermediates []*x509.Certificate, anchor *Anchor, profile *Profile, now time.Time) (*Verified, error) {
	if now.IsZero() {
		return nil, errors.New("trust: the hub's time must be given (one clock)")
	}
	if leaf == nil || slices.Contains(intermediates, nil) {
		return nil, errors.New("trust: a certificate presented is nil")
	}
	if anchor == nil || profile == nil {
		return nil, errors.New("trust: no anchor or no profile")
	}
	rootRole, ok := profile.root()
	if !ok {
		return nil, errors.New("trust: the profile has no root role")
	}
	roots, err := anchor.RootCertificates()
	if err != nil {
		return nil, err
	}

	// 1. the chain's shape
	presented := append([]*x509.Certificate{leaf}, intermediates...)
	if len(presented) > 1 {
		last := presented[len(presented)-1]
		if slices.ContainsFunc(roots, func(r *x509.Certificate) bool { return bytes.Equal(last.Raw, r.Raw) }) {
			presented = presented[:len(presented)-1] // the root itself may be sent along; it is the anchor's
		}
	}
	if len(presented) < 1 || len(presented) > maxPresented-1 {
		return nil, refuse(CauseChain, 0, "%d certificates presented", len(presented))
	}

	// 2. the root
	last := presented[len(presented)-1]
	var root *x509.Certificate
	for _, candidate := range roots {
		if issuedBy(last, candidate) == nil {
			root = candidate
			break
		}
	}
	if root == nil {
		return nil, refuse(CauseNotInAnchor, len(presented), "no certificate root of the anchor issued it")
	}
	chain := make([]*certView, 0, len(presented)+1)
	for _, c := range presented {
		chain = append(chain, view(c))
	}
	chain = append(chain, view(root))
	top := len(chain) - 1

	// 3. the roles
	roles := make([]Role, len(chain))
	for i := range roles {
		roles[i] = rootRole
	}
	for i := top - 1; i >= 0; i-- {
		if chain[i].extErr != nil {
			// As Python's readable_extensions: a refusal naming the extensions, never a crash.
			return nil, &Refused{Cause: CauseProfile, Field: FieldExtensions, Position: i, Detail: "its extensions cannot be read: " + chain[i].extErr.Error()}
		}
		if !chain[i].hasID {
			return nil, &Refused{Cause: CauseProfile, Field: FieldSubjectAltName, Position: i, Detail: "not one URI name of a SPIFFE id"}
		}
		role, ok := profile.IssuedBy(roles[i+1], chain[i].id.Kind())
		if !ok {
			return nil, refuse(CauseChain, i, "%s issues no role for a %s id", roles[i+1].ID, chain[i].id.Kind())
		}
		roles[i] = role
	}

	// 4. the intermediates. The key must be listed, for the id's hub (as Python's step 4).
	listed, err := anchor.IntermediateKeys()
	if err != nil {
		return nil, err
	}
	for i := 1; i < top; i++ {
		hub, isListed := listed[string(chain[i].cert.RawSubjectPublicKeyInfo)]
		idHub, hasHub := chain[i].id.Hub()
		if !chain[i].hasID || !isListed || !hasHub || hub != idHub {
			return nil, refuse(CauseNotInAnchor, i, "the anchor does not list this intermediate's key")
		}
	}

	// 5. the profile
	for i := top; i >= 0; i-- {
		issuer := min(i+1, top)
		if r := checkCertificate(chain[i], roles[i], roles[issuer], chain[issuer], i); r != nil {
			return nil, r
		}
	}

	// 6. the signatures
	for i := top - 1; i >= 0; i-- {
		if err := issuedBy(chain[i].cert, chain[i+1].cert); err != nil {
			return nil, refuse(CauseSignature, i, "not signed by its issuer: %v", err)
		}
	}

	// 7. the identities
	for i := top; i >= 0; i-- {
		id, issuerID := chain[i].id, chain[min(i+1, top)].id
		if !chain[i].hasID || !chain[min(i+1, top)].hasID { // the profile check holds every id to its form
			return nil, fmt.Errorf("trust: certificate %d has no id after the profile check", i)
		}
		if id.Deployment() != anchor.Deployment {
			return nil, refuse(CauseIdentity, i, "%s is not in %s", id, anchor.Deployment)
		}
		if !id.IsUnder(issuerID) {
			return nil, refuse(CauseIdentity, i, "%s is not under its issuer %s", id, issuerID)
		}
	}

	// 8. time
	for i := top; i >= 0; i-- {
		c := chain[i].cert
		start, end := c.NotBefore, c.NotAfter
		if now.Before(start) {
			return nil, refuse(CauseNotYetValid, i, "valid from %s", start.Format(time.RFC3339))
		}
		if now.After(end) {
			return nil, refuse(CauseExpired, i, "expired %s", end.Format(time.RFC3339))
		}
		if i < top {
			issuer := chain[i+1].cert
			if start.Before(issuer.NotBefore) || end.After(issuer.NotAfter) {
				return nil, refuse(CauseNesting, i, "its validity is not inside its issuer's")
			}
		}
		limit, capped := anchor.Policy.Lifetimes[roles[i].ID]
		if !capped || longerThan(start, end, limit) {
			return nil, refuse(CauseLifetime, i, "lives longer than %s's cap", roles[i].ID)
		}
	}

	ids := make([]string, len(roles))
	for i, r := range roles {
		ids[i] = r.ID
	}
	return &Verified{Identity: chain[0].id, Role: roles[0].ID, Roles: ids}, nil
}

// maxPresented is the longest chain presented: leaf, intermediate and the root itself, with
// one to spare.
const maxPresented = 4

// Cause is why a certificate does not count: a closed set, the same in both verifiers.
type Cause string

const (
	CauseChain       Cause = "chain"
	CauseNotInAnchor Cause = "not-in-anchor"
	CauseProfile     Cause = "profile"
	CauseSignature   Cause = "signature"
	CauseIdentity    Cause = "identity"
	CauseNotYetValid Cause = "not-yet-valid"
	CauseExpired     Cause = "expired"
	CauseNesting     Cause = "validity-nesting"
	CauseLifetime    Cause = "lifetime"
)

// Field is a field of the profile, named by a profile refusal. They are checked in the
// order listed here.
type Field string

const (
	FieldVersion            Field = "version"
	FieldSerial             Field = "serial"
	FieldSignatureAlgorithm Field = "signature-algorithm"
	FieldCurve              Field = "curve"
	FieldExtensions         Field = "extensions"
	FieldBasicConstraints   Field = "basic-constraints"
	FieldKeyUsage           Field = "key-usage"
	FieldExtendedKeyUsage   Field = "extended-key-usage"
	FieldSubjectAltName     Field = "subject-alt-name"
	FieldSubject            Field = "subject"
	FieldKeyIdentifiers     Field = "key-identifiers"
)

// Refused is a certificate that does not count, with the cause, the profile field when the
// cause is the profile, the position in the chain (0 is the leaf) and a detail.
type Refused struct {
	Cause    Cause
	Field    Field
	Position int
	Detail   string
}

// Code is the cause as both verifiers write it: "profile/<field>" or the cause alone.
func (r *Refused) Code() string {
	if r.Field != "" {
		return string(r.Cause) + "/" + string(r.Field)
	}
	return string(r.Cause)
}

func (r *Refused) Error() string { return fmt.Sprintf("%s at %d: %s", r.Code(), r.Position, r.Detail) }

func refuse(cause Cause, position int, format string, args ...any) *Refused {
	return &Refused{Cause: cause, Position: position, Detail: fmt.Sprintf(format, args...)}
}

// Verified is a chain that counts: the leaf's identity and role, and every certificate's
// role from the leaf to the root.
type Verified struct {
	Identity SpiffeID
	Role     string
	Roles    []string
}

// root is the profile's root role, if it has one (NewProfile makes sure it has).
func (p *Profile) root() (Role, bool) {
	for _, r := range p.roles {
		if r.SelfSigned() {
			return r, true
		}
	}
	return Role{}, false
}

// issuedBy is cryptography's verify_directly_issued_by: the child names the parent's subject
// as its issuer, byte for byte, and the parent's key verifies the child's signature over
// its TBSCertificate. Not x509.Verify or CheckSignatureFrom: they add rules of their own.
//
// ECDSA is verified here, with exactly the hashes cryptography verifies it with: Go's
// CheckSignature lacks SHA-224 and SHA-3 and accepts SHA-1, which cryptography does not, so
// it would find a different root for such a chain (step 2) and give another cause. Every
// other algorithm goes to CheckSignature.
func issuedBy(child, parent *x509.Certificate) error {
	if !bytes.Equal(child.RawIssuer, parent.RawSubject) {
		return errors.New("its issuer is not the issuer's subject")
	}
	algorithm := signatureOID(child).String()
	if algorithm == oidECDSAWithSHA1 {
		return errors.New("ECDSA with SHA-1 is not verified")
	}
	if digest, isECDSA := ecdsaDigests[algorithm]; isECDSA {
		key, isEC := parent.PublicKey.(*ecdsa.PublicKey)
		if !isEC {
			return errors.New("the signature algorithm does not match the issuer's key")
		}
		if !ecdsa.VerifyASN1(key, digest(child.RawTBSCertificate), child.Signature) {
			return errors.New("the ECDSA signature does not verify")
		}
		return nil
	}
	return parent.CheckSignature(child.SignatureAlgorithm, child.RawTBSCertificate, child.Signature)
}

const oidECDSAWithSHA1 = "1.2.840.10045.4.1"

// ecdsaDigests are the ECDSA signature algorithms cryptography verifies, by OID.
var ecdsaDigests = map[string]func([]byte) []byte{
	"1.2.840.10045.4.3.1":     func(b []byte) []byte { s := sha256.Sum224(b); return s[:] },
	"1.2.840.10045.4.3.2":     func(b []byte) []byte { s := sha256.Sum256(b); return s[:] },
	"1.2.840.10045.4.3.3":     func(b []byte) []byte { s := sha512.Sum384(b); return s[:] },
	"1.2.840.10045.4.3.4":     func(b []byte) []byte { s := sha512.Sum512(b); return s[:] },
	"2.16.840.1.101.3.4.3.9":  func(b []byte) []byte { s := sha3.Sum224(b); return s[:] },
	"2.16.840.1.101.3.4.3.10": func(b []byte) []byte { s := sha3.Sum256(b); return s[:] },
	"2.16.840.1.101.3.4.3.11": func(b []byte) []byte { s := sha3.Sum384(b); return s[:] },
	"2.16.840.1.101.3.4.3.12": func(b []byte) []byte { s := sha3.Sum512(b); return s[:] },
}

// signatureOID is the certificate's outer signatureAlgorithm, as cryptography's
// signature_algorithm_oid reads it; nil when the DER cannot be read.
func signatureOID(c *x509.Certificate) asn1.ObjectIdentifier {
	var outer struct {
		TBS                asn1.RawValue
		SignatureAlgorithm pkix.AlgorithmIdentifier
		Signature          asn1.BitString
	}
	if unmarshalAll(c.Raw, &outer) != nil {
		return nil
	}
	return outer.SignatureAlgorithm.Algorithm
}

// longerThan reports whether end - start is more than the given number of seconds.
func longerThan(start, end time.Time, seconds int64) bool {
	secs := end.Unix() - start.Unix()
	nanos := end.Nanosecond() - start.Nanosecond()
	if nanos < 0 {
		secs--
		nanos += int(time.Second)
	}
	return secs > seconds || secs == seconds && nanos > 0
}

// ---------------------------------------------------------------------------
// The profile check
// ---------------------------------------------------------------------------

const (
	extSubjectKeyID       = "2.5.29.14"
	extKeyUsage           = "2.5.29.15"
	extSubjectAltName     = "2.5.29.17"
	extBasicConstraints   = "2.5.29.19"
	extAuthorityKeyID     = "2.5.29.35"
	extExtendedKeyUsage   = "2.5.29.37"
	generalNameURI        = 6
	ekuServerAuth         = "1.3.6.1.5.5.7.3.1"
	ekuClientAuth         = "1.3.6.1.5.5.7.3.2"
	asn1VisibleString     = 26
	asn1UniversalString   = 28
	asn1TagBoolean        = 0x01
	asn1TagInteger        = 0x02
	keyUsageKeyAgreement  = "key_agreement"
	keyUsageEncipherOnly  = 7
	keyUsageDecipherOnly  = 8
	keyUsageAlwaysVisible = 7 // bits 0 to 6 count by themselves; 7 and 8 only with key agreement
)

var (
	baseExtensions = []string{extBasicConstraints, extKeyUsage, extSubjectAltName, extSubjectKeyID, extAuthorityKeyID}
	signatureOIDs  = map[string]asn1.ObjectIdentifier{
		"sha256": {1, 2, 840, 10045, 4, 3, 2}, // ecdsa-with-SHA256
		"sha384": {1, 2, 840, 10045, 4, 3, 3}, // ecdsa-with-SHA384
	}
	ekuOIDs      = map[string]string{"server_auth": ekuServerAuth, "client_auth": ekuClientAuth}
	keyUsageBits = [...]string{
		"digital_signature", "content_commitment", "key_encipherment", "data_encipherment",
		keyUsageKeyAgreement, "key_cert_sign", "crl_sign", "encipher_only", "decipher_only",
	}
	curveNames = map[string]string{"P-224": "secp224r1", "P-256": "secp256r1", "P-384": "secp384r1", "P-521": "secp521r1"}

	oidOrganization       = asn1.ObjectIdentifier{2, 5, 4, 10}
	oidOrganizationalUnit = asn1.ObjectIdentifier{2, 5, 4, 11}
	oidCommonName         = asn1.ObjectIdentifier{2, 5, 4, 3}
)

// checkCertificate refuses a certificate that does not fit its role exactly, naming the
// first field in Field order. The root is checked with itself as issuer.
func checkCertificate(c *certView, role, issuerRole Role, issuer *certView, position int) *Refused {
	fail := func(field Field, format string, args ...any) *Refused {
		return &Refused{Cause: CauseProfile, Field: field, Position: position, Detail: role.ID + ": " + fmt.Sprintf(format, args...)}
	}
	if c.cert.Version != 3 {
		return fail(FieldVersion, "not an X.509 v3 certificate")
	}
	if serial := c.cert.SerialNumber; serial == nil || serial.Sign() <= 0 || serial.BitLen() > 159 {
		return fail(FieldSerial, "the serial is not a positive number of at most 20 bytes")
	}
	if want, known := signatureOIDs[issuerRole.SignsWith]; !known || !c.signatureAlgorithm.Equal(want) {
		return fail(FieldSignatureAlgorithm, "not signed with ECDSA-%s", issuerRole.SignsWith)
	}
	if key, isEC := c.cert.PublicKey.(*ecdsa.PublicKey); !isEC || key.Curve == nil || curveNames[key.Curve.Params().Name] != role.Curve {
		return fail(FieldCurve, "its key is not on %s", role.Curve)
	}
	if c.extErr != nil {
		return fail(FieldExtensions, "its extensions cannot be read: %v", c.extErr)
	}
	ext := c.ext
	expected := slices.Clone(baseExtensions)
	if len(role.ExtendedKeyUsage) > 0 {
		expected = append(expected, extExtendedKeyUsage)
	}
	if !sameMembers(ext.order, expected) {
		return fail(FieldExtensions, "its extensions are not exactly the role's")
	}

	bc := ext.basicConstraints
	if !ext.critical[extBasicConstraints] || bc.ca != role.CA || !samePathLength(bc.pathLength, role.PathLength) {
		return fail(FieldBasicConstraints, "basic constraints are not the role's, critical")
	}
	if !ext.critical[extKeyUsage] || !sameSet(ext.keyUsage, role.KeyUsage) {
		return fail(FieldKeyUsage, "key usage is not exactly the role's, critical")
	}
	if len(role.ExtendedKeyUsage) > 0 {
		if ext.critical[extExtendedKeyUsage] || !exactUsages(ext.extendedKeyUsage, role.ExtendedKeyUsage) {
			return fail(FieldExtendedKeyUsage, "extended key usage is not exactly the role's")
		}
	}
	if !ext.critical[extSubjectAltName] || !c.hasID || c.id.Kind() != role.Identity {
		return fail(FieldSubjectAltName, "not one critical URI name of a %s id", role.Identity)
	}
	if !subjectIs(c.cert.RawSubject, c.id.Deployment(), role.ID, c.id.Last()) {
		return fail(FieldSubject, "the subject is not the role's form")
	}
	own, issuers := keyIdentifier(c.keyBits), keyIdentifier(issuer.keyBits)
	aki := ext.authorityKeyID
	if own == nil || issuers == nil || !bytes.Equal(ext.subjectKeyID, own) ||
		!aki.hasKeyID || !bytes.Equal(aki.keyID, issuers) || aki.hasIssuer || aki.hasSerial {
		return fail(FieldKeyIdentifiers, "the key identifiers are not the keys' own")
	}
	return nil
}

// sameMembers reports whether present holds exactly the members of expected, each once.
func sameMembers(present, expected []string) bool {
	if len(present) != len(expected) {
		return false
	}
	seen := map[string]bool{}
	for _, oid := range present {
		if seen[oid] || !slices.Contains(expected, oid) {
			return false
		}
		seen[oid] = true
	}
	return true
}

func samePathLength(got *uint64, want *int) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *want >= 0 && *got == uint64(*want)
}

func sameSet(got map[string]bool, want []string) bool {
	set := map[string]bool{}
	for _, w := range want {
		set[w] = true
	}
	return maps.Equal(got, set)
}

// exactUsages reports whether the extended key usages are exactly the role's, none twice.
func exactUsages(got, names []string) bool {
	wanted := map[string]bool{}
	for _, name := range names {
		oid, known := ekuOIDs[name]
		if !known {
			return false
		}
		wanted[oid] = true
	}
	present := map[string]bool{}
	for _, oid := range got {
		present[oid] = true
	}
	return len(got) == len(wanted) && maps.Equal(present, wanted)
}

// keyIdentifier is the SHA-1 of the subjectPublicKey BIT STRING (RFC 5280 4.2.1.2 (1)),
// as cryptography's SubjectKeyIdentifier.from_public_key computes it.
func keyIdentifier(keyBits []byte) []byte {
	if keyBits == nil {
		return nil
	}
	sum := sha1.Sum(keyBits)
	return sum[:]
}

// subjectIs reports whether the subject is exactly O=<deployment>, OU=<role>, CN=<last>:
// three RDNs of one attribute each, in that order. Values compare as text whatever their
// string type, as cryptography's Name equality does.
func subjectIs(raw []byte, deployment, role, last string) bool {
	rdns, err := parseName(raw)
	if err != nil || len(rdns) != 3 {
		return false
	}
	want := []struct {
		oid   asn1.ObjectIdentifier
		value string
	}{{oidOrganization, deployment}, {oidOrganizationalUnit, role}, {oidCommonName, last}}
	for i, rdn := range rdns {
		if len(rdn) != 1 || !rdn[0].Type.Equal(want[i].oid) {
			return false
		}
		text, ok := nameText(rdn[0].Value)
		if !ok || text != want[i].value {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// What the verifier reads from a certificate, from its DER
// ---------------------------------------------------------------------------

// certView is what the verifier reads from one certificate, parsed once. Where Go's
// convenience fields and cryptography read a certificate differently, it reads the DER.
type certView struct {
	cert               *x509.Certificate
	signatureAlgorithm asn1.ObjectIdentifier // the outer signatureAlgorithm, as signature_algorithm_oid
	keyBits            []byte                // the subjectPublicKey BIT STRING
	ext                *extensions           // nil when the extensions cannot be read
	extErr             error
	id                 SpiffeID
	hasID              bool
}

func view(c *x509.Certificate) *certView {
	v := &certView{cert: c, signatureAlgorithm: signatureOID(c)}
	var spki struct {
		Algorithm pkix.AlgorithmIdentifier
		PublicKey asn1.BitString
	}
	if unmarshalAll(c.RawSubjectPublicKeyInfo, &spki) == nil {
		v.keyBits = spki.PublicKey.Bytes
	}
	v.ext, v.extErr = readExtensions(c.Extensions)
	v.id, v.hasID = spiffeID(v.ext)
	return v
}

// spiffeID is the certificate's one URI name as an id, as Python's spiffe_id: there is none
// when the extensions cannot be read (step 3 refuses that first, naming the extensions),
// when there is no subject alternative name, when it
// holds anything but exactly one URI, or when that URI is not an id.
func spiffeID(ext *extensions) (SpiffeID, bool) {
	if ext == nil {
		return SpiffeID{}, false
	}
	if _, present := ext.critical[extSubjectAltName]; !present {
		return SpiffeID{}, false
	}
	names := ext.subjectAltName
	if len(names) != 1 || names[0].tag != generalNameURI {
		return SpiffeID{}, false
	}
	id, err := ParseSpiffeID(string(names[0].value))
	return id, err == nil
}

// extensions are a certificate's extensions in order, with the profile's six parsed.
type extensions struct {
	order            []string
	critical         map[string]bool
	basicConstraints basicConstraints
	keyUsage         map[string]bool
	extendedKeyUsage []string
	subjectAltName   []generalName
	subjectKeyID     []byte
	authorityKeyID   authorityKeyID
}

// readExtensions reads the extensions as cryptography's Certificate.extensions does, and
// fails where it raises: an extension twice, or one of the profile's six that does not
// parse strictly as DER (nothing left over, no DEFAULT value encoded) or that its Python
// class refuses (a path length without cA, encipherOnly without keyAgreement, an
// authority's issuer without its serial, an x400Address or ediPartyName).
func readExtensions(list []pkix.Extension) (*extensions, error) {
	out := &extensions{critical: map[string]bool{}}
	for _, e := range list {
		oid := e.Id.String()
		if _, twice := out.critical[oid]; twice {
			return nil, fmt.Errorf("the extension %s appears twice", oid)
		}
		out.order = append(out.order, oid)
		out.critical[oid] = e.Critical
		var err error
		switch oid {
		case extBasicConstraints:
			out.basicConstraints, err = parseBasicConstraints(e.Value)
		case extKeyUsage:
			out.keyUsage, err = parseKeyUsage(e.Value)
		case extExtendedKeyUsage:
			out.extendedKeyUsage, err = parseExtendedKeyUsage(e.Value)
		case extSubjectAltName:
			out.subjectAltName, err = parseGeneralNames(e.Value)
		case extSubjectKeyID:
			err = unmarshalAll(e.Value, &out.subjectKeyID)
		case extAuthorityKeyID:
			out.authorityKeyID, err = parseAuthorityKeyID(e.Value)
		}
		if err != nil {
			return nil, fmt.Errorf("the extension %s: %w", oid, err)
		}
	}
	return out, nil
}

// unmarshalAll is asn1.Unmarshal with nothing left over, as rust-asn1's parse_single.
func unmarshalAll(der []byte, v any) error {
	rest, err := asn1.Unmarshal(der, v)
	if err != nil {
		return err
	}
	if len(rest) > 0 {
		return errors.New("trailing data")
	}
	return nil
}

// sequenceBody is the contents of the one SEQUENCE der holds.
func sequenceBody(der []byte) ([]byte, error) {
	var seq asn1.RawValue
	if err := unmarshalAll(der, &seq); err != nil {
		return nil, err
	}
	if seq.Class != asn1.ClassUniversal || seq.Tag != asn1.TagSequence || !seq.IsCompound {
		return nil, errors.New("not a SEQUENCE")
	}
	return seq.Bytes, nil
}

type basicConstraints struct {
	ca         bool
	pathLength *uint64
}

// parseBasicConstraints reads SEQUENCE { cA BOOLEAN DEFAULT FALSE, pathLenConstraint
// INTEGER (0..MAX) OPTIONAL }; cryptography refuses a path length without cA.
func parseBasicConstraints(der []byte) (basicConstraints, error) {
	var bc basicConstraints
	body, err := sequenceBody(der)
	if err != nil {
		return bc, err
	}
	if len(body) > 0 && body[0] == asn1TagBoolean {
		if body, err = asn1.Unmarshal(body, &bc.ca); err != nil {
			return bc, err
		}
		if !bc.ca {
			return bc, errors.New("cA FALSE, its DEFAULT, is encoded")
		}
	}
	if len(body) > 0 && body[0] == asn1TagInteger {
		var n *big.Int
		if body, err = asn1.Unmarshal(body, &n); err != nil {
			return bc, err
		}
		if n.Sign() < 0 || n.BitLen() > 64 {
			return bc, errors.New("the path length is not an unsigned 64-bit number")
		}
		u := n.Uint64()
		bc.pathLength = &u
	}
	if len(body) > 0 {
		return bc, errors.New("an unexpected element")
	}
	if bc.pathLength != nil && !bc.ca {
		return bc, errors.New("path_length must be None when ca is False")
	}
	return bc, nil
}

// parseKeyUsage reads the BIT STRING as cryptography's KeyUsage: bits 0 to 8 by name, and
// encipherOnly or decipherOnly only with keyAgreement (otherwise KeyUsage refuses it).
func parseKeyUsage(der []byte) (map[string]bool, error) {
	var bits asn1.BitString
	if err := unmarshalAll(der, &bits); err != nil {
		return nil, err
	}
	set := map[string]bool{}
	for i := 0; i < keyUsageAlwaysVisible; i++ {
		if bits.At(i) == 1 {
			set[keyUsageBits[i]] = true
		}
	}
	encipher, decipher := bits.At(keyUsageEncipherOnly) == 1, bits.At(keyUsageDecipherOnly) == 1
	if (encipher || decipher) && !set[keyUsageKeyAgreement] {
		return nil, errors.New("encipher_only and decipher_only can only be true when key_agreement is true")
	}
	if encipher {
		set[keyUsageBits[keyUsageEncipherOnly]] = true
	}
	if decipher {
		set[keyUsageBits[keyUsageDecipherOnly]] = true
	}
	return set, nil
}

func parseExtendedKeyUsage(der []byte) ([]string, error) {
	var oids []asn1.ObjectIdentifier
	if err := unmarshalAll(der, &oids); err != nil {
		return nil, err
	}
	out := make([]string, len(oids))
	for i, oid := range oids {
		out[i] = oid.String()
	}
	return out, nil
}

type authorityKeyID struct {
	keyID                          []byte
	hasKeyID, hasIssuer, hasSerial bool
}

// parseAuthorityKeyID reads SEQUENCE { [0] keyIdentifier OPTIONAL, [1] authorityCertIssuer
// OPTIONAL, [2] authorityCertSerialNumber OPTIONAL }; cryptography refuses one of the last
// two without the other.
func parseAuthorityKeyID(der []byte) (authorityKeyID, error) {
	var aki authorityKeyID
	body, err := sequenceBody(der)
	if err != nil {
		return aki, err
	}
	next := 0
	for len(body) > 0 {
		var el asn1.RawValue
		if body, err = asn1.Unmarshal(body, &el); err != nil {
			return aki, err
		}
		if el.Class != asn1.ClassContextSpecific || el.Tag < next || el.Tag > 2 {
			return aki, errors.New("an unexpected element")
		}
		next = el.Tag + 1
		switch el.Tag {
		case 0:
			if el.IsCompound {
				return aki, errors.New("the key identifier is not an OCTET STRING")
			}
			aki.keyID, aki.hasKeyID = el.Bytes, true
		case 1:
			if !el.IsCompound {
				return aki, errors.New("the authority's issuer is not a SEQUENCE")
			}
			if _, err := parseGeneralNameList(el.Bytes); err != nil {
				return aki, err
			}
			aki.hasIssuer = true
		case 2:
			if el.IsCompound || !isUnsignedInteger(el.Bytes) {
				return aki, errors.New("the authority's serial is not an unsigned INTEGER")
			}
			aki.hasSerial = true
		}
	}
	if aki.hasIssuer != aki.hasSerial {
		return aki, errors.New("authority_cert_issuer and authority_cert_serial_number must both be present or both None")
	}
	return aki, nil
}

// isUnsignedInteger reports whether b is the minimal content of a non-negative INTEGER.
func isUnsignedInteger(b []byte) bool {
	if len(b) == 0 {
		return false
	}
	if len(b) > 1 && (b[0] == 0 && b[1]&0x80 == 0 || b[0] == 0xff && b[1]&0x80 == 0x80) {
		return false
	}
	return b[0]&0x80 == 0
}

type generalName struct {
	tag   int
	value []byte
}

func parseGeneralNames(der []byte) ([]generalName, error) {
	body, err := sequenceBody(der)
	if err != nil {
		return nil, err
	}
	return parseGeneralNameList(body)
}

func parseGeneralNameList(body []byte) ([]generalName, error) {
	var names []generalName
	for len(body) > 0 {
		var gn asn1.RawValue
		var err error
		if body, err = asn1.Unmarshal(body, &gn); err != nil {
			return nil, err
		}
		if err := checkGeneralName(gn); err != nil {
			return nil, err
		}
		names = append(names, generalName{tag: gn.Tag, value: gn.Bytes})
	}
	return names, nil
}

// checkGeneralName refuses a GeneralName that cryptography cannot read.
func checkGeneralName(gn asn1.RawValue) error {
	if gn.Class != asn1.ClassContextSpecific {
		return errors.New("a general name of no known type")
	}
	switch gn.Tag {
	case 0: // otherName: type-id OBJECT IDENTIFIER, value [0] EXPLICIT ANY
		var typeID asn1.ObjectIdentifier
		rest, err := asn1.Unmarshal(gn.Bytes, &typeID)
		if !gn.IsCompound || err != nil {
			return errors.New("an otherName that does not parse")
		}
		var value, inner asn1.RawValue
		if unmarshalAll(rest, &value) != nil || value.Class != asn1.ClassContextSpecific || value.Tag != 0 ||
			!value.IsCompound || unmarshalAll(value.Bytes, &inner) != nil {
			return errors.New("an otherName that does not parse")
		}
	case 1, 2, generalNameURI: // rfc822Name, dNSName, uniformResourceIdentifier: IA5String
		if gn.IsCompound || !isASCII(gn.Bytes) {
			return errors.New("a name that is not an IA5String")
		}
	case 3, 5:
		return errors.New("x400Address/EDIPartyName are not supported types")
	case 4: // directoryName: [4] EXPLICIT Name
		if _, err := parseName(gn.Bytes); !gn.IsCompound || err != nil {
			return errors.New("a directoryName that does not parse")
		}
	case 7: // iPAddress
		if gn.IsCompound || len(gn.Bytes) != 4 && len(gn.Bytes) != 16 {
			return errors.New("an iPAddress that is not 4 or 16 bytes")
		}
	case 8: // registeredID
		full, err := asn1.Marshal(asn1.RawValue{Class: asn1.ClassUniversal, Tag: asn1.TagOID, Bytes: gn.Bytes})
		var oid asn1.ObjectIdentifier
		if gn.IsCompound || err != nil || unmarshalAll(full, &oid) != nil {
			return errors.New("a registeredID that is not an OBJECT IDENTIFIER")
		}
	default:
		return errors.New("a general name of no known type")
	}
	return nil
}

func isASCII(b []byte) bool {
	for _, c := range b {
		if c >= 0x80 {
			return false
		}
	}
	return true
}

type nameAttribute struct {
	Type  asn1.ObjectIdentifier
	Value asn1.RawValue
}

// nameAttributeSET is one relative distinguished name; encoding/asn1 reads a slice type
// whose name ends in SET as a SET OF.
type nameAttributeSET []nameAttribute

// parseName reads a Name (a SEQUENCE OF SET OF AttributeTypeAndValue) whose every value
// cryptography can read.
func parseName(der []byte) ([]nameAttributeSET, error) {
	var rdns []nameAttributeSET
	if err := unmarshalAll(der, &rdns); err != nil {
		return nil, err
	}
	for _, rdn := range rdns {
		if len(rdn) == 0 {
			return nil, errors.New("an empty relative distinguished name")
		}
		for _, a := range rdn {
			if _, ok := nameText(a.Value); !ok && !isBitString(a.Value) {
				return nil, errors.New("an attribute value that cannot be read")
			}
		}
	}
	return rdns, nil
}

func isBitString(v asn1.RawValue) bool {
	return v.Class == asn1.ClassUniversal && !v.IsCompound && v.Tag == asn1.TagBitString
}

// nameText is an attribute value as cryptography reads it: BMPString as UTF-16, Universal
// String as UTF-32, every other string, time or OCTET STRING type as UTF-8.
func nameText(v asn1.RawValue) (string, bool) {
	if v.Class != asn1.ClassUniversal || v.IsCompound {
		return "", false
	}
	switch v.Tag {
	case asn1.TagBMPString:
		if len(v.Bytes)%2 != 0 {
			return "", false
		}
		units := make([]uint16, len(v.Bytes)/2)
		for i := range units {
			units[i] = binary.BigEndian.Uint16(v.Bytes[2*i:])
		}
		for i := 0; i < len(units); i++ {
			switch {
			case units[i] >= 0xd800 && units[i] < 0xdc00: // a high surrogate needs a low one
				if i+1 >= len(units) || units[i+1] < 0xdc00 || units[i+1] >= 0xe000 {
					return "", false
				}
				i++
			case units[i] >= 0xdc00 && units[i] < 0xe000:
				return "", false
			}
		}
		return string(utf16.Decode(units)), true
	case asn1UniversalString:
		if len(v.Bytes)%4 != 0 {
			return "", false
		}
		runes := make([]rune, len(v.Bytes)/4)
		for i := range runes {
			r := binary.BigEndian.Uint32(v.Bytes[4*i:])
			if r > utf8.MaxRune || !utf8.ValidRune(rune(r)) {
				return "", false
			}
			runes[i] = rune(r)
		}
		return string(runes), true
	case asn1.TagOctetString, asn1.TagUTF8String, asn1.TagNumericString, asn1.TagPrintableString,
		asn1.TagT61String, asn1.TagIA5String, asn1.TagUTCTime, asn1.TagGeneralizedTime, asn1VisibleString:
		if !utf8.Valid(v.Bytes) {
			return "", false
		}
		return string(v.Bytes), true
	}
	return "", false
}
