// Package trust is the Go twin of forge_core.trust (D-23 law 1): the SPIFFE ids, the
// certificate profile, the deployment's anchor, and the verifier that answers "is this
// certificate real?". It gives the same answer, cause and position as the Python verifier
// (forge-core/src/python/forge_core/trust/verify.py) for every chain; the shared vectors in
// testdata/vectors.json, made by tests/trust_world.py, hold the two to it.
package trust

import (
	"fmt"
	"strings"
)

// Identity is which of the three forms an id has.
type Identity string

const (
	IdentityDeployment Identity = "deployment"
	IdentityHub        Identity = "hub"
	IdentityModule     Identity = "module"
)

// identityDepth orders the forms: a role may only sit at or below its issuer's.
var identityDepth = map[Identity]int{IdentityDeployment: 0, IdentityHub: 1, IdentityModule: 2}

const spiffeScheme = "spiffe://"

// IDError is text that is not one of the three forms; it names what was given.
type IDError struct{ Reason string }

func (e *IDError) Error() string { return e.Reason }

// SpiffeID is the id of a deployment, a hub or a module (D-21 SF-13, D-23 T-4):
//
//	spiffe://<deployment>
//	spiffe://<deployment>/hub/<hub>
//	spiffe://<deployment>/hub/<hub>/module/<module>
//
// Only ParseSpiffeID and NewSpiffeID make one, so every SpiffeID they return holds names
// in one of the three forms. The zero value is not an id.
type SpiffeID struct {
	deployment, hub, module string
}

// isName reports whether s is a name: lower-case letters, digits and inner hyphens, 1 to 63
// characters, so it also fits a certificate's common name. The name ends where the text
// ends: a trailing newline is not part of a name.
func isName(s string) bool {
	if len(s) < 1 || len(s) > 63 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z', c >= '0' && c <= '9':
		case c == '-' && i > 0 && i < len(s)-1:
		default:
			return false
		}
	}
	return true
}

// NewSpiffeID makes an id from its names; an empty hub or module is absent.
func NewSpiffeID(deployment, hub, module string) (SpiffeID, error) {
	notName := func(part, value string) error {
		return &IDError{fmt.Sprintf("%s %q is not a name (a-z, 0-9, inner hyphens, 1-63)", part, value)}
	}
	if !isName(deployment) {
		return SpiffeID{}, notName("deployment", deployment)
	}
	if hub != "" && !isName(hub) {
		return SpiffeID{}, notName("hub", hub)
	}
	if module != "" {
		if hub == "" {
			return SpiffeID{}, &IDError{"a module's id names its hub"}
		}
		if !isName(module) {
			return SpiffeID{}, notName("module", module)
		}
	}
	return SpiffeID{deployment: deployment, hub: hub, module: module}, nil
}

// ParseSpiffeID reads an id strictly, never repairing it: no port, user, query, fragment,
// percent-encoding, upper case, empty segment or trailing slash.
func ParseSpiffeID(text string) (SpiffeID, error) {
	if !strings.HasPrefix(text, spiffeScheme) {
		return SpiffeID{}, &IDError{fmt.Sprintf("%q is not a spiffe:// id", text)}
	}
	noForm := &IDError{fmt.Sprintf("%q is not one of the three id forms", text)}
	rest := text[len(spiffeScheme):]
	parts := strings.Split(rest, "/")
	if strings.ContainsAny(rest, "?#%@:") {
		return SpiffeID{}, noForm
	}
	for _, part := range parts {
		if part == "" {
			return SpiffeID{}, noForm
		}
	}
	deployment, path := parts[0], parts[1:]
	switch {
	case len(path) == 0:
		return NewSpiffeID(deployment, "", "")
	case len(path) == 2 && path[0] == "hub":
		return NewSpiffeID(deployment, path[1], "")
	case len(path) == 4 && path[0] == "hub" && path[2] == "module":
		return NewSpiffeID(deployment, path[1], path[3])
	}
	return SpiffeID{}, noForm
}

// Deployment is the id's deployment.
func (id SpiffeID) Deployment() string { return id.deployment }

// Hub is the id's hub, if it names one.
func (id SpiffeID) Hub() (string, bool) { return id.hub, id.hub != "" }

// Module is the id's module, if it names one.
func (id SpiffeID) Module() (string, bool) { return id.module, id.module != "" }

// Kind is which of the three forms the id has.
func (id SpiffeID) Kind() Identity {
	switch {
	case id.module != "":
		return IdentityModule
	case id.hub != "":
		return IdentityHub
	}
	return IdentityDeployment
}

// Last is the last name in the id: the module, else the hub, else the deployment.
func (id SpiffeID) Last() string {
	switch {
	case id.module != "":
		return id.module
	case id.hub != "":
		return id.hub
	}
	return id.deployment
}

// IsUnder reports whether this id is other or sits below it.
func (id SpiffeID) IsUnder(other SpiffeID) bool {
	if id.deployment != other.deployment {
		return false
	}
	if other.hub == "" {
		return true
	}
	if id.hub != other.hub {
		return false
	}
	return other.module == "" || id.module == other.module
}

func (id SpiffeID) String() string {
	text := spiffeScheme + id.deployment
	if id.hub != "" {
		text += "/hub/" + id.hub
	}
	if id.module != "" {
		text += "/module/" + id.module
	}
	return text
}
