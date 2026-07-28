/**
 * Per-bridge config for the nightly live audit (`audit.ts`). Keyed by bridge id (= the `.build/<id>`
 * dir). `flaky` marks a bridge whose LIVE failures shouldn't redden the run — e.g. it Cloudflare-walls
 * or rate-limits datacenter (GitHub runner) IPs even though it works from a phone. For a flaky bridge,
 * even a real `fail` is downgraded to a warning in the status (transient/blocked throws are already
 * downgraded by the harness itself — see `isTransientError`). The string is the human reason shown.
 *
 * The shape lives in `@comical/testkit` (`BridgeAuditConfig`) — it's ops/test config, deliberately
 * OUT of the bridge contract.
 */
import type { BridgeAuditConfig } from "@comical/testkit";

export const AUDIT: Record<string, BridgeAuditConfig> = {
  atsumaru: { searchQuery: "spy" },
  weebcentral: { searchQuery: "blue" },
  // Commonly blocks / rate-limits datacenter runner IPs, so its LIVE failures are tolerated (⚠, not
  // ✗). Adjust as the nightly reveals what actually holds up in CI.
  mangadex: { searchQuery: "spy", flaky: "Cloudflare challenges datacenter (runner) IPs" },
};
