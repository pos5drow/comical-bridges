/**
 * Atsumaru serves the same cover under two different key families, and cards must land on the
 * pre-generated 2:3 medium variant in BOTH — never the full-size original.
 *
 *   list / detail / bookmarks: `image` (original) + `smallImage` (180x180 square) +
 *                              `mediumImage` (360x540) + `largeImage` (400x600)
 *   Typesense search docs:     `poster` (original) + `posterSmall` (180x180 square) +
 *                              `posterMedium` (360x540)   ← no posterLarge
 *
 * The search family used to match none of the resolver's keys, so every search card fell through to
 * the full-size `poster` — a 1656x2618 / 6.4 MB PNG in a real sample. These lock in that each shape
 * resolves to its medium variant on cards, and that the square small crop is never chosen (it would
 * render our 2:3 cards square).
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import factory from "../src/bridge.ts";

const POSTER = "posters/abc123";

/** Search-document shape: the Typesense `poster*` family. */
const SEARCH_DOC = {
  id: "s1",
  title: "Searched Series",
  poster: `/static/${POSTER}.png`,
  posterMedium: `/static/${POSTER}-medium.webp`,
  posterSmall: `/static/${POSTER}-small.webp`,
};

/** List-item shape: the `*Image` family. */
const LIST_ITEM = {
  id: "l1",
  title: "Listed Series",
  image: `${POSTER}.jpg`,
  smallImage: `${POSTER}-small.webp`,
  mediumImage: `${POSTER}-medium.webp`,
  largeImage: `${POSTER}-large.webp`,
};

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

describe("Atsumaru cover variants", () => {
  test("search cards use posterMedium, not the full-size poster", async () => {
    const bridge = factory(
      host((url) =>
        url.includes("/documents/search")
          ? { page: 1, found: 1, hits: [{ document: SEARCH_DOC }], request_params: { per_page: 40 } }
          : {},
      ),
    );
    const { items } = await bridge.getSearchResults("q", 1);
    expect(items[0].thumbnailUrl).toBe(`https://atsu.moe/static/${POSTER}-medium.webp`);
  });

  test("browse cards use mediumImage, not the full-size image", async () => {
    const bridge = factory(host((url) => (url.includes("/api/infinite/") ? { items: [LIST_ITEM] } : {})));
    const { items } = await bridge.getListItems("trending", 1);
    expect(items[0].thumbnailUrl).toBe(`https://atsu.moe/static/${POSTER}-medium.webp`);
  });

  test("the detail hero keeps largeImage from the nested poster object", async () => {
    const bridge = factory(
      host((url) =>
        url.includes("/api/manga/page")
          ? { mangaPage: { id: "d1", title: "Detailed Series", poster: { ...LIST_ITEM } } }
          : {},
      ),
    );
    const info = await bridge.getSeriesDetails("d1");
    expect(info.thumbnailUrl).toBe(`https://atsu.moe/static/${POSTER}-large.webp`);
  });

  test("falls back to the original only when no 2:3 variant exists", async () => {
    const bridge = factory(
      host((url) =>
        url.includes("/documents/search")
          ? {
              page: 1,
              found: 1,
              // Only the square small crop + the original: the square must NOT win.
              hits: [{ document: { id: "s2", title: "Bare", poster: `/static/${POSTER}.png`, posterSmall: `/static/${POSTER}-small.webp` } }],
              request_params: { per_page: 40 },
            }
          : {},
      ),
    );
    const { items } = await bridge.getSearchResults("q", 1);
    expect(items[0].thumbnailUrl).toBe(`https://atsu.moe/static/${POSTER}.png`);
  });
});
