/**
 * Manga Ball against fixtures cut from its API (Nov 2026): the Language setting scoping listings and
 * chapters, search parameters, adult rating, `{titleId}:{slug}` ids, details, chapters, pages, links.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import mangaball from "../src/mangaball.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "mangaball", name), "utf8");
const ID = "685155e6702284f834178607:tears-on-a-withered-flower";

function host(settings: Record<string, string> = {}) {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req);
        const p = new URL(req.url).pathname;
        const body =
          p === "/api/v1/title/search-advanced" ? fixture("search.json")
          : p.startsWith("/api/v1/title/detail/") ? fixture("detail.json")
          : p === "/api/v1/chapter/chapter-listing-by-title-id" ? fixture("chapters.json")
          : fixture("pages.json");
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings,
  };
  return { caps, requests };
}

describe("browse and search", () => {
  test("lists ask for the chosen language's translations; ids pair title id and slug", async () => {
    const { caps, requests } = host();
    const res = await mangaball(caps).getListItems!("popular");
    expect(Object.fromEntries(new URL(requests[0]!.url).searchParams)).toEqual({
      page: "1", limit: "24", tag_mode: "AND", adult_mode: "all", chapterLanguage: "en", sort_by: "views", sort_order: "desc",
    });
    expect(res.items[0]).toMatchObject({ id: ID, title: "Tears on a Withered Flower" });
    expect(res.items[0]!.thumbnailUrl).toStartWith("https://bulbasaur.poke-black-and-white.net/covers/685155e6702284f834178607/");
    expect(res.items[1]!.contentRating).toBe("adult");
    expect(res.nextCursor).toBeDefined();
  });

  test("another language widens to all of its codes", async () => {
    const { caps, requests } = host({ language: "es" });
    await mangaball(caps).getListItems!("latest");
    expect(new URL(requests[0]!.url).searchParams.get("chapterLanguage")).toBe("es,es-ar,es-mx,es-es,es-la,es-419");
  });

  test("a keyword search leaves sort to relevance unless one is chosen", async () => {
    const { caps, requests } = host();
    const bridge = mangaball(caps);
    await bridge.getSearchResults!({ text: "solo", filters: [{ key: "status", value: "ongoing" }] });
    await bridge.getSearchResults!({ text: "solo", sort: { key: "name", ascending: true } });
    const [a, b] = requests.map((r) => new URL(r.url).searchParams);
    expect(a!.get("keyword")).toBe("solo");
    expect(a!.get("status")).toBe("ongoing");
    expect(a!.has("sort_by")).toBe(false);
    expect([b!.get("sort_by"), b!.get("sort_order")]).toEqual(["name", "asc"]);
  });
});

describe("details, chapters, pages", () => {
  test("details by slug", async () => {
    const { caps, requests } = host();
    const info = await mangaball(caps).getSeriesDetails(ID);
    expect(requests[0]!.url).toEndWith("/api/v1/title/detail/tears-on-a-withered-flower");
    expect(info).toMatchObject({ id: ID, status: "ongoing", rating: { votes: 63 }, shareUrl: "https://mangaball.com/title-detail/tears-on-a-withered-flower" });
    expect(info.rating?.score).toBeCloseTo(0.903, 6);
    expect(info.authors?.length).toBe(2);
  });

  test("chapters by title id, only the chosen language, tagged", async () => {
    const { caps, requests } = host();
    const chapters = await mangaball(caps).getChapters!(ID);
    expect(JSON.parse(requests[0]!.body!)).toEqual({ title_id: "685155e6702284f834178607" });
    expect(chapters.every((c) => c.languageCode === "en")).toBe(true);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toMatchObject({ name: "Ch.127", number: 127, group: "Empoleon", publishedAt: Date.parse("2026-11-14T01:41:43.660Z") });
  });

  test("pages", async () => {
    const pages = await mangaball(host().caps).getChapterPages!(ID, "6af7bc57bca7d6642d6c16e0");
    expect(pages[0]!.imageUrl).toStartWith("https://chikorita.red-and-blue.net/");
  });

  test("an id without its slug half is gone", async () => {
    await expect(mangaball(host().caps).getSeriesDetails("nope")).rejects.toThrow(/removed from the source/);
  });
});

test("links: a title link by slug, a chapter link through its title id", async () => {
  const bridge = mangaball(host().caps);
  expect(await bridge.resolveUrl!("https://mangaball.com/title-detail/tears-on-a-withered-flower")).toEqual({ seriesId: ID });
  expect(await bridge.resolveUrl!("https://mangaball.net/chapter-detail/6af7bc57bca7d6642d6c16e0")).toEqual({ seriesId: ID, chapterId: "6af7bc57bca7d6642d6c16e0" });
  expect(await bridge.resolveUrl!("https://mangaball.com/search")).toBeNull();
});
