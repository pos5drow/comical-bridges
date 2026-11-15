/**
 * LectorXD against pages captured Nov 2026 through a browser session (the series and reader pages
 * had passed Cloudflare): the catalog by most recent, its second page by rating, a search, a series
 * page and one chapter's reader, trimmed to the result cards, pager, series details, the
 * `ChapterList` island and the page images.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import { nextPageCursor, parseSeriesGone } from "@comical/sdk";
import lectorxd, { catalogUrl, filterParams } from "../src/lectorxd.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "lectorxd", name), "utf8");
const ID = "manga/nade-nade-skill-de-maryoku-chuunyuu";

function host(opts: { status?: number; edit?: (body: string) => string; userAgent?: string } = {}) {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req);
        const u = new URL(req.url);
        const body =
          u.pathname === "/catalogo"
            ? u.searchParams.has("search") ? fixture("search.html")
            : u.searchParams.get("orderBy") === "rating" ? fixture("rating2.html")
            : fixture("recent.html")
          : u.pathname.includes("/leer/") ? fixture("chapter.html")
          : fixture("series.html");
        return { url: req.url, status: opts.status ?? 200, statusText: "", headers: {}, body: opts.edit ? opts.edit(body) : body };
      },
    },
    storage: {
      get: async () => undefined,
      set: async () => {},
      delete: async () => {},
      keys: async () => [],
      secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  const ua = opts.userAgent;
  if (ua) caps.getDefaultUserAgent = () => ua;
  return { caps, requests };
}

describe("lists and search", () => {
  test("recent from the catalog, safe content only, with type hints and card facts", async () => {
    const { caps, requests } = host();
    const res = await lectorxd(caps).getListItems!("recent");
    expect(requests[0]!.url).toBe("https://lectorxd.com/catalogo?adult=safe&filters=true&orderBy=recent");
    expect(res.items).toHaveLength(24);
    expect(res.items[0]).toEqual({
      id: "manhwa/cyberpunk-el-inmortal-de-kunlun",
      title: "Cyberpunk: El inmortal de Kunlun",
      subtitle: "8 caps · En emisión",
      thumbnailUrl: "https://s2.cdnlxd.xyz/manga/covers/cyberpunk-el-inmortal-de-kunlun.webp",
      thumbnailAspect: 2 / 3,
      coverForm: "scroll",
      readingDirection: "vertical",
    });
    expect(res.items.find((e) => e.id === "manga/un-amor-contra-el-destino")).toMatchObject({ title: "¡Un amor contra el destino!", coverForm: "volume", readingDirection: "rtl" });
    expect(res.items.find((e) => e.id === "one_shot/nondemiru")?.title).toBe("Nondemiru?");
    expect(res.nextCursor).toBe(nextPageCursor(1, true));
  });

  test("top rated pages through the catalog sorted by rating", async () => {
    const { caps, requests } = host();
    const res = await lectorxd(caps).getListItems!("rating", { cursor: nextPageCursor(1, true)! });
    expect(requests[0]!.url).toBe("https://lectorxd.com/catalogo?adult=safe&filters=true&orderBy=rating&page=2");
    expect(res.items).toHaveLength(6);
    expect(res.items[1]).toMatchObject({ id: "manhwa/el-gran-demonio-celestial-soberano", title: "El Gran Demonio Celestial Soberano" });
    expect(res.nextCursor).toBe(nextPageCursor(2, true));
    await expect(lectorxd(caps).getListItems!("nope")).rejects.toThrow();
  });

  test("the last page has no next link; novels are left out", async () => {
    const res = await lectorxd(
      host({ edit: (b) => b.replace(/<a [^>]*aria-label="Next page"[^>]*>.*?<\/a>/, "").replace('href="/manhwa/ganar-con-arte"', 'href="/novela/ganar-con-arte"') }).caps,
    ).getListItems!("recent");
    expect(res.nextCursor).toBeUndefined();
    expect(res.items).toHaveLength(23);
    expect(res.items.some((e) => e.id.includes("ganar-con-arte"))).toBe(false);
  });

  test("search sends the text and filters as the site's form does", async () => {
    const { caps, requests } = host();
    const bridge = lectorxd(caps);
    const res = await bridge.getSearchResults!({
      text: " solo ",
      filters: [
        { key: "types", value: ["manhwa", "novela"] },
        { key: "status", value: "en_emision" },
        { key: "demographics", value: ["shounen", "seinen"] },
        { key: "tags", value: { include: ["147", "160"], exclude: ["33"] } },
        { key: "adult", value: "adult" },
      ],
      sort: { key: "views", ascending: false },
    });
    expect(requests[0]!.url).toBe(
      "https://lectorxd.com/catalogo?adult=safe&filters=true&orderBy=views&search=solo&types=manhwa&status=en_emision&demographics=shounen%2Cseinen&tags=147%2C160&excludeTags=33",
    );
    expect(res.items).toHaveLength(6);
    expect(res.items[0]).toMatchObject({ id: "manhwa/me-converti-en-un-actor-de-primera-solo-leyendo-libros" });
    expect(res.nextCursor).toBe(nextPageCursor(1, true));

    await bridge.getSearchResults!({ text: "solo", sort: { key: "bogus", ascending: true } });
    expect(requests[1]!.url).toBe("https://lectorxd.com/catalogo?adult=safe&filters=true&orderBy=recent&search=solo");
    expect(filterParams([{ key: "tags", value: ["27", "x"] }, { key: "status", value: "nope" }])).toEqual({ tags: "27" });
    expect(catalogUrl(3, { orderBy: "" })).toBe("https://lectorxd.com/catalogo?adult=safe&filters=true&orderBy=recent&page=3");
  });

  test("filters and sorts need no request", async () => {
    const { caps, requests } = host();
    const bridge = lectorxd(caps);
    const filters = await bridge.getFilters!();
    expect(filters.map((f) => f.key)).toEqual(["types", "status", "demographics", "tags"]);
    const genres = filters.find((f) => f.key === "tags");
    expect(genres).toMatchObject({ type: "multiselect", excludable: true });
    expect(genres?.type === "multiselect" && genres.options).toContainEqual({ value: "147", label: "Acción" });
    expect((await bridge.getSortOptions!()).map((s) => s.key)).toEqual(["recent", "rating", "views", "leyendo", "por_leer", "completado", "chapters"]);
    expect(requests).toHaveLength(0);
  });
});

describe("a series", () => {
  test("details from the series page", async () => {
    const { caps, requests } = host();
    const info = await lectorxd(caps).getSeriesDetails(ID);
    expect(requests[0]!.url).toBe("https://lectorxd.com/manga/nade-nade-skill-de-maryoku-chuunyuu");
    expect(info).toMatchObject({
      id: ID,
      title: "Nade Nade Skill de Maryoku Chuunyuu!!",
      thumbnailUrl: "https://s1.cdnlxd.xyz/manga/covers/nade-nade-skill-de-maryoku-chuunyuu.webp",
      thumbnailAspect: 2 / 3,
      status: "ongoing",
      type: "Manga",
      coverForm: "volume",
      readingDirection: "rtl",
      shareUrl: "https://lectorxd.com/manga/nade-nade-skill-de-maryoku-chuunyuu",
    });
    expect(info.altTitles).toEqual([
      "Injecting Magical Power through My Caressing Skill",
      "なでなでスキルで魔力注入！！",
      "Nadenade Skill de Maryoku Chuunyuu!!",
      "なでなでスキルで魔力注入!!, Nadenade Skill de Maryoku Chu-nyu!! / Injecting Magical Power through My Caressing Skill",
    ]);
    expect(info.description).toStartWith("Mahiro Fushimi Un chico con expresiones faciales muertas");
    expect(info.tagGroups).toEqual([
      { label: "Géneros", kind: "genre", tags: ["Harem", "Romance", "Comedia", "Ecchi", "Magia", "Fantasía", "Manga"], tagIds: ["21", "27", "28", "33", "48", "160", "264"] },
      { label: "Demografía", kind: "demographic", tags: ["Shounen"] },
    ]);
  });

  test("chapters from the ChapterList island, decimals included, dated", async () => {
    const chapters = await lectorxd(host().caps).getChapters!(ID);
    expect(chapters).toHaveLength(10);
    expect(chapters[0]).toEqual({ id: "8.2", name: "Capítulo 8.2", number: 8.2, publishedAt: Date.UTC(2026, 10, 12) });
    expect(chapters.map((c) => c.id)).toEqual(["8.2", "8.1", "7", "6", "5", "4.5", "4", "3", "2", "1"]);
    expect(chapters[5]).toMatchObject({ number: 4.5, publishedAt: Date.UTC(2026, 4, 21) });
  });

  test("a group's version of a chapter keeps its group in the id", async () => {
    const edit = (b: string) => b.replace("&quot;groupId&quot;:[0,null]", "&quot;groupId&quot;:[0,12]").replace("&quot;title&quot;:[0,null]", "&quot;title&quot;:[0,&quot;Final&quot;]");
    const { caps, requests } = host({ edit });
    const bridge = lectorxd(caps);
    const chapters = await bridge.getChapters!(ID);
    expect(chapters[0]).toMatchObject({ id: "8.2?g=12", name: "Capítulo 8.2: Final", number: 8.2 });
    await bridge.getChapterPages!(ID, "8.2?g=12");
    expect(requests[1]!.url).toBe("https://lectorxd.com/manga/nade-nade-skill-de-maryoku-chuunyuu/leer/8.2?g=12");
  });

  test("pages from the reader, lazy ones by their data-src", async () => {
    const { caps, requests } = host();
    const bridge = lectorxd(caps);
    const pages = await bridge.getChapterPages!(ID, "7");
    expect(requests[0]!.url).toBe("https://lectorxd.com/manga/nade-nade-skill-de-maryoku-chuunyuu/leer/7");
    expect(pages).toHaveLength(30);
    expect(pages[0]).toEqual({ index: 0, imageUrl: "https://s1.cdnlxd.xyz/7780/7/1.jpg" });
    expect(pages[3]).toEqual({ index: 3, imageUrl: "https://s1.cdnlxd.xyz/7780/7/4.jpg" });
    expect(pages.every((p) => p.imageUrl.startsWith("https://s1.cdnlxd.xyz/7780/7/"))).toBe(true);
    expect(bridge.info.images).toBeUndefined();
    await expect(bridge.getChapterPages!("catalogo/x", "7")).rejects.toThrow();
  });

  test("a missing series is gone; an unknown id never reaches the site", async () => {
    const err = await lectorxd(host({ status: 404 }).caps).getSeriesDetails(ID).catch((e: Error) => e);
    expect(parseSeriesGone((err as Error).message)).not.toBeNull();
    const { caps, requests } = host();
    await expect(lectorxd(caps).getChapters!("novela/algo")).rejects.toThrow();
    expect(requests).toHaveLength(0);
    await expect(lectorxd(host({ status: 500 }).caps).getSeriesDetails(ID)).rejects.toThrow("HTTP 500");
  });

  test("links to series and chapters", async () => {
    const bridge = lectorxd(host().caps);
    expect(await bridge.resolveUrl!("https://lectorxd.com/manga/nade-nade-skill-de-maryoku-chuunyuu")).toEqual({ seriesId: ID });
    expect(await bridge.resolveUrl!("https://www.lectorxd.com/manhwa/book-eater/")).toEqual({ seriesId: "manhwa/book-eater" });
    expect(await bridge.resolveUrl!("https://lectorxd.com/manga/nade-nade-skill-de-maryoku-chuunyuu/leer/8.2")).toEqual({ seriesId: ID, chapterId: "8.2" });
    expect(await bridge.resolveUrl!("https://lectorxd.com/manhua/x/leer/3?g=5")).toEqual({ seriesId: "manhua/x", chapterId: "3?g=5" });
    expect(await bridge.resolveUrl!("https://lectorxd.com/catalogo?orderBy=recent")).toBeNull();
    expect(await bridge.resolveUrl!("https://lectorxd.com/novela/algo")).toBeNull();
    expect(await bridge.resolveUrl!("https://example.com/manga/x")).toBeNull();
  });
});

describe("User-Agent", () => {
  test("the host's browser User-Agent goes on every request, else a desktop one", async () => {
    const browser = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36";
    const a = host({ userAgent: browser });
    await lectorxd(a.caps).getListItems!("recent");
    await lectorxd(a.caps).getChapterPages!(ID, "7");
    expect(a.requests.map((r) => r.headers?.["User-Agent"])).toEqual([browser, browser]);
    const b = host({ userAgent: "Comical/1.0" });
    await lectorxd(b.caps).getSeriesDetails(ID);
    expect(b.requests[0]!.headers?.["User-Agent"]).toStartWith("Mozilla/5.0 (Windows NT 10.0");
  });
});
