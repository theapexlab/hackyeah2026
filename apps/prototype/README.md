# Pomóc prototype

A locally emulated prototype of the Pomóc civic mesh. It runs real nodes in containers on one
machine: a radio broker standing in for the air, relay and gateway nodes, and the Elevated User
Server that authorities use. Messages are real signed protocol messages, not a model of them.

The browser simulation in [`apps/sim`](../sim/README.md) shows how the mesh behaves at city scale.
This prototype is the other half: the protocol and services as they would be built, running end to
end on a small network. It shares no code with the simulation.

## Status

The prototype runs end to end on a three-node line, and `task check`, `task test:integration` and
`task test:e2e` pass. The protocol core is
partly built. The certificate authority, the phone SDK, the real radio emulation and the authority
dashboard are not built yet.

| Area | State |
|---|---|
| Toolchain, build, containers, tests | Working |
| End-to-end path: phone, relay, gateway, server | Working, with one fixed key and a fixed three-node line |
| Wire format, strict codec, signatures | Working, specified in `apps/prototype/spec/wire-format.md` |
| Time check, replay window, replay cache | Working as a library, not yet used by the relay |
| Classes, priorities, mode matrix | Not built |
| Credentials, trust bundle, certificate authority | Not built |
| Forwarding decision, rate limits, store and forward | Not built |
| Kotlin phone SDK | Not built. The Kotlin side checks the shared test vectors only |
| Authority dashboard, declarations, alerts | Not built. The server shows a plain table of received messages |
| Scenarios, Kraków fixture, metrics | Not built |

### What works today

A phone container signs one `LIFE_CRITICAL` request ("AED needed now") with Ed25519 and sends it
through the broker. The relay verifies the signature and forwards it. The gateway verifies it again
and posts it over HTTP to the server, which lists it on its page. The relay and the gateway each log
one JSON decision line per frame, defined in [`apps/prototype/spec/log-events.md`](spec/log-events.md).

The Go protocol library in `apps/prototype/go/protocol/` has:

- the 15 message classes with fixed codes and payload budgets (`class.go`)
- the frame layer: hop count and recorded path around the signed message (`frame.go`)
- a deterministic CBOR codec that rejects every non-canonical encoding and anything over 1024 bytes
  (`codec.go`)
- Ed25519 signing, one signature check for the whole protocol, and the message id (`sign.go`)
- the timestamp check, the 64-slot sequence window per signer and the replay cache (`replay.go`)
- the decision event the nodes log (`event/event.go`)

Every legal message fits the 240-byte frame budget from NFR-PERF-01. `TestAllClassesFit240` in
`apps/prototype/go/protocol/frame_test.go` checks it, and the table is in the wire format spec.

### Known gaps in what is built

These are simplifications in working code. None blocks the demo.

- The broker trusts the node id each connection claims, so any connection can pose as the relay.
- The broker and its clients set no read deadlines, and a slow neighbour blocks the sender.
- The server keeps every message it receives with no limit and no de-duplication.
- Nodes do not count hops yet, so every decision line says `"hop": 0`.
- Some services log plain text lines among the JSON lines.

## What is left, in order

Each phase depends only on the phases named beside it. Phases 2 and 3 can start in parallel once
phase 1 is done.

| Phase | Builds | Depends on | State |
|---|---|---|---|
| 0 Foundations | Pinned toolchain, build, containers, the end-to-end path above | none | Done |
| 1 Protocol core | Go protocol library, open specification, shared test vectors | 0 | 4 of 14 steps done |
| 2 Certificate authority | Registration: checks identity, attestation and proof of possession, then signs the certificate over the phone's own public key; renewal; region-scoped declaration keys for local authorities; transparency log; web certificates | 1 | Not started |
| 3 Radio, relay, gateway | Broker with link loss, delay, power and backhaul; relay with disk buffer, topology gossip, captive portal | 1, and 2 for credentials | Not started |
| 4 Kotlin SDK | Phone library that generates its key on the device, and a host that runs many virtual phones in one JVM | 1, then 2 and 3 | Not started |
| 5 Elevated User Server | Role login for the local authority's crisis office and for Police, Fire, Emergency Medical Services and Military; live dashboard; mode declarations and alerts for the authority's own region, L3 with two approvers | 2, 3 | Not started |
| 6 Scenarios and metrics | A Kraków district fixture, ten scripted scenarios, reach and delivery metrics, a one-command demo | 2 to 5 | Not started |
| 7 Hardening | Security scans, decoder fuzzing, reproducible builds, licence audit, clean-clone check | 0 to 6 | Not started |

Phase 1 steps:

| Step | State |
|---|---|
| Wire format and size budget | Done |
| Strict deterministic codec | Done |
| Signature envelope and message id | Done |
| Time, replay and sequence window | Done |
| Classes, priorities and the mode matrix | Next |
| Compact credential and trust bundle | Open |
| Validity, grace period and role rules | Open |
| Credential reference, announce and hold | Open |
| Policy and the mode state machine | Open |
| The forwarding decision pipeline | Open |
| Rate limits, de-duplication cache, queue and expiry | Open |
| Privacy and scope checks | Open |
| Shared test vectors for the new rules | Open |
| Specification review | Open |

Open questions for phase 1:

- Which drop reason a sequence number below the replay window maps to. The candidates are
  `DUPLICATE` and `STALE_TIMESTAMP`.
- Where the replay window is persisted between restarts. `Window` in
  `apps/prototype/go/protocol/replay.go` has no exported state yet.
- The time and window rules have no shared test vectors yet. They need them before the Kotlin SDK
  implements the same rules.

Trust model for phases 2 and 4: the phone generates its own key pair, and the authority only signs
the certificate over the public key, as `docs/concept.md` and FR-ID-02 to FR-ID-04 describe. No
private key travels anywhere. Containers have no secure element and no hardware attestation, so
the emulation needs a software stand-in for both.

### Target design

When phase 6 is done, the stack grows to run a whole district:

```
 phone (Kotlin host, N virtual phones)      router (relay)              gateway (relay with backhaul)
        |  TCP frames                           |  TCP frames                 |  TCP frames
        +-----------------> radio broker <------+-----------------------------+
                            (adjacency, loss, delay, power, backhaul flag)
                                                                              |  HTTPS, only when backhaul is up
                                                          +-------------------+-------------------+
                                                          v                                       v
                                                 Certificate authority                    Elevated User Server
                                                 (sign certificates, renew, certify       (ingest, dashboard, role login,
                                                  region keys, transparency log)           declaration console, alert console)
```

The broker is the only path between mesh nodes. A node reaches the certificate authority or the
server only while the broker reports its backhaul as up, which follows FR-NET-11.

## Run it

### Prerequisites

- [mise](https://mise.jdx.dev), which installs every other tool at the pinned version from
  `apps/prototype/mise.toml`
- A Docker daemon (Docker Desktop, OrbStack or Colima) with `docker buildx` and `docker compose`

Run every command below from `apps/prototype/`.

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
| `apps/prototype/go/internal/` | The services: `broker`, `relay` (also the gateway), `euserver`, `phone`, and `svc` for logging and health checks |
| `apps/prototype/go/cmd/` | One `main.go` per binary, plus `vectors`, which regenerates the shared test vectors |
| `apps/prototype/kotlin/` | Gradle build for `pomoc-sdk`. Today it holds the test-vector checks only |
| `apps/prototype/spec/` | The open specification and the JSON test vectors shared by Go and Kotlin |
| `apps/prototype/e2e/` | A separate Go module with the testcontainers tests |
| `apps/prototype/docker/Dockerfile.go` | One Dockerfile for every Go service, selected by the `SERVICE` build argument |
| `apps/prototype/compose.yaml` | The four-container stack |
| `apps/prototype/docker-bake.hcl` | Builds all images in one `docker buildx bake` |
| `apps/prototype/Taskfile.yml` | Every command above |
| `apps/prototype/mise.toml` | Tool versions |
| `apps/prototype/scripts/` | The `task doctor` check and its test |

`apps/prototype/go/internal/euserver/page_templ.go` is generated from `page.templ`. Regenerate it
with `go tool templ generate` in `apps/prototype/go/`; `task check` fails if it is out of date.

## Technology and licences

The prototype itself is licensed under Apache-2.0, in [`LICENSE`](LICENSE). Third-party test data is
listed in [`NOTICE`](NOTICE). The rest of this repository has no licence file of its own.

Every licence below was read from the package's own licence file or POM, in the local Go module
cache and Gradle cache.

### Libraries built into the services and the SDK

| Library | Version | Used for | Licence |
|---|---|---|---|
| [fxamacker/cbor](https://github.com/fxamacker/cbor) | 2.9.4 | Deterministic CBOR encoding in Go | MIT |
| [x448/float16](https://github.com/x448/float16) | 0.8.4 | Dependency of fxamacker/cbor | MIT |
| [templ](https://github.com/a-h/templ) | 0.3.1020 | HTML templates for the Elevated User Server | MIT |
| Go standard library (`crypto/ed25519`, `crypto/sha256`, `net/http`, `log/slog`) | 1.27.1 | Signatures, hashing, HTTP, logging | BSD-3-Clause |
| [kotlinx.serialization](https://github.com/Kotlin/kotlinx.serialization) CBOR and JSON | 1.11.0 | CBOR for the Kotlin SDK (used by the vector tests today), JSON for reading the vectors | Apache-2.0 |
| Kotlin standard library | 2.4.20 | Kotlin runtime | Apache-2.0 |

### Test libraries

| Library | Version | Used for | Licence |
|---|---|---|---|
| [testcontainers-go](https://github.com/testcontainers/testcontainers-go) and its compose module | 0.44.0 | Integration and end-to-end tests | MIT |
| [moby/moby/api](https://github.com/moby/moby) | 1.55.0 | Container types for the tests | Apache-2.0 |
| [docker/compose](https://github.com/docker/compose) | 5.2.0 | Pulled in by the testcontainers compose module | Apache-2.0 |
| [rapid](https://github.com/flyingmutant/rapid) | 1.3.0 | Property-based tests of the codec and signatures | MPL-2.0 |
| [JUnit](https://junit.org) Jupiter | 6.1.3 | Kotlin tests | EPL-2.0 |

### Build and development tools

| Tool | Version | Used for | Licence |
|---|---|---|---|
| [Go](https://go.dev) | 1.27.1 | Compiler and toolchain | BSD-3-Clause |
| [Eclipse Temurin](https://adoptium.net) JDK | 25.0.4 | Runs Gradle and the Kotlin build | GPL-2.0 with Classpath Exception |
| [Gradle](https://gradle.org), including the committed wrapper | 9.8.0 | Kotlin build | Apache-2.0 |
| Kotlin Gradle plugin and serialization plugin | 2.4.20 | Kotlin compilation | Apache-2.0 |
| [ktlint-gradle](https://github.com/JLLeitschuh/ktlint-gradle) | 14.2.0 | Kotlin lint | MIT |
| [Kover](https://github.com/Kotlin/kotlinx-kover) | 0.9.11 | Kotlin coverage | Apache-2.0 |
| [Task](https://taskfile.dev) | 3.54.0 | Command runner | MIT |
| [golangci-lint](https://golangci-lint.run) | 2.14.0 | Go lint | GPL-3.0 |
| [gotestsum](https://github.com/gotestyourself/gotestsum) | 1.13.0 | Pinned for test output, not used yet | Apache-2.0 |
| [govulncheck](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck) | 1.8.0 | Pinned for vulnerability scans, not used yet | BSD-3-Clause |
| [mise](https://mise.jdx.dev) | any | Installs the pinned tools | MIT |
| Docker Engine, Buildx, Compose | any recent | Images and the local stack | Apache-2.0 |

None of these tools is linked into or shipped with the prototype, so their licences, including
golangci-lint's GPL-3.0 and Temurin's GPL-2.0, do not reach its code.

### Container images

| Image | Used for | Licence |
|---|---|---|
| `golang:1.27.1-alpine` | Build stage only, not in the final image | Go: BSD-3-Clause. Alpine packages: their own licences |
| `gcr.io/distroless/static-debian13:nonroot` | Base of every service image | The distroless project is Apache-2.0. It contains Debian `base-files`, `ca-certificates`, `netbase` and `tzdata`, each under its own licence, listed in the image under `/usr/share/doc` |

### Test data

| File | Source | Licence |
|---|---|---|
| `apps/prototype/spec/testvectors/ed25519/rfc8032-1.json` | RFC 8032 section 7.1, test 1 | IETF Trust, Revised BSD for code components |
| `apps/prototype/spec/testvectors/ed25519/wycheproof-sample.json` | Project Wycheproof, Ed25519 vectors | Apache-2.0 |
| `apps/prototype/spec/testvectors/skeleton/request-1.json` | Generated by `go run ./go/cmd/vectors -update` | Apache-2.0, part of this prototype |

The secret key in these files is the public RFC 8032 test key. It is not a credential.

## Related

- [Concept](../../docs/concept.md)
- [Functional requirements](../../docs/requirements/functional.md)
- [Non-functional requirements](../../docs/requirements/non-functional.md)
- [Wire format specification](spec/wire-format.md)
- [Simulation](../sim/README.md)
