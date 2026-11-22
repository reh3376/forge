# What every FxTS framework provides — design record

**Status:** approved by reh3376 on 2026-11-18 (the owner answered Q-1 to Q-6 one at a time and declared the answers the signature; the status line was set on that word) · **Backlog:** FB-152 (with FB-149, FB-151) · **Roadmap:** decisions A-13, A-15
**Participants:** reh3376 (owner, decides and signs), Claude (surveys, asks, records, proposes)

Every statement is tagged **[OWNER]** (decided by the owner, with the date), **[FACT]** (what the code says today, with the path) or **[PROPOSED]** (Claude's recommendation, not approved).

---

## 1. What the owner decided (2026-11-17 and 18)

- **[OWNER]** A-13: "In this development environment FxTS specs are treated as defacto standards when building repeatable functionality. All processes which are highly repeatable must have a FxTS spec associated with it."
- **[OWNER]** A-15: "The FxTS framework has multiple purposes, which includes standardization of repeatable functionality and code, ensuring FxTS specs are safe from unapproved or accidental changes (via hash), and much more but we need to ensure we are not generating excessive technical debt when building FxTS specs by ensuring these core purposes are met with each new instantiation of a FxTS spec."
- **[OWNER]** "when a FxTS schema changes so must the hash, this functionality should be built directly into the FxTS framework."
- **[OWNER]** "We must also be certain all JSON schema are versioned and have the necessary infra in place to review / parse / iterate / etc... via version."
- **[OWNER]** (D-13, B-11) The FxTS schemas bound what a user can build; only a hub admin, a dev or the super admin can change a schema.

## 2. What exists today (surveyed 2026-11-18)

| Framework | Versioned schema | Runner | Specs | Specs hashed and approved | Hash checked by the runner | Documentation page | Row in the summary | `forge governance run` | Gate in CI |
|---|---|---|---|---|---|---|---|---|---|
| FACTS | yes (`forge://fxts/facts/v0.1.0`) | yes | 9 | 9 of 9 approved | presence, format and state; not that the hash verifies | yes | yes | yes | yes |
| FATS | yes (`forge://fxts/fats/v0.1.0`) | yes | 28 | **0 of 28: no spec carries a hash** | **no** | yes | yes | yes | yes |
| FMTS | yes (`forge://governance/fmts/v0.2.0`) | yes | 9 | 8 approved, 1 pending | yes: verified and approved | yes | yes | yes | yes |
| FVTS | yes (`forge://governance/fvts/v0.1.0`) | yes | 1 | 0 approved, 1 pending | yes: verified and approved | yes | yes | yes | yes |
| FTTS | yes (`forge://governance/ftts/v0.1.0`) | yes | 1 | **0 of 1: no hash** | presence, format and state | **no** | **no** | yes | yes |
| FHTS | none (it validates integrity blocks) | yes | none | not applicable | it is the hash framework | yes | yes | no | no test directory |
| FQTS | **none** | **none** | 1 | **no hash** | no runner | yes ("stub") | yes | no | no |
| FSTS | **none** | **none** | 0 | not applicable | no runner | yes ("stub") | yes | no | no |
| FDTS, FLTS, FNTS, FOTS, FPTS | none | none | 0 | not applicable | none | yes ("planned") | yes | no | no |

Other facts:

- **[FACT]** No schema file is hashed. A spec's hash covers the spec's own content only; a schema can change with no approved spec noticing.
- **[FACT]** The schema `$id` uses two prefixes: `forge://fxts/…` (FATS, FACTS) and `forge://governance/…` (FTTS, FVTS, FMTS).
- **[FACT]** Only one version of each schema exists in the tree; a change replaces the file.
- **[FACT]** `forge governance specs` lists the specs under `src/forge/governance/` only. Seven spec files live under the top-level `specs/` directory and are not listed: `adapter-transport.facts.json` and `curation.facts.json` (no hash), `grpc-hardened-transport.ftts.json` (the one FTTS spec; no hash), `whk-data-products.fqts.json` (no hash; its name carries the old company prefix, A-16), and three under `specs/facts/` that are stale copies of governed FACTS specs with different content, referenced by nothing.
- **[FACT]** FACTS and FTTS report whether a spec's hash verifies as a separate signal on the report (`hash_verified`), not as a verdict, so a spec whose content no longer matches its hash can still pass their runs.

## 3. The problem, precisely

The purposes the owner named are met by two frameworks of eleven (FMTS and FVTS). The others lack one or more of them, and nothing tells an author of a new framework what is required or checks it. The weakest point is the one the owner named first: 28 FATS specs, the FTTS spec and three others have no hash at all, so they can change without anyone's approval.

## 4. The baseline

The owner answered §5 on 2026-11-18. F-1 to F-10 stand as amended by those answers and are **[OWNER]**.

A framework that has specs meets all of these. Each is checked by one test that walks `src/forge/governance/` (`tests/governance/test_framework_baseline.py`).

| # | Requirement |
|---|---|
| F-1 | **A stated purpose**: which repeatable work the framework standardizes, in its documentation page. |
| F-2 | **A versioned schema**, with one `$id` convention, every released version kept in the tree, and a hash for each version (FB-151). |
| F-3 | **A runner with schema-runner parity**: every schema field is enforced or the run fails. |
| F-4 | **Every spec carries an integrity block**, and the runner gives two verdicts for it: the hash verifies, and the hash is approved by the owner. A spec whose content does not match its hash fails. |
| F-5 | **Every spec lives in the `fxts/` folder of what it describes** (named `fxts/` by D-17's amendment of 2026-11-22) and is listed by `forge governance specs`. No spec file exists outside such a folder. *Reworded by the owner on 2026-11-22 (D-17, `repository-structure.md` Q-6); it read "Every spec lives in the framework's `specs/` directory … No spec file exists outside it", and that is still how the files lie until FB-200 and FB-201 move them.* |
| F-6 | **A blocking gate in CI** that runs every spec and names each failure it allows, with the backlog item that removes it. |
| F-7 | **A check that was not run is reported as not run**, never as passed. |
| F-8 | **A documentation page and a row in the summary** (`docs/FxTS/README.md`), both stating the framework's real state. |
| F-9 | **The commands**: `forge governance run`, `stamp`, `approve`, `validate-spec` work for the framework. |
| F-10 | **A spec records the schema version and hash it was approved against**; when the schema has changed since, the spec is reported as needing review (FB-151). |

## 5. Questions for the owner

| # | Question | Answer |
|---|---|---|
| Q-1 | The baseline F-1 to F-10: accept, remove or add. | **Answered 2026-11-18: all ten accepted.** One test walks `src/forge/governance/` and fails for a framework that lacks one. Debt check: the test is the enforcement, so a framework cannot be added half-finished; F-2 and F-10 need the schema versioning work (Q-5) before they can be met, and until then the test names them as allowed failures per framework with FB-151. |
| Q-2 | The specs with no hash today (28 FATS, 1 FTTS, 2 FACTS-named files and 1 FQTS file under `specs/`): how they come under the hash. | **Answered 2026-11-18: stamp all, approve by framework.** Every unhashed spec is stamped `pending_review` now, so any later change is detected at once. The owner then approves one framework at a time from a table of its specs; one answer approves the set. The gate names "awaiting approval" as an allowed failure until then. Debt check: stamping without approval already closes the silent-change hole; approval by table is the owner's choice of review depth for specs that describe routes already served. After Q-4, the specs to stamp are the 28 FATS specs and the FTTS spec. |
| Q-3 | The frameworks that are only a documentation page (FDTS, FLTS, FNTS, FOTS, FPTS) or a stub (FQTS, FSTS): what the baseline asks of them. | **Answered 2026-11-18: planned is allowed, half-built is not.** A framework is either planned (a documentation page that says so; no code, no specs) or it meets the whole baseline. FSTS's empty directories are removed and it is planned; FQTS likewise (Q-4). Debt check: a planned page is a statement of intent with no enforcement to rot; the test fails for a framework directory that has anything in it short of the baseline. |
| Q-4 | The top-level `specs/` directory and its seven files. | **Answered 2026-11-18: move the live one, remove the rest.** `grpc-hardened-transport.ftts.json` moves into `src/forge/governance/ftts/specs/` and is stamped. The three stale copies under `specs/facts/`, the two old-shape files and the unchecked data-products file are removed; git history keeps them. The directory is gone and FQTS becomes planned. Debt check: the data-quality rules in the removed FQTS file were never checked by anything; they are summarized in `BACKLOG.md` as input for FQTS when it is built, so nothing decided is lost. |
| Q-5 | Schema versions: what change needs which version step, and who approves a schema's hash. | **Answered 2026-11-18: semantic steps; the owner approves.** One id form, `forge://fxts/<framework>/v<major.minor.patch>`. A released version is never edited: a change is a new version file kept beside the old one. Each version's hash is recorded in a registry and approved like a spec's. Patch: wording only. Minor: something optional added; approved specs stay valid. Major: a required field added, or anything removed or narrowed; every spec is reported as needing review. Each spec records the schema version and hash it was approved against. A test fails when a schema file changes without a new version and hash. In this repository the owner approves each schema hash; at an installation it is that hub's admin, dev or super admin (D-13, B-11). Debt check: FMTS went from 0.1.0 to 0.2.0 in place on 2026-11-18; under this rule that would have been a new file, and 0.1.0 is restored from git history when the versions are laid out. |
| Q-6 | FACTS and FTTS: a spec whose hash does not verify becomes a failed verdict. | **Answered 2026-11-18: yes, in every framework.** A spec edited after its hash was recorded fails its run, and so does a spec whose hash is not approved, unless the gate names that as an allowed failure with a backlog item. The shared runner does it once for all frameworks. Debt check: one implementation in `FxTSRunner.run` replaces four per-framework ones, and a new framework gets it without writing anything. |

## 6. Implementation plan (after signature)

One backlog item and one PR per step.

| Step | What | Item |
|---|---|---|
| 1 | The shared runner fails a spec whose hash does not verify or is not approved, for every framework (Q-6); the per-framework copies in FMTS and FVTS are removed. | FB-159 |
| 2 | The top-level `specs/` directory is emptied: the FTTS spec moved and stamped, the six others removed; FSTS and FQTS become planned (Q-3, Q-4). The 28 FATS specs are stamped (Q-2). | FB-160 |
| 3 | The baseline test, `tests/governance/test_framework_baseline.py`, with each allowed failure named; the summary document and every framework page brought to the code; FTTS gets its page and row (FB-149). | FB-149, FB-152 |
| 4 | The owner approves FATS and FTTS from a table of their specs (Q-2). | FB-161 |
| 5 | Schema versions: one id form, every version kept, the schema registry with hashes, the spec's record of its schema, the commands to list, compare, validate against a version and migrate, the change test (Q-5). | FB-151 |
