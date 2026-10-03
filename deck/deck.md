<!-- layout: title -->
<!-- event: HackYeah 2026 · Open Task: Smart City -->
<!-- team: Apexlab · Members: Vargha Csongor Csaba · Magyar Dániel · Fábi Tamás -->
# Pomóc

The network that is already there.

A dual-use civic mesh: neighbourhood sharing on an ordinary Tuesday, resilient communication on the day the network goes dark.

---
<!-- kicker: The problem -->
## Two failures, one root cause

### On an ordinary day
Resources sit idle. Nobody nearby knows they exist.

**13 min**

a drill is used in its whole lifetime

### On the bad day
Help sits unreachable. The mobile network is the first thing to fail.

**80 m**

between a cardiac arrest and the AED on the wall

> The city already owns what it needs. It is in the wrong pocket.

---
<!-- kicker: The idea -->
## One network, one identity, two rule sets

### Peace mode
- Borrow a drill, get sour cream next door, hand over a parking spot
- Reach is hop-limited: local by protocol, not by policy
- Optional micro-payments or credits

### Emergency mode
- Signed official alerts, "I am OK" check-ins, life-critical requests
- No backbone needed: phones and home routers relay hop by hop
- Payments off, priorities on

> Runs on what the city already has: phones and ISP routers.

---
<!-- layout: diagram -->
## How the pieces fit together

![System overview](overview.png)

---
<!-- kicker: Trust -->
## Verified people, verifiable offline

- Register once through the national identity wallet (mObywatel / EUDI). The Authority issues a key and a **citizen certificate**, delivered wrapped into the phone's secure element.
- Every message is signed. Any node verifies it with the Authority root key already in the app. **No network needed.**
- Routers hold **relay certificates**: they carry, they can never ask. A cryptographic rule, not a policy.
- Pseudonymous on the wire. 30-day keys, re-issued silently, through the mesh when the internet is gone.

---
<!-- kicker: Peace mode -->
## Resource sharing within a few hops

- **Request** → neighbours within 3 hops see it → first accepted match closes it
- **Shared-ownership amortisation:** a tool pays itself back through community use
- **Registered static resources:** public AEDs, shelters, water points pinned to the map
- Rate limits per identity, reputation, quiet hours

### Example request
Cordless drill, Sunday afternoon

2 PLN · 3 hops · expires in 2 h

Matched by Marek, 2 hops away, in 4 minutes.

---
<!-- kicker: Emergency mode -->
## Three levels, one signed declaration

| | L1 Disruption | L2 Disaster | L3 Security |
|---|---|---|---|
| Cause | cell outage, cable cut | flood, storm, blackout | terror, war, hybrid attack |
| Entered by | automatic or declaration | declaration only | declaration only |
| Router portal | read + check-in | read + check-in + request | **read only** |
| Citizen requests | life-critical, safety, "I am OK" | life-critical, safety, "I am OK" | + sealed casualty report to the authorities |
| Citizen info | on | on | **off** (rumour control) |
| Reach | 10 hops | 15 hops | 6 hops, phones go quiet |

Jamming the cells can force L1 at most. Everything above it needs a signature.

---
<!-- kicker: Scenario -->
## The AED, in 90 seconds

1. Ola's phone sends a signed **LIFE_CRITICAL** request. It floods the mesh, top priority.
2. The mesh knows a registered AED 40 m from Marek. He is the nearest capable responder and accepts.
3. Everyone else sees the request is taken. The mesh guides Marek to the AED, then to Ola.
4. Marek runs it over. One person moves, the messages did the rest. Staff would take six minutes.

> Messages travel hop by hop. The object travels with one person.

---
<!-- kicker: What we built at HackYeah -->
<!-- style: pills -->
## A simulation of the protocol on a city graph

Kraków district, static router layer plus mobile phone layer. Deterministic, playable step by step:

- 1 peace request + match
- 2 flooding: hop limit, TTL, dedup
- 3 cells down → L1, router backbone
- 4 power down → phone-only, store-and-forward
- 5 L2 vs L3 side by side
- 6 coverage planning

Live metrics: reach, delivery per class, hops, latency. Sliders for participation and radio range show the **percolation threshold**: how few nodes are enough.

Cryptography is standard and not simulated; the simulation is about mesh behaviour. Nothing else is built. Pomóc is a vision; the simulation is the argument.

---
<!-- kicker: Why it is believable -->
<!-- footer: Pomóc · concept, research and docs made with AI assistance (Claude Code); sources in the repo -->
## Every piece has been tried. Nobody has combined them.

- **00000JAPAN** and **Comcast** already flip existing Wi-Fi open in disasters
- **Alert RCB** is moving into mObywatel; the **EUDI wallet** is mandatory EU-wide
- Japan's **Relay-by-Smartphone** proved phone-to-phone message relaying after 2011
- Peerby: 80% of neighbourhood requests filled in 30 minutes

### Next
Open protocol spec · pilot in one district with one ISP · battery-backed relay placement from the coverage model
