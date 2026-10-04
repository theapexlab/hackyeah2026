// Package svc holds what every service binary shares: JSON logging, a health endpoint and signal
// handling.
package svc

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/event"
)

// NewLogger returns a JSON logger that tags each line with the service name.
func NewLogger(w io.Writer, service string) *slog.Logger {
	return event.NewLogger(w).With("service", service)
}

// HealthHandler answers 200 on /healthz and 404 elsewhere.
func HealthHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	return mux
}

// Context is cancelled on SIGINT or SIGTERM.
func Context() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
}

// ServeHTTP serves h on addr until ctx ends.
func ServeHTTP(ctx context.Context, addr string, h http.Handler) error {
	srv := &http.Server{Addr: addr, Handler: h, ReadHeaderTimeout: 5 * time.Second}
	drained := make(chan struct{})
	go func() {
		defer close(drained)
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	<-drained
	return nil
}

// CheckHealth GETs url and fails unless it answers 200. A distroless image has no curl, so the
// binary checks itself: `<binary> -healthcheck` is the container's HEALTHCHECK command.
func CheckHealth(ctx context.Context, url string) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("svc: %s answered %s", url, resp.Status)
	}
	return nil
}

// HealthcheckExit runs CheckHealth against the local health address and exits the process.
func HealthcheckExit(addr string) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if host == "" {
		host = "127.0.0.1"
	}
	if err := CheckHealth(context.Background(), "http://"+net.JoinHostPort(host, port)+"/healthz"); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	os.Exit(0)
}
