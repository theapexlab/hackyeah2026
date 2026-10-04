// Command broker is the radio stand-in: it connects the skeleton nodes by a fixed adjacency.
package main

import (
	"flag"
	"net"
	"os"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/broker"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/svc"
)

func main() {
	listen := flag.String("listen", ":7000", "address for node connections")
	health := flag.String("health", ":8080", "address for /healthz")
	healthcheck := flag.Bool("healthcheck", false, "check the local /healthz and exit")
	flag.Parse()
	if *healthcheck {
		svc.HealthcheckExit(*health)
	}

	log := svc.NewLogger(os.Stderr, "broker")
	ctx, stop := svc.Context()
	defer stop()

	ln, err := (&net.ListenConfig{}).Listen(ctx, "tcp", *listen)
	if err != nil {
		log.Error("listen failed", "err", err)
		os.Exit(1)
	}
	b := broker.New(broker.SkeletonAdjacency())
	go func() {
		<-ctx.Done()
		_ = b.Close()
	}()
	go func() {
		if err := svc.ServeHTTP(ctx, *health, svc.HealthHandler()); err != nil {
			log.Error("health server failed", "err", err)
		}
	}()

	log.Info("broker listening", "addr", ln.Addr().String())
	if err := b.Serve(ln); err != nil {
		log.Error("serve failed", "err", err)
		os.Exit(1)
	}
}
