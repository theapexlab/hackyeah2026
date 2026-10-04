package protocol

import (
	"fmt"
	"maps"
	"slices"
)

// The codes are on the wire and in the vectors, so a code never changes.
type Class uint8

const (
	ClassLifeCritical       Class = 1
	ClassSafety             Class = 2
	ClassCheckIn            Class = 3
	ClassInfo               Class = 4
	ClassOfficialAlert      Class = 5
	ClassModeDeclaration    Class = 6
	ClassCasualtyReport     Class = 7
	ClassTopology           Class = 8
	ClassPortalSummary      Class = 9
	ClassLend               Class = 10
	ClassBorrow             Class = 11
	ClassGive               Class = 12
	ClassSell               Class = 13
	ClassCredentialAnnounce Class = 14
	ClassCredentialRequest  Class = 15
)

type classInfo struct {
	name       string
	maxPayload int
}

// The payload budgets are for messages without free text. They are sized so that the largest legal
// message of every class, signed and framed with a full path, stays inside FrameBudget.
var classTable = map[Class]classInfo{
	ClassLifeCritical:       {"LIFE_CRITICAL", 32},
	ClassSafety:             {"SAFETY", 32},
	ClassCheckIn:            {"CHECK_IN", 24},
	ClassInfo:               {"INFO", 64},
	ClassOfficialAlert:      {"OFFICIAL_ALERT", 96},
	ClassModeDeclaration:    {"MODE_DECLARATION", 64},
	ClassCasualtyReport:     {"CASUALTY_REPORT", 96},
	ClassTopology:           {"TOPOLOGY", 96},
	ClassPortalSummary:      {"PORTAL_SUMMARY", 64},
	ClassLend:               {"LEND", 48},
	ClassBorrow:             {"BORROW", 48},
	ClassGive:               {"GIVE", 48},
	ClassSell:               {"SELL", 48},
	ClassCredentialAnnounce: {"CREDENTIAL_ANNOUNCE", 125},
	ClassCredentialRequest:  {"CREDENTIAL_REQUEST", 8},
}

// Classes lists every defined class in code order.
func Classes() []Class {
	return slices.Sorted(maps.Keys(classTable))
}

// MaxPayload is the payload budget in bytes for a message of class c without free text. An unknown
// class has no budget.
func MaxPayload(c Class) int {
	return classTable[c].maxPayload
}

// IsLinkLocal reports whether a class is credential control: it travels one hop, so it carries no geohash,
// radius or recorded path.
func IsLinkLocal(c Class) bool {
	return c == ClassCredentialAnnounce || c == ClassCredentialRequest
}

func (c Class) String() string {
	if info, ok := classTable[c]; ok {
		return info.name
	}
	return fmt.Sprintf("CLASS_%d", c)
}
