// Command euserver is the Elevated User Server of the skeleton.
package main

import (
	"crypto/ed25519"
	"flag"
	"os"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/euserver"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/svc"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/vectors"
)

func main() {
	listen := flag.String("listen", ":8080", "address for the page, /ingest and /healthz")
	healthcheck := flag.Bool("healthcheck", false, "check the local /healthz and exit")
	flag.Parse()
	if *healthcheck {
		svc.HealthcheckExit(*listen)
	}

	log := svc.NewLogger(os.Stderr, "euserver")
	ctx, stop := svc.Context()
	defer stop()

	pub := vectors.SkeletonKey().Public().(ed25519.PublicKey)
	log.Info("euserver listening", "addr", *listen)
	if err := svc.ServeHTTP(ctx, *listen, euserver.New(pub).Handler()); err != nil {
		log.Error("serve failed", "err", err)
		os.Exit(1)
	}
}
