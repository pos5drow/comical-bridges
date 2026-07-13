# TODO / design

## Nightly bridge audit + live README status (design — not yet implemented)

**Goal:** reuse the shared harness (`@comical/testkit`) to exercise every bridge capability AND measure
asset metrics (thumbnail sizes), run it **live nightly**, auto-update this repo's README status, and
**not cry wolf** on Cloudflare/flaky sites.

### Already exists — build on, don't rebuild
- **`@comical/testkit`** (in `comical`): `evaluateBridge(bridge, opts)` → conformance report
  (pass/warn/fail per capability + coverage verdict); fixture backend; mock host; **network
  record/replay cassettes**.
- **`comical-bridges/evaluate.ts`**: runs `evaluateBridge` against the **live** backend (`bun run
  evaluate`).
- **CI today**: `bun test` (deterministic, mock/cassette) gates PRs in `publish.yml` + `comical/ci.yml`.

### 1. Metrics probe (in `comical/testkit`)
- Sample the exercised items' `thumbnailUrl`s (+ page-thumb URLs for direct bridges), fetch via the same
  `network.request` capability (works **recorded OR live**), and measure **dimensions + byte size**.
- Extend `EvaluationReport` with a `metrics` block: avg/median/max cover bytes + dimensions, aspect
  distribution, cover-vs-page-thumb. `evaluate.ts` prints it; the audit surfaces regressions.
- Would have caught the atsumaru full-res-cover regression automatically (459 KB/card).

### 2. Nightly live-audit workflow (in `comical-bridges`)
- `schedule` (nightly) + manual `workflow_dispatch`. Runs `evaluate` + metrics **live** for every bridge.
- **Non-blocking** — reports, does NOT gate PRs (PRs stay gated on deterministic `bun test`).
- Caveat: GitHub runners are datacenter IPs; some sites (e.g. MangaDex) return a Cloudflare bot page to
  datacenter IPs even though they work from a phone → handled by tagging (§4).

### 3. README status, auto-updated
- Add a `<!-- BRIDGE-STATUS:START -->…<!-- BRIDGE-STATUS:END -->` block to `README.md`.
- The nightly job renders a markdown table (bridge · ✓/⚠/✗ · capabilities N/M · avg cover KB · last run),
  rewrites the block, commits `docs: bridge status [skip ci]` (bot identity), pushes. Mirrors the
  existing `ci: republish registry [skip ci]` bot-commit pattern (so it doesn't re-trigger CI).
- (Alt considered: shields.io endpoint badges reading a JSON in-repo — the table is richer, so chosen.)

### 4. Flaky / Cloudflare tagging → warning, not failure
Two layers:
- **Auto-classify in the harness:** a failure caused by a network error / HTTP 403 + bot-challenge HTML /
  429 / timeout is severity **`warn`** ("transient/blocked"), NOT `fail`. A schema/logic violation stays
  `fail`. So a Cloudflare block naturally shows ⚠, not ✗.
- **Explicit per-bridge tag:** a small audit config (e.g. `audit.config.ts`, keyed by bridge id — NOT in
  the bridge contract) marks known-flaky/Cloudflare bridges. For those, even a hard fail is downgraded to
  `warn` in the nightly. Untagged bridges: a fail is a fail.
- **Nightly verdict** fails only if a NON-tagged bridge has a real (non-transient) failure. README shows
  ⚠ "blocked (flaky)" for tagged/blocked ones.

### GitHub runner feasibility (answered)
Runners have full outbound internet — endpoints + images fetch fine. Keep deterministic cassette/mock
tests gating PRs; run live `evaluate` + metrics only in the nightly/manual audit (flakiness + datacenter
Cloudflare blocks make live unsuitable for PR gating).

### Rough order to implement
1. Metrics probe + `metrics` on `EvaluationReport` (`comical/testkit`) + failure auto-classification.
2. `audit.config.ts` (flaky/blocked tags) in `comical-bridges`.
3. Nightly audit workflow (live evaluate + metrics; verdict honors tags).
4. README `BRIDGE-STATUS` block + the workflow's write-back commit.
5. Same wiring reused by `comical-trackers`.
