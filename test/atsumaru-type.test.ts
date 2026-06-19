/**
 * The Atsumaru series `type` (Manga / Manhwa / Manhua / …) is the series' format and is surfaced as
 * SeriesInfo.type — a single Type cell — rather than prepended to the genre chips. `genres` carries
 * only the real genres.
 *
 * Instantiates the bridge with a mock host answering the single detail endpoint with canned JSON.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import factory from "../src/bridge.ts";

/** A host that answers the manga-page detail endpoint with the given MangaDto. */
function detailHost(mangaPage: Record<string, unknown>): HostCapabilities {
  return {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        const body = req.url.includes("/api/manga/page") ? JSON.stringify({ mangaPage }) : "{}";
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
}

describe("Atsumaru series type", () => {
  test("maps `type` to SeriesInfo.type and keeps it out of genres", async () => {
    const bridge = factory(
      detailHost({
        title: "Subject Series",
        type: "Manga",
        genres: [
          { id: 39, name: "Action" },
          { id: 9, name: "Romance" },
        ],
      }),
    );
    const info = await bridge.getSeriesDetails("series-1");
    expect(info.type).toBe("Manga");
    expect(info.genres).toEqual(["Action", "Romance"]);
  });

  test("omits type when the series has none", async () => {
    const bridge = factory(detailHost({ title: "No Type", genres: [{ id: 1, name: "Drama" }] }));
    const info = await bridge.getSeriesDetails("series-2");
    expect(info.type).toBeUndefined();
    expect(info.genres).toEqual(["Drama"]);
  });
});
