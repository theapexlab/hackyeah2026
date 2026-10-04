# @pomoc/sim — the Pomóc mesh simulation

An offline, frontend-only simulation of the Pomóc civic mesh: phones, ISP routers and
satellite gateways form a proximity graph on a district map (hand-traced Kraków for seed 42,
procedural otherwise), messages flood hop by hop, and the network flips between Peace and the L1 / L2 / L3 emergency levels. All
business rules live in `@pomoc/core`; this app only renders and dispatches.

## Running

From the repository root (pnpm workspace):

```bash
pnpm install
pnpm dev                        # Vite dev server for apps/sim
pnpm build                      # production bundle in apps/sim/dist (relative base; serve it with pnpm preview or any static server, ES modules do not load from file://)
pnpm preview                    # serve the built bundle
pnpm typecheck                  # tsc for core and sim
pnpm test                       # core engine + sim tests
pnpm --filter @pomoc/sim test   # sim tests only (pure modules: particles, store, event text, ...)
pnpm check                      # Biome lint + format (pnpm check:fix to auto-format)
```

The app opens playing on the default world (seed 42 = Kraków · Kazimierz, 2200 × 1300 m,
200 phones, 120 routers, 4 satellite gateways, phones on the move); fire events, or Generate
another world from the left panel. Reset regenerates the same seed, so a repeated event script gives an identical log (the
engine is deterministic). A lime badge counts the requests a phone currently sees as open.

Time is real: a tick stands for 200 ms of simulated time (the Tick length slider) and takes
just as long at 1×; 10× and 60× run 50 and 300 ticks a second (at 60× several ticks per
frame). Protocol timings such as TTLs stay in ticks.

Street traffic at real speeds: at every moment 10% of the phones walk at 2–3 km/h (walking
icon, cyan dot), 5% cycle at 10 km/h (bike icon, indigo dot) and 10% drive at 50 km/h (car
icon, pink dot). A traveller stops where it arrives, lingers 30 s to 5 min, then sets off
again in whichever mode is short of people, or stays put for good while a still phone sets
off instead; the HUD counts who is walking, cycling and driving. Walkers may cross a park on
the way, bikes and cars stay on the streets.

Seed 42 ignores the Width / Height sliders (they lock and show the map's size); every other
seed draws a procedural street grid of the configured size. Nothing is ever generated or
dropped in the Vistula. Phones start on streets; gateways on the most central street junctions (the first on the
central hub, the others at least 400 m apart); routers stand anywhere except the
river and the parks. The engine moves a phone or gateway dropped in the water onto the nearest
street, and a router dropped in the water or a park to the nearest allowed spot.

Dev-only:

- `/?fixture=1` shows a fabricated world without the engine (`src/dev/fixture.ts`).
- `/?ref=1` lays the map screenshot the Kraków streets were traced from under the nodes, at
  45% opacity, to check the trace while panning and zooming (`src/dev/RefOverlay.tsx`). The
  image is third-party imagery: it lives in `apps/sim/dev-ref/krakow-ref.webp`, which git
  ignores and the build never copies; without it the overlay is just a missing image.

Neither is part of the production bundle.

The Kraków data (`packages/core/src/terrain/krakowData.ts`) was traced once from that
screenshot: the river and parks from colour masks, the streets from a vectorised road mask
plus hand-traced major roads and bridges, with label gaps healed and stray blocks joined so the
street graph is one connected network. Edit it by hand (screenshot pixels); the core terrain
tests check connectivity, bridges and park gates.

## Hotkeys

Hotkeys are ignored while typing in a text field; Esc first leaves the field, a second Esc
deselects. While the shortcuts sheet (`?` button) is open only Esc acts.

| Key           | Event                                                                 |
| ------------- | --------------------------------------------------------------------- |
| `c`           | Cells up / down (phones lose WAN, fall to L1 after a few ticks)       |
| `g`           | Grid off / on (routers without battery go dark, islands form)         |
| `1` `2` `3`   | Authority declares L1 / L2 / L3 for the whole area                    |
| `0`           | All-clear (L3 steps down through L1)                                  |
| `a`           | Broadcast an official alert (injected at every node with a backhaul)  |
| `r`           | Random citizen request, class drawn from the sender's current mode    |
| `x`           | Act upon requests: the nearest eligible phone accepts the oldest one  |
| `f`           | Forged request from an unregistered phone (every neighbour rejects it)|
| `space`       | Play / pause                                                          |
| `.`           | Step one tick                                                         |
| `+` `-`       | Faster / slower (1× real time, 10×, 60×)                              |
| `v`           | Toggle radio range circles                                            |
| `t`           | Toggle topology gossip packets (hidden by default)                    |
| `h`           | Fit the whole area in view                                            |
| `d`           | Dark / light scheme                                                   |
| `Esc`         | Deselect / close inspector                                            |

Regional declarations, all-clear by region, custom alert text and forged authority
messages are in the Authority console (badge top-right of the map). Node actions (send a
request, accept one, check in, power a node off) are in the inspector that opens on click.

## Architecture: React owns what you click, the canvas owns what moves

```
ConfigPanel ─Generate─▶ sim/store.createWorld ─▶ createEngine(config)        (@pomoc/core)
playback (setInterval) ─step()─▶ engine ─notify─┬─▶ sim/store { snapshot } ─▶ React selectors
                                                 └─▶ renderer.ingest() ─▶ rAF draw (canvas)
buttons / hotkeys ─▶ ui/store  and  sim/commands.dispatch(cmd) ─▶ engine
useZoom (d3-zoom) ─▶ transformRef ─▶ SVG <g transform> + canvas setTransform
```

Three layers share one zoom transform on the map:

1. **Canvas** (`features/map/renderer/`): the basemap from `snapshot.terrain` (`drawTerrain.ts`:
   river, parks, minor and major streets, district captions; `Path2D`s cached on the terrain
   object, which core keeps for the life of a world), region tints, range circles,
   edges (cached `Path2D`), packet pulses with glow and tail, arrival ripples, injection
   ripples at gateways ("from the sky"), drop bursts, and the highlighted message trail. It
   subscribes to the engine directly, coalesces transits per edge and class (cap 300) and
   interpolates with `t = (now − lastTickAt) / tickInterval` in a `requestAnimationFrame`
   loop. No React, no Mantine, no icons are imported anywhere under `renderer/`, `sim/` or
   `lib/`; `theme/tokens.ts` is pure colours and labels (icons live in `theme/icons.ts`).
2. **SVG** (`NodesLayer` / `NodeGlyph`): one memoised glyph per node with click, double-click
   (centre), hover and tooltip. Ring colour = node mode, green outer ring = backhaul, dashed =
   unregistered, walking / car icon with a cyan / pink dot = on the move, amber badge =
   store-and-forward buffer, lime badge = open requests, dim = powered off.
3. **HTML overlay** (`MapOverlay`): legend, zoom buttons, Authority badge.

State lives in two zustand stores. `sim/store.ts` holds the engine, its latest immutable
snapshot (a new reference on every tick or command, so selectors only re-render what
changed), the tick clock and the world epoch. `ui/store.ts` holds selection, highlight,
playback speed, view toggles and the config draft. `sim/commands.ts` is the only module that
calls `engine.dispatch`; `sim/playback.ts` is the only one that calls `engine.step`. The
inspector reads `engine.getNodeDetail(id)` on demand (inbox, store, request views, node
log are not part of the snapshot).

Rules such as which classes a phone may originate, whether payments are allowed, hop caps,
credential rights and accept eligibility are read from `@pomoc/core` exports
(`MODE_POLICIES`, `classAllowedToOriginate`, `canOriginate`, `isPriced`, ...) and never
re-implemented here; the engine validates every command again on dispatch.

Tests cover only the pure modules (`test/`): particles, highlight trail, event cursor,
regions, geometry, event text, terrain helpers and path builders, and the store against the
real engine (Generate, Reset determinism, zero-node worlds, the Kraków seed). There are no component tests by design.
