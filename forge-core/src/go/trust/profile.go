package trust

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// Role is one role of certificate in the profile, the governed list certificate-roles
// (D-23 T-4): who issues it, the form of its id, whether it is a CA and its path length,
// exactly which key usages and extended key usages it carries, its curve, and the hash its
// key signs with. Lifetimes are not here: the anchor's policy caps them.
type Role struct {
	ID               string
	Description      string
	IssuedBy         string
	Identity         Identity
	CA               bool
	PathLength       *int     // nil for a leaf
	KeyUsage         []string // the profile's names: digital_signature, key_cert_sign, crl_sign
	ExtendedKeyUsage []string // server_auth, client_auth; empty means the extension is absent
	Curve            string   // secp256r1 or secp384r1
	SignsWith        string   // sha256 or sha384; empty for a role that signs nothing
}

// SelfSigned reports whether the role signs itself: the certificate root.
func (r Role) SelfSigned() bool { return r.IssuedBy == r.ID }

// Profile is the roles, in the list's order, and the hash of the list they were read from
// (the anchor's policy pins it).
type Profile struct {
	roles []Role
	hash  string
}

// The closed sets the list's schema (certificateRole) allows.
var (
	profileKeyUsages = []string{"digital_signature", "key_cert_sign", "crl_sign"}
	profileEKUs      = []string{"server_auth", "client_auth"}
	profileCurves    = []string{"secp256r1", "secp384r1"}
	profileHashes    = []string{"sha256", "sha384"}
)

// roleEntry is one entry of the list as written, before it is checked.
type roleEntry struct {
	ID               string   `json:"id"`
	Description      string   `json:"description"`
	IssuedBy         string   `json:"issued_by"`
	Identity         Identity `json:"identity"`
	CA               bool     `json:"ca"`
	PathLength       *int     `json:"path_length"`
	KeyUsage         []string `json:"key_usage"`
	ExtendedKeyUsage []string `json:"extended_key_usage"`
	Curve            string   `json:"curve"`
	SignsWith        *string  `json:"signs_with"`
}

var roleEntryKeys = map[string]keyRule{
	"id": required, "description": required, "issued_by": required, "identity": required,
	"ca": required, "path_length": required | nullable, "key_usage": required,
	"extended_key_usage": required, "curve": required, "signs_with": required | nullable,
}

func (e *roleEntry) UnmarshalJSON(data []byte) error {
	type plain roleEntry
	return decodeStrict("certificate role", data, (*plain)(e), roleEntryKeys)
}

// DecodeProfile reads the list's entries (a JSON array, every field required and no other)
// and makes the profile from them.
func DecodeProfile(entries []byte, hash string) (*Profile, error) {
	var list []roleEntry
	if err := json.Unmarshal(entries, &list); err != nil {
		return nil, fmt.Errorf("trust: the profile cannot be read: %w", err)
	}
	if list == nil {
		return nil, fmt.Errorf("trust: the profile is not a list of roles")
	}
	roles := make([]Role, 0, len(list))
	for _, e := range list {
		role := Role{
			ID: e.ID, Description: e.Description, IssuedBy: e.IssuedBy, Identity: e.Identity,
			CA: e.CA, PathLength: e.PathLength, KeyUsage: e.KeyUsage,
			ExtendedKeyUsage: e.ExtendedKeyUsage, Curve: e.Curve,
		}
		if e.SignsWith != nil {
			role.SignsWith = *e.SignsWith
			if role.SignsWith == "" {
				return nil, fmt.Errorf("trust: the profile cannot be used: %s: signs_with is empty", e.ID)
			}
		}
		roles = append(roles, role)
	}
	return NewProfile(roles, hash)
}

// NewProfile makes the profile, or refuses it naming every problem: the shape the list's
// schema gives a role, and the graph of roles (forge_core.trust.profile.role_problems).
func NewProfile(roles []Role, hash string) (*Profile, error) {
	if problems := profileProblems(roles); len(problems) > 0 {
		return nil, fmt.Errorf("trust: the profile cannot be used: %s", strings.Join(problems, "; "))
	}
	own := make([]Role, len(roles))
	for i, r := range roles {
		r.KeyUsage = slices.Clone(r.KeyUsage)
		r.ExtendedKeyUsage = slices.Clone(r.ExtendedKeyUsage)
		if r.PathLength != nil {
			n := *r.PathLength
			r.PathLength = &n
		}
		own[i] = r
	}
	return &Profile{roles: own, hash: hash}, nil
}

func isRoleID(s string) bool {
	if s == "" || s[0] < 'a' || s[0] > 'z' {
		return false
	}
	for i := 1; i < len(s); i++ {
		if c := s[i]; !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}

// closedSet names what is wrong with a list of values that must be unique members of allowed.
func closedSet(role, field string, values, allowed []string) []string {
	var problems []string
	seen := map[string]bool{}
	for _, v := range values {
		if !slices.Contains(allowed, v) {
			problems = append(problems, fmt.Sprintf("%s: %s %q is not one of %v", role, field, v, allowed))
		}
		if seen[v] {
			problems = append(problems, fmt.Sprintf("%s: %s lists %q twice", role, field, v))
		}
		seen[v] = true
	}
	return problems
}

func profileProblems(roles []Role) []string {
	var problems []string
	// The shape (the schema's certificateRole).
	for _, r := range roles {
		if !isRoleID(r.ID) {
			problems = append(problems, fmt.Sprintf("%q is not a role id", r.ID))
		}
		if r.Description == "" {
			problems = append(problems, fmt.Sprintf("%s: no description", r.ID))
		}
		if !isRoleID(r.IssuedBy) {
			problems = append(problems, fmt.Sprintf("%s: issued_by %q is not a role id", r.ID, r.IssuedBy))
		}
		if _, ok := identityDepth[r.Identity]; !ok {
			problems = append(problems, fmt.Sprintf("%s: an unknown identity form %q", r.ID, r.Identity))
		}
		if r.PathLength != nil && *r.PathLength < 0 {
			problems = append(problems, fmt.Sprintf("%s: a negative path length", r.ID))
		}
		if len(r.KeyUsage) == 0 {
			problems = append(problems, fmt.Sprintf("%s: no key usage", r.ID))
		}
		problems = append(problems, closedSet(r.ID, "key usage", r.KeyUsage, profileKeyUsages)...)
		problems = append(problems, closedSet(r.ID, "extended key usage", r.ExtendedKeyUsage, profileEKUs)...)
		if !slices.Contains(profileCurves, r.Curve) {
			problems = append(problems, fmt.Sprintf("%s: an unknown curve %q", r.ID, r.Curve))
		}
		if r.SignsWith != "" && !slices.Contains(profileHashes, r.SignsWith) {
			problems = append(problems, fmt.Sprintf("%s: an unknown hash %q", r.ID, r.SignsWith))
		}
	}
	// The graph (role_problems).
	byID := map[string]Role{}
	var order []string
	for _, r := range roles {
		if _, twice := byID[r.ID]; twice {
			problems = append(problems, fmt.Sprintf("%s: listed twice", r.ID))
		} else {
			order = append(order, r.ID)
		}
		byID[r.ID] = r
	}
	var roots []string
	for _, id := range order {
		if byID[id].SelfSigned() {
			roots = append(roots, id)
		}
	}
	if len(roots) != 1 {
		problems = append(problems, fmt.Sprintf("exactly one role signs itself (the certificate root); found %v", roots))
	}
	type issuerForm struct {
		issuer   string
		identity Identity
	}
	seen := map[issuerForm]bool{}
	for _, id := range order {
		r := byID[id]
		if r.CA && r.PathLength == nil {
			problems = append(problems, fmt.Sprintf("%s: a CA role states its path length", id))
		}
		if !r.CA && r.PathLength != nil {
			problems = append(problems, fmt.Sprintf("%s: a leaf role has no path length", id))
		}
		if r.CA != slices.Contains(r.KeyUsage, "key_cert_sign") {
			problems = append(problems, fmt.Sprintf("%s: a role signs certificates if and only if it is a CA", id))
		}
		if r.CA != (r.SignsWith != "") {
			problems = append(problems, fmt.Sprintf("%s: a CA role names the hash it signs with; a leaf none", id))
		}
		issuer, ok := byID[r.IssuedBy]
		if !ok {
			problems = append(problems, fmt.Sprintf("%s: issued by the unknown role %q", id, r.IssuedBy))
			continue
		}
		if r.SelfSigned() {
			continue
		}
		if !issuer.CA {
			problems = append(problems, fmt.Sprintf("%s: its issuer %s is not a CA role", id, issuer.ID))
		} else if r.CA && r.PathLength != nil && issuer.PathLength != nil && *r.PathLength >= *issuer.PathLength {
			problems = append(problems, fmt.Sprintf("%s: its path length is not below its issuer's", id))
		}
		depth, known := identityDepth[r.Identity]
		issuerDepth, issuerKnown := identityDepth[issuer.Identity]
		if !known || !issuerKnown {
			problems = append(problems, fmt.Sprintf("%s: an unknown identity form", id))
		} else if depth < issuerDepth {
			problems = append(problems, fmt.Sprintf("%s: its id would sit above its issuer's", id))
		}
		key := issuerForm{r.IssuedBy, r.Identity}
		if seen[key] {
			problems = append(problems, fmt.Sprintf("%s: two roles share an issuer and an identity form", id))
		}
		seen[key] = true
	}
	for _, id := range order { // every chain of issuers ends at the root, with no loop
		chain, current := []string{id}, byID[id]
		for !current.SelfSigned() {
			next := current.IssuedBy
			if _, ok := byID[next]; !ok || slices.Contains(chain, next) {
				problems = append(problems, fmt.Sprintf("%s: its chain of issuers does not end at the root", id))
				break
			}
			chain = append(chain, next)
			current = byID[next]
		}
	}
	return problems
}

// Hash is the hash of the list the roles were read from.
func (p *Profile) Hash() string { return p.hash }

// Roles are the profile's roles, in the list's order.
func (p *Profile) Roles() []Role { return slices.Clone(p.roles) }

// Role is the role with this id, if the profile has one.
func (p *Profile) Role(id string) (Role, bool) {
	for _, r := range p.roles {
		if r.ID == id {
			return r, true
		}
	}
	return Role{}, false
}

// Root is the role that signs itself: the certificate root. Every profile NewProfile makes
// has exactly one; the zero Profile has none and yields the zero Role.
func (p *Profile) Root() Role {
	r, _ := p.root()
	return r
}

// IssuedBy is the one role an issuer of this role issues for an id of this form, if any.
func (p *Profile) IssuedBy(issuer Role, identity Identity) (Role, bool) {
	for _, r := range p.roles {
		if !r.SelfSigned() && r.IssuedBy == issuer.ID && r.Identity == identity {
			return r, true
		}
	}
	return Role{}, false
}
