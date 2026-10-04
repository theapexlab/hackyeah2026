// Command skeletonphone sends one signed reference request through the broker and exits.
package main

import (
	"flag"
	"os"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/phone"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/svc"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/vectors"
)

func main() {
	brokerAddr := flag.String("broker", "broker:7000", "broker address")
	flag.Parse()

	log := svc.NewLogger(os.Stderr, "phone")
	ctx, stop := svc.Context()
	defer stop()

	if err := phone.Send(ctx, *brokerAddr, vectors.SkeletonKey(), protocol.ReferenceRequest()); err != nil {
		log.Error("send failed", "err", err)
		os.Exit(1)
	}
	log.Info("request sent")
}
