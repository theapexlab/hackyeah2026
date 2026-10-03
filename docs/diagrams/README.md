# Diagrams

Sources for the explanatory diagrams. Mermaid files render on GitHub directly and can be
imported into draw.io (Arrange > Insert > Advanced > Mermaid). The system overview is a
hand-laid draw.io file.

| File | Shows |
|---|---|
| `01-system-overview.drawio` | Actors, the two node castes, administrative vs radio relationships |
| `02-trust-model.mmd` | Registration, certificate issuance, offline verification, relay restriction |
| `03-mode-state-machine.mmd` | Peace, local emergency, declared emergency, triggers and hysteresis |
| `04-degradation-ladder.mmd` | Stage 0 to 3: internet up, cells down, power down, gateways bridge |
| `05-aed-scenario.mmd` | LIFE_CRITICAL request, match to a registered AED, hand-to-hand delivery chain |
| `06-forwarding-decision.mmd` | What every node does with every received message |
