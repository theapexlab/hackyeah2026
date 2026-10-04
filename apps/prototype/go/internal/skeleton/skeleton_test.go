package skeleton_test

import (
	"context"
	"crypto/ed25519"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/broker"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/euserver"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/phone"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/relay"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/vectors"
)

// TestRequestTravelsPhoneToServerPage runs every skeleton piece in one process: the broker, a relay,
// a gateway and the server, with the phone as the only sender.
func TestRequestTravelsPhoneToServerPage(t *testing.T) {
	key := vectors.SkeletonKey()
	pub := key.Public().(ed25519.PublicKey)
	ctx := t.Context()

	ln, err := (&net.ListenConfig{}).Listen(ctx, "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	b := broker.New(broker.SkeletonAdjacency())
	go func() { _ = b.Serve(ln) }()
	t.Cleanup(func() { _ = b.Close() })

	srv := httptest.NewServer(euserver.New(pub).Handler())
	t.Cleanup(srv.Close)

	startNode(t, ctx, ln.Addr().String(), "relay", &relay.Relay{PublicKey: pub})
	startNode(t, ctx, ln.Addr().String(), "gateway", &relay.Relay{
		PublicKey: pub,
		Ingest:    relay.HTTPIngest(srv.Client(), srv.URL+"/ingest"),
	})

	req := protocol.ReferenceRequest()
	if err := phone.Send(ctx, ln.Addr().String(), key, req); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		page := get(t, srv.URL+"/")
		if strings.Contains(page, string(req.Payload)) && strings.Contains(page, "LIFE_CRITICAL") {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("the request never reached the server page:\n%s", page)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func startNode(t *testing.T, ctx context.Context, addr, id string, r *relay.Relay) {
	t.Helper()
	conn, err := broker.Dial(ctx, addr, id)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	ctx, cancel := context.WithCancel(ctx)
	go func() {
		defer close(done)
		_ = r.Serve(ctx, conn)
	}()
	t.Cleanup(func() {
		cancel()
		<-done
	})
}

func get(t *testing.T, url string) string {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}
