package protocol_test

import (
	"slices"
	"strings"
	"testing"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
)

func TestClassTableHasUniqueCodesAndNames(t *testing.T) {
	names := map[string]protocol.Class{}
	for _, c := range protocol.Classes() {
		name := c.String()
		if prev, ok := names[name]; ok {
			t.Errorf("name %s is both code %d and %d", name, prev, c)
		}
		names[name] = c
		if strings.HasPrefix(name, "CLASS_") {
			t.Errorf("class %d has no name", c)
		}
	}
	if len(names) != 15 {
		t.Errorf("class table has %d entries, want 15", len(names))
	}
}

func TestClassCodesAreStable(t *testing.T) {
	// Codes are on the wire and in the vectors. Changing one is a wire-format change.
	want := map[protocol.Class]uint8{
		protocol.ClassLifeCritical:       1,
		protocol.ClassSafety:             2,
		protocol.ClassCheckIn:            3,
		protocol.ClassInfo:               4,
		protocol.ClassOfficialAlert:      5,
		protocol.ClassModeDeclaration:    6,
		protocol.ClassCasualtyReport:     7,
		protocol.ClassTopology:           8,
		protocol.ClassPortalSummary:      9,
		protocol.ClassLend:               10,
		protocol.ClassBorrow:             11,
		protocol.ClassGive:               12,
		protocol.ClassSell:               13,
		protocol.ClassCredentialAnnounce: 14,
		protocol.ClassCredentialRequest:  15,
	}
	for c, code := range want {
		if uint8(c) != code {
			t.Errorf("%s has code %d, want %d", c, c, code)
		}
	}
}

func TestEveryClassHasAPayloadBudget(t *testing.T) {
	for _, c := range protocol.Classes() {
		if protocol.MaxPayload(c) <= 0 {
			t.Errorf("%s has no payload budget", c)
		}
	}
	if protocol.MaxPayload(protocol.Class(99)) != 0 {
		t.Error("an unknown class must have a zero budget")
	}
}

func TestClassesAreInCodeOrder(t *testing.T) {
	if !slices.IsSorted(protocol.Classes()) {
		t.Fatalf("Classes() is %v, want ascending code order", protocol.Classes())
	}
}

func TestOnlyCredentialControlIsLinkLocal(t *testing.T) {
	linkLocal := []protocol.Class{protocol.ClassCredentialAnnounce, protocol.ClassCredentialRequest}
	for _, c := range protocol.Classes() {
		want := slices.Contains(linkLocal, c)
		if protocol.IsLinkLocal(c) != want {
			t.Errorf("IsLinkLocal(%s) = %v, want %v", c, !want, want)
		}
	}
}

func TestClassString(t *testing.T) {
	for c, want := range map[protocol.Class]string{
		protocol.ClassLifeCritical: "LIFE_CRITICAL",
		protocol.Class(99):         "CLASS_99",
	} {
		if got := c.String(); got != want {
			t.Errorf("Class(%d).String() = %q, want %q", c, got, want)
		}
	}
}
