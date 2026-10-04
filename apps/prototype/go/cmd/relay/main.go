// Command relay is a radio relay of the skeleton. With -ingest it is the gateway.
package main

import (
	"context"
	"crypto/ed25519"
	"flag"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/broker"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/relay"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/svc"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/vectors"
)

func main() {
	brokerAddr := flag.String("broker", "broker:7000", "broker address")
	id := flag.String("id", "relay", "node id: relay or gateway")
	ingest := flag.String("ingest", "", "server /ingest URL; setting it makes this node the gateway")
	health := flag.String("health", ":8080", "address for /healthz")
	healthcheck := flag.Bool("healthcheck", false, "check the local /healthz and exit")
	flag.Parse()
	if *healthcheck {
		svc.HealthcheckExit(*health)
	}

	log := svc.NewLogger(os.Stderr, *id)
	ctx, stop := svc.Context()
	defer stop()

	r := &relay.Relay{PublicKey: vectors.SkeletonKey().Public().(ed25519.PublicKey), Node: *id, Log: log}
	if *ingest != "" {
		r.Ingest = relay.HTTPIngest(&http.Client{Timeout: 5 * time.Second}, *ingest)
	}

	conn, err := dialWithRetry(ctx, *brokerAddr, *id)
	if err != nil {
		log.Error("broker unreachable", "err", err)
		os.Exit(1)
	}
	// Healthy only once registered, so a service that waits on this one can send straight away.
	go func() {
		if err := svc.ServeHTTP(ctx, *health, svc.HealthHandler()); err != nil {
			log.Error("health server failed", "err", err)
		}
	}()
	log.Info("connected to broker", "addr", *brokerAddr, "gateway", *ingest != "")
	if err := r.Serve(ctx, conn); err != nil {
		log.Error("serve failed", "err", err)
		os.Exit(1)
	}
}

func dialWithRetry(ctx context.Context, addr, id string) (net.Conn, error) {
	var lastErr error
	for range 30 {
		conn, err := broker.Dial(ctx, addr, id)
		if err == nil {
			return conn, nil
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Second):
		}
	}
	return nil, lastErr
}
