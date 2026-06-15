/**
 * Unit test for the Atsumaru "exclude-genres" capability. Genre exclusions live on the user's
 * atsu.moe account (`global.excludedGenreIds` under /api/user/homePagePreferences), which the backend
 * enforces server-side across every surface. The bridge reads that endpoint for the picker + current
 * state, and writes it back read-merge-write so the rest of the preferences object (contentRatings,
 * sections, adult) survives untouched.
 *
 * A mock host serves a canned prefs payload and records the PUT — no network, no build step.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import factory from "../src/bridge.ts";

const PREFS = {
  preferences: {
    global: { excludedGenreIds: ["39"], contentRatings: ["Safe", "Suggestive", "Erotica"] },
    sections: { "continue-reading": [{ type: "bookmarkStatus", statuses: ["Reading"] }] },
    adult: false,
  },
  availableFilters: {
    genres: [
      { id: "39", name: "Action" },
      { id: "44", name: "Horror" },
      { id: "9", name: "Romance" },
    ],
  },
};

/** A host that answers the prefs GET with PREFS and records the PUT body it receives. */
function prefsHost(): { host: HostCapabilities; puts: Array<Record<string, unknown>> } {
  const puts: Array<Record<string, unknown>> = [];
  const host: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        const ok = (body: string): HttpResponse => ({ url: req.url, status: 200, statusText: "OK", headers: {}, body });
        if (req.url.includes("/api/user/homePagePreferences")) {
          if ((req.method ?? "GET") === "PUT") {
            puts.push(JSON.parse(req.body as string) as Record<string, unknown>);
            return ok("{}");
          }
          return ok(JSON.stringify(PREFS));
        }
        return ok("{}");
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { host, puts };
}

describe("Atsumaru exclude-genres", () => {
  test('advertises the "exclude-genres" capability', () => {
    const bridge = factory(prefsHost().host);
    expect(bridge.info.capabilities).toContain("exclude-genres");
  });

  test("getGenreExclusions maps available genres + the current exclusion set", async () => {
    const bridge = factory(prefsHost().host);
    const state = await bridge.getGenreExclusions!();
    expect(state.available).toEqual([
      { id: "39", label: "Action" },
      { id: "44", label: "Horror" },
      { id: "9", label: "Romance" },
    ]);
    expect(state.excluded).toEqual(["39"]);
  });

  test("setExcludedGenres writes excludedGenreIds and preserves other preferences", async () => {
    const { host, puts } = prefsHost();
    const bridge = factory(host);

    const state = await bridge.setExcludedGenres!(["44", "9"]);

    // The PUT body is the bare preferences object, with only excludedGenreIds replaced.
    expect(puts).toHaveLength(1);
    const sent = puts[0] as { global: Record<string, unknown>; sections: unknown; adult: unknown };
    expect(sent.global.excludedGenreIds).toEqual(["44", "9"]);
    expect(sent.global.contentRatings).toEqual(["Safe", "Suggestive", "Erotica"]); // preserved
    expect(sent.sections).toEqual(PREFS.preferences.sections); // preserved
    expect(sent.adult).toBe(false); // preserved

    // Returned state reflects the new exclusion without a second round-trip.
    expect(state.excluded).toEqual(["44", "9"]);
    expect(state.available.map((g) => g.id)).toEqual(["39", "44", "9"]);
  });

  test("setExcludedGenres dedupes, trims and drops blank ids", async () => {
    const { host, puts } = prefsHost();
    const bridge = factory(host);

    await bridge.setExcludedGenres!(["44", "44", "  ", "", " 9 "]);

    expect((puts[0] as { global: { excludedGenreIds: string[] } }).global.excludedGenreIds).toEqual(["44", "9"]);
  });
});
