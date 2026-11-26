# Installation and devices: everything a site runs comes from Forge's release (FB-302) — design record

**Status: approved by reh3376 on 2026-11-25 as D-24** (the owner corrected the problem twice, then answered Q-1 to Q-7 one at a time, Q-5 after asking why a separate machine was needed, then, asked whether the record is signed: "Sign it"). It amends D-23 T-2's development layout, T-3, T-5 and T-10, D-20 SG-4 for code releases and D-21 §14 FR-2, each with a dated note there (§9). Nothing in it is built yet; its build is the backlog items named in Q-6, FB-231 first. Before signing: **Status: PROPOSED, not signed.** Second draft, 2026-11-25, on the owner's `+design` at gate 1 for FB-302. The first draft was attacked by three adversaries (security and supply chain; Kubernetes operations; fit with Forge's records); every finding they proved is folded in (§8). Nothing is decided until the owner answers §10 and signs.

Marks: **[OWNER]** the owner's words or decision · **[FACT]** verified, with the source · **[PROPOSED]** Claude's proposal · **[OPEN]** a question for the owner.

## 1. The problem

**[OWNER] 2026-11-25:** "this will be an enterprise application that will need to have self-contained installation of applications." Connectivity "to the sites and servers at the remote sites must be confirmed before install … This is something that the person doing the install will handle. The installer will define the intial build - where forge-core & top level hub will run once that is built out then the hubs and spokes for the sites will be installled it will run via forge-core gateway setup." "Air gapped sites would completely defeat the purpose of an enterprise level hub."

So installation has two phases: the person installing stands up forge-core and the top hub (the initial build); every site's hubs and modules are then installed through forge-core. Everything a site runs comes from Forge's release, pinned, checked and licence-cleared; nothing comes from a site's own package sources or is installed by hand on its hosts. A service reaches its signing device by one path in every stage. A site is never designed to be disconnected, but one temporarily cut off keeps running (D-17 §11.2, D-21 SF-6). A site needs the enterprise network, not the public internet.

## 2. What exists (grounded 2026-11-25)

- **[FACT]** One image (`deploy/docker/Dockerfile.forge`): base and uv images by floating tag; wheels from `uv.lock` by hash; `postgresql-client` and `curl` by unpinned apt; runs as root; no Go or manager stage, no device driver. CI builds no image (FB-231). Development Compose runs every image by tag; Neo4j fetches APOC at start; an entrypoint is mounted from the host. No Kubernetes artifact, installer or registry.
- **[FACT]** D-21 SF-18: "Secrets are scoped to one module in a store Forge runs inside the site … mounted only into that module's container." SF-19: one audit trail per hub, "hash-chained, numbered, signed by the hub's hardware-held audit key." SF-20: release artifacts "signed under the vendor's anchor … and verified before it runs." D-20 SG-13: "A release bundle's manifest names the digest of the hub release." D-17 C-1: "No hub below the enterprise hub connects to forge-core"; changes roll down one layer at a time. D-16 Q-5: scripts import only "packages a hub admin has approved for that hub". D-23 T-3, T-5, T-10 (device credential from the environment; PKCS#11 in every service; the connector on the Mac).

## 3. What the research found

- **[FACT] YubiHSM 2:** through Yubico's connector ("a multiplexer daemon", "not a trusted component") or directly over USB (`yhusb://`, "requiring exclusive access"); 16 concurrent sessions. Apache-2.0; the USB backend uses libusb (LGPL-2.1: the source is offered "from the same place" as the binary).
- **[FACT] Kubernetes:** a device is a per-container resource, "cannot be shared between containers", and pins the pod to its node; the device plugin "must run in a privileged security context"; a container can open a device as non-root only where the runtime's `device_ownership_from_security_context` is on (default false in containerd and CRI-O); leader election "does not guarantee … fencing"; a pod is Ready only when every container is; a `local` volume's pod "is unable to run" when its node is lost; k3s pins imported images against garbage collection and shares them between nodes; a ValidatingAdmissionPolicy is built into Kubernetes.
- **[FACT] TPM:** `tpm2-pkcs11` keeps its keys' blobs in an SQLite store bound to one TPM, and an older library refuses a newer store schema; the kernel's resource manager lets several processes share `/dev/tpmrm0`.
- **[FACT] Sources:** `python:3.12-slim` is Debian trixie, which packages `yubihsm-pkcs11` 2.6.0, `libtpm2-pkcs11-1` 1.9.1 and the connector for amd64 and arm64; Yubico's own builds are amd64 only; the pure-Go YubiHSM client is unmaintained; Go's PKCS#11 bindings need cgo.
- **[FACT] Supply chain:** wheels carry native code of their own (`cryptography` with OpenSSL, `grpcio` with BoringSSL, `confluent-kafka` with OpenSSL, SASL, zstd and curl), which syft does not attribute (proved); snapshot.debian.org serves old archives whose `Valid-Until` must be ignored, so their hashes must be checked against Debian's keyring, not trusted on download.

## 4. Two shapes

| | A. Drivers in every service | B. A signer beside each service that signs |
|---|---|---|
| Who holds a device and its credential | every service that signs | one `forge-signer` container per signing pod, the only container given the device |
| What a service asks | PKCS#11, any digest | a typed request (issue this certificate, sign this token, seal this audit head, answer this freshness challenge), which the signer checks against the profile, the anchor's caps and the caller's scope before signing |
| YubiHSM 2 | a shared connector | directly over USB, one owner |
| Signed records | D-23 as written | amends D-23 T-3, T-5, T-10 (§9) |

**[PROPOSED] Shape B.** Each device and key has one owner (working principle 10); the signer never signs a bare digest, so "a key that can sign nothing else" (D-21 §14 FR-2) and the issuer's refusal (D-23 law 1) hold in the one place that holds the key; the device credential is in one container. The cost is a second container per signing pod and a local call per signature.

## 5. The design

**The release**

| # | Rule |
|---|---|
| I-1 | **A release bundle's manifest** (D-20 SG-13's term) names every image by digest and, for every component in them (wheels and the native code inside them, Debian packages, Go binaries), its name, version, source, SHA-256 and licence, with an SBOM per image. Releases are **numbered**: a hub keeps the highest number it has accepted (D-20 SG-5's floor), refuses a lower one, and rolls back only to a release the current manifest lists as a fallback; a withdrawn release or a retired vendor key travels in D-21 §14's log. |
| I-2 | **Code releases take two devices.** A manifest is signed by a threshold of 2 of the vendor's attested release devices (D-20 SG-1: every vendor release key is the owner's, on at least two devices), not SG-4's one touch, because it ships code to every customer and one stolen device with an observed PIN must not be enough; CI records how each image was built, and a second, independent build must reproduce the same digests before signing. |
| I-3 | **Every image is built from pinned parts, nothing fetched at start.** Base images by digest; wheels by hash from `uv.lock`; Debian trixie packages by exact version, their chain checked from `InRelease` to `Packages` to `.deb` against a pinned Debian keyring, the `.deb`s and their source packages kept with the release (the LGPL and GPL source offers are served from the same place as the images); Go binaries static except the signer's driver loading; plugins, entrypoints and assets inside the image; images run as non-root. The check of law 2 fails on any native file (ELF) it cannot attribute to a recorded component, so OpenSSL and BoringSSL inside wheels are listed (and FB-303's FIPS edition must cover both). Script packages for a hub's Python workers (D-16 Q-5) are not in the release: they are approved by that hub's admin, recorded by hash and licence, and arrive by the same chain as images. |

**How it reaches a site**

| # | Rule |
|---|---|
| I-4 | **Phase 1, the initial build.** The person installing first checks the release with the stock `ssh-keygen -Y verify` against the vendor's genesis keys obtained out of band (never with tooling from the bundle being checked), then installs, from the release, the admission policy (I-5), the device plugin (I-10), forge-core with the deployment's registry, and the top hub. **Phase 2, the sites, down the chain (D-17 C-1).** forge-core issues an install or upgrade as an administrative change; it rolls down one layer at a time: each hub holds a registry mirror of exactly the images its children run, filled from its parent's, and every node a pod can run on holds its images pinned against garbage collection. A site cut off keeps running and can reschedule a pod from its own nodes and its own hub's mirror. Confirming connectivity before an install is the installer's job. |
| I-5 | **Only listed images run, enforced at admission.** A ValidatingAdmissionPolicy installed in phase 1 (outside what forge-core may change) admits a pod in Forge's namespaces only when every image is a digest in a manifest the site has verified, refuses a pod that overrides an image's command or arguments, refuses `exec`, `attach` and ephemeral containers on signing pods, and gives the device resources only to the manifest's signer image. A hub also checks its own and its modules' digests and reports them (D-21 SF-20); the admission policy is what stops a mismatch. Until D-21 step 5 builds signed releases, a manifest is checked by its digests only, and every surface says so. |

**How a service reaches its device**

| # | Rule |
|---|---|
| I-6 | **The signer.** Each signing pod has one `forge-signer` container (Python, the foundation's `forge_core.trust` with its issuer, D-17's foundation layer; no new PKCS#11 binding), the only container given a device. It serves typed requests over a socket in the pod's shared `emptyDir`, mode 0600, each container under its own user, the caller checked by `SO_PEERCRED`. Each kind of request names its scope (`trust:certificate:issue`, `trust:token:sign`, `trust:audit:seal`, `trust:freshness:answer`), checked at the one check point (D-22 PF-1); the scopes a pod holds come from its role's grants, never from the signer. It counts signatures and alarms before a device saturates. |
| I-7 | **The device credential lives in the site's secret store** (D-21 SF-18), mounted only into the signer container. Until forge-creds exists (FB-142) it is a Kubernetes Secret mounted only there, and the installer refuses a cluster whose Secrets are not encrypted at rest. |
| I-8 | **YubiHSM 2 over USB, one owner** (`yhusb://serial=N`). **TPM through `tpm2-pkcs11`**, the kernel resource manager sharing `/dev/tpmrm0` among the signers on its node, each signer with its own store and keys on a node-local volume; the manifest records the store's schema, and a rollback across a schema change is refused. |
| I-9 | **A signer's state never stops its service.** The signer has no readiness probe that gates the pod; a signer without its device puts its cause on the service's status, and the service refuses only the acts that need it (issuing, signing tokens, sealing audit, by the policy of D-21 SF-19); ingest, alarms and writes go on. A new key is generated and attested, then shown as "awaiting anchor version" until an anchor lists it. |
| I-10 | **Devices reach pods through Forge's device plugin**, built by Forge from a pinned, reviewed source, scheduled only on device nodes, in its own namespace with the one Pod Security exception Kubernetes requires, writable only by the installer. A USB device that re-enumerates is detected and its signer's pod recreated. Opening a device as non-root needs the runtime's `device_ownership_from_security_context`; it is a **site prerequisite**, applied from Forge's release by the installer and checked by forge-core, and a node without it is refused with that cause. |

**High availability**

| # | Rule |
|---|---|
| I-11 | **One active hub, fenced.** A hub runs an active and a standby replica on two nodes; only the active one serves the link, sessions and the audit chain, fenced by compare-and-swap on the chain's number (leader election alone does not fence), and readiness means being active. Each replica's signer holds its own intermediate on its own device (D-23 T-2), so the standby can issue the moment it takes over; a change of active replica, and of its audit key, is itself a chain entry. forge-core's manager runs the same way, with two freshness keys on two devices (§9). Rollouts never surge onto a device another pod holds (a StatefulSet, or `maxSurge: 0`). |
| I-12 | **A node lost.** The out-of-service taint and the release of its local volume claim are the site's act (its hub's administrator, or forge-core's change rolled down the chain, D-17 C-1), audited; the standby takes over; the replacement node's keys are generated, attested and wait for an anchor version (D-23 step 1b counts later versions). |

**Development**

| # | Rule |
|---|---|
| I-13 | **Development runs the production path on the owner's Docker Desktop.** Its built-in single-node Kubernetes runs forge-core and the development hub through the same admission policy, device plugin, signers and mirror as a site. The YubiHSM 2 reaches it through Docker Desktop's USB passthrough (USB/IP) and holds forge-core's keys, its signer using the same direct-USB backend as production; the development hub's keys are on a software TPM (`swtpm`) in a container, which the development anchor's test attestation root allows (D-21 SF-2), so each device keeps one owner. A single node cannot hold an active and a standby on two nodes (I-11); that is recorded as unmet and shown, as separation of duties is. Nothing is bought. USB passthrough with the YubiHSM 2 is tested when it arrives; if it fails, Yubico's connector on the Mac is the fallback, each difference from production listed as unmet on status, and a small Linux machine is reconsidered. CI runs the same path on SoftHSM under the `test` stage. |

## 6. The cases

1. **Scale.** A YubiHSM 2 signs tens of ECDSA signatures a second, a TPM fewer; certificates are issued per module per day and tokens per sign-in; the signer counts and alarms before saturation.
2. **Change while in use.** A release rolls down the chain layer by layer and pod by pod; a TPM store schema change is recorded and a rollback across it refused.
3. **A hub cut off.** Images are pinned on its nodes and in its hub's mirror; the active replica keeps running; a rescheduled pod starts from local images; installs and upgrades wait.
4. **No person acting.** Signers sign unattended with a credential only they read; a typed request that does not fit the profile, the caps or the caller's scope is refused.
5. **Failure and recovery.** A node lost: I-12. A device lost: the service keeps operating and refuses what needs signing, with the cause. A USB reset: the signer's pod is recreated.
6. **Renaming and migration.** A release changes digests, never names; the floor never moves down.
7. **Before it is complete.** Until D-21 step 5 manifests are checked by digest; until forge-creds the credential is an encrypted Secret; until forge-core's gateway (FB-232) the installer applies phase 2 from the same manifest; until D-23 step 1b a new key waits for an anchor version. Each is stated on status.
8. **The wrong thing.** An unlisted image, an overridden command, `exec` into a signer, a device for a non-signer, a lower release, a bare digest to sign, a call without the scope: each is refused.
9. **What it pins.** Debian trixie under the Python images; Kubernetes' admission policies; Forge's device plugin; the signer's typed calls; the manifest's form; Docker Desktop's Kubernetes for development.
10. **How it is known to hold.** §7.

## 7. Laws

1. **Every pod a site runs in Forge's namespaces runs only images named, by digest, in a release manifest the site verified, and none overrides an image's command** (checked at admission; a verify skill holds the policy over every pod shape in a bound).
2. **Every native file in a release belongs to a recorded component whose licence is on the allow-list** (checked at build over each image's files; FB-304).
3. **Only a signer container is given a device, and a signer signs only typed requests that fit the profile, the anchor's caps and the caller's scope** (checked over every request kind and scope).
4. **A hub never accepts a release numbered below its floor.**
5. **At most one replica of a hub appends to its audit chain** (checked by a model of the fenced takeover).

Each law gets a check and a `verify-*` skill with the pull request that builds it, and says when it takes hold.

## 8. What the attack found, and where each went

| # | Finding | Where |
|---|---|---|
| A-1 | Sites pulled from forge-core directly, against D-17 C-1; a rescheduled pod could not get its image during a cut | I-4 |
| A-2 | A hub checking its own images is no check; a listed image with an overridden command runs anything | I-5 |
| A-3 | No release number or floor: a valid older release could be replayed | I-1 |
| A-4 | Phase 1 verified the bundle with tooling and keys from the bundle | I-4 |
| A-5 | One release key could ship code to every customer | I-2 |
| A-6 | The signer signed any digest for anyone in the pod; role, not scope; a Secret against SF-18 | I-6, I-7 |
| A-7 | A non-root container cannot open a device without a runtime setting on the node | I-10 |
| A-8 | syft does not see native code inside wheels | I-3 |
| A-9 | Debian snapshot hashes trusted on download | I-3 |
| A-10 | The device plugin is a privileged target | I-10 |
| A-11 | Source offers come from where the binary is served; glibc and GPL tools need them too | I-3 |
| A-12 | Two live hub replicas fork the audit chain; leader election does not fence | I-11 |
| A-13 | A signer's readiness stopped the whole hub; a store schema rollback broke both replicas | I-8, I-9 |
| A-14 | Rollouts surged onto a device the old pod held | I-11 |
| A-15 | USB re-enumeration left the signer's pod stuck | I-10 |
| A-16 | A new key could not start before an anchor listed it | I-9, I-12 |
| A-17 | Node loss with a local volume had no owner | I-12 |
| A-18 | The Mac path was a mode: another backend, a shared HSM, no admission or device plugin | I-13 |
| A-19 | One freshness key on one device could not fail over | I-11, §9 |
| A-20 | One pod per node got the TPM; module keys blocked | I-8 |
| A-21 | D-16's per-hub script packages against "no package manager" | I-3 |
| A-22 | No FxTS specs, no verify skills, a law outside the record's scope; several backlog items in one | §7, §10 Q-6 |

The proof scripts are in the session's scratch folder; each becomes a test of the build.

## 9. What it would amend

- **D-23 T-3, T-5, T-10:** the device credential is the signer's alone; PKCS#11 runs in the signer, not in every service; the connector on the Mac becomes the fallback to Docker Desktop's USB passthrough (I-13).
- **D-23 T-2's development layout:** the YubiHSM 2 holds forge-core's online keys; the development hub's keys move to a software TPM, so each device has one owner (I-13).
- **D-20 SG-4 for code releases:** a release bundle's manifest takes a threshold of 2 release devices (I-2).
- **D-21 §14 FR-2:** two freshness keys on two devices, either counting, so forge-core can fail over (I-11).
- **D-21 Q-9** ("highly available") is met by an active and a standby (I-11).
- A **site prerequisite** on its hosts: the container runtime's device-ownership setting, applied from Forge's release by the installer (I-10). Nothing else is set on a host.

## 10. What only the owner decides, one at a time

| # | Question | Recommendation |
|---|---|---|
| Q-1 | Shape B: a signer container beside each service that signs, the only holder of a device, answering typed requests by scope; amends D-23 T-3 and T-5. | Accept. **Answered 2026-11-25: "Accept".** |
| Q-2 | Phase 2 down the chain: forge-core issues an install, each hub mirrors its children's images, every node pins its images; confirms "via forge-core gateway" within D-17 C-1. | Accept. **Answered 2026-11-25: "Accept".** |
| Q-3 | Code releases signed by 2 of the vendor's release devices, after a second build reproduces the digests; amends D-20 SG-4 for code. | Accept. **Answered 2026-11-25: "Accept".** |
| Q-4 | The site prerequisite: the container runtime's device-ownership setting on device nodes, applied from Forge's release by the installer and checked. | Accept: the one host setting, stated. **Answered 2026-11-25: "Accept".** |
| Q-5 | Development on Docker Desktop's Kubernetes, the YubiHSM 2 through its USB passthrough for forge-core's keys, a software TPM for the development hub's; nothing bought; the connector the fallback if passthrough fails; amends D-23 T-10 and T-2's development layout. | Accept. **Answered 2026-11-25, after the owner asked why a separate machine was needed ("cant we just use a docker contain I have docker desktop running locally"): "Accept" on this revision.** |
| Q-6 | Build it as separate backlog items: the release manifest, numbering and verification; the admission policy; the signer; the hub's mirror and image pinning; the device plugin and the site prerequisite; active and standby hubs; each with its FxTS spec (the release build, the install phases, a signer's enrolment) and verify skills. FB-231 (CI builds images) first. | Accept. **Answered 2026-11-25: "Accept".** |
| Q-7 | Two freshness keys on two devices (amends D-21 §14 FR-2), so forge-core can fail over. | Accept. **Answered 2026-11-25: "Accept".** The anchor's form (step 1a, `forge_core.trust.anchor`) changes from one `freshness_key` to two before any anchor exists. |
| Q-8 | Sign the record. | After Q-1 to Q-7. **Answered 2026-11-25: "Sign it".** |

## 11. What this does not decide

The FIPS edition's build (FB-303, which must cover OpenSSL and BoringSSL); the licence allow-list's contents (FB-304); signed releases (D-21 step 5); forge-core's gateway service in detail (FB-232); the forge-creds secret store (FB-142); every service's Kubernetes manifests.
