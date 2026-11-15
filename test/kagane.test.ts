/**
 * Kagane against API responses captured Nov 2026 through a browser session (trimmed to a few
 * entries; one synthetic 18+ entry added to the popular list to check it is dropped): the popular,
 * latest and search lists, a series, its chapter index, an integrity token and one book's reader
 * challenge.
 */
import { afterEach, describe, expect, test, setSystemTime } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse, SettingValue } from "@comical/contract";
import { bridgeInfoSchema } from "@comical/contract";
import { nextPageCursor, parseChallenge, parseSeriesGone } from "@comical/sdk";
import kagane from "../src/kagane.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "kagane", name), "utf8");
const SERIES = "019c2a34-94c2-7585-97e5-b0bf0bd8cf77";
const BOOK = "019e4ecf-fec4-732a-a141-8a1ddcaba396";
const OTHER_BOOK = "019e4ecf-6016-76d4-8cef-516c71cd5e2d";
const CHALLENGE = JSON.parse(fixture("challenge.json")) as { access_token: string; cache_url: string };
const INTEGRITY = JSON.parse(fixture("integrity.json")) as { token: string; exp: number };
/** Shortly after the capture: the integrity token (5 min) and the access token (20 min) are both live. */
const CAPTURED = (INTEGRITY.exp - 240) * 1000;

/** An unsigned JWT that expires at `exp` (epoch seconds). */
const jwt = (exp: number) => `e30.${btoa(JSON.stringify({ exp })).replace(/=+$/, "")}.sig`;

const store = () => ({ get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] as string[] });

interface Opts {
  settings?: Record<string, SettingValue>;
  userAgent?: string;
  /** Overrides by path; return undefined to fall through to the fixtures. */
  respond?: (req: HttpRequest, u: URL) => Partial<HttpResponse> | undefined;
}

function host(opts: Opts = {}) {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req);
        const u = new URL(req.url);
        const over = opts.respond?.(req, u);
        if (over) return { url: req.url, status: 200, statusText: "OK", headers: {}, body: "", ...over };
        const p = u.pathname;
        const body =
          p === "/api/v2/search/series"
            ? JSON.parse(req.body ?? "{}").title ? fixture("search.json")
            : u.searchParams.get("sort")?.startsWith("updated_at") ? fixture("latest.json")
            : fixture("popular.json")
          : p === "/api/integrity" ? fixture("integrity.json")
          : p.startsWith("/api/v2/books/") ? fixture("challenge.json")
          : p.endsWith("/books/index") ? fixture("index.json")
          : p.startsWith("/api/v2/series/") ? fixture("series.json")
          : "";
        return { url: req.url, status: body ? 200 : 404, statusText: "", headers: {}, body };
      },
    },
    storage: { ...store(), secure: store() },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: opts.settings ?? {},
    ...(opts.userAgent ? { getDefaultUserAgent: () => opts.userAgent! } : {}),
  };
  return { caps, requests };
}

const bodyOf = (req: HttpRequest | undefined) => JSON.parse(req?.body ?? "{}") as Record<string, unknown>;
const header = (req: HttpRequest | undefined, name: string) =>
  Object.entries(req?.headers ?? {}).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];

afterEach(() => setSystemTime());

describe("info", () => {
  test("is a valid, safe-for-work bridge whose images carry the site's Origin and Referer", () => {
    const { info } = kagane(host().caps);
    expect(bridgeInfoSchema.safeParse(info).success).toBe(true);
    expect(info).toMatchObject({ id: "pos5drow.kagane", nsfw: false, linkHosts: ["kagane.moe", "kagane.cx", "kagane.net"] });
    expect(info.images).toEqual({
      hosts: ["kstatic.to", "kagane.moe"],
      headers: { Origin: "https://kagane.moe", Referer: "https://kagane.moe/" },
      intercept: ["kstatic.to"],
    });
  });
});

describe("lists and search", () => {
  test("popular posts the search body, safe ratings only, and drops anything 18+", async () => {
    const { caps, requests } = host();
    const res = await kagane(caps).getListItems!("popular");
    expect(requests[0]).toMatchObject({ method: "POST", url: "https://kagane.moe/api/v2/search/series?page=0&size=35&sort=total_views%2Cdesc" });
    expect(bodyOf(requests[0])).toEqual({
      source_type: ["Official", "Unofficial", "Mixed"],
      age_rating: ["Safe"],
      is_pornographic: false,
      is_disturbing: false,
      content_lang: ["en"],
    });
    expect(header(requests[0], "Content-Type")).toBe("application/json");
    expect(res.items.map((e) => e.title)).toEqual([
      "The Beginning After the End",
      "The Greatest Estate Developer",
      "Tomb Raider King",
      "The Legend of the Northern Blade",
      "Lost in the Cloud",
    ]);
    expect(res.items[0]).toEqual({
      id: "019c2084-fa67-791d-8ba5-494744577445",
      title: "The Beginning After the End",
      contentRating: "everyone",
      thumbnailUrl: "https://kagane.moe/api/v2/image/019c2084-fa56-7fa4-b2bb-db1cada869f9",
      subtitle: "Other · Ch. 302",
    });
    expect(res.items.at(-1)?.contentRating).toBe("mature");
    expect(res.nextCursor).toBe(nextPageCursor(1, true));
  });

  test("latest and this week's popular sort the same search; later pages count from zero", async () => {
    const { caps, requests } = host();
    const bridge = kagane(caps);
    const latest = await bridge.getListItems!("latest", { cursor: nextPageCursor(1, true)! });
    expect(requests[0]!.url).toBe("https://kagane.moe/api/v2/search/series?page=1&size=35&sort=updated_at%2Cdesc");
    expect(latest.items[0]).toMatchObject({ id: "01a0b926-1355-7b60-811a-95e616eea045", title: "Garden in the Closet" });
    await bridge.getListItems!("week");
    expect(new URL(requests[1]!.url).searchParams.get("sort")).toBe("avg_views_week,desc");
    expect((await bridge.getLists!()).map((l) => l.id)).toEqual(["popular", "latest", "week"]);
  });

  test("search sends the title, filters and sort in the body and query", async () => {
    const { caps, requests } = host({ settings: { rating: "fifteenplus" } });
    const res = await kagane(caps).getSearchResults!({
      text: " solo ",
      filters: [
        { key: "genre", value: { include: ["019c1fe4-fabf-7242-a0a8-7866f98f705e"], exclude: ["019beb9a-a36a-718c-b551-d917a0818cc7", "not-a-genre"] } },
        { key: "format", value: ["Manhwa", "Nonsense"] },
        { key: "status", value: ["Abandoned"] },
        { key: "from", value: 2015 },
        { key: "official", value: true },
      ],
      sort: { key: "created_at", ascending: true },
    });
    expect(new URL(requests[0]!.url).searchParams.get("sort")).toBe("created_at,asc");
    expect(bodyOf(requests[0])).toEqual({
      title: "solo",
      source_type: ["Official"],
      age_rating: ["Safe", "FifteenPlus"],
      is_pornographic: false,
      is_disturbing: false,
      genres: { match_all: true, values: ["019c1fe4-fabf-7242-a0a8-7866f98f705e"], exclude: ["019beb9a-a36a-718c-b551-d917a0818cc7"] },
      format: ["Manhwa"],
      upload_status: ["Abandoned"],
      start_year: { min: 2015 },
      content_lang: ["en"],
    });
    expect(res.items[0]).toMatchObject({ id: SERIES, title: "Solo Camping for Two", contentRating: "mature" });
  });

  test("relevance sends no sort, 'any genre' drops match_all, and the last page ends the results", async () => {
    const last = JSON.stringify({ ...JSON.parse(fixture("search.json")), last: true });
    const { caps, requests } = host({ respond: (_r, u) => (u.pathname === "/api/v2/search/series" ? { body: last } : undefined) });
    const res = await kagane(caps).getSearchResults!({
      text: "solo",
      filters: [{ key: "genre", value: ["019c1fe4-fabf-7242-a0a8-7866f98f705e"] }, { key: "anyGenre", value: true }],
      sort: { key: "relevance", ascending: false },
    });
    expect(new URL(requests[0]!.url).searchParams.has("sort")).toBe(false);
    expect(bodyOf(requests[0])["genres"]).toEqual({ values: ["019c1fe4-fabf-7242-a0a8-7866f98f705e"] });
    expect(res.nextCursor).toBeUndefined();
  });

  test("filters offer genres without the adult-only ones, and the reference's sorts", async () => {
    const bridge = kagane(host().caps);
    const genres = (await bridge.getFilters!()).find((f) => f.key === "genre");
    const labels = genres && "options" in genres ? genres.options.map((o) => o.label) : [];
    expect(labels).toContain("Action");
    expect(labels).not.toContain("Hentai");
    expect(labels).not.toContain("Smut");
    expect((await bridge.getSortOptions!()).map((s) => s.key)).toEqual([
      "relevance", "total_views", "avg_views", "avg_views_today", "avg_views_week", "avg_views_month", "updated_at", "current_books", "created_at",
    ]);
  });
});

describe("a series", () => {
  test("details from the series API", async () => {
    const { caps, requests } = host();
    const info = await kagane(caps).getSeriesDetails(SERIES);
    expect(requests[0]).toMatchObject({ method: "GET", url: `https://kagane.moe/api/v2/series/${SERIES}` });
    expect(info).toMatchObject({
      id: SERIES,
      title: "Solo Camping for Two",
      contentRating: "mature",
      thumbnailUrl: "https://kagane.moe/api/v2/image/019c2a34-9492-7900-b6a6-8e53689d6c24",
      shareUrl: `https://kagane.moe/series/solo-camping-for-two-${SERIES}`,
      status: "ongoing",
      type: "Manga",
      author: "Yuudai Deguchi",
      authors: [{ name: "Yuudai Deguchi", id: "00000000-0000-7000-8000-0000000000a1" }],
      artist: "Yuudai Deguchi",
      externalIds: { anilist: 110853, mu: "odobkft" },
    });
    expect(info.altTitles).toContain("Futari Solo Camp");
    expect(info.altTitles).toHaveLength(7);
    expect(info.description).toStartWith("Kinokura Gen loves camping solo.");
    expect(info.description).not.toContain("migrated from the old Kagane");
    expect(info.tagGroups?.[0]).toEqual({
      label: "Genres",
      kind: "genre",
      tags: ["Romance", "Drama", "Adventure", "Slice of Life", "Comedy", "Seinen", "Ecchi"],
      tagIds: expect.any(Array),
    });
    expect(info.tagGroups?.[1]).toMatchObject({ label: "Tags", tags: expect.arrayContaining(["Cooking", "Japan"]) });
    expect(info.infoCells).toEqual([{ label: "Original language", value: "Japanese" }, { label: "Views", value: "2.3K" }]);
  });

  test("an 18+ series opened by link is refused", async () => {
    const adult = JSON.stringify({ ...JSON.parse(fixture("series.json")), age_rating: "EighteenPlus", is_pornographic: true });
    const { caps } = host({ respond: (_r, u) => (u.pathname === `/api/v2/series/${SERIES}` ? { body: adult } : undefined) });
    await expect(kagane(caps).getSeriesDetails(SERIES)).rejects.toThrow("18+");
  });

  test("chapters from the columnar index, newest first, with groups, numbers, pages and dates", async () => {
    const { caps, requests } = host();
    const chapters = await kagane(caps).getChapters!(SERIES);
    expect(requests[0]!.url).toBe(`https://kagane.moe/api/v2/series/${SERIES}/books/index?fields=List`);
    expect(chapters.map((c) => c.number)).toEqual([92, 91, 3, 2, 1]);
    expect(chapters[0]).toEqual({ id: BOOK, name: "Chapter 92", languageCode: "en", number: 92, group: "Angelvi", pageCount: 22, publishedAt: 1779438714000 });
    expect(chapters.at(-1)).toEqual({
      id: "019c2a9f-948b-76d3-a8da-f88bb05d3186",
      name: "Chapter 1 Solo Camping Musings",
      languageCode: "en",
      number: 1,
      group: "The Hours Between",
      pageCount: 45,
      publishedAt: 1770241627000,
    });
  });

  test("an incomplete index fails rather than dropping chapters", async () => {
    const short = JSON.stringify({ ...JSON.parse(fixture("index.json")), count: 91 });
    const { caps } = host({ respond: (_r, u) => (u.pathname.endsWith("/books/index") ? { body: short } : undefined) });
    await expect(kagane(caps).getChapters!(SERIES)).rejects.toThrow("incomplete");
  });

  test("a 404 is a removed series; other errors say what failed", async () => {
    const gone = host({ respond: () => ({ status: 404, body: "" }) });
    const err = await kagane(gone.caps).getSeriesDetails(SERIES).catch((e: Error) => e);
    expect(parseSeriesGone((err as Error).message)).not.toBeNull();
    const down = host({ respond: () => ({ status: 502, body: "" }) });
    await expect(kagane(down.caps).getChapters!(SERIES)).rejects.toThrow("HTTP 502");
    await expect(kagane(host().caps).getSeriesDetails("not-a-uuid")).rejects.toThrow("[series-gone]");
  });
});

describe("pages", () => {
  test("integrity token, then the book's challenge, then data-saver page URLs with the access token", async () => {
    setSystemTime(new Date(CAPTURED));
    const { caps, requests } = host();
    const pages = await kagane(caps).getChapterPages!(SERIES, BOOK);
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "POST https://kagane.moe/api/integrity",
      `POST https://kagane.moe/api/v2/books/${BOOK}?intent=Read`,
    ]);
    expect(header(requests[1], "x-integrity-token")).toBe(INTEGRITY.token);
    expect(requests[1]!.body).toBe("");
    expect(pages).toHaveLength(3);
    expect(pages[0]).toEqual({
      index: 0,
      imageUrl: `https://kstatic.to/api/v2/books/page/datasaver/${BOOK}/8c72bcf2-20a8-5748-8bf5-91a89312be9b.jxl?token=${CHALLENGE.access_token}`,
    });
  });

  test("the original quality setting asks for the JPEG XL originals", async () => {
    setSystemTime(new Date(CAPTURED));
    const pages = await kagane(host({ settings: { quality: "original" } }).caps).getChapterPages!(SERIES, BOOK);
    expect(pages[1]!.imageUrl).toStartWith(`https://kstatic.to/api/v2/books/page/original/${BOOK}/da740378-6e7c-5956-9b01-e1a401c7fc46.jxl?token=`);
  });

  test("the integrity token is reused until it expires, and a book's access while it lasts", async () => {
    setSystemTime(new Date(CAPTURED));
    const { caps, requests } = host();
    const bridge = kagane(caps);
    await bridge.getChapterPages!(SERIES, BOOK);
    await bridge.getChapterPages!(SERIES, BOOK);
    await bridge.getChapterPages!(SERIES, OTHER_BOOK);
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(["/api/integrity", `/api/v2/books/${BOOK}`, `/api/v2/books/${OTHER_BOOK}`]);
    setSystemTime(new Date(INTEGRITY.exp * 1000 + 1000));
    await bridge.getChapterPages!(SERIES, "019c2a9f-948b-76d3-a8da-f88bb05d3186");
    expect(requests.slice(3).map((r) => new URL(r.url).pathname)).toEqual(["/api/integrity", "/api/v2/books/019c2a9f-948b-76d3-a8da-f88bb05d3186"]);
  });

  test("a rejected integrity token is replaced once", async () => {
    setSystemTime(new Date(CAPTURED));
    let challenges = 0;
    const { caps, requests } = host({
      respond: (_r, u) => (u.pathname.startsWith("/api/v2/books/") && challenges++ === 0 ? { status: 401, body: "{}" } : undefined),
    });
    const pages = await kagane(caps).getChapterPages!(SERIES, BOOK);
    expect(pages).toHaveLength(3);
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(["/api/integrity", `/api/v2/books/${BOOK}`, "/api/integrity", `/api/v2/books/${BOOK}`]);
  });

  test("a live page URL passes through; an expiring one gets a fresh access token", async () => {
    setSystemTime(new Date(CAPTURED));
    const fresh = jwt(INTEGRITY.exp + 3600);
    let challenges = 0;
    const { caps, requests } = host({
      respond: (_r, u) =>
        u.pathname.startsWith("/api/v2/books/") && challenges++ > 0 ? { body: JSON.stringify({ ...CHALLENGE, access_token: fresh }) } : undefined,
    });
    const bridge = kagane(caps);
    const [page] = await bridge.getChapterPages!(SERIES, BOOK);
    expect(await bridge.interceptImageRequest!(page!.imageUrl)).toEqual({ url: page!.imageUrl });
    expect(requests).toHaveLength(2);

    setSystemTime(new Date(CHALLENGE_EXP() - 30_000));
    const renewed = await bridge.interceptImageRequest!(page!.imageUrl);
    expect(renewed.url).toBe(page!.imageUrl.replace(CHALLENGE.access_token, fresh));
    // The renewed access is cached for the book's other pages.
    await bridge.interceptImageRequest!(page!.imageUrl);
    expect(requests.filter((r) => r.url.includes("/api/v2/books/"))).toHaveLength(2);
    expect(await bridge.interceptImageRequest!("https://kstatic.to/other.webp")).toEqual({ url: "https://kstatic.to/other.webp" });
  });

  test("pages on an undeclared image host carry the headers themselves", async () => {
    setSystemTime(new Date(CAPTURED));
    const moved = JSON.stringify({ ...CHALLENGE, cache_url: "https://img.example.org", manifest: JSON.parse(fixture("challenge.json")).manifest });
    const { caps } = host({ respond: (_r, u) => (u.pathname.startsWith("/api/v2/books/") ? { body: moved } : undefined) });
    const [page] = await kagane(caps).getChapterPages!(SERIES, BOOK);
    expect(page!.imageUrl).toStartWith("https://img.example.org/api/v2/books/page/datasaver/");
    expect(page!.headers).toEqual({ Origin: "https://kagane.moe", Referer: "https://kagane.moe/" });
  });

  test("a removed book is gone", async () => {
    setSystemTime(new Date(CAPTURED));
    const { caps } = host({ respond: (_r, u) => (u.pathname.startsWith("/api/v2/books/") ? { status: 404, body: "" } : undefined) });
    const err = await kagane(caps).getChapterPages!(SERIES, BOOK).catch((e: Error) => e);
    expect(parseSeriesGone((err as Error).message)?.reason).toBe("chapter removed from the source");
  });
});

/** The capture's access token's expiry, in ms. */
function CHALLENGE_EXP(): number {
  const payload = CHALLENGE.access_token.split(".")[1]!;
  return (JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp: number }).exp * 1000;
}

describe("User-Agent and Cloudflare", () => {
  test("the host's browser User-Agent is used; otherwise a browser fallback", async () => {
    const browser = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36";
    const a = host({ userAgent: browser });
    await kagane(a.caps).getListItems!("popular");
    expect(header(a.requests[0], "User-Agent")).toBe(browser);
    const b = host({ userAgent: "okhttp/4.12" });
    await kagane(b.caps).getListItems!("popular");
    expect(header(b.requests[0], "User-Agent")).toStartWith("Mozilla/5.0 (Windows NT 10.0");
  });

  test("a Cloudflare challenge asks for a web check of the site with the same User-Agent", async () => {
    const browser = "Mozilla/5.0 (X11; Linux x86_64) Chrome/152.0 Safari/537.36";
    const { caps } = host({
      userAgent: browser,
      respond: () => ({ status: 403, headers: { "cf-mitigated": "challenge", server: "cloudflare" }, body: "<title>Just a moment...</title>" }),
    });
    const err = await kagane(caps).getListItems!("popular").catch((e: Error) => e);
    expect(parseChallenge((err as Error).message)).toMatchObject({ url: "https://kagane.moe/", userAgent: browser });
  });
});

describe("links", () => {
  test("series and reader links on any of the site's domains", async () => {
    const bridge = kagane(host().caps);
    expect(await bridge.resolveUrl!(`https://kagane.moe/series/solo-camping-for-two-${SERIES}`)).toEqual({ seriesId: SERIES });
    expect(await bridge.resolveUrl!(`https://kagane.cx/series/${SERIES}`)).toEqual({ seriesId: SERIES });
    expect(await bridge.resolveUrl!(`https://kagane.net/series/solo-camping-for-two-${SERIES}/reader/${BOOK}`)).toEqual({ seriesId: SERIES, chapterId: BOOK });
    expect(await bridge.resolveUrl!("https://kagane.moe/search?title=solo")).toBeNull();
    expect(await bridge.resolveUrl!(`https://example.com/series/${SERIES}`)).toBeNull();
  });
});
