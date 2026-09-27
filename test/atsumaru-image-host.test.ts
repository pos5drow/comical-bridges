/**
 * Atsumaru images must point straight at cdn.atsu.moe, like the site does. The legacy
 * `atsu.moe/static/…` path only 301s to the CDN, and its nginx intermittently answers `410 Gone`
 * under a reader's burst of page requests — which surfaced as random chapter pages failing to load.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import factory from "../src/bridge.ts";

function host(route: (url: string) => unknown): HostCapabilities {
  return {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => ({
        url: req.url,
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify(route(req.url) ?? {}),
      }),
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
}

describe("Atsumaru image host", () => {
  test("chapter pages load from the CDN, never the legacy origin path", async () => {
    const pages = [
      { image: "/static/pages/scan1/ch1/aaa.avif" }, // current reader shape
      { image: "static/pages/v8Kbg/ch1/1.webp" },
      { image: "https://atsu.moe/static/pages/v8Kbg/ch1/2.webp" }, // absolute on the legacy origin
      { image: "https://cdn.atsu.moe/static/pages/v8Kbg/ch1/3.webp" }, // already on the CDN
    ];
    const bridge = factory(host((url) => (url.includes("/api/read/chapter") ? { readChapter: { pages } } : {})));
    const result = await bridge.getChapterPages("v8Kbg", "ch1");
    expect(result.map((p) => p.imageUrl)).toEqual([
      "https://cdn.atsu.moe/static/pages/scan1/ch1/aaa.avif",
      "https://cdn.atsu.moe/static/pages/v8Kbg/ch1/1.webp",
      "https://cdn.atsu.moe/static/pages/v8Kbg/ch1/2.webp",
      "https://cdn.atsu.moe/static/pages/v8Kbg/ch1/3.webp",
    ]);
  });
});
