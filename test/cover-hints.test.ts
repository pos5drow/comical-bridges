/**
 * The contract's cover hints — `coverForm` (what a series is as an object) and `readingDirection` —
 * as each bridge reads them off its source: Atsumaru's and Weeb Central's series `type`, MangaDex's
 * format tags and original language. The app draws a card from them (a volume, a stapled issue, a
 * webtoon's scroll) and only guesses where a series says nothing.
 *
 * Each bridge runs against a mock host answering its endpoints with canned payloads.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import atsumaru from "../src/bridge.ts";
import { hintsForType } from "../src/cover-hints.ts";
import mangadex from "../src/mangadex.ts";
import weebcentral from "../src/weebcentral.ts";

/** A host answering every request with `respond(url)`. */
function host(respond: (url: string) => string): HostCapabilities {
  return {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => ({
        url: req.url,
        status: 200,
        statusText: "OK",
        headers: {},
        body: respond(req.url),
      }),
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
}

describe("cover hints from a series type", () => {
  test("manga is a volume read right to left", () => {
    expect(hintsForType("Manga")).toEqual({ coverForm: "volume", readingDirection: "rtl" });
  });
  test("manhwa (Atsumaru's 'Manwha' too) and manhua are webtoons, read down", () => {
    for (const type of ["Manhwa", "Manwha", "Manhua"]) {
      expect(hintsForType(type)).toEqual({ coverForm: "scroll", readingDirection: "vertical" });
    }
  });
  test("OEL is a volume read left to right", () => {
    expect(hintsForType("OEL")).toEqual({ coverForm: "volume", readingDirection: "ltr" });
  });
  test("an unknown or missing type says nothing", () => {
    expect(hintsForType("Novel")).toEqual({});
    expect(hintsForType(undefined)).toEqual({});
  });
});

describe("Atsumaru", () => {
  test("a series' detail carries its type's hints", async () => {
    const bridge = atsumaru(host(() => JSON.stringify({ mangaPage: { title: "A Webtoon", type: "Manwha" } })));
    const info = await bridge.getSeriesDetails("s1");
    expect(info.coverForm).toBe("scroll");
    expect(info.readingDirection).toBe("vertical");
  });
});

describe("Weeb Central", () => {
  // One card of the `/search/data` listing, as the site serves it (Full Display).
  const card = (id: string, type: string) => `
    <article class="bg-base-300 flex gap-4 p-4">
      <a href="https://weebcentral.com/series/${id}/slug">cover</a>
      <div class="text-lg font-semibold"><a href="https://weebcentral.com/series/${id}/slug">Title ${id}</a></div>
      <div class="opacity-70"><strong>Type:</strong> <span>${type}</span></div>
    </article>`;

  test("a listing card's Type line gives its entry's hints", async () => {
    const bridge = weebcentral(host(() => card("01A", "Manga") + card("01B", "Manhwa")));
    const lists = await bridge.getLists();
    const page = await bridge.getListItems(lists[0]!.id);
    const byId = Object.fromEntries(page.items.map((e) => [e.id, e]));
    expect(byId["01A"]).toMatchObject({ coverForm: "volume", readingDirection: "rtl" });
    expect(byId["01B"]).toMatchObject({ coverForm: "scroll", readingDirection: "vertical" });
  });
});

describe("MangaDex", () => {
  /** A detail response for a series with these format tags, first published in `language`. */
  const manga = (formats: string[], language?: string) =>
    JSON.stringify({
      result: "ok",
      data: {
        id: "m1",
        attributes: {
          title: { en: "A Series" },
          ...(language ? { originalLanguage: language } : {}),
          tags: formats.map((name) => ({ id: name, attributes: { name: { en: name }, group: "format" } })),
        },
        relationships: [],
      },
    });
  const details = (formats: string[], language?: string) =>
    mangadex(host(() => manga(formats, language))).getSeriesDetails("m1");

  test("a long strip is a webtoon, read down", async () => {
    expect(await details(["Long Strip", "Full Color"], "ko")).toMatchObject({ coverForm: "scroll", readingDirection: "vertical" });
  });
  test("a doujinshi is an issue, read the way its language reads", async () => {
    expect(await details(["Doujinshi"], "ja")).toMatchObject({ coverForm: "issue", readingDirection: "rtl" });
  });
  test("anything else is a volume: Japanese right to left, others left to right", async () => {
    expect(await details(["Adaptation"], "ja")).toMatchObject({ coverForm: "volume", readingDirection: "rtl" });
    expect(await details([], "en")).toMatchObject({ coverForm: "volume", readingDirection: "ltr" });
  });
  test("with no original language, the direction is left unsaid", async () => {
    const info = await details([]);
    expect(info.coverForm).toBe("volume");
    expect(info.readingDirection).toBeUndefined();
  });
});
