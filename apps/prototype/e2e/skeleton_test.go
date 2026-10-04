//go:build integration

package e2e_test

import (
	"bytes"
	"cmp"
	"context"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/compose"
	"github.com/testcontainers/testcontainers-go/network"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/event"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/vectors"
)

const stackName = "pomoc-e2e"

// TestSkeletonRequestReachesTheServerPage runs the images from `task build` through compose.yaml: the
// phone sends one signed request over the broker and the relay, and the gateway posts it to the server.
func TestSkeletonRequestReachesTheServerPage(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	stack, err := compose.NewDockerComposeWith(compose.WithStackFiles("../compose.yaml"), compose.StackIdentifier(stackName))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		down, cancel := context.WithTimeout(context.WithoutCancel(ctx), time.Minute)
		defer cancel()
		if err := stack.Down(down, compose.RemoveOrphans(true), compose.RemoveVolumes(true)); err != nil {
			t.Errorf("compose down: %v", err)
		}
	})
	if err := stack.Up(ctx, compose.Wait(true)); err != nil {
		t.Fatalf("compose up: %v", err)
	}

	phone, err := testcontainers.Run(ctx, "pomoc/skeletonphone:"+tag(),
		testcontainers.WithCmd("-broker", "broker:7000"),
		network.WithNetworkName([]string{"phone"}, stackName+"_radio"),
		testcontainers.WithWaitStrategy(wait.ForExit()),
	)
	testcontainers.CleanupContainer(t, phone)
	if err != nil {
		t.Fatalf("run the phone: %v", err)
	}
	if state, err := phone.State(ctx); err != nil || state.ExitCode != 0 {
		t.Fatalf("the phone did not exit 0: state %+v, err %v", state, err)
	}

	server, err := stack.ServiceContainer(ctx, "server")
	if err != nil {
		t.Fatal(err)
	}
	url, err := server.PortEndpoint(ctx, "8080/tcp", "http")
	if err != nil {
		t.Fatal(err)
	}

	id, err := protocol.ID(signedReference(t))
	if err != nil {
		t.Fatal(err)
	}

	var page string
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		page = get(ctx, t, url)
		if strings.Contains(page, id) && strings.Contains(page, "LIFE_CRITICAL") && strings.Contains(page, "AED needed now") {
			assertDecision(ctx, t, stack, "relay", event.Forward)
			assertDecision(ctx, t, stack, "gateway", event.Post)
			return
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatalf("the server page never showed the request:\n%s", page)
}

// assertDecision reads a service's container log and expects exactly one valid decision event of the given kind.
func assertDecision(ctx context.Context, t *testing.T, stack *compose.DockerCompose, service string, want event.Decision) {
	t.Helper()
	ctr, err := stack.ServiceContainer(ctx, service)
	if err != nil {
		t.Fatal(err)
	}
	logs, err := ctr.Logs(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = logs.Close() }()
	raw, err := io.ReadAll(logs)
	if err != nil {
		t.Fatal(err)
	}

	var got []event.Event
	for _, line := range bytes.Split(raw, []byte("\n")) {
		if e, ok := event.Parse(line); ok {
			got = append(got, e)
		}
	}
	if len(got) != 1 || got[0].Decision != want || got[0].Reason != event.ReasonValid || got[0].Node != service {
		t.Fatalf("%s decision events = %+v, want one valid %s\nlog:\n%s", service, got, want, raw)
	}
}

// signedReference is the request skeletonphone sends: the reference request under the skeleton key.
func signedReference(t *testing.T) []byte {
	t.Helper()
	wire, err := protocol.Sign(protocol.Ed25519Key(vectors.SkeletonKey()), protocol.ReferenceRequest())
	if err != nil {
		t.Fatal(err)
	}
	return wire
}

func get(ctx context.Context, t *testing.T, url string) string {
	t.Helper()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

// tag is the image tag compose.yaml and docker-bake.hcl share.
func tag() string { return cmp.Or(os.Getenv("TAG"), "dev") }
