package svc_test

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/svc"
)

func TestHealthHandlerReturnsOK(t *testing.T) {
	rec := httptest.NewRecorder()

	svc.HealthHandler().ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", rec.Code)
	}
}

func TestHealthHandlerRejectsOtherPaths(t *testing.T) {
	rec := httptest.NewRecorder()

	svc.HealthHandler().ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404", rec.Code)
	}
}

func TestLoggerWritesJSONLines(t *testing.T) {
	var buf bytes.Buffer

	svc.NewLogger(&buf, "relay").Info("hello", "k", "v")

	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatalf("not JSON: %v: %q", err, buf.String())
	}
	if line["msg"] != "hello" || line["service"] != "relay" || line["k"] != "v" || line["level"] != slog.LevelInfo.String() {
		t.Fatalf("unexpected line: %v", line)
	}
}

func TestCheckHealthSucceedsOnOK(t *testing.T) {
	srv := httptest.NewServer(svc.HealthHandler())
	t.Cleanup(srv.Close)

	if err := svc.CheckHealth(t.Context(), srv.URL+"/healthz"); err != nil {
		t.Fatal(err)
	}
}

func TestCheckHealthFailsOnNon200(t *testing.T) {
	srv := httptest.NewServer(svc.HealthHandler())
	t.Cleanup(srv.Close)

	if err := svc.CheckHealth(t.Context(), srv.URL+"/missing"); err == nil {
		t.Fatal("want an error for a 404")
	}
}

func TestCheckHealthFailsWhenNothingListens(t *testing.T) {
	srv := httptest.NewServer(svc.HealthHandler())
	url := srv.URL + "/healthz"
	srv.Close()

	if err := svc.CheckHealth(t.Context(), url); err == nil {
		t.Fatal("want an error when the server is down")
	}
}
