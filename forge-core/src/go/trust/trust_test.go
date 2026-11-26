package trust

import (
	"crypto/x509"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"
)

// vectors is testdata/vectors.json, written by `uv run python -m tests.trust_world`: one
// world, every fault of the catalog, and the code and position both verifiers must give.
type vectors struct {
	Now     string          `json:"now"`
	Profile json.RawMessage `json:"profile"`
	Cases   []struct {
		Name   string          `json:"name"`
		Chain  []string        `json:"chain"`
		Anchor json.RawMessage `json:"anchor"`
		Expect struct {
			OK       bool    `json:"ok"`
			Code     *string `json:"code"`
			Position *int    `json:"position"`
		} `json:"expect"`
	} `json:"cases"`
}

func loadVectors(t *testing.T) (vectors, *Profile, time.Time) {
	t.Helper()
	data, err := os.ReadFile("testdata/vectors.json")
	if err != nil {
		t.Fatalf("the vectors cannot be read: %v", err)
	}
	var v vectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("the vectors cannot be decoded: %v", err)
	}
	if len(v.Cases) == 0 {
		t.Fatal("the vectors hold no case")
	}
	profile, err := DecodeProfile(v.Profile, "")
	if err != nil {
		t.Fatalf("the vectors' profile: %v", err)
	}
	now, err := time.Parse(time.RFC3339, v.Now)
	if err != nil {
		t.Fatalf("the vectors' time: %v", err)
	}
	return v, profile, now
}

func TestVectors(t *testing.T) {
	v, profile, now := loadVectors(t)
	for _, c := range v.Cases {
		t.Run(c.Name, func(t *testing.T) {
			anchor, err := DecodeAnchor(c.Anchor)
			if err != nil {
				t.Fatalf("the case's anchor: %v", err)
			}
			chain := make([]*x509.Certificate, len(c.Chain))
			for i, text := range c.Chain {
				if chain[i], err = parseCertificatePEM(text); err != nil {
					t.Fatalf("certificate %d cannot be read: %v", i, err)
				}
			}
			want := "accepted"
			if !c.Expect.OK {
				if c.Expect.Code == nil || c.Expect.Position == nil {
					t.Fatal("a refused case names no code or position")
				}
				want = strings.Join([]string{*c.Expect.Code, "at", itoa(*c.Expect.Position)}, " ")
			}

			got, err := Verify(chain[0], chain[1:], anchor, profile, now)
			var refused *Refused
			switch {
			case err == nil:
				if !c.Expect.OK {
					t.Fatalf("accepted as %s (%s); want %s", got.Identity, got.Role, want)
				}
				if got.Identity.String() != chain[0].URIs[0].String() || got.Role != got.Roles[0] ||
					got.Roles[len(got.Roles)-1] != profile.Root().ID {
					t.Fatalf("accepted, but the answer is not the leaf's: %+v", got)
				}
			case errors.As(err, &refused):
				if c.Expect.OK {
					t.Fatalf("refused (%v); want accepted", err)
				}
				if refused.Code() != *c.Expect.Code || refused.Position != *c.Expect.Position {
					t.Fatalf("refused %s at %d (%s); want %s", refused.Code(), refused.Position, refused.Detail, want)
				}
			default:
				t.Fatalf("not a refusal but an error: %v; want %s", err, want)
			}
		})
	}
}

func itoa(n int) string { b, _ := json.Marshal(n); return string(b) }

func TestSpiffeID(t *testing.T) {
	name63 := strings.Repeat("a", 63)
	accepted := []struct {
		text, deployment, hub, module, last string
		kind                                Identity
	}{
		{"spiffe://plant-a", "plant-a", "", "", "plant-a", IdentityDeployment},
		{"spiffe://plant-a/hub/area-1", "plant-a", "area-1", "", "area-1", IdentityHub},
		{"spiffe://plant-a/hub/area-1/module/forge-ot", "plant-a", "area-1", "forge-ot", "forge-ot", IdentityModule},
		{"spiffe://hub/hub/module/module/m", "hub", "module", "m", "m", IdentityModule},
		{"spiffe://" + name63, name63, "", "", name63, IdentityDeployment},
		{"spiffe://0", "0", "", "", "0", IdentityDeployment},
	}
	for _, c := range accepted {
		id, err := ParseSpiffeID(c.text)
		if err != nil {
			t.Errorf("%q refused: %v", c.text, err)
			continue
		}
		hub, _ := id.Hub()
		module, _ := id.Module()
		if id.Deployment() != c.deployment || hub != c.hub || module != c.module || id.Kind() != c.kind ||
			id.Last() != c.last || id.String() != c.text {
			t.Errorf("%q read as %+v (%s, last %s)", c.text, id, id.Kind(), id.Last())
		}
	}

	refused := map[string]string{
		"a port":                    "spiffe://plant-a:8443/hub/area-1",
		"a user":                    "spiffe://ops@plant-a",
		"a query":                   "spiffe://plant-a/hub/area-1?x=1",
		"a fragment":                "spiffe://plant-a#x",
		"percent-encoding":          "spiffe://plant%2da",
		"upper case":                "spiffe://Plant-A",
		"upper case in a hub":       "spiffe://plant-a/hub/Area-1",
		"an empty segment":          "spiffe://plant-a//hub/area-1",
		"a trailing slash":          "spiffe://plant-a/hub/area-1/",
		"no deployment":             "spiffe://",
		"a module without a hub":    "spiffe://plant-a/module/forge-ot",
		"a hub without its name":    "spiffe://plant-a/hub",
		"a module without its name": "spiffe://plant-a/hub/area-1/module",
		"a fifth segment":           "spiffe://plant-a/hub/area-1/module/forge-ot/x",
		"a wrong word":              "spiffe://plant-a/site/area-1",
		"another scheme":            "https://plant-a",
		"upper-case scheme":         "SPIFFE://plant-a",
		"a leading hyphen":          "spiffe://-plant",
		"a trailing hyphen":         "spiffe://plant-",
		"an underscore":             "spiffe://plant_a",
		"a dot":                     "spiffe://plant.a",
		"64 characters":             "spiffe://" + name63 + "a",
		"a trailing newline":        "spiffe://plant-a\n",
		"a newline after the hub":   "spiffe://plant-a/hub/area-1\n",
		"a space":                   "spiffe://plant a",
		"not ASCII":                 "spiffe://plänt",
	}
	for why, text := range refused {
		if id, err := ParseSpiffeID(text); err == nil {
			t.Errorf("%s: %q accepted as %s", why, text, id)
		} else if _, ok := errors.AsType[*IDError](err); !ok {
			t.Errorf("%s: %q refused without an IDError: %v", why, text, err)
		}
	}

	if _, err := NewSpiffeID("plant-a", "", "forge-ot"); err == nil {
		t.Error("a module's id without its hub was made")
	}

	ids := map[string]SpiffeID{}
	for _, text := range []string{"spiffe://plant-a", "spiffe://plant-b", "spiffe://plant-a/hub/area-1",
		"spiffe://plant-a/hub/area-2", "spiffe://plant-a/hub/area-1/module/forge-ot",
		"spiffe://plant-a/hub/area-1/module/forge-mes", "spiffe://plant-a/hub/area-2/module/forge-ot"} {
		ids[text], _ = ParseSpiffeID(text)
	}
	under := []struct {
		id, other string
		want      bool
	}{
		{"spiffe://plant-a", "spiffe://plant-a", true},
		{"spiffe://plant-a/hub/area-1", "spiffe://plant-a", true},
		{"spiffe://plant-a/hub/area-1/module/forge-ot", "spiffe://plant-a", true},
		{"spiffe://plant-a/hub/area-1/module/forge-ot", "spiffe://plant-a/hub/area-1", true},
		{"spiffe://plant-a/hub/area-1/module/forge-ot", "spiffe://plant-a/hub/area-1/module/forge-ot", true},
		{"spiffe://plant-a/hub/area-1/module/forge-ot", "spiffe://plant-a/hub/area-1/module/forge-mes", false},
		{"spiffe://plant-a/hub/area-2/module/forge-ot", "spiffe://plant-a/hub/area-1", false},
		{"spiffe://plant-a/hub/area-1", "spiffe://plant-a/hub/area-1/module/forge-ot", false},
		{"spiffe://plant-a", "spiffe://plant-a/hub/area-1", false},
		{"spiffe://plant-a/hub/area-1", "spiffe://plant-b", false},
	}
	for _, c := range under {
		if got := ids[c.id].IsUnder(ids[c.other]); got != c.want {
			t.Errorf("%s under %s: %v, want %v", c.id, c.other, got, c.want)
		}
	}
}

// TestDecodingIsStrict proves the anchor and the profile are read as the Python models
// forbid extras, and more strictly than pydantic's lax mode: no unknown or wrongly cased
// key, nothing required missing, no null, no value of another JSON type.
func TestDecodingIsStrict(t *testing.T) {
	v, _, _ := loadVectors(t)
	if _, err := DecodeAnchor(v.Cases[0].Anchor); err != nil {
		t.Fatalf("the vectors' anchor is refused: %v", err)
	}
	change := func(edit func(a map[string]any)) []byte {
		var a map[string]any
		if err := json.Unmarshal(v.Cases[0].Anchor, &a); err != nil {
			t.Fatal(err)
		}
		edit(a)
		out, _ := json.Marshal(a)
		return out
	}
	policy := func(a map[string]any) map[string]any { return a["policy"].(map[string]any) }
	anchors := map[string][]byte{
		"an unknown field":                  change(func(a map[string]any) { a["note"] = "x" }),
		"an unknown field in the policy":    change(func(a map[string]any) { policy(a)["note"] = "x" }),
		"an unknown field in a root":        change(func(a map[string]any) { a["certificate_roots"].([]any)[0].(map[string]any)["note"] = "x" }),
		"a key in another case":             change(func(a map[string]any) { a["Deployment"] = a["deployment"]; delete(a, "deployment") }),
		"both cases of a key":               change(func(a map[string]any) { a["DEPLOYMENT"] = "plant-b" }),
		"a required field missing":          change(func(a map[string]any) { delete(a, "hub_intermediates") }),
		"a null":                            change(func(a map[string]any) { a["release_keys"] = nil }),
		"a null root key":                   change(func(a map[string]any) { a["root_keys"] = []any{nil} }),
		"a version in quotes":               change(func(a map[string]any) { a["version"] = "1" }),
		"a lifetime in quotes":              change(func(a map[string]any) { policy(a)["lifetimes"].(map[string]any)["hub-leaf"] = "86400" }),
		"a lifetime of 86400.5":             change(func(a map[string]any) { policy(a)["lifetimes"].(map[string]any)["hub-leaf"] = 86400.5 }),
		"a lifetime of zero":                change(func(a map[string]any) { policy(a)["lifetimes"].(map[string]any)["hub-leaf"] = 0 }),
		"a boolean as a word":               change(func(a map[string]any) { policy(a)["separation_of_duties"] = "yes" }),
		"a count as a boolean":              change(func(a map[string]any) { policy(a)["intermediates_per_hub"] = true }),
		"another form":                      change(func(a map[string]any) { a["form"] = "forge-anchor/2" }),
		"an unknown stage":                  change(func(a map[string]any) { a["stage"] = "staging" }),
		"a deployment that is not a name":   change(func(a map[string]any) { a["deployment"] = "Plant-A" }),
		"a threshold above the keys":        change(func(a map[string]any) { a["root_threshold"] = 4 }),
		"a root key also a release key":     change(func(a map[string]any) { a["release_keys"] = []any{a["root_keys"].([]any)[0]} }),
		"production with a test root":       change(func(a map[string]any) { a["stage"] = "production" }),
		"no certificate root":               change(func(a map[string]any) { a["certificate_roots"] = []any{} }),
		"a certificate that is not PEM":     change(func(a map[string]any) { a["hub_intermediates"].([]any)[0].(map[string]any)["certificate"] = "x" }),
		"a profile hash that is not a hash": change(func(a map[string]any) { policy(a)["profile"] = "abc" }),
	}
	for why, data := range anchors {
		if _, err := DecodeAnchor(data); err == nil {
			t.Errorf("an anchor with %s was accepted", why)
		}
	}

	var entries []map[string]any
	if err := json.Unmarshal(v.Profile, &entries); err != nil {
		t.Fatal(err)
	}
	changeProfile := func(edit func(e []map[string]any)) []byte {
		var copied []map[string]any
		raw, _ := json.Marshal(entries)
		_ = json.Unmarshal(raw, &copied)
		edit(copied)
		out, _ := json.Marshal(copied)
		return out
	}
	profiles := map[string][]byte{
		"an unknown field":          changeProfile(func(e []map[string]any) { e[0]["note"] = "x" }),
		"a missing signs_with":      changeProfile(func(e []map[string]any) { delete(e[0], "signs_with") }),
		"a CA as a word":            changeProfile(func(e []map[string]any) { e[0]["ca"] = "true" }),
		"an unknown key usage":      changeProfile(func(e []map[string]any) { e[2]["key_usage"] = []any{"key_encipherment"} }),
		"a second root":             changeProfile(func(e []map[string]any) { e[1]["issued_by"] = e[1]["id"] }),
		"a leaf issuing a leaf":     changeProfile(func(e []map[string]any) { e[3]["issued_by"] = "hub-leaf" }),
		"a CA without a path":       changeProfile(func(e []map[string]any) { e[1]["path_length"] = nil }),
		"a path not below its root": changeProfile(func(e []map[string]any) { e[1]["path_length"] = 1 }),
	}
	for why, data := range profiles {
		if _, err := DecodeProfile(data, ""); err == nil {
			t.Errorf("a profile with %s was accepted", why)
		}
	}
}

// TestEdges holds the Go verifier to testdata/edges.json, written by
// `uv run python -m tests.trust_edges`: malformed DER, odd encodings and other hashes, each
// with the answer both verifiers must give. A chain marked go_parses false holds a
// certificate Go's own parser refuses before the verifier runs; that refusal is asserted.
func TestEdges(t *testing.T) {
	_, profile, _ := loadVectors(t)
	data, err := os.ReadFile("testdata/edges.json")
	if err != nil {
		t.Fatalf("the edges cannot be read: %v", err)
	}
	var edges struct {
		Now   string `json:"now"`
		Cases []struct {
			Name     string          `json:"name"`
			Chain    []string        `json:"chain"`
			Anchor   json.RawMessage `json:"anchor"`
			GoParses bool            `json:"go_parses"`
			Expect   struct {
				OK       bool    `json:"ok"`
				Code     *string `json:"code"`
				Position *int    `json:"position"`
			} `json:"expect"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &edges); err != nil {
		t.Fatalf("the edges cannot be decoded: %v", err)
	}
	if len(edges.Cases) == 0 {
		t.Fatal("the edges hold no case")
	}
	now, err := time.Parse(time.RFC3339, edges.Now)
	if err != nil {
		t.Fatalf("the edges' time: %v", err)
	}
	for _, c := range edges.Cases {
		t.Run(c.Name, func(t *testing.T) {
			anchor, err := DecodeAnchor(c.Anchor)
			if err != nil {
				t.Fatalf("the case's anchor: %v", err)
			}
			chain := make([]*x509.Certificate, len(c.Chain))
			var parseErr error
			for i, text := range c.Chain {
				if chain[i], parseErr = parseCertificatePEM(text); parseErr != nil {
					break
				}
			}
			if !c.GoParses {
				if parseErr == nil {
					t.Fatal("Go's parser read a certificate the case says it refuses")
				}
				return
			}
			if parseErr != nil {
				t.Fatalf("a certificate cannot be read: %v", parseErr)
			}
			got, err := Verify(chain[0], chain[1:], anchor, profile, now)
			var refused *Refused
			switch {
			case err == nil:
				if !c.Expect.OK {
					t.Fatalf("accepted as %s; want %s at %d", got.Role, *c.Expect.Code, *c.Expect.Position)
				}
			case errors.As(err, &refused):
				if c.Expect.OK {
					t.Fatalf("refused (%v); want accepted", err)
				}
				if refused.Code() != *c.Expect.Code || refused.Position != *c.Expect.Position {
					t.Fatalf("refused %s at %d; want %s at %d", refused.Code(), refused.Position, *c.Expect.Code, *c.Expect.Position)
				}
			default:
				t.Fatalf("not a refusal but an error: %v", err)
			}
		})
	}
}

// TestAnchorFreshnessKeys holds the anchor's freshness keys to D-21 §14 FR-2 as amended by
// D-24 Q-7 (FB-311): one or two, each its own device's, and two in production.
func TestAnchorFreshnessKeys(t *testing.T) {
	v, _, _ := loadVectors(t)
	var base map[string]any
	if err := json.Unmarshal(v.Cases[0].Anchor, &base); err != nil {
		t.Fatal(err)
	}
	keys := base["freshness_keys"].([]any)
	if len(keys) != 2 {
		t.Fatalf("the vectors' anchor holds %d freshness keys; want 2", len(keys))
	}
	first := keys[0].(string)
	head, rest, _ := strings.Cut(first, "\n")
	body, foot, _ := strings.Cut(rest, "-----END")
	content := strings.ReplaceAll(body, "\n", "")
	var lines []string
	for i := 0; i < len(content); i += 32 {
		lines = append(lines, content[i:min(i+32, len(content))])
	}
	rewrapped := head + "\n" + strings.Join(lines, "\n") + "\n-----END" + foot
	if rewrapped == first {
		t.Fatal("the rewrapped key is spelled as the first one; the case would prove nothing")
	}
	old := map[string]any{}
	for k, val := range base {
		if k != "freshness_keys" {
			old[k] = val
		}
	}
	old["freshness_key"] = first
	if raw, err := json.Marshal(old); err != nil {
		t.Fatal(err)
	} else if _, err := DecodeAnchor(raw); err == nil {
		t.Fatal("an anchor in the form with one freshness_key was accepted")
	}
	cases := []struct {
		name    string
		change  map[string]any
		refused bool
	}{
		{"two keys, as written", map[string]any{}, false},
		{"a key broken at another width, with another key", map[string]any{"freshness_keys": []any{rewrapped, keys[1]}}, false},
		{"the same key broken at another width", map[string]any{"freshness_keys": []any{first, rewrapped}}, true},
		{"the same key without its last line break", map[string]any{"freshness_keys": []any{first, strings.TrimSuffix(first, "\n")}}, true},
		{"a key that is not PEM", map[string]any{"freshness_keys": []any{first, "x"}}, true},
		{"one key outside a list", map[string]any{"freshness_keys": first}, true},
		{"one key under the test stage", map[string]any{"freshness_keys": keys[:1]}, false},
		{"one key under the development stage", map[string]any{"stage": "development", "freshness_keys": keys[:1]}, false},
		{"one key in production", map[string]any{"stage": "production", "test_attestation_roots": []any{}, "freshness_keys": keys[:1]}, true},
		{"two keys in production", map[string]any{"stage": "production", "test_attestation_roots": []any{}}, false},
		{"the same key twice", map[string]any{"freshness_keys": []any{keys[0], keys[0]}}, true},
		{"three keys", map[string]any{"freshness_keys": []any{keys[0], keys[1], keys[0]}}, true},
		{"none", map[string]any{"freshness_keys": []any{}}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc := map[string]any{}
			for k, val := range base {
				doc[k] = val
			}
			for k, val := range c.change {
				doc[k] = val
			}
			raw, err := json.Marshal(doc)
			if err != nil {
				t.Fatal(err)
			}
			_, err = DecodeAnchor(raw)
			if c.refused && err == nil {
				t.Fatal("accepted; want refused")
			}
			if !c.refused && err != nil {
				t.Fatalf("refused (%v); want accepted", err)
			}
		})
	}
}
