/**
 * The MadTheme engine (MangaK, Toonily.me) against fixtures cut from the API (Nov 2026): site config,
 * search URL and filters, adult titles rated, details with credits/rating/tags, chapters numbered by
 * name, pages, rotating image hosts declared with the Referer, and links resolved through the page.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import mangak from "../src/mangak.ts";
import toonilyme from "../src/toonilyme.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "madtheme", name), "utf8");

function host() {
  const requests: string[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req.url);
        const u = new URL(req.url);
        const p = u.pathname;
        const body =
          u.host === "mangak.io"
            ? '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"initialManga":{"id":"PDmZ0n2E"}}}}</script>'
            : p === "/titles/search" ? fixture("search.json")
            : p === "/genres" ? JSON.stringify({ success: true, data: { items: [{ name: "Action", slug: "action" }] } })
            : /\/chapters\/[^/]+$/.test(p) ? fixture("chapter.json")
            : p.endsWith("/chapters") ? fixture("chapters.json")
            : fixture("title.json");
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, requests };
}

describe("sites", () => {
  test("one engine, each site its own id, API host and Referer; rotating image hosts declared", () => {
    const [a, b] = [mangak(host().caps).info, toonilyme(host().caps).info];
    expect([a.id, b.id]).toEqual(["pos5drow.mangak", "pos5drow.toonilyme"]);
    expect(a.images?.headers?.Referer).toBe("https://mangak.io/");
    expect(b.images?.headers?.Referer).toBe("https://toontop.io/");
    expect(a.images?.hosts).toContain("qvzrg.org");
    expect(a.images?.hosts).toContain("rzyn.net");
    expect(b.images?.hosts).toContain("toontop.io");
  });
});

describe("browse and search", () => {
  test("popular list: weekly window on the site's API, adult titles rated", async () => {
    const { caps, requests } = host();
    const res = await mangak(caps).getListItems!("popular");
    expect(requests[0]).toBe("https://api.mangak.io/titles/search?page=1&limit=24&sort=popular&window=week");
    expect(res.items[0]).toMatchObject({ id: "PDmZ0n2E", title: "Seashell boy", contentRating: "adult" });
    expect(res.nextCursor).toBeDefined();
  });

  test("search cleans the text and carries sort and filters", async () => {
    const { caps, requests } = host();
    await toonilyme(caps).getSearchResults!({
      text: "Solo-Leveling: Ragnarok!",
      sort: { key: "rating", ascending: false },
      filters: [{ key: "status", value: "ongoing" }, { key: "genres", value: ["action", "drama"] }],
    });
    expect(Object.fromEntries(new URL(requests[0]!).searchParams)).toEqual({
      page: "1",
      limit: "24",
      q: "Solo Leveling Ragnarok",
      sort: "rating",
      status: "ongoing",
      genres: "action,drama",
    });
    expect(new URL(requests[0]!).host).toBe("api.toontop.io");
  });

  test("genre options come from the API", async () => {
    const filters = await mangak(host().caps).getFilters!();
    expect(filters.at(-1)).toMatchObject({ key: "genres", options: [{ value: "action", label: "Action" }] });
  });
});

describe("details, chapters, pages", () => {
  test("details", async () => {
    const info = await mangak(host().caps).getSeriesDetails("PDmZ0n2E");
    expect(info).toMatchObject({
      id: "PDmZ0n2E",
      title: "Seashell boy",
      status: "ongoing",
      type: "Manhwa",
      contentRating: "adult",
      shareUrl: "https://mangak.io/seashell-boy",
      coverForm: "scroll",
    });
    expect(info.authors?.map((a) => a.name)).toContain("Zoy");
    expect(info.rating?.score).toBeCloseTo(4.39 / 5, 3);
    expect(info.rating?.votes).toBe(756);
    expect(info.tagGroups?.map((g) => g.label)).toEqual(["Genres", "Format", "Tags"]);
  });

  test("chapters are numbered from their names, not the API's position", async () => {
    const chapters = await mangak(host().caps).getChapters!("PDmZ0n2E");
    expect(chapters[0]).toEqual({ id: "2qOmlOlY", name: "Chapter 121", number: 121, publishedAt: Date.parse("2026-05-31T01:33:58.000Z") });
    expect(chapters[1]!.number).toBe(118);
  });

  test("pages", async () => {
    const pages = await mangak(host().caps).getChapterPages!("PDmZ0n2E", "2qOmlOlY");
    expect(pages.map((p) => p.imageUrl)).toEqual([
      "https://rx.qvzrg.org/r/p/177845fa/23dc422f/7238fe172016.webp",
      "https://rx.qvzrh.org/r/p/177845fa/23dc422f/02becfe82355.webp",
    ]);
  });
});

describe("links", () => {
  test("a series link finds its id on the page; a chapter link maps through the chapter list", async () => {
    const bridge = mangak(host().caps);
    expect(await bridge.resolveUrl!("https://mangak.io/seashell-boy")).toEqual({ seriesId: "PDmZ0n2E" });
    expect(await bridge.resolveUrl!("https://mangak.io/seashell-boy/chapter-121")).toEqual({ seriesId: "PDmZ0n2E", chapterId: "2qOmlOlY" });
    expect(await bridge.resolveUrl!("https://other.example/seashell-boy")).toBeNull();
  });
});
