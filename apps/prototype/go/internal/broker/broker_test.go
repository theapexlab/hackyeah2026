package broker_test

import (
	"errors"
	"io"
	"net"
	"testing"
	"time"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/broker"
)

func startBroker(t *testing.T) string {
	t.Helper()
	ln, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	b := broker.New(broker.SkeletonAdjacency())
	go func() { _ = b.Serve(ln) }()
	t.Cleanup(func() { _ = b.Close() })
	return ln.Addr().String()
}

func writeFrame(t *testing.T, w io.Writer, body []byte) {
	t.Helper()
	if err := broker.WriteFrame(w, body); err != nil {
		t.Fatal(err)
	}
}

func readFrame(c net.Conn, wait time.Duration) ([]byte, error) {
	if err := c.SetReadDeadline(time.Now().Add(wait)); err != nil {
		return nil, err
	}
	return broker.ReadFrame(c)
}

func sendHello(t *testing.T, addr, id string) net.Conn {
	t.Helper()
	c, err := (&net.Dialer{}).DialContext(t.Context(), "tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	writeFrame(t, c, []byte(id))
	return c
}

// connect says hello and waits for the broker's empty ack frame, which means the node is registered.
func connect(t *testing.T, addr, id string) net.Conn {
	t.Helper()
	c := sendHello(t, addr, id)
	ack, err := readFrame(c, 2*time.Second)
	if err != nil || len(ack) != 0 {
		t.Fatalf("hello ack for %s: got %q, %v; want an empty frame", id, ack, err)
	}
	return c
}

func connectLine(t *testing.T) (phone, relay, gateway net.Conn) {
	t.Helper()
	addr := startBroker(t)
	phone, relay, gateway = connect(t, addr, "phone"), connect(t, addr, "relay"), connect(t, addr, "gateway")
	return phone, relay, gateway
}

func isTimeout(err error) bool {
	var ne net.Error
	return errors.As(err, &ne) && ne.Timeout()
}

func TestFrameFromPhoneReachesRelayNotGateway(t *testing.T) {
	phone, relay, gateway := connectLine(t)

	writeFrame(t, phone, []byte("sos"))

	got, err := readFrame(relay, 2*time.Second)
	if err != nil {
		t.Fatalf("relay read: %v", err)
	}
	if string(got) != "sos" {
		t.Fatalf("relay got %q, want %q", got, "sos")
	}
	if _, err := readFrame(gateway, 300*time.Millisecond); !isTimeout(err) {
		t.Fatalf("gateway read: got %v, want a timeout (nothing delivered)", err)
	}
	if _, err := readFrame(phone, 300*time.Millisecond); !isTimeout(err) {
		t.Fatalf("phone read: got %v, want a timeout (no echo)", err)
	}
}

func TestRelayFramesReachPhoneAndGateway(t *testing.T) {
	phone, relay, gateway := connectLine(t)

	writeFrame(t, relay, []byte("fwd"))

	for name, c := range map[string]net.Conn{"phone": phone, "gateway": gateway} {
		got, err := readFrame(c, 2*time.Second)
		if err != nil || string(got) != "fwd" {
			t.Fatalf("%s got %q, %v; want %q", name, got, err, "fwd")
		}
	}
}

func TestUnknownNodeIsDisconnected(t *testing.T) {
	addr := startBroker(t)
	c := sendHello(t, addr, "stranger")

	if _, err := readFrame(c, 2*time.Second); err == nil || isTimeout(err) {
		t.Fatalf("got %v, want the connection closed", err)
	}
}

func TestDialRegistersTheNode(t *testing.T) {
	addr := startBroker(t)
	ctx := t.Context()
	phone, err := broker.Dial(ctx, addr, "phone")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = phone.Close() })
	relay, err := broker.Dial(ctx, addr, "relay")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = relay.Close() })

	writeFrame(t, phone, []byte("sos"))

	if got, err := readFrame(relay, 2*time.Second); err != nil || string(got) != "sos" {
		t.Fatalf("relay got %q, %v; want %q", got, err, "sos")
	}
}

func TestDialFailsForAnUnknownNode(t *testing.T) {
	addr := startBroker(t)

	if c, err := broker.Dial(t.Context(), addr, "stranger"); err == nil {
		_ = c.Close()
		t.Fatal("want an error for an unknown node")
	}
}

func TestAckPrecedesDataWhenANodeReconnectsUnderLoad(t *testing.T) {
	addr := startBroker(t)
	relay := connect(t, addr, "relay")
	done := make(chan struct{})
	flooded := make(chan struct{})
	go func() {
		defer close(flooded)
		for {
			select {
			case <-done:
				return
			default:
				if broker.WriteFrame(relay, []byte("x")) != nil {
					return
				}
			}
		}
	}()
	t.Cleanup(func() { close(done); <-flooded })

	for range 3000 {
		c, err := broker.Dial(t.Context(), addr, "phone")
		if err != nil {
			t.Fatalf("dial under load: %v", err)
		}
		_ = c.Close()
	}
}
