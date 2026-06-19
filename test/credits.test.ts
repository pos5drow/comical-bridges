/**
 * Credit parsing: each bridge maps its native author/artist data into `SeriesInfo.authors`/`artists`
 * (the multi-credit form) in addition to the back-compat single string. Splitting a credit line into
 * individual people is the bridge's job — the host renders the array verbatim without guessing
 * separators. nhentai/e-hentai carry names only (their author filter matches names); MangaDex carries
 * the real per-author UUIDs so the host can filter precisely.
 *
 * Bridges are instantiated directly with a mock host that answers canned JSON — no network, no build.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import nhentaiFactory from "../src/nhentai.ts";
import mangadexFactory from "../src/mangadex.ts";

function jsonHost(route: (path: string) => unknown): HostCapabilities {
  return {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => ({
        url: req.url,
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify(route(new URL(req.url).pathname)),
      }),
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
}

describe("nhentai credits", () => {
  test("splits multiple artist tags into name-only credits (no ids)", async () => {
    const bridge = nhentaiFactory(
      jsonHost((path) => {
        if (path.endsWith("/cdn")) return { image_servers: ["https://i.example"], thumb_servers: ["https://t.example"] };
        return {
          id: 1,
          media_id: "m1",
          title: { english: "G", pretty: "G" },
          cover: { path: "galleries/1/cover.webp" },
          tags: [
            { id: 100, type: "artist", name: "Artist One" },
            { id: 101, type: "artist", name: "Artist Two" },
            { id: 9, type: "tag", name: "example" },
          ],
        };
      }),
    );
    const info = await bridge.getSeriesDetails("1");
    expect(info.author).toBe("Artist One, Artist Two");
    expect(info.authors).toEqual([{ name: "Artist One" }, { name: "Artist Two" }]);
  });
});

describe("mangadex credits", () => {
  test("keeps each author's UUID so the host can filter precisely", async () => {
    const bridge = mangadexFactory(
      jsonHost(() => ({
        result: "ok",
        response: "entity",
        data: {
          id: "manga-1",
          type: "manga",
          attributes: { title: { en: "M" }, description: {}, status: "ongoing", tags: [] },
          relationships: [
            { id: "auth-a", type: "author", attributes: { name: "Author A" } },
            { id: "auth-b", type: "author", attributes: { name: "Author B" } },
            { id: "art-c", type: "artist", attributes: { name: "Artist C" } },
          ],
        },
      })),
    );
    const info = await bridge.getSeriesDetails("manga-1");
    expect(info.author).toBe("Author A, Author B");
    expect(info.authors).toEqual([
      { name: "Author A", id: "auth-a" },
      { name: "Author B", id: "auth-b" },
    ]);
    expect(info.authorId).toBe("auth-a");
    expect(info.artists).toEqual([{ name: "Artist C", id: "art-c" }]);
  });
});
