//go:build integration

package smoke_test

import (
	"context"
	"testing"
	"time"

	"github.com/moby/moby/api/types/container"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestContainerBecomesHealthy(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	ctr, err := testcontainers.Run(ctx, "alpine:3.22",
		testcontainers.WithCmd("sleep", "120"),
		testcontainers.WithConfigModifier(func(c *container.Config) {
			c.Healthcheck = &container.HealthConfig{
				Test:     []string{"CMD", "true"},
				Interval: time.Second,
				Retries:  3,
			}
		}),
		testcontainers.WithWaitStrategy(wait.ForHealthCheck()),
	)
	testcontainers.CleanupContainer(t, ctr)
	if err != nil {
		t.Fatalf("start container: %v", err)
	}

	state, err := ctr.State(ctx)
	if err != nil {
		t.Fatalf("read state: %v", err)
	}
	if state.Health == nil || state.Health.Status != "healthy" {
		t.Fatalf("container is not healthy: %+v", state.Health)
	}
}
