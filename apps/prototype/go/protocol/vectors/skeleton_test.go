package vectors_test

import (
	"crypto/ed25519"
	"testing"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/vectors"
)

func TestCommittedSkeletonVectorMatchesGenerator(t *testing.T) {
	want, err := vectors.SkeletonRequest()
	if err != nil {
		t.Fatal(err)
	}
	wantJSON, err := want.JSON()
	if err != nil {
		t.Fatal(err)
	}

	got, err := vectors.LoadRaw(specDir + "/skeleton/request-1.json")
	if err != nil {
		t.Fatalf("read committed vector: %v (run `go run ./go/cmd/vectors -update`)", err)
	}
	if string(got) != string(wantJSON) {
		t.Fatal("spec/testvectors/skeleton/request-1.json differs from the generator; run `go run ./go/cmd/vectors -update`")
	}
}

func TestSkeletonVectorVerifies(t *testing.T) {
	v, err := vectors.Load(specDir + "/skeleton/request-1.json")
	if err != nil {
		t.Fatal(err)
	}
	pub, _ := v.Bytes("input", "public_key_hex")
	wire, _ := v.Bytes("output", "request_hex")

	if err := protocol.Verify(ed25519.PublicKey(pub), wire); err != nil {
		t.Fatalf("verify: %v", err)
	}
}
