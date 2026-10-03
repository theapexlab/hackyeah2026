# Non-functional requirements

Same conventions as the functional list: MoSCoW priority, **Sim** column for what the
hackathon simulation demonstrates (D / P / –).

## 1. Security

| ID         | Requirement                                                                                                                                                                                                                      | Priority | Sim |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| NFR-SEC-01 | All protocol messages are signed. Unsigned or unverifiable messages are dropped at the first hop and never forwarded.                                                                                                            | M        | D   |
| NFR-SEC-02 | Verification requires only material already on the device (Authority root keys, the message's own certificate chain). No verification step depends on network access.                                                            | M        | D   |
| NFR-SEC-03 | Private keys are generated and stored in hardware-backed storage where the platform provides it (Android Keystore / StrongBox, iOS Secure Enclave). Keys are not exportable.                                                     | M        | –   |
| NFR-SEC-04 | Separate Authority keys for certificate issuance, mode declarations and official alerts, so compromise of one does not grant the others. Root keys are kept offline.                                                             | M        | P   |
| NFR-SEC-05 | Replay protection: every message carries a unique id, a timestamp and the signer's sequence number; nodes reject ids seen before and timestamps outside a tolerance window.                                                      | M        | D   |
| NFR-SEC-06 | Flooding resistance: per-certificate rate limits enforced by receivers; relay certificates have stricter limits than citizen certificates; LIFE_CRITICAL has the lowest allowed rate to make it expensive to abuse.              | M        | D   |
| NFR-SEC-07 | Sybil resistance comes from identity: one verified person, one certificate. Relay-only devices without a certificate cannot inject anything other than topology gossip, and their gossip is weighted lower in topology assembly. | M        | P   |
| NFR-SEC-08 | The relay component on routers is isolated from the customer's LAN (separate network namespace / VLAN) and cannot read or modify household traffic.                                                                              | M        | –   |
| NFR-SEC-09 | The emergency SSID is open by necessity; the captive portal is served over a locally self-signed TLS with a clear warning that the network is unencrypted.                                                                       | S        | –   |
| NFR-SEC-10 | Forcing emergency mode (e.g. by cell jamming) must not grant any capability unavailable in peace mode. Emergency mode is strictly a subset plus different limits.                                                                | M        | D   |
| NFR-SEC-11 | Mesh traffic originating from captive portals is bounded by design: at most one PORTAL_SUMMARY per router per minute, regardless of client count. An attacker at a portal can distort one router's counters, not load the mesh. | M | D |
| NFR-SEC-12 | At L3 Security no unauthenticated input enters the mesh and no citizen-originated free-form information propagates; only Authority-signed information does. | M | D |
| NFR-SEC-13 | At L3 Security phones do not emit topology gossip, so the mesh does not reveal the distribution of people; only routers at known locations gossip. | M | D |

## 2. Privacy

| ID         | Requirement                                                                                                                                                                    | Priority | Sim |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --- |
| NFR-PRV-01 | Peers see pseudonyms, categories and hop distance, never legal names, exact addresses or GPS coordinates, unless the citizen chooses to share them for a specific transaction. | M        | D   |
| NFR-PRV-02 | Location is expressed as hop distance by default and as a coarse geohash (street segment) only when the citizen attaches a radius.                                             | M        | D   |
| NFR-PRV-03 | Topology gossip from phones is rate-limited and coarsened so that movement patterns of individuals cannot be reconstructed from the mesh.                                      | S        | –   |
| NFR-PRV-04 | The Authority stores the pseudonym-to-identity mapping separately from transaction data, under access logging and legal access rules published in advance.                     | M        | –   |
| NFR-PRV-05 | Peacetime transaction content is retained on Authority servers for no longer than needed for disputes (target 90 days); only aggregates are kept.                              | S        | –   |
| NFR-PRV-06 | Emergency-mode check-ins and requests are retained for the duration of the declaration plus a defined review period, then deleted.                                             | S        | –   |
| NFR-PRV-07 | Participation of unregistered devices as relays does not require them to disclose any identity; a random per-boot relay id is sufficient.                                      | M        | D   |
| NFR-PRV-08 | The system complies with GDPR; data minimisation is the default and the protocol carries no field it does not use.                                                             | M        | –   |

## 3. Resilience and availability

| ID         | Requirement                                                                                                                                                                      | Priority | Sim |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| NFR-RES-01 | No single server, link or node is required for emergency-mode operation. The Authority service being offline must not stop local requests, check-ins or relaying.                | M        | D   |
| NFR-RES-02 | Graceful degradation ladder: internet, then router backbone, then phone-only, then store-and-forward islands. Each step is automatic.                                            | M        | D   |
| NFR-RES-03 | Phone-only emergency mode sustains at least 8 hours on a phone starting at 50% battery, through adaptive duty cycling.                                                           | S        | P   |
| NFR-RES-04 | Store-and-forward buffers survive app restarts and device reboots.                                                                                                               | M        | –   |
| NFR-RES-05 | The router relay component starts automatically on power restoration and rejoins the mesh without ISP intervention.                                                              | M        | P   |
| NFR-RES-06 | Mode switching converges across a connected mesh region within 60 seconds of a declaration reaching any node in it.                                                              | S        | D   |
| NFR-RES-07 | Target delivery: in a district with at least 20% router participation, an OFFICIAL_ALERT reaches 95% of connected nodes within 5 minutes with mobile networks down and power up. | S        | D   |

## 4. Performance and scalability

| ID          | Requirement                                                                                                                                                | Priority | Sim |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| NFR-PERF-01 | Protocol messages fit in a single BLE extended advertisement or GATT write where possible (target 240 bytes for requests without free text, 1 KB with).    | M        | P   |
| NFR-PERF-02 | A node forwards a received message within 500 ms of verification.                                                                                          | S        | P   |
| NFR-PERF-03 | A phone node handles 50 neighbours and 20 messages per second without user-visible degradation.                                                            | S        | P   |
| NFR-PERF-04 | A router node handles 200 neighbours and 200 messages per second.                                                                                          | S        | P   |
| NFR-PERF-05 | The topology gossip overhead stays below 10% of mesh capacity at city scale through aggregation and coarsening.                                            | S        | D   |
| NFR-PERF-06 | The architecture scales to a city of 1 million inhabitants with no central component in the emergency path; peacetime central services scale horizontally. | M        | P   |
| NFR-PERF-07 | The simulation renders 20 000 router nodes and 2 000 mobile nodes at interactive frame rates in a browser.                                                 | M        | D   |

## 5. Interoperability and openness

| ID         | Requirement                                                                                                                                                       | Priority | Sim |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| NFR-INT-01 | The message format, certificate profile and forwarding rules are a published open specification. Anyone may implement a compatible node.                          | M        | –   |
| NFR-INT-02 | The router relay component and the phone protocol library are open source, reproducibly built, and the deployed hashes are published in the transparency log.     | M        | –   |
| NFR-INT-03 | Transports are pluggable: BLE, Wi-Fi Aware, Wi-Fi Direct, 802.11s, LAN, internet, and future direct-to-device satellite behave identically to the protocol layer. | M        | D   |
| NFR-INT-04 | Identity integrates with the national identity wallet and the EUDI wallet standard rather than running its own enrolment.                                         | M        | –   |
| NFR-INT-05 | Official alerts use the Common Alerting Protocol (CAP) payload so existing alert origination tools (e.g. Alert RCB) can feed the mesh.                            | S        | –   |
| NFR-INT-06 | Router integration targets the firmware bases ISPs actually ship (OpenWrt, prplOS, RDK-B) and the TR-369 data model for provisioning.                             | S        | –   |

## 6. Usability and accessibility

| ID        | Requirement                                                                                                                                                                   | Priority | Sim |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| NFR-UX-01 | Creating an emergency request takes at most two taps from the lock screen or the app home.                                                                                    | M        | P   |
| NFR-UX-02 | Mode changes are unmistakable: colour, layout and wording change, and a plain-language summary says what works now.                                                           | M        | D   |
| NFR-UX-03 | The captive portal and the app meet WCAG 2.2 AA; emergency flows work with screen readers and large text.                                                                     | M        | –   |
| NFR-UX-04 | Interface in Polish and English at minimum; emergency message templates are pre-translated so a request is readable across languages without network translation.             | M        | –   |
| NFR-UX-05 | Peace-mode notifications are bounded (quiet hours, category mutes, hop caps) so that the app earns its place on the phone rather than being uninstalled before the emergency. | M        | –   |
| NFR-UX-06 | Participation without the app is possible in emergency mode through the router captive portal.                                                                                | S        | P   |

## 7. Legal, compliance and governance

| ID         | Requirement                                                                                                                                                                                    | Priority | Sim |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| NFR-LEG-01 | Activation of emergency mode by declaration is a legally defined act with a named issuing body, published criteria, and an automatic expiry.                                                   | M        | P   |
| NFR-LEG-02 | The relay capability on routers is enabled only under published regulation, with customer opt-out, and its scope (what it may carry) is fixed in the specification, not configurable remotely. | M        | –   |
| NFR-LEG-03 | Peacetime micro-payments respect occasional-income thresholds through enforced caps or automatic reporting; the system never claims tax exemption on the user's behalf.                        | M        | –   |
| NFR-LEG-04 | Liability for lent goods follows a published standard term accepted at registration, with an optional pooled insurance.                                                                        | S        | –   |
| NFR-LEG-05 | Radio use complies with EU and national spectrum rules; emergency band switching on routers stays within licence-exempt power limits.                                                          | M        | –   |
| NFR-LEG-06 | Alignment with the European Electronic Communications Code Article 110 (public warning systems), NIS2 and the Critical Entities Resilience directive is documented.                            | S        | –   |

## 8. Operability

| ID         | Requirement                                                                                                                                                 | Priority | Sim |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| NFR-OPS-01 | Router relay firmware updates go through the ISP's existing update pipeline and can be rolled back.                                                         | M        | –   |
| NFR-OPS-02 | The Authority can run a scheduled nationwide drill: a declaration flagged as a drill that exercises mode switching without restricting peacetime functions. | S        | P   |
| NFR-OPS-03 | Peacetime topology data gives operators a continuous coverage health indicator per district with alerting on degradation.                                   | S        | D   |
| NFR-OPS-04 | All Authority actions are auditable; the transparency log is independently mirrorable.                                                                      | M        | –   |

## 9. Simulation quality (hackathon deliverable)

| ID         | Requirement                                                                                                                                        | Priority | Sim |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --- |
| NFR-SIM-01 | Runs in a current desktop browser with no installation, from a static host, and works offline once loaded.                                         | M        | D   |
| NFR-SIM-02 | The visual design follows one consistent system (typography, colour tokens for modes and message classes, light and dark) suitable for projection. | M        | D   |
| NFR-SIM-03 | Every scenario step is reachable by a single key or button so the presenter never fights the tool on stage.                                        | M        | D   |
| NFR-SIM-04 | Protocol module has unit tests for forwarding, TTL, hop limit, de-duplication, priority ordering, mode switching and signature rejection.          | S        | D   |
