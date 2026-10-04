package euserver_test

import (
	"bytes"
	"crypto/ed25519"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/euserver"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
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

func do(t *testing.T, h http.Handler, method, path string, body []byte) (int, string) {
	t.Helper()
	req := httptest.NewRequestWithContext(t.Context(), method, path, bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	out, err := io.ReadAll(rec.Result().Body)
	if err != nil {
		t.Fatal(err)
	}
	return rec.Code, string(out)
}

func TestPageRendersReceivedMessages(t *testing.T) {
	var buf bytes.Buffer
	err := euserver.Page([]euserver.Received{{
		ID:      "0123456789abcdef0123456789abcdef",
		Class:   "LIFE_CRITICAL",
		Signer:  "d75a980182b10ab7",
		Seq:     17,
		Payload: "AED needed now",
		At:      time.Date(2026, 10, 4, 9, 0, 0, 0, time.UTC),
	}}).Render(t.Context(), &buf)
	if err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{"0123456789abcdef0123456789abcdef", "LIFE_CRITICAL", "d75a980182b10ab7", "17", "AED needed now"} {
		if !strings.Contains(buf.String(), want) {
			t.Errorf("page lacks %q:\n%s", want, buf.String())
		}
	}
}

func TestPageEscapesThePayload(t *testing.T) {
	var buf bytes.Buffer
	err := euserver.Page([]euserver.Received{{Payload: "<script>alert(1)</script>"}}).Render(t.Context(), &buf)
	if err != nil {
		t.Fatal(err)
	}

	if strings.Contains(buf.String(), "<script>") {
		t.Fatalf("payload was not escaped:\n%s", buf.String())
	}
}

func TestIngestStoresAValidMessageAndThePageShowsIt(t *testing.T) {
	pub, wire := signedRequest(t)
	h := euserver.New(pub).Handler()

	if code, body := do(t, h, http.MethodPost, "/ingest", wire); code != http.StatusAccepted {
		t.Fatalf("ingest returned %d %q, want 202", code, body)
	}

	code, page := do(t, h, http.MethodGet, "/", nil)
	if code != http.StatusOK {
		t.Fatalf("page returned %d", code)
	}
	id, err := protocol.ID(wire)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{id, "LIFE_CRITICAL", "AED needed now"} {
		if !strings.Contains(page, want) {
			t.Errorf("page lacks %q", want)
		}
	}
}

func TestIngestRejectsAFlippedBit(t *testing.T) {
	pub, wire := signedRequest(t)
	wire[len(wire)/2] ^= 0x01
	h := euserver.New(pub).Handler()

	if code, _ := do(t, h, http.MethodPost, "/ingest", wire); code != http.StatusBadRequest {
		t.Fatalf("ingest returned %d, want 400", code)
	}
	if _, page := do(t, h, http.MethodGet, "/", nil); strings.Contains(page, "AED needed now") {
		t.Fatal("a rejected message appears on the page")
	}
}

func TestIngestAcceptsPostOnly(t *testing.T) {
	pub, _ := signedRequest(t)

	if code, _ := do(t, euserver.New(pub).Handler(), http.MethodGet, "/ingest", nil); code != http.StatusMethodNotAllowed {
		t.Fatalf("GET /ingest returned %d, want 405", code)
	}
}

func TestHealthz(t *testing.T) {
	pub, _ := signedRequest(t)

	if code, _ := do(t, euserver.New(pub).Handler(), http.MethodGet, "/healthz", nil); code != http.StatusOK {
		t.Fatalf("healthz returned %d, want 200", code)
	}
}
