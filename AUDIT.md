# Bridge audit — detailed results

Per-check results from the live bridge audit — every conformance probe run against the real
backend. ✓ pass · ⚠ warn · ✗ fail · ⊘ skipped (auth-gated with no credentials, or an inconclusive
sort/filter probe — never a defect). Warnings never fail the run; a tolerated flaky/blocked bridge
shows ⚠ even for a hard failure.

## `atsumaru` — ✗ (0✓ 0⚠ 1✗)

**Bridge failed to load:** bridge "pos5drow.atsumaru" targets contract 1.0.0, incompatible with runtime 2.0.0

## `weebcentral` — ✗ (0✓ 0⚠ 1✗)

**Bridge failed to load:** bridge "pos5drow.weebcentral" targets contract 1.0.0, incompatible with runtime 2.0.0

## `mangadex` — ⚠ (0✓ 0⚠ 0✗)

**Bridge failed to load:** bridge "pos5drow.mangadex" targets contract 1.0.0, incompatible with runtime 2.0.0

_Updated 2026-07-30 by the nightly live audit ([`audit.ts`](audit.ts))._
