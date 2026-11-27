package trust

import (
	"bytes"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"maps"
	"regexp"
	"slices"
	"strings"
)

// AnchorForm is the form an anchor document declares.
const AnchorForm = "forge-anchor/1"

// Stage is development, test or production: data on one framework, never a mode (D-21 SF-2).
type Stage string

const (
	StageDevelopment Stage = "development"
	StageTest        Stage = "test"
	StageProduction  Stage = "production"
)

// SecurityKeyType is the type of FIDO2 security key the deployment's authorities hold.
type SecurityKeyType string

const (
	SecurityKeyEd25519SK SecurityKeyType = "ed25519-sk"
	SecurityKeyECDSASK   SecurityKeyType = "ecdsa-sk"
)

var (
	pemPattern     = regexp.MustCompile(`^-----BEGIN [A-Z ]+-----\n[A-Za-z0-9+/=\n]+-----END [A-Z ]+-----\n?$`)
	fidoKeyPattern = regexp.MustCompile(`^sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com [A-Za-z0-9+/=]+( .*)?$`)
	hashPattern    = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

// keyRule says whether a JSON key must be present and whether it may be null.
type keyRule uint8

const (
	required keyRule = 1 << iota
	nullable
)

// decodeStrict decodes one JSON object into v the way the Python model reads it with
// extra="forbid": every key is one of keys, exactly as spelled (encoding/json alone would
// match a key in any case), every required key is present, and no key is null unless it
// may be. The values are then decoded with unknown fields disallowed, so a number is never
// a string, a boolean never a number.
func decodeStrict(what string, data []byte, v any, keys map[string]keyRule) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil || raw == nil {
		return fmt.Errorf("%s: not a JSON object", what)
	}
	for _, k := range slices.Sorted(maps.Keys(raw)) {
		rule, known := keys[k]
		if !known {
			return fmt.Errorf("%s: unknown field %q", what, k)
		}
		if rule&nullable == 0 && bytes.Equal(bytes.TrimSpace(raw[k]), []byte("null")) {
			return fmt.Errorf("%s: %s is null", what, k)
		}
	}
	for _, k := range slices.Sorted(maps.Keys(keys)) {
		if _, ok := raw[k]; !ok && keys[k]&required != 0 {
			return fmt.Errorf("%s: %s is missing", what, k)
		}
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("%s: %w", what, err)
	}
	return nil
}

func checkPEM(what, value string) error {
	if !pemPattern.MatchString(value) {
		return fmt.Errorf("%s is not one PEM block", what)
	}
	return nil
}

func checkName(what, value string) error {
	if !isName(value) {
		return fmt.Errorf("%s %q is not a name (a-z, 0-9, inner hyphens, 1-63)", what, value)
	}
	return nil
}

// FidoCredential is an authority's FIDO2 credential (D-20 SG-1, SG-9).
type FidoCredential struct {
	ID        string `json:"id"`
	PublicKey string `json:"public_key"`
	Device    string `json:"device"`
}

func (f *FidoCredential) UnmarshalJSON(data []byte) error {
	type plain FidoCredential
	keys := map[string]keyRule{"id": required, "public_key": required, "device": required}
	if err := decodeStrict("FIDO credential", data, (*plain)(f), keys); err != nil {
		return err
	}
	if err := checkName("FIDO credential id", f.ID); err != nil {
		return err
	}
	if !fidoKeyPattern.MatchString(f.PublicKey) {
		return fmt.Errorf("FIDO credential %s: its public key is not an OpenSSH security key", f.ID)
	}
	if f.Device == "" {
		return fmt.Errorf("FIDO credential %s: no device", f.ID)
	}
	return nil
}

// CertificateRoot is a certificate root and its device's attestation chain, attestation
// certificate first.
type CertificateRoot struct {
	ID          string   `json:"id"`
	Certificate string   `json:"certificate"`
	Attestation []string `json:"attestation"`
}

func (r *CertificateRoot) UnmarshalJSON(data []byte) error {
	type plain CertificateRoot
	keys := map[string]keyRule{"id": required, "certificate": required, "attestation": required}
	if err := decodeStrict("certificate root", data, (*plain)(r), keys); err != nil {
		return err
	}
	if err := checkName("certificate root id", r.ID); err != nil {
		return err
	}
	if err := checkPEM("certificate root "+r.ID, r.Certificate); err != nil {
		return err
	}
	if len(r.Attestation) == 0 {
		return fmt.Errorf("certificate root %s: no attestation", r.ID)
	}
	for _, a := range r.Attestation {
		if err := checkPEM("certificate root "+r.ID+": an attestation certificate", a); err != nil {
			return err
		}
	}
	return nil
}

// HubIntermediate is a hub intermediate that counts: the anchor lists it for its hub.
type HubIntermediate struct {
	Hub         string `json:"hub"`
	Certificate string `json:"certificate"`
}

func (h *HubIntermediate) UnmarshalJSON(data []byte) error {
	type plain HubIntermediate
	keys := map[string]keyRule{"hub": required, "certificate": required}
	if err := decodeStrict("hub intermediate", data, (*plain)(h), keys); err != nil {
		return err
	}
	if err := checkName("hub intermediate's hub", h.Hub); err != nil {
		return err
	}
	return checkPEM("hub intermediate "+h.Hub, h.Certificate)
}

// Policy is the anchor's policy: the profile's hash, each role's lifetime cap in seconds,
// the security-key type, how many intermediates a hub keeps, and whether separation of
// duties is met.
type Policy struct {
	Profile             string           `json:"profile"`
	Lifetimes           map[string]int64 `json:"lifetimes"`
	SecurityKeyType     SecurityKeyType  `json:"security_key_type"`
	IntermediatesPerHub int              `json:"intermediates_per_hub"`
	SeparationOfDuties  bool             `json:"separation_of_duties"`
}

func (p *Policy) UnmarshalJSON(data []byte) error {
	type plain Policy
	keys := map[string]keyRule{
		"profile": required, "lifetimes": required, "security_key_type": required,
		"intermediates_per_hub": required, "separation_of_duties": required,
	}
	if err := decodeStrict("policy", data, (*plain)(p), keys); err != nil {
		return err
	}
	if !hashPattern.MatchString(p.Profile) {
		return errors.New("policy: the profile is not a SHA-256 hash in hex")
	}
	for _, role := range slices.Sorted(maps.Keys(p.Lifetimes)) {
		if err := checkName("policy: lifetime role", role); err != nil {
			return err
		}
		if p.Lifetimes[role] <= 0 {
			return fmt.Errorf("policy: the lifetime cap of %s is not positive", role)
		}
	}
	switch p.SecurityKeyType {
	case SecurityKeyEd25519SK, SecurityKeyECDSASK:
	default:
		return fmt.Errorf("policy: an unknown security key type %q", p.SecurityKeyType)
	}
	if p.IntermediatesPerHub < 1 {
		return errors.New("policy: a hub keeps at least one intermediate")
	}
	return nil
}

// Anchor is a deployment's trust anchor (D-21 SF-21, D-23 T-1, T-7), the form of
// forge_core.trust.anchor.Anchor. DecodeAnchor reads one; which version counts is the
// hub's decision (law 3), not this package's.
type Anchor struct {
	Form                 string            `json:"form"`
	Deployment           string            `json:"deployment"`
	Version              int               `json:"version"`
	Stage                Stage             `json:"stage"`
	RootKeys             []FidoCredential  `json:"root_keys"`
	RootThreshold        int               `json:"root_threshold"`
	ReleaseKeys          []FidoCredential  `json:"release_keys"`
	CertificateRoots     []CertificateRoot `json:"certificate_roots"`
	HubIntermediates     []HubIntermediate `json:"hub_intermediates"`
	DistributionKey      string            `json:"distribution_key"`
	FreshnessKeys        []string          `json:"freshness_keys"`
	TestAttestationRoots []string          `json:"test_attestation_roots"`
	Policy               Policy            `json:"policy"`
}

var anchorKeys = map[string]keyRule{
	"form": required, "deployment": required, "version": required, "stage": required,
	"root_keys": required, "root_threshold": required, "release_keys": required,
	"certificate_roots": required, "hub_intermediates": required, "distribution_key": required,
	"freshness_keys": required, "test_attestation_roots": 0, "policy": required,
}

func (a *Anchor) UnmarshalJSON(data []byte) error {
	type plain Anchor
	if err := decodeStrict("anchor", data, (*plain)(a), anchorKeys); err != nil {
		return err
	}
	return a.check()
}

// check holds the anchor to its fields' constraints, then to the model's own rules.
func (a *Anchor) check() error {
	if a.Form != AnchorForm {
		return fmt.Errorf("anchor: the form %q is not %s", a.Form, AnchorForm)
	}
	if err := checkName("anchor: deployment", a.Deployment); err != nil {
		return err
	}
	if a.Version < 1 {
		return errors.New("anchor: the version is not positive")
	}
	switch a.Stage {
	case StageDevelopment, StageTest, StageProduction:
	default:
		return fmt.Errorf("anchor: an unknown stage %q", a.Stage)
	}
	if len(a.RootKeys) == 0 {
		return errors.New("anchor: no root key")
	}
	if a.RootThreshold < 1 {
		return errors.New("anchor: the root threshold is not positive")
	}
	if len(a.CertificateRoots) == 0 {
		return errors.New("anchor: no certificate root")
	}
	if err := checkPEM("anchor: the distribution key", a.DistributionKey); err != nil {
		return err
	}
	// One or two freshness keys, each its own device's (D-21 §14 FR-2 as amended by D-24 Q-7).
	if len(a.FreshnessKeys) < 1 || len(a.FreshnessKeys) > 2 {
		return fmt.Errorf("anchor: %d freshness keys; one or two", len(a.FreshnessKeys))
	}
	for _, key := range a.FreshnessKeys {
		if err := checkPEM("anchor: a freshness key", key); err != nil {
			return err
		}
	}
	if a.Stage == StageProduction && len(a.FreshnessKeys) != 2 {
		return errors.New("anchor: a production anchor holds two freshness keys, one per device (D-24 Q-7)")
	}
	for _, root := range a.TestAttestationRoots {
		if err := checkPEM("anchor: a test attestation root", root); err != nil {
			return err
		}
	}

	if a.RootThreshold > len(a.RootKeys) {
		return fmt.Errorf("anchor: a threshold of %d from %d root keys", a.RootThreshold, len(a.RootKeys))
	}
	ids := func(n int, id func(int) string) []string {
		out := make([]string, n)
		for i := range out {
			out[i] = id(i)
		}
		return out
	}
	for _, group := range []struct {
		label string
		ids   []string
	}{
		{"root key", ids(len(a.RootKeys), func(i int) string { return a.RootKeys[i].ID })},
		{"release key", ids(len(a.ReleaseKeys), func(i int) string { return a.ReleaseKeys[i].ID })},
		{"certificate root", ids(len(a.CertificateRoots), func(i int) string { return a.CertificateRoots[i].ID })},
	} {
		seen := map[string]bool{}
		for _, id := range group.ids {
			if seen[id] {
				return fmt.Errorf("anchor: a %s id is listed twice", group.label)
			}
			seen[id] = true
		}
	}
	keyOf := func(f FidoCredential) string { return strings.Fields(f.PublicKey)[1] }
	rootKeys := map[string]bool{}
	for _, k := range a.RootKeys {
		rootKeys[keyOf(k)] = true
	}
	for _, k := range a.ReleaseKeys {
		if rootKeys[keyOf(k)] {
			return errors.New("anchor: a key is both a root key and a release key (D-20 SG-1 keeps them apart)")
		}
	}
	if a.Stage == StageProduction && len(a.TestAttestationRoots) > 0 {
		return errors.New("anchor: a production anchor holds no test attestation root (D-21 SF-2)")
	}
	return a.keysOnce()
}

// DecodeAnchor reads an anchor document strictly: no field the form does not have, every
// required field present, every value of its declared type and within its constraints.
func DecodeAnchor(data []byte) (*Anchor, error) {
	var a Anchor
	if err := json.Unmarshal(data, &a); err != nil {
		return nil, fmt.Errorf("trust: the anchor is malformed: %w", err)
	}
	return &a, nil
}

// parseCertificatePEM reads the first CERTIFICATE (or X509 CERTIFICATE) block in text,
// as cryptography's load_pem_x509_certificate does.
func parseCertificatePEM(text string) (*x509.Certificate, error) {
	rest := []byte(text)
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			return nil, errors.New("no BEGIN CERTIFICATE block")
		}
		if block.Type == "CERTIFICATE" || block.Type == "X509 CERTIFICATE" {
			return x509.ParseCertificate(block.Bytes)
		}
	}
}

// RootCertificates are the anchor's certificate roots, in the anchor's order.
func (a *Anchor) RootCertificates() ([]*x509.Certificate, error) {
	out := make([]*x509.Certificate, 0, len(a.CertificateRoots))
	for _, r := range a.CertificateRoots {
		c, err := parseCertificatePEM(r.Certificate)
		if err != nil {
			return nil, fmt.Errorf("trust: certificate root %s cannot be read: %w", r.ID, err)
		}
		out = append(out, c)
	}
	return out, nil
}

// IntermediateKeys maps each listed hub intermediate's key (its DER SubjectPublicKeyInfo,
// as a string) to its hub. No key is listed twice: such an anchor cannot be decoded (keysOnce).
func (a *Anchor) IntermediateKeys() (map[string]string, error) {
	out := make(map[string]string, len(a.HubIntermediates))
	for _, h := range a.HubIntermediates {
		c, err := parseCertificatePEM(h.Certificate)
		if err != nil {
			return nil, fmt.Errorf("trust: hub intermediate %s cannot be read: %w", h.Hub, err)
		}
		out[string(c.RawSubjectPublicKeyInfo)] = h.Hub
	}
	return out, nil
}
