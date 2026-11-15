/**
 * MangaDot against responses captured Nov 2026 through a session that had passed the site's
 * Cloudflare check: two searches (latest updates, and "solo"), one series' route data (its
 * turbo-stream `.data`), that series' chapter list, and one chapter's images. Lists trimmed.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import { nextPageCursor } from "@comical/sdk";
import mangadot, { decodeTurboStream, parseDate, searchParams } from "../src/mangadot.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "mangadot", name), "utf8");
const ID = "5283";

const store = () => ({ get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] });

function host(opts: { settings?: Record<string, string>; userAgent?: string; status?: number; chapters?: string } = {}) {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req);
        const u = new URL(req.url);
        if (opts.status) return { url: req.url, status: opts.status, statusText: "", headers: {}, body: "" };
        const body =
          u.pathname === "/api/search" ? fixture(u.searchParams.get("search") ? "search-q.json" : "search-latest.json")
          : u.pathname.endsWith("/chapters/list") ? (opts.chapters ?? fixture("chapters.json"))
          : u.pathname.endsWith("/images") ? fixture("images.json")
          : u.pathname.endsWith(".data") ? fixture("manga.data")
          : "";
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { ...store(), secure: store() },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: opts.settings ?? {},
    ...(opts.userAgent ? { getDefaultUserAgent: () => opts.userAgent! } : {}),
  };
  return { caps, requests };
}

const query = (req: HttpRequest) => Object.fromEntries(new URL(req.url).searchParams);

describe("lists and search", () => {
  test("latest updates from the search API, all-ages, adult titles dropped", async () => {
    const { caps, requests } = host();
    const res = await mangadot(caps).getListItems!("latest");
    expect(query(requests[0]!)).toEqual({ lang: "en", page: "1", limit: "56", adult: "0", content_rating: "-erotica,-pornographic", genres: "-Loli,-Lolicon,-Shota,-Shotacon", sortBy: "latest", sortOrder: "desc" });
    expect(res.items[0]).toEqual({
      id: "26633",
      title: "Super Cube",
      thumbnailUrl: "https://mangadot.net/uploads/fa943bae0ed3aeae59cb732f.webp",
      subtitle: "Chapter 323",
      readingDirection: "vertical",
      coverForm: "scroll",
      contentRating: "everyone",
    });
    // Of the twelve captured, one is flagged adult (though rated safe): it never reaches the list.
    expect(res.items).toHaveLength(11);
    expect(res.items.some((e) => e.id === "8113")).toBe(false);
    expect(res.nextCursor).toBe(nextPageCursor(1, true));
  });

  test("popular and top rated sort the same search; an unknown list throws", async () => {
    const { caps, requests } = host();
    const bridge = mangadot(caps);
    await bridge.getListItems!("popular", { cursor: nextPageCursor(1, true)! });
    await bridge.getListItems!("top-rated");
    expect(query(requests[0]!)).toMatchObject({ sortBy: "tracked", page: "2" });
    expect(query(requests[1]!)).toMatchObject({ sortBy: "rating", page: "1" });
    await expect(bridge.getListItems!("nope")).rejects.toThrow();
  });

  test("text search is by relevance unless sorted, in the chosen language; suggestive titles rate mature", async () => {
    const { caps, requests } = host({ settings: { language: "pt-BR" } });
    const bridge = mangadot(caps);
    const res = await bridge.getSearchResults!({ text: " solo " });
    const q = query(requests[0]!);
    expect(q).toMatchObject({ search: "solo", lang: "pt-br", content_rating: "-erotica,-pornographic" });
    expect(q["sortBy"]).toBeUndefined();
    expect(res.items.map((e) => e.id).slice(0, 4)).toEqual(["5283", "118", "49240", "2985"]);
    expect(res.items.find((e) => e.id === "2985")?.contentRating).toBe("mature");
    await bridge.getSearchResults!({ text: "solo", sort: { key: "alphabetical", ascending: true } });
    expect(query(requests[1]!)).toMatchObject({ sortBy: "alphabetical", sortOrder: "asc" });
  });

  test("filters become the API's parameters", async () => {
    const { caps, requests } = host();
    await mangadot(caps).getSearchResults!({
      text: "",
      filters: [
        { key: "origin", value: ["KR", "CN"] },
        { key: "status", value: "Ongoing" },
        { key: "rating", value: "safe" },
        { key: "demographic", value: { include: ["Seinen"], exclude: [] } },
        { key: "genre", value: { include: ["Action"], exclude: ["Romance", "not-a-genre"] } },
        { key: "min_rating", value: "7" },
        { key: "year_min", value: 2015 },
        { key: "author", value: " Zhihong Yao " },
      ],
    });
    expect(query(requests[0]!)).toMatchObject({
      origin: "KR,CN",
      status: "Ongoing",
      content_rating: "-suggestive,-erotica,-pornographic",
      genres: "Seinen,Action,-Romance,-Loli,-Lolicon,-Shota,-Shotacon",
      min_rating: "7",
      year_min: "2015",
      author: "Zhihong Yao",
      sortBy: "latest",
    });
    // Every type at once is no filter at all; nonsense is dropped; the rating stays all-ages.
    expect(searchParams([{ key: "origin", value: ["JP", "KR", "CN", "EN", "ONESHOT"] }, { key: "status", value: "x" }, { key: "year_max", value: "soon" }])).toEqual({ content_rating: "-erotica,-pornographic" });
  });

  test("the language setting is offered and the host's browser User-Agent is sent", async () => {
    const browser = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36";
    const withHost = host({ userAgent: browser });
    await mangadot(withHost.caps).getListItems!("latest");
    expect(withHost.requests[0]!.headers?.["User-Agent"]).toBe(browser);
    const other = host({ userAgent: "okhttp/4.12" });
    await mangadot(other.caps).getListItems!("latest");
    expect(other.requests[0]!.headers?.["User-Agent"]).toStartWith("Mozilla/5.0 (Windows NT 10.0");
    const settings = mangadot(host().caps).getSettings!();
    expect(settings[0]).toMatchObject({ key: "language", default: "en" });
  });
});

describe("a series", () => {
  test("details decoded from the route data", async () => {
    const { caps, requests } = host();
    const info = await mangadot(caps).getSeriesDetails(ID);
    expect(requests[0]!.url).toBe("https://mangadot.net/manga/5283.data?_routes=pages/MangaDetailPage");
    expect(info).toMatchObject({
      id: ID,
      title: "Solo Slime‘s Ascension",
      author: "Zhihong Yao",
      authors: [{ name: "Zhihong Yao" }],
      artist: "Bai Lian",
      status: "ongoing",
      type: "Manhua",
      thumbnailUrl: "https://mangadot.net/uploads/7fbb192ad53b8c08f64b7c23.webp",
      shareUrl: "https://mangadot.net/manga/5283",
      contentRating: "everyone",
      readingDirection: "vertical",
      rating: { score: 0.9, votes: 4 },
      externalIds: { anilist: 205171, mu: "sseaob7" },
      languages: ["en"],
    });
    expect(info.description).toStartWith("Reincarnated into another world");
    expect(info.altTitles).toContain("Alone as a Slime");
    expect(info.altTitles).not.toContain(info.title);
    expect(info.tagGroups?.slice(0, 2)).toEqual([
      { label: "Genres", kind: "genre", tags: ["Action", "Adventure", "Fantasy"] },
      { label: "Demographic", kind: "demographic", tags: ["Shounen"] },
    ]);
    expect(info.tagGroups?.find((g) => g.label === "Work Info")).toEqual({ label: "Work Info", kind: "format", tags: ["Full Color", "Longstrip", "Manhua", "Web Comic"] });
    expect(info.infoCells).toEqual([
      { label: "Year", value: "2025" },
      { label: "Chapters", value: "46" },
      { label: "Tracked", value: "91" },
      { label: "Views", value: "1,919" },
    ]);
    expect(info.relatedSeriesGroups).toHaveLength(1);
    expect(info.relatedSeriesGroups![0]).toMatchObject({ label: "You may also like", kind: "recommended" });
    expect(info.relatedSeriesGroups![0]!.series[0]).toMatchObject({ id: "6781", thumbnailUrl: "https://mangadot.net/uploads/a5513f6d03bac59d1bd0f421.webp" });
  });

  test("a missing series, or a malformed id, is gone", async () => {
    await expect(mangadot(host({ status: 404 }).caps).getSeriesDetails(ID)).rejects.toThrow();
    await expect(mangadot(host().caps).getSeriesDetails("../x")).rejects.toThrow();
    await expect(mangadot(host({ status: 500 }).caps).getChapters!(ID)).rejects.toThrow(/HTTP 500/);
  });

  test("chapters newest first, numbered, grouped and dated; uploads and the site's own copies kept apart", async () => {
    const { caps, requests } = host();
    const chapters = await mangadot(caps).getChapters!(ID);
    expect(requests[0]!.url).toBe("https://mangadot.net/api/manga/5283/chapters/list?lang=en");
    expect(chapters).toHaveLength(9);
    expect(chapters[0]).toEqual({
      id: "u1901409",
      name: "Chapter 46",
      number: 46,
      languageCode: "en",
      group: "Elf Toon",
      pageCount: 8,
      publishedAt: Date.UTC(2026, 8, 14, 12, 28, 53, 252),
    });
    expect(chapters.at(-1)).toEqual({ id: "u421121", name: "Chapter 1", number: 1, languageCode: "en", group: "Elf Toon", pageCount: 9, publishedAt: Date.UTC(2026, 4, 23, 12, 17, 22, 87) });
    expect(chapters.at(-2)).toEqual({ id: "387614", name: "Chapter 1", number: 1, languageCode: "en", pageCount: 10, publishedAt: Date.UTC(2026, 2, 4, 21, 53, 3) });
  });

  test("chapters in other languages, and titles beside the number, are handled", async () => {
    const rows = [
      { id: 1, chapter_number: 10.5, chapter_title: "The Duel", language: "en", source: "scraper", date_added: "2026-01-02 03:04:05+00", groups: [] },
      { id: 2, chapter_number: 11, chapter_title: "", language: "es", source: "scraper", groups: [] },
      { id: 3, chapter_number: "12.0", chapter_title: null, language: "en", groups: [], scanlator_name: "Team" },
    ];
    const chapters = await mangadot(host({ chapters: JSON.stringify(rows) }).caps).getChapters!(ID);
    expect(chapters).toEqual([
      { id: "u3", name: "Chapter 12", number: 12, languageCode: "en", group: "Team" },
      { id: "1", name: "Chapter 10.5: The Duel", number: 10.5, languageCode: "en", publishedAt: Date.UTC(2026, 0, 2, 3, 4, 5) },
    ]);
  });

  test("pages from the images API, made absolute on the host that wants the session and Referer", async () => {
    const { caps, requests } = host();
    const bridge = mangadot(caps);
    const pages = await bridge.getChapterPages!("5463", "421121");
    expect(requests[0]!.url).toBe("https://mangadot.net/api/chapters/421121/images");
    expect(pages).toHaveLength(16);
    expect(pages[0]).toEqual({ index: 0, imageUrl: "https://mangadot.net/chapters/manga_5463/chapter_206/001.webp" });
    expect(bridge.info.images).toEqual({ hosts: ["mangadot.net"], headers: { Referer: "https://mangadot.net/" } });
    await bridge.getChapterPages!("5463", "u421121");
    expect(requests[1]!.url).toBe("https://mangadot.net/api/uploads/421121/images");
    // A chapter of another series, or an id that isn't one.
    await expect(bridge.getChapterPages!(ID, "421121")).rejects.toThrow();
    await expect(bridge.getChapterPages!(ID, "x1")).rejects.toThrow();
  });

  test("links to series and chapters", async () => {
    const { caps, requests } = host();
    const bridge = mangadot(caps);
    expect(await bridge.resolveUrl!("https://mangadot.net/manga/5283")).toEqual({ seriesId: ID });
    expect(await bridge.resolveUrl!("https://mangadot.net/chapter/421121")).toEqual({ seriesId: "5463", chapterId: "421121" });
    expect(requests.at(-1)!.url).toBe("https://mangadot.net/api/chapters/421121/images");
    expect(await bridge.resolveUrl!("https://mangadot.net/chapter/421121?source=user")).toEqual({ seriesId: "5463", chapterId: "u421121" });
    expect(await bridge.resolveUrl!("https://mangadot.net/view-all/most-tracked")).toBeNull();
    expect(await bridge.resolveUrl!("https://example.com/manga/5283")).toBeNull();
  });
});

describe("helpers", () => {
  test("turbo-stream: indexed keys and values, special values absent, promises settled on later lines", () => {
    // Root {a: [6, -7], b: null, c: promise 7}; the promise settles on a later line as {a: "x"}.
    const head = `[{"_1":2,"_3":-5,"_4":5},"a",[6,-7],"b","c",["P",7],"x"]`;
    expect(decodeTurboStream(head)).toEqual({ a: ["x", undefined] });
    expect(decodeTurboStream(`${head}\nP7:[{"_1":6}]\n`)).toEqual({ a: ["x", undefined], c: { a: "x" } });
    expect(decodeTurboStream(`[{"_1":2},"when",["D",1700000000000]]`)).toEqual({ when: 1700000000000 });
  });

  test("Postgres timestamps", () => {
    expect(parseDate("2026-03-04 21:53:03+00")).toBe(Date.UTC(2026, 2, 4, 21, 53, 3));
    expect(parseDate("2026-09-06 15:28:14.5054+00")).toBe(Date.UTC(2026, 8, 6, 15, 28, 14, 505));
    expect(parseDate("2026-01-01 02:00:00+02:00")).toBe(Date.UTC(2026, 0, 1));
    expect(parseDate("yesterday")).toBeUndefined();
  });
});
