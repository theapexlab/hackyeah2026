package relay_test

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/broker"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/relay"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/event"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/vectors"
)

func signedRequest(t *testing.T) (ed25519.PublicKey, []byte) {
	t.Helper()
	key := vectors.SkeletonKey()
	wire, err := protocol.Sign(protocol.Ed25519Key(key), protocol.ReferenceRequest())
	if err != nil {
		t.Fatal(err)
	}
	return key.Public().(ed25519.PublicKey), wire
}

// run starts the relay on one end of an in-memory pipe and returns the other end, which plays the broker.
func run(t *testing.T, r *relay.Relay) net.Conn {
	t.Helper()
	near, far := net.Pipe()
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() {
		defer close(done)
		_ = r.Serve(ctx, near)
	}()
	t.Cleanup(func() {
		cancel()
		_ = far.Close()
		<-done
	})
	return far
}

func readFrame(t *testing.T, c net.Conn) []byte {
	t.Helper()
	if err := c.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatal(err)
	}
	body, err := broker.ReadFrame(c)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func TestForwardsValidFrame(t *testing.T) {
	pub, wire := signedRequest(t)
	far := run(t, &relay.Relay{PublicKey: pub})

	if err := broker.WriteFrame(far, wire); err != nil {
		t.Fatal(err)
	}

	if got := readFrame(t, far); string(got) != string(wire) {
		t.Fatalf("forwarded %x, want %x", got, wire)
	}
}

func TestDropsFlippedBitFrame(t *testing.T) {
	pub, wire := signedRequest(t)
	bad := append([]byte(nil), wire...)
	bad[len(bad)/2] ^= 0x01
	far := run(t, &relay.Relay{PublicKey: pub})

	if err := broker.WriteFrame(far, bad); err != nil {
		t.Fatal(err)
	}
	if err := broker.WriteFrame(far, wire); err != nil {
		t.Fatal(err)
	}

	// Frames keep their order, so the first frame out being the good one means the bad one was dropped.
	if got := readFrame(t, far); string(got) != string(wire) {
		t.Fatalf("first forwarded frame is %x, want only the valid one %x", got, wire)
	}
}

func TestGatewayPostsOnceAndDoesNotForward(t *testing.T) {
	pub, wire := signedRequest(t)
	posted := make(chan []byte, 2)
	far := run(t, &relay.Relay{
		PublicKey: pub,
		Ingest: func(_ context.Context, signed []byte) error {
			posted <- signed
			return nil
		},
	})

	if err := broker.WriteFrame(far, wire); err != nil {
		t.Fatal(err)
	}

	select {
	case got := <-posted:
		if string(got) != string(wire) {
			t.Fatalf("posted %x, want %x", got, wire)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("gateway never posted the frame")
	}
	if err := far.SetReadDeadline(time.Now().Add(200 * time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	if body, err := broker.ReadFrame(far); err == nil {
		t.Fatalf("gateway forwarded %x, want nothing", body)
	}
	if len(posted) != 0 {
		t.Fatal("gateway posted more than once")
	}
}

func TestHTTPIngestPostsTheSignedBytes(t *testing.T) {
	_, wire := signedRequest(t)
	var gotBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		gotBody, _ = io.ReadAll(req.Body)
		w.WriteHeader(http.StatusAccepted)
	}))
	t.Cleanup(srv.Close)

	if err := relay.HTTPIngest(srv.Client(), srv.URL)(t.Context(), wire); err != nil {
		t.Fatal(err)
	}
	if string(gotBody) != string(wire) {
		t.Fatalf("server got %x, want %x", gotBody, wire)
	}
}

func TestHTTPIngestReportsServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	t.Cleanup(srv.Close)

	if err := relay.HTTPIngest(srv.Client(), srv.URL)(t.Context(), []byte("x")); err == nil {
		t.Fatal("want an error for a 400 response")
	}
}

// decisions parses the decision events a relay wrote to its log.
func decisions(t *testing.T, log *bytes.Buffer) []event.Event {
	t.Helper()
	var out []event.Event
	for _, line := range bytes.Split(log.Bytes(), []byte("\n")) {
		if e, ok := event.Parse(line); ok {
			out = append(out, e)
		}
	}
	return out
}

func TestEmitsAForwardDecision(t *testing.T) {
	pub, wire := signedRequest(t)
	var log syncBuffer
	far := run(t, &relay.Relay{PublicKey: pub, Node: "relay", Log: event.NewLogger(&log)})

	if err := broker.WriteFrame(far, wire); err != nil {
		t.Fatal(err)
	}
	readFrame(t, far)

	id, _ := protocol.ID(wire)
	got := decisions(t, log.Buffer())
	if len(got) != 1 {
		t.Fatalf("got %d events, want 1: %s", len(got), log.Buffer())
	}
	want := event.Event{Node: "relay", MsgID: id, Class: "LIFE_CRITICAL", Decision: event.Forward, Reason: event.ReasonValid, Mode: "peace"}
	got[0].TS = time.Time{}
	if got[0] != want {
		t.Fatalf("got %+v, want %+v", got[0], want)
	}
}

func TestEmitsADropDecisionWithTheReason(t *testing.T) {
	pub, wire := signedRequest(t)
	bad := append([]byte(nil), wire...)
	bad[len(bad)-1] ^= 0x01
	var log syncBuffer
	far := run(t, &relay.Relay{PublicKey: pub, Node: "relay", Log: event.NewLogger(&log)})

	if err := broker.WriteFrame(far, bad); err != nil {
		t.Fatal(err)
	}
	if err := broker.WriteFrame(far, wire); err != nil {
		t.Fatal(err)
	}
	readFrame(t, far)

	got := decisions(t, log.Buffer())
	if len(got) != 2 || got[0].Decision != event.Drop || got[0].Reason != event.ReasonBadSignature || got[0].MsgID == "" {
		t.Fatalf("want a drop for bad_signature with an id, then a forward; got %+v", got)
	}
}

func TestEmitsAPostDecisionForTheGateway(t *testing.T) {
	pub, wire := signedRequest(t)
	var log syncBuffer
	posted := make(chan struct{}, 1)
	far := run(t, &relay.Relay{
		PublicKey: pub, Node: "gateway", Log: event.NewLogger(&log),
		Ingest: func(context.Context, []byte) error { posted <- struct{}{}; return nil },
	})

	if err := broker.WriteFrame(far, wire); err != nil {
		t.Fatal(err)
	}
	<-posted

	got := decisions(t, log.Buffer())
	if len(got) != 1 || got[0].Decision != event.Post || got[0].Node != "gateway" {
		t.Fatalf("want one post decision from the gateway, got %+v", got)
	}
}

type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) Buffer() *bytes.Buffer {
	b.mu.Lock()
	defer b.mu.Unlock()
	return bytes.NewBuffer(append([]byte(nil), b.buf.Bytes()...))
}
