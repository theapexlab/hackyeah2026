# Functional requirements

Priority uses MoSCoW: **M** must, **S** should, **C** could, **W** won't (this version).
The **Sim** column marks what the hackathon simulation demonstrates:
**D** demonstrated, **P** partially / visualised only, **–** not in simulation.

The system described is the target vision. Only the simulation is built at HackYeah.

## 1. Identity and registration

| ID       | Requirement                                                                                                                                                                                           | Priority | Sim                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------- |
| FR-ID-01 | A citizen registers once, in peace mode, with a verified address and national ID. Registration is delegated to the national identity wallet (mObywatel / EUDI wallet) where available.                | M        | –                    |
| FR-ID-02 | The Authority generates the asymmetric key pair at registration inside an HSM and delivers the private key wrapped to a non-extractable enrollment key held in the device secure element. The device imports it into the platform secure element / keystore; the Authority destroys its copy after delivery is confirmed. | M | D (real keys in sim) |
| FR-ID-03 | The Authority issues the citizen certificate together with the key pair, containing a pseudonymous identifier, validity window and permitted message classes. | M | D |
| FR-ID-04 | Key pairs and certificates are short-lived (target 30 days) and re-issued automatically and silently. Renewal uses the internet when available; otherwise the renewal request is forwarded through the mesh to a gateway. | M | P |
| FR-ID-05 | An expired certificate remains accepted in emergency mode for a grace period (target 90 days) so an outage never locks citizens out.                                                                  | M        | P                    |
| FR-ID-06 | A citizen may hold at most one active certificate at a time. Re-registration revokes the previous one.                                                                                                | S        | –                    |
| FR-ID-07 | The pseudonym shown to peers is stable within a neighbourhood context but is not the citizen's legal name. Legal identity is revealed only to the Authority, and only under defined legal conditions. | M        | P                    |
| FR-ID-08 | Unregistered devices may install the app and participate as relays in emergency mode, but cannot create requests, offers or acceptances in either mode.                                               | M        | D                    |
| FR-ID-09 | Routers receive a relay certificate from their ISP, chained to the Authority root, bound to a verified customer account.                                                                              | M        | D                    |
| FR-ID-10 | Relay certificates grant forwarding rights only. Any request, offer, acceptance or check-in signed by a relay certificate is rejected by every node.                                                  | M        | D                    |
| FR-ID-11 | Registered static resources (public AEDs, hydrants, shelters, pharmacies) are published by the municipality as signed resource records pinned to a location.                                          | S        | D                    |

## 2. Network and topology

| ID        | Requirement                                                                                                                                                                                                                                                                           | Priority | Sim |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| FR-NET-01 | Each node continuously discovers neighbours over available local radios (BLE, Wi-Fi Aware / Wi-Fi Direct, LAN) and maintains an ego-network with signal quality buckets (near / medium / far).                                                                                        | M        | D   |
| FR-NET-02 | Routers discover each other over Wi-Fi (802.11s or equivalent) using a dedicated band in emergency mode, and over LAN / ISP network in peace mode.                                                                                                                                    | M        | D   |
| FR-NET-03 | Every node periodically gossips a signed neighbour list (link state) with a sequence number and timestamp.                                                                                                                                                                            | M        | D   |
| FR-NET-04 | Any node can assemble the known topology from received link-state messages and compute shortest paths, coverage and articulation points locally.                                                                                                                                      | M        | D   |
| FR-NET-05 | Messages are forwarded by controlled flooding with hop count, time-to-live and message id de-duplication. A node never forwards the same message id twice.                                                                                                                            | M        | D   |
| FR-NET-06 | Requests carry a hop limit (peace default 3, max 6; emergency default 10, max unbounded for OFFICIAL_ALERT) and an optional geographic radius. Nodes drop messages that exceed either.                                                                                                | M        | D   |
| FR-NET-07 | Responses travel back along the recorded forward path where it still exists, and by flooding to the requester id when it does not.                                                                                                                                                    | M        | D   |
| FR-NET-08 | In emergency mode nodes store messages whose TTL has not expired and forward them to any new neighbour that appears (store-and-forward / data mule).                                                                                                                                  | M        | D   |
| FR-NET-09 | Nodes prioritise forwarding by message class: LIFE_CRITICAL, then OFFICIAL_ALERT, SAFETY, CHECK_IN, then everything else. Lower classes are dropped first under congestion.                                                                                                           | M        | D   |
| FR-NET-10 | Nodes with backhaul (internet, satellite, municipal fibre) act as gateways: they forward authority-bound mesh traffic to the Authority service and inject Authority messages into the mesh. | M | D |
| FR-NET-11 | The internet is used only to contact authorities and issuers. Peer-to-peer traffic (requests, offers, acceptances) always travels over the mesh in every mode. | M | P |
| FR-NET-12 | Responder guidance: for a LIFE_CRITICAL request matched to a registered resource, the nearest capable citizen is asked to accept; on acceptance the mesh guides that one responder to the resource and then to the requester, and everyone else sees the request as taken. Objects never travel hop by hop; only messages do. | M | D |
| FR-NET-13 | When no internet is available, authority-bound messages (renewal, check-ins, reports) are forwarded through the mesh to a gateway only if their priority class is admitted by the current mode and congestion state; lower classes are held or dropped first (FR-NET-09). | M | D |
| FR-NET-14 | Certificate renewal over the mesh is acknowledged: the issuer returns a signed receipt (wrapped credential) along the recorded path and the node retries until receipt or expiry. All other authority-bound messages are fire-and-forget with de-duplication at the gateway. | M | D |

## 3. Peace mode: local resource sharing

| ID       | Requirement                                                                                                                                                                                 | Priority | Sim |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| FR-PE-01 | A citizen can publish a request of class LEND / BORROW / GIVE / SELL / INFO with a free-text description, category, hop limit, optional radius, optional price or credit value, and expiry. | M        | D   |
| FR-PE-02 | A citizen can publish a standing offer (an item or skill available to the neighbourhood) with the same attributes, without waiting for a request.                                           | S        | P   |
| FR-PE-03 | Nearby citizens within the hop limit see the request and can accept it. The first accepted response the requester confirms closes the request; other responders are notified.               | M        | D   |
| FR-PE-04 | A transaction has a state machine: open, accepted, confirmed, handed over, returned (for lends), closed, disputed. State transitions are signed by the party making them.                   | M        | P   |
| FR-PE-05 | Optional payment per transaction, either in currency through an integrated payment provider, or in community credits maintained by the Authority service.                                   | S        | P   |
| FR-PE-06 | The system tracks, per lent item, the cumulative value received, and shows the owner when an item has amortised its purchase price.                                                         | C        | P   |
| FR-PE-07 | Monthly income per citizen is capped at the legal occasional-income threshold; above it the system either blocks paid transactions or reports them, according to configuration.             | S        | –   |
| FR-PE-08 | Both parties can rate a closed transaction. Ratings are aggregated into a reputation visible to peers.                                                                                      | S        | P   |
| FR-PE-09 | Request rate limits per citizen certificate (requests per hour, open requests at a time) are enforced by receiving nodes, not only by the sender.                                           | M        | D   |
| FR-PE-10 | Citizens can mute categories, set quiet hours, and set a personal maximum hop distance for notifications.                                                                                   | S        | –   |
| FR-PE-11 | LIFE_CRITICAL and SAFETY requests are permitted in peace mode and bypass mutes and quiet hours.                                                                                             | M        | D   |
| FR-PE-12 | A peacetime dashboard shows the citizen their own impact: items lent, trips avoided, estimated money and waste saved.                                                                       | C        | P   |

## 4. Mode switching

| ID         | Requirement                                                                                                                                                                                      | Priority | Sim |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --- |
| FR-MODE-01 | A node enters local emergency mode when it has had no reachable backhaul (mobile data, Wi-Fi internet) for a configurable window (default 10 minutes).                                           | M        | D   |
| FR-MODE-02 | A node enters declared emergency mode on receiving a MODE_DECLARATION signed by the Authority, regardless of its own connectivity. The declaration carries a region, a start time and an expiry. | M        | D   |
| FR-MODE-03 | Declared mode overrides local mode. A node in declared emergency mode stays there until the declaration expires or a signed all-clear arrives, even if backhaul returns.                         | M        | D   |
| FR-MODE-04 | A node leaves local emergency mode after backhaul has been stable for a configurable window (default 15 minutes), with hysteresis to avoid flapping.                                             | M        | D   |
| FR-MODE-05 | Mode transitions are shown to the user with a clear, full-screen state change and a plain-language explanation of what is now possible.                                                          | M        | P   |
| FR-MODE-06 | Mode declarations and all-clears propagate over the mesh with unbounded hop limit and maximum priority.                                                                                          | M        | D   |
| FR-MODE-07 | Routers switch one radio band to mesh relay on entering emergency mode and keep serving the household on the other band.                                                                         | S        | P   |
| FR-MODE-08 | A MODE_DECLARATION carries a policy (portal_write, citizen_classes, hop_limit, ttl, store_and_forward, phone_topology_gossip, emission). Three named levels are presets: L1 Disruption, L2 Disaster, L3 Security. | M | D |
| FR-MODE-09 | Local automation enters L1 at most. L2 and L3 require a signed declaration. | M | D |
| FR-MODE-10 | L3 Security: captive portal read-only, citizen INFO class disabled, hop limit 6, phone topology gossip off, reduced radio duty cycle. Life-critical, safety and check-in remain. | M | D |
| FR-MODE-11 | Downgrades require a signed all-clear or declaration expiry; L3 steps down through L1, never directly to peace. | M | D |
| FR-MODE-12 | Declarations carry a region; different districts may be at different levels at the same time. | S | D |

## 5. Emergency mode

| ID       | Requirement                                                                                                                                                                            | Priority | Sim |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| FR-EM-01 | In emergency mode only the classes LIFE_CRITICAL, SAFETY, CHECK_IN, OFFICIAL_ALERT, INFO and no-payment GIVE are accepted. Any message carrying a price is rejected.                   | M        | D   |
| FR-EM-02 | A citizen can send a CHECK_IN ("I am OK", "I need evacuation", "trapped", with free text) that propagates to gateways and to designated contacts' devices wherever they are reachable. | M        | D   |
| FR-EM-03 | Official alerts injected at any gateway reach every node in the declared region, with delivery confirmation counts returned to the Authority when paths exist.                         | M        | D   |
| FR-EM-04 | A LIFE_CRITICAL request shows responders the request, its distance in hops and estimated metres, and a one-tap accept. The requester sees who accepted and the estimated time.         | M        | D   |
| FR-EM-05 | Registered static resources (AEDs, shelters, water points) are matched automatically to requests: the nearest citizen to the resource is asked to fetch it.                            | S        | D   |
| FR-EM-06 | Emergency mode works with the screen locked and the app in background for as long as the platform allows; the app requests the necessary background permissions in peace mode.         | M        | –   |
| FR-EM-07 | The app shows the local mesh state: number of reachable nodes, whether a gateway is reachable, and age of the last Authority message.                                                  | M        | D   |
| FR-EM-08 | Battery conservation: in phone-only mode nodes reduce discovery duty cycle adaptively based on battery level and neighbour density.                                                    | S        | P   |
| FR-EM-09 | Unregistered relay-only devices show a minimal screen: current alerts, mesh state, and how to reach help.                                                                              | S        | P   |

## 6. Routers and ISPs

| ID       | Requirement                                                                                                                                                                                     | Priority | Sim |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| FR-RT-01 | ISPs provision the relay component on customer routers through their existing remote management channel (TR-069 / TR-369). The component is dormant in peace mode except for topology gossip.   | M        | P   |
| FR-RT-02 | Routers broadcast an open emergency SSID in emergency mode and serve a captive portal with the current alerts and a minimal request / check-in form, so phones without the app can participate. | S        | P   |
| FR-RT-03 | Routers never originate requests, offers, acceptances or check-ins. They relay, cache (store-and-forward), and serve the captive portal.                                                        | M        | D   |
| FR-RT-04 | Routers report their static location (from the customer record, at street-segment precision) in topology gossip so coverage can be planned.                                                     | M        | D   |
| FR-RT-05 | Battery-backed routers announce their backup status so that the coverage model and emergency routing can prefer them.                                                                           | C        | D   |
| FR-RT-06 | A customer may opt out of relay participation; opt-out is recorded and the router is excluded from the coverage model.                                                                          | M        | P   |
| FR-RT-07 | Routers never forward captive-portal inputs individually. They emit at most one signed PORTAL_SUMMARY per minute with aggregated counts; this is the only class a relay certificate may originate. | M | D |
| FR-RT-08 | Free text entered on the captive portal is stored and shown only on that router; only structured fields enter the mesh. | M | P |
| FR-RT-09 | The captive portal enforces a per-client rate limit (one input per device per minute) and accepts only what the current level's portal_write policy allows. | M | P |
| FR-RT-10 | PORTAL_SUMMARY data is flagged unverified end to end and displayed separately from signed citizen check-ins on the dashboard. | M | D |

## 7. Authority, municipality and governance

| ID        | Requirement                                                                                                                                                                    | Priority | Sim |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --- |
| FR-GOV-01 | The Authority operates the certificate service, the peacetime synchronisation service, the payment / credit ledger and the alert origination console.                          | M        | –   |
| FR-GOV-02 | The Authority can issue a MODE_DECLARATION for a region and an all-clear, each signed with a dedicated declaration key kept separate from the certificate-issuing key.         | M        | D   |
| FR-GOV-03 | Every declaration, alert and key rotation is published to a public, append-only transparency log.                                                                              | M        | –   |
| FR-GOV-04 | A municipal dashboard shows the peacetime topology, coverage gaps, articulation points, percolation threshold and recommended locations for battery-backed relays or gateways. | M        | D   |
| FR-GOV-05 | In emergency mode the dashboard shows received check-ins, open LIFE_CRITICAL requests and alert delivery estimates per district, from whatever reaches the gateways.           | M        | D   |
| FR-GOV-06 | Dispute handling in peace mode is limited to reputation and a reporting channel; the Authority is not an arbiter of individual transactions.                                   | S        | –   |
| FR-GOV-07 | Aggregate peacetime statistics (transactions, categories, estimated waste avoided) are published per district as open data.                                                    | C        | P   |

## 8. Simulation (hackathon deliverable)

| ID        | Requirement                                                                                                                                                                                                                                                                            | Priority | Sim |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| FR-SIM-01 | The simulation renders a district of Kraków with a static router layer (density derived from building footprints) and a mobile phone layer, as one proximity graph.                                                                                                                    | M        | D   |
| FR-SIM-02 | Participation rate, radio range, hop limit and TTL are adjustable live, and the coverage / delivery curves update accordingly (percolation view).                                                                                                                                      | M        | D   |
| FR-SIM-03 | Scenario script, playable step by step: (1) peace mode request and match, (2) forged request from an unregistered node rejected, (3) mobile network loss and switch to router backbone at L1, (4) power loss, phone-only mesh, store-and-forward across islands, (5) declared L2 vs L3 side by side: portal behaviour, INFO class, phone gossip, hop radius, (6) coverage planning view. | M | D |
| FR-SIM-04 | Signatures in the simulation are real (ed25519 via WebCrypto or an equivalent library), so rejection of forged messages is computed, not animated.                                                                                                                                     | S        | D   |
| FR-SIM-05 | The simulation is deterministic for a given seed so the stage demo matches rehearsal.                                                                                                                                                                                                  | M        | D   |
| FR-SIM-06 | Live metrics: reachable fraction, delivery rate per class, median hops, median latency, messages dropped by reason.                                                                                                                                                                    | M        | D   |
| FR-SIM-07 | The protocol logic (message format, flooding, TTL, hop limit, priorities, store-and-forward, mode switching, signature checks) is a separate module from rendering, so it could later run on a device unchanged.                                                                       | S        | D   |
