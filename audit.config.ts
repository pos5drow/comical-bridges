/**
 * Per-bridge config for the nightly live audit (`audit.ts`). Keyed by bridge id (= the `.build/<id>`
 * dir). `flaky` marks a bridge whose LIVE failures shouldn't redden the run — e.g. it Cloudflare-walls
 * or rate-limits datacenter (GitHub runner) IPs even though it works from a phone. For a flaky bridge,
 * even a real `fail` is downgraded to a warning in the status (transient/blocked throws are already
 * downgraded by the harness itself — see `isTransientError`). The string is the human reason shown.
 *
 * NOTE: this is deliberately OUT of the bridge contract — it's test/ops config, not runtime shape.
 */
export interface BridgeAuditConfig {
  /** A query expected to return ≥1 result live. */
  searchQuery?: string;
  /** Extra host settings for the live run (e.g. enable adult content so NSFW bridges return results). */
  settings?: Record<string, string>;
  /** Non-empty ⇒ tolerate this bridge's live failures (show ⚠, don't fail the run). The reason. */
  flaky?: string;
}

export const AUDIT: Record<string, BridgeAuditConfig> = {
  atsumaru: { searchQuery: "spy" },
  weebcentral: { searchQuery: "blue" },
  // The following commonly block / rate-limit datacenter runner IPs, so their LIVE failures are
  // tolerated (⚠, not ✗). Adjust as the nightly reveals what actually holds up in CI.
  mangadex: { searchQuery: "spy", flaky: "Cloudflare challenges datacenter (runner) IPs" },
  nhentai: { searchQuery: "the", settings: { adult: "true" }, flaky: "Cloudflare / IP-gated from datacenters" },
  // "the" isn't a searchable token on e-hentai's tag-tokenized search (returns 0); "translated" is a
  // near-universal tag that reliably returns hits.
  "e-hentai": { searchQuery: "translated", settings: { adult: "true" }, flaky: "sad-panda / IP + cookie gated from datacenters" },
};
