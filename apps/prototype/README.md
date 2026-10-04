# Pomóc prototype

A locally emulated prototype of the Pomóc civic mesh. It runs real nodes in containers on one
machine: a radio broker standing in for the air, relay and gateway nodes, and the Elevated User
Server that authorities use. Messages are real signed protocol messages, not a model of them.

The browser simulation in [`apps/sim`](../sim/README.md) shows how the mesh behaves at city scale.
This prototype is the other half: the protocol and services as they would be built, running end to
end on a small network. It shares no code with the simulation.

## Status

One request travels end to end over a fixed three-node line, and `task check`, `task test:integration`
and `task test:e2e` pass. The protocol core is partly built. The certificate authority, the phone
SDK, the real radio emulation and the authority dashboard are not built yet;
[`ROADMAP.md`](ROADMAP.md) lists what is left, in order.

A phone container signs one `LIFE_CRITICAL` request ("AED needed now") with Ed25519 and sends it
through the broker. The relay verifies the signature and forwards it. The gateway verifies it again
and posts it over HTTP to the server, which lists it on its page. The relay and the gateway each log
one JSON decision line per frame.

| Built | Where | Limits |
|---|---|---|
| End-to-end path: phone, relay, gateway, server | `apps/prototype/go/internal/`, `apps/prototype/compose.yaml` | One fixed key. The server shows a plain table of received messages |
| Wire format, frame layer, strict CBOR codec | `apps/prototype/go/protocol/frame.go`, `apps/prototype/go/protocol/codec.go`, specified in [`spec/wire-format.md`](spec/wire-format.md) | |
| Ed25519 signing, one signature check, message id | `apps/prototype/go/protocol/sign.go` | |
| The 15 message classes with codes and payload budgets | `apps/prototype/go/protocol/class.go` | No priorities or mode matrix yet |
| Time check, replay window, replay cache | `apps/prototype/go/protocol/replay.go` | A library only; the relay does not call it yet |
| Decision events | `apps/prototype/go/protocol/event/event.go`, specified in [`spec/log-events.md`](spec/log-events.md) | |
| Kotlin SDK | `apps/prototype/kotlin/` | Checks the shared test vectors only |

The codec rejects every non-canonical encoding and anything over 1024 bytes. Without free text,
every class at its full payload budget fits the 240-byte frame budget of NFR-PERF-01;
`TestAllClassesFit240` in `apps/prototype/go/protocol/frame_test.go` checks it.

### Known gaps in what is built

These are simplifications in working code. None blocks the demo.

- The broker trusts the node id each connection claims, so any connection can pose as the relay.
- The broker and its clients set no read deadlines, and a slow neighbour blocks the sender.
- The server keeps every message it receives with no limit and no de-duplication.
- Nodes do not count hops yet, so every decision line says `"hop": 0`.
- Some services log plain text lines among the JSON lines.

## Run it

You need [mise](https://mise.jdx.dev), which installs every other tool at the version pinned in
`apps/prototype/mise.toml`, and a Docker daemon (Docker Desktop, OrbStack or Colima) with
`docker buildx` and `docker compose`. Run every command below from `apps/prototype/`.

```sh
mise install          # Go, JDK, Gradle, Task, golangci-lint and the rest, at pinned versions
mise exec -- task doctor
```

`task doctor` prints `ok` for each tool and for the Docker daemon. A `FAIL` line names the tool and
the version it wanted.

### Tests

| Command | What it runs | Needs Docker |
|---|---|---|
| `mise exec -- task check` | Go lint, generated-template check, Go unit tests, Kotlin `check` | no |
| `mise exec -- task test:integration` | A testcontainers smoke test | yes |
| `mise exec -- task test:e2e` | Builds the images, starts `compose.yaml`, sends a request, checks the server page and the decision lines | yes |

Each prints `ok` per Go package, and `task check` ends with `BUILD SUCCESSFUL` from Gradle. No
continuous integration is set up; the tests run locally.

### Demo by hand

```sh
mise exec -- task build                     # images pomoc/broker, relay, euserver, skeletonphone
docker compose up -d --wait                 # broker, relay, gateway, server
docker compose port server 8080             # prints 127.0.0.1:<port>
docker run --rm --network pomoc-skeleton_radio pomoc/skeletonphone:dev -broker broker:7000
```

Open `http://127.0.0.1:<port>/`. The table shows one `LIFE_CRITICAL` row from signer
`d75a980182b10ab7` with sequence 17 and payload `AED needed now`. Each run of the phone container
adds one row.

`docker compose logs relay gateway` shows the decisions: the relay logs `"decision":"forward"` and
the gateway logs `"decision":"post"`, both with `"reason":"valid"`. Stop with `docker compose down`.

## Layout

| Path | What it is |
|---|---|
| `apps/prototype/go/protocol/` | The protocol library. Pure Go with no network access; only the `vectors` subpackage reads files |
| `apps/prototype/go/internal/` | The services: `broker`, `relay` (also the gateway), `euserver`, `phone`, and `svc` for logging and health checks. `skeleton` holds the in-process end-to-end test |
| `apps/prototype/go/cmd/` | One `main.go` per binary, plus `vectors`, which regenerates the shared test vectors |
| `apps/prototype/kotlin/` | Gradle build for `pomoc-sdk`. Today it holds the test-vector checks only |
| `apps/prototype/spec/` | The open specification and the JSON test vectors shared by Go and Kotlin |
| `apps/prototype/e2e/` | A separate Go module with the testcontainers tests |
| `apps/prototype/docker/Dockerfile.go` | One Dockerfile for every Go service, selected by the `SERVICE` build argument |
| `apps/prototype/compose.yaml` | The four-container stack |
| `apps/prototype/docker-bake.hcl` | Builds all images in one `docker buildx bake` |
| `apps/prototype/Taskfile.yml` | The `task` commands above, and `task --list` for the rest |
| `apps/prototype/mise.toml` | Tool versions |
| `apps/prototype/scripts/` | The `task doctor` check and its test |

`apps/prototype/go/internal/euserver/page_templ.go` is generated from `page.templ`. Regenerate it
with `go tool templ generate` in `apps/prototype/go/`; `task check` fails if it is out of date.

## Licence

The prototype is licensed under Apache-2.0, in [`LICENSE`](LICENSE). Third-party test data is listed
in [`NOTICE`](NOTICE), and every library, tool and image with its licence in
[`THIRD_PARTY.md`](THIRD_PARTY.md). The rest of this repository has no licence file of its own.

## Disclosure

The prototype's code, tests and documentation were written with AI assistance (Claude Code). The
Disclosure section of the [root README](../../README.md#disclosure) covers only the concept, research
and documentation, so this section adds the prototype code to it.

## Related

- [Roadmap](ROADMAP.md)
- [Wire format specification](spec/wire-format.md)
- [Concept](../../docs/concept.md)
- [Functional requirements](../../docs/requirements/functional.md)
- [Non-functional requirements](../../docs/requirements/non-functional.md)
- [Simulation](../sim/README.md)
