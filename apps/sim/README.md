# @pomoc/sim — the Pomóc mesh simulation

An offline, frontend-only simulation of the Pomóc civic mesh: phones, ISP routers and
satellite gateways form a proximity graph on an abstract district plane, messages flood hop
by hop, and the network flips between Peace and the L1 / L2 / L3 emergency levels. All
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

Generate a world from the left panel (defaults: 1000 × 700 m, 40 phones, 25 routers,
2 satellite gateways, seed 42), press Space, then fire events. Reset regenerates the same seed,
so a repeated event script gives an identical log (the engine is deterministic). A lime badge
counts the requests a phone currently sees as open.

Dev-only: `pnpm dev` and open `/?fixture=1` to see a fabricated world without the engine
(`src/dev/fixture.ts`); it is never part of the production bundle.

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
| `+` `-`       | Faster / slower (0.5× 1× 2× 4×)                                       |
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

1. **Canvas** (`features/map/renderer/`): procedural street grid, region tints, range circles,
   edges (cached `Path2D`), packet pulses with glow and tail, arrival ripples, injection
   ripples at gateways ("from the sky"), drop bursts, and the highlighted message trail. It
   subscribes to the engine directly, coalesces transits per edge and class (cap 300) and
   interpolates with `t = (now − lastTickAt) / tickInterval` in a `requestAnimationFrame`
   loop. No React, no Mantine, no icons are imported anywhere under `renderer/`, `sim/` or
   `lib/`; `theme/tokens.ts` is pure colours and labels (icons live in `theme/icons.ts`).
2. **SVG** (`NodesLayer` / `NodeGlyph`): one memoised glyph per node with click, double-click
   (centre), hover and tooltip. Ring colour = node mode, green outer ring = backhaul, dashed =
   unregistered, amber badge = store-and-forward buffer, lime badge = open requests, dim =
   powered off.
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
regions, geometry, event text, and the store against the real engine (Generate, Reset
determinism, zero-node worlds). There are no component tests by design.
