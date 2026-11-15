/**
 * OniSaga against responses captured Nov 2026 through a browser session that had passed the site's
 * Cloudflare check (trimmed; scripts and styles stripped except the JSON-LD and the reader's Next.js
 * flight data): the catalog RPC (a browse and a search), a title page with its chapter list, and one
 * chapter's reader. Two pages are synthetic, shaped after the reference's selectors because the
 * captured title has neither: a chapter list with multi-group versions and paging, and the age gate.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import onisaga, { browseInput, flightObject, nextFlight } from "../src/onisaga.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "onisaga", name), "utf8");
const SLUG = "solo-fessional-solo-katsu-danshi-to-bocchi-joshi-no-koubou-sen";
const FALLBACK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

interface Opts {
  settings?: Record<string, string>;
  userAgent?: string;
  browse?: string;
  respond?: (u: URL, req: HttpRequest) => Partial<HttpResponse> | undefined;
}

function host(opts: Opts = {}) {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req);
        const u = new URL(req.url);
        const custom = opts.respond?.(u, req);
        if (custom) return { url: req.url, status: 200, statusText: "OK", headers: {}, body: "", ...custom };
        const body =
          u.pathname === "/api/rpc/catalog/browse" ? (opts.browse ?? (JSON.parse(req.body as string).json.q ? fixture("search.json") : fixture("browse.json")))
          : u.pathname === "/title/adult-title" || u.pathname.startsWith("/read/adult-title/") ? fixture("gate.html")
          : u.pathname.startsWith("/read/") ? fixture("read.html")
          : u.pathname === "/title/sample-title" ? fixture(u.searchParams.get("cc") ? "title-versions-2.html" : "title-versions.html")
          : u.pathname.startsWith("/title/") ? fixture("title.html")
          : "";
        return { url: req.url, status: body ? 200 : 404, statusText: "", headers: {}, body };
      },
    },
    storage: { ...store(), secure: store() },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: opts.settings ?? {},
    ...(opts.userAgent !== undefined ? { getDefaultUserAgent: () => opts.userAgent! } : {}),
  };
  return { caps, requests };
}

function store() {
  return { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] as string[] };
}

const rpcBody = (req: HttpRequest) => JSON.parse(req.body as string) as { json: Record<string, unknown> };

describe("lists and search", () => {
  test("latest updates post the catalog RPC with safe ratings, the language and the sort", async () => {
    const { caps, requests } = host();
    const res = await onisaga(caps).getListItems!("updated");
    expect(requests[0]).toMatchObject({ url: "https://onisaga.com/api/rpc/catalog/browse", method: "POST" });
    expect(requests[0]!.headers).toMatchObject({ "Content-Type": "application/json", "User-Agent": FALLBACK_UA });
    expect(rpcBody(requests[0]!)).toEqual({ json: { limit: 42, ratings: ["safe", "suggestive"], languages: ["en"], sort: "updated" } });
    expect(res.items).toHaveLength(5);
    expect(res.items[0]).toEqual({
      id: "light-of-the-dawn-remake",
      title: "Yeomyeongui Deungbul",
      thumbnailUrl: "https://media.onisaga.com/api/covers/light-of-the-dawn-remake?mv=147",
      thumbnailAspect: 2 / 3,
      readingDirection: "vertical",
      subtitle: "Chapter 102",
      contentRating: "everyone",
    });
    expect(res.items[2]).toMatchObject({ id: "sovereign-of-a-hundred-blades-heir-to-the-strongest-style", readingDirection: "rtl" });
    expect(res.items[3]!.readingDirection).toBeUndefined();
    expect(res.nextCursor).toBe("eyJ2IjoiMjAyNi0xMS0xNVQxMDo0OTowNS40NzQzMDhaIiwiaWQiOiI0NzAzMSJ9.CvQckbmtDDvU68zbAUohtPsEyhL8ZUmP");
  });

  test("the API's cursor comes back as the next page's cursor", async () => {
    const { caps, requests } = host();
    const bridge = onisaga(caps);
    const first = await bridge.getListItems!("new");
    await bridge.getListItems!("new", { cursor: first.nextCursor! });
    expect(rpcBody(requests[1]!).json).toEqual({ limit: 42, ratings: ["safe", "suggestive"], languages: ["en"], sort: "new", cursor: first.nextCursor });
    await expect(bridge.getListItems!("nope")).rejects.toThrow("unknown list");
  });

  test("a search sends the text, filters and sort; suggestive titles are marked mature", async () => {
    const { caps, requests } = host({ settings: { language: "pt-BR" } });
    const res = await onisaga(caps).getSearchResults!({
      text: " solo ",
      filters: [
        { key: "type", value: ["manhwa", "bogus"] },
        { key: "status", value: ["releasing"] },
        { key: "genres", value: { include: ["action"], exclude: ["horror", "x"] } },
        { key: "themes", value: "Video Games, -Réincarnation" },
        { key: "yearFrom", value: 2010 },
      ],
      sort: { key: "relevance", ascending: false },
    });
    expect(rpcBody(requests[0]!).json).toEqual({
      limit: 42,
      ratings: ["safe", "suggestive"],
      languages: ["pt-BR"],
      origin: ["manhwa"],
      status: ["releasing"],
      genres: { include: ["action"], exclude: ["horror"] },
      themes: { include: ["video-games"], exclude: ["reincarnation"] },
      year: { from: 2010 },
      q: "solo",
      sort: "relevance",
    });
    expect(res.items.map((e) => e.id)).toContain(SLUG);
    expect(res.items.find((e) => e.id === "sekai-ni-hitotsu-dake-no-r")?.contentRating).toBe("mature");
    expect(res.nextCursor).toBe("eyJ2IjoiMyIsImlkIjoiMzkwNDkifQ.G13rz2gw2E7Hyl6HtQltqwu2ASY16JjQ");
  });

  test("the rating filter can only narrow to safe ratings", () => {
    expect(browseInput([{ key: "rating", value: ["explicit", "mature"] }], "en").ratings).toEqual(["safe", "suggestive"]);
    expect(browseInput([{ key: "rating", value: ["safe"] }], "en").ratings).toEqual(["safe"]);
    expect(browseInput([{ key: "genres", value: ["comedy"] }, { key: "yearTo", value: 1700 }], "fr")).toEqual({
      limit: 42, ratings: ["safe", "suggestive"], languages: ["fr"], genres: { include: ["comedy"], exclude: [] },
    });
  });

  test("adult-rated or novel items that slip through are dropped; the last page has no cursor", async () => {
    const items = [
      { slug: "a", title: "A", contentRating: "explicit", medium: "comic" },
      { slug: "b", title: "B", contentRating: "safe", medium: "novel" },
      { slug: "c", title: "C", contentRating: "safe", medium: "comic", coverUrl: null },
    ];
    const res = await onisaga(host({ browse: JSON.stringify({ json: { items, nextCursor: null } }) }).caps).getListItems!("updated");
    expect(res).toEqual({ items: [{ id: "c", title: "C", contentRating: "everyone" }], nextCursor: undefined });
  });

  test("the host's browser User-Agent is used; a non-browser one falls back", async () => {
    const browser = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36";
    const a = host({ userAgent: browser });
    await onisaga(a.caps).getListItems!("updated");
    expect(a.requests[0]!.headers!["User-Agent"]).toBe(browser);
    const b = host({ userAgent: "okhttp/4.12" });
    await onisaga(b.caps).getListItems!("updated");
    expect(b.requests[0]!.headers!["User-Agent"]).toBe(FALLBACK_UA);
  });
});

describe("a title", () => {
  test("details from the title page", async () => {
    const { caps, requests } = host();
    const info = await onisaga(caps).getSeriesDetails(SLUG);
    expect(requests[0]!.url).toBe(`https://onisaga.com/title/${SLUG}?chapters=all&order=desc&lang=en`);
    expect(info).toMatchObject({
      id: SLUG,
      title: "Solo-fessional: Solo Katsu Danshi to Bocchi Joshi no Koubou-sen",
      thumbnailUrl: `https://media.onisaga.com/api/covers/${SLUG}?mv=101`,
      thumbnailAspect: 2 / 3,
      author: "Tori Yamoco",
      authors: [{ name: "Tori Yamoco" }],
      status: "ongoing",
      type: "Manga",
      contentRating: "everyone",
      languages: ["en"],
      shareUrl: `https://onisaga.com/title/${SLUG}`,
    });
    expect(info.altTitles).toHaveLength(10);
    expect(info.altTitles).toContain("ソロフェッショナル～ソロ活男子とボッチ女子の攻防戦～");
    expect(info.description).toStartWith("Hasama Shin is a solo guy who loves being alone.");
    expect(info.description).toContain('"It\'s creepy that she asked me out');
    expect(info.description).toEndWith("(Source: YanMaga Web, translated)");
    expect(info.tagGroups).toEqual([
      { label: "Genres", kind: "genre", tags: ["Comedy", "Romance", "Slice of Life"] },
      { label: "Tags", kind: "other", tags: ["Adult Cast"] },
      { label: "Publisher", kind: "other", tags: ["Kodansha"] },
    ]);
  });

  test("chapters from the title page, newest first, named, numbered and dated", async () => {
    const chapters = await onisaga(host().caps).getChapters!(SLUG);
    expect(chapters).toEqual([
      { id: "100019855", name: "Chapter 2", number: 2, languageCode: "en", pageCount: 16, publishedAt: Date.parse("2025-11-07T12:54:09Z") },
      { id: "100019856", name: "Chapter 1", number: 1, languageCode: "en", pageCount: 34, publishedAt: Date.parse("2025-10-06T10:47:56Z") },
    ]);
  });

  test("multi-group versions, unreadable rows and further chapter pages (synthetic page)", async () => {
    const { caps, requests } = host({ settings: { language: "fr" } });
    const chapters = await onisaga(caps).getChapters!("sample-title");
    expect(requests.map((r) => r.url)).toEqual([
      "https://onisaga.com/title/sample-title?chapters=all&order=desc&lang=fr",
      "https://onisaga.com/title/sample-title?chapters=all&order=desc&cc=2",
    ]);
    expect(chapters).toEqual([
      { id: "9012", name: "Chapter 12: The Return", number: 12, languageCode: "fr", group: "Alpha Scans", pageCount: 21, publishedAt: Date.parse("2026-11-01T10:00:00Z") },
      { id: "9013", name: "Chapter 12: The Return", number: 12, languageCode: "fr", group: "Beta Team, Gamma", publishedAt: Date.parse("2026-11-02T08:30:00Z") },
      { id: "9010", name: "Chapter 10.5", number: 10.5, languageCode: "fr", pageCount: 8, publishedAt: Date.parse("2026-10-20T12:00:00Z") },
      { id: "9009", name: "Extra", languageCode: "fr" },
      { id: "9001", name: "Chapter 1: A Beginning", number: 1, languageCode: "fr", publishedAt: Date.parse("2026-01-05T00:00:00Z") },
    ]);
  });

  test("pages from the reader's Next.js flight data, signed URLs unescaped, on the routed media host", async () => {
    const { caps, requests } = host();
    const bridge = onisaga(caps);
    const pages = await bridge.getChapterPages!(SLUG, "100019855");
    expect(requests[0]!.url).toBe(`https://onisaga.com/read/${SLUG}/100019855`);
    expect(pages).toHaveLength(16);
    expect(pages.map((p) => p.index)).toEqual([...Array(16).keys()]);
    expect(pages[0]!.imageUrl).toBe(
      "https://media.onisaga.com/api/media/e762d903-39c9-4cce-b6fa-3b3c7f8336e7?k=p&r=100019855&n=2&p=sg&pv=7&e=1794783600&g=83d312f4f78a.IOsOQrzGnoMQG7nwIFsKNPaJHuQkKOgFlyE-sUlofPY",
    );
    expect(pages.every((p) => !p.imageUrl.includes("\\u0026") && !p.imageUrl.includes("&amp;"))).toBe(true);
    expect(bridge.info.images).toEqual({ hosts: ["media.onisaga.com"], headers: { Referer: "https://onisaga.com/" } });
    await expect(bridge.getChapterPages!(SLUG, "../x")).rejects.toThrow();
  });

  test("flight data helpers find a nested object across escaped strings", () => {
    const html = `<script>self.__next_f.push([1,"a:{\\"manifest\\":{\\"pages\\":[{\\"url\\":\\"https://x/1?a=1\\u0026b=2\\"}]}}"])</script>`;
    expect(flightObject(nextFlight(html), "manifest")).toEqual({ pages: [{ url: "https://x/1?a=1&b=2" }] });
    expect(flightObject(nextFlight(html), "missing")).toBeUndefined();
  });

  test("a gone title is reported as gone", async () => {
    const res = (u: URL) => (u.pathname === "/title/gone-title" ? { status: 404, body: "Not found" } : undefined);
    await expect(onisaga(host({ respond: res }).caps).getSeriesDetails("gone-title")).rejects.toThrow(/removed|gone/i);
  });
});

describe("age gate", () => {
  test("an adult-rated title's gate becomes a clear error, not an age statement", async () => {
    const { caps, requests } = host();
    const bridge = onisaga(caps);
    await expect(bridge.getSeriesDetails("adult-title")).rejects.toThrow("Sample Title: OniSaga shows this only to adults");
    await expect(bridge.getChapters!("adult-title")).rejects.toThrow("only to adults");
    await expect(bridge.getChapterPages!("adult-title", "123")).rejects.toThrow("only to adults");
    expect(requests.some((r) => r.url.includes("age-confirmation") || r.url.includes("readerView"))).toBe(false);
  });
});

describe("links", () => {
  test("title and reader links", async () => {
    const bridge = onisaga(host().caps);
    expect(await bridge.resolveUrl!(`https://onisaga.com/title/${SLUG}?tab=details`)).toEqual({ seriesId: SLUG });
    expect(await bridge.resolveUrl!(`https://www.onisaga.com/read/${SLUG}/100019855`)).toEqual({ seriesId: SLUG, chapterId: "100019855" });
    expect(await bridge.resolveUrl!("https://onisaga.com/browse?genre=comedy")).toBeNull();
    expect(await bridge.resolveUrl!("https://example.com/title/x")).toBeNull();
  });

  test("an old /manga/ link follows the site's redirect to the title's slug", async () => {
    const respond = (u: URL) => (u.pathname === "/manga/old-slug" ? { url: `https://onisaga.com/title/${SLUG}`, body: "<html></html>" } : undefined);
    expect(await onisaga(host({ respond }).caps).resolveUrl!("https://onisaga.com/manga/old-slug")).toEqual({ seriesId: SLUG });
  });
});
