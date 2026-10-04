package protocol_test

import (
	"testing"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
)

func TestVersion(t *testing.T) {
	if protocol.Version != 1 {
		t.Fatalf("protocol.Version = %d, want 1", protocol.Version)
	}
}
