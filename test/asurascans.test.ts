/**
 * Asura Scans against fixtures cut from its API (Nov 2026): browse/search URLs, entry/detail/chapter
 * parsing, locked chapters left out, links with the site's rotating slug suffix, and tiled pages —
 * marked for processing and laid out by inverting the API's tile map.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import asura, { asuraCommentBody } from "../src/asurascans.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "asurascans", name), "utf8");

function host(respond: (req: HttpRequest) => string) {
  const requests: string[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req.url);
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body: respond(req) };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, requests };
}

const api = (req: HttpRequest) => {
  const u = new URL(req.url);
  if (u.pathname === "/api/series") return fixture("list.json");
  if (/\/chapters\/[^/]+$/.test(u.pathname)) return fixture("pages.json");
  if (u.pathname.endsWith("/chapters")) {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    return JSON.stringify({
      data: [
        { number: 350, title: "Paid", is_premium: true, published_at: "2026-11-15T00:00:00Z" },
        { number: 349, title: null, is_premium: false, early_access_until: future, published_at: "2026-11-14T00:00:00Z" },
        { number: 348, title: "The Enemy of My Enemy", is_premium: false, early_access_until: "2026-11-01T00:00:00Z", published_at: "2026-11-14T03:57:55.951857Z" },
        { number: 2.5, title: "", published_at: "2020-01-01T00:00:00Z" },
      ],
    });
  }
  if (u.pathname === "/api/genres") return JSON.stringify({ data: [{ name: "Action", slug: "action" }] });
  return fixture("detail.json");
};

describe("browse and search", () => {
  test("lists page through the API, newest offset by page", async () => {
    const { caps, requests } = host(api);
    const bridge = asura(caps);
    const res = await bridge.getListItems!("popular");
    await bridge.getListItems!("popular", { cursor: res.nextCursor! });
    expect(requests).toEqual([
      "https://api.asurascans.com/api/series?offset=0&limit=24&sort=popular&order=desc",
      "https://api.asurascans.com/api/series?offset=24&limit=24&sort=popular&order=desc",
    ]);
    expect(res.items[0]).toMatchObject({
      id: "overgeared",
      title: "Overgeared",
      thumbnailUrl: "https://cdn.asurascans.com/asura-images/covers/overgeared.905990.webp",
      coverForm: "scroll",
    });
    expect(res.nextCursor).toBeDefined();
  });

  test("search carries text, sort, direction and filters", async () => {
    const { caps, requests } = host(api);
    await asura(caps).getSearchResults!({
      text: " solo ",
      sort: { key: "rating", ascending: true },
      filters: [
        { key: "status", value: "ongoing" },
        { key: "genres", value: ["action", "fantasy"] },
      ],
    });
    const q = new URL(requests[0]!).searchParams;
    expect(Object.fromEntries(q)).toEqual({ offset: "0", limit: "24", sort: "rating", order: "asc", search: "solo", status: "ongoing", genres: "action,fantasy" });
  });

  test("genre filter options come from the API", async () => {
    const filters = await asura(host(api).caps).getFilters!();
    expect(filters.find((f) => f.key === "genres")).toMatchObject({ type: "multiselect", options: [{ value: "action", label: "Action" }] });
  });
});

describe("details", () => {
  test("credits, status, type, rating out of ten, alt titles, plain description, share link", async () => {
    const info = await asura(host(api).caps).getSeriesDetails("overgeared");
    expect(info).toMatchObject({
      id: "overgeared",
      title: "Overgeared",
      status: "ongoing",
      type: "Manhwa",
      author: "LEE Dong Wook, PARK Saenal",
      artist: "REDICE Studio",
      shareUrl: "https://asurascans.com/comics/overgeared-f212c582",
    });
    expect(info.rating?.score).toBeCloseTo(0.905, 3);
    expect(info.altTitles).toContain("Temppal");
    expect(info.description).not.toContain("</p>");
    expect(info.tagGroups?.[0]?.tags).toContain("Action");
  });

  test("recommendations are a related group", async () => {
    const groups = await asura(host(api).caps).getRelatedSeries!("overgeared");
    expect(groups[0]?.kind).toBe("recommended");
    expect(groups[0]?.series[0]).toMatchObject({ id: "solo-max-level-newbie", title: "Solo Max-Level Newbie" });
  });
});

describe("chapters and pages", () => {
  test("premium and still-early-access chapters are left out; the rest are named and dated", async () => {
    const chapters = await asura(host(api).caps).getChapters!("overgeared");
    expect(chapters.map((c) => c.id)).toEqual(["348", "2.5"]);
    expect(chapters[0]).toEqual({
      id: "348",
      name: "Chapter 348 - The Enemy of My Enemy",
      number: 348,
      publishedAt: Date.parse("2026-11-14T03:57:55.951Z"),
    });
    expect(chapters[1]!.name).toBe("Chapter 2.5");
  });

  test("plain pages go straight to the CDN", async () => {
    const pages = await asura(host(api).caps).getChapterPages!("overgeared", "348");
    expect(pages).toHaveLength(2);
    expect(pages[0]!.imageUrl).toStartWith("https://cdn.asurascans.com/asura-images/chapters/overgeared/348/");
    expect(pages[0]!.process).toBeUndefined();
  });

  test("a tiled page is marked for processing, and its layout inverts the tile map", async () => {
    const tiled = JSON.stringify({
      data: { chapter: { pages: [{ url: "https://cdn.asurascans.com/x.webp", tiles: [1, 2, 3, 0], tile_cols: 2, tile_rows: 2 }] } },
    });
    const bridge = asura(host(() => tiled).caps);
    const [page] = await bridge.getChapterPages!("s", "1");
    expect(page!.process).toEqual({ context: { tiles: "[1,2,3,0]", cols: "2", rows: "2" } });
    const layout = await bridge.layoutPageImage!({ url: page!.imageUrl, headers: {}, context: page!.process!.context!, width: 100, height: 60 });
    // tiles[src] = dst: source 0 → dst 1, 1 → 2, 2 → 3, 3 → 0. So dst 0 takes source 3.
    expect(layout!.ops.map((o) => [o.src.x, o.src.y, o.dst.x, o.dst.y])).toEqual([
      [50, 30, 0, 0],
      [0, 0, 50, 0],
      [50, 0, 0, 30],
      [0, 30, 50, 30],
    ]);
    expect(await bridge.layoutPageImage!({ url: "u", headers: {}, context: { tiles: "nope", cols: "2", rows: "2" }, width: 10, height: 10 })).toBeNull();
  });

  test("no pages means a locked chapter, said plainly", async () => {
    const bridge = asura(host(() => JSON.stringify({ data: { chapter: { pages: [] } } })).caps);
    await expect(bridge.getChapterPages!("s", "61")).rejects.toThrow(/premium or early access/);
  });
});

describe("links", () => {
  test("strips the website's rotating suffix; no fetch", async () => {
    const { caps, requests } = host(api);
    const bridge = asura(caps);
    expect(await bridge.resolveUrl!("https://asurascans.com/comics/overgeared-f212c582")).toEqual({ seriesId: "overgeared" });
    expect(await bridge.resolveUrl!("https://asurascans.com/comics/overgeared-f212c582/chapter/348")).toEqual({ seriesId: "overgeared", chapterId: "348" });
    expect(await bridge.resolveUrl!("https://asurascans.com/browse")).toBeNull();
    expect(requests).toEqual([]);
  });
});

describe("comments", () => {
  // The comment routes on top of the read path's fixtures; chapters carry their API ids here.
  const commentsApi = (req: HttpRequest) => {
    const u = new URL(req.url);
    if (u.pathname === "/api/series/2165/comments") return fixture("comments-series.json");
    if (u.pathname === "/api/chapters/262950/comments") return fixture("comments-chapter.json");
    if (u.pathname === "/api/comments/785948/replies") return fixture("comments-replies.json");
    if (u.pathname.endsWith("/chapters")) {
      return JSON.stringify({ data: [{ id: 262950, number: 348, title: "The Enemy of My Enemy", published_at: "2026-11-14T03:57:55Z" }] });
    }
    return api(req);
  };

  test("declares series and chapter threads with the site's sorts", () => {
    const { caps } = host(commentsApi);
    const { info } = asura(caps);
    expect(info.capabilities).toContain("comments");
    expect(info.contractVersion).toBe("2.2.0");
    expect(info.comments).toEqual({
      scopes: ["series", "chapter"],
      sorts: [
        { id: "top", label: "Best" },
        { id: "newest", label: "Newest" },
        { id: "oldest", label: "Oldest" },
      ],
      votes: "up-down",
      maxDepth: 2,
    });
  });

  test("the series thread looks up the numeric id once, then pages by offset", async () => {
    const { caps, requests } = host(commentsApi);
    const bridge = asura(caps);
    const first = await bridge.getComments!({ target: { seriesId: "overgeared" } });
    await bridge.getComments!({ target: { seriesId: "overgeared" }, sort: "newest", cursor: first.nextCursor! });
    expect(requests).toEqual([
      "https://api.asurascans.com/api/series/overgeared",
      "https://api.asurascans.com/api/series/2165/comments?sort=top&offset=0&limit=20",
      "https://api.asurascans.com/api/series/2165/comments?sort=newest&offset=20&limit=20",
    ]);
    expect(first.total).toBe(795);
    expect(first.webUrl).toBe("https://asurascans.com/comics/overgeared-f212c582");
  });

  test("details already fetched spare the id lookup", async () => {
    const { caps, requests } = host(commentsApi);
    const bridge = asura(caps);
    await bridge.getSeriesDetails("overgeared");
    await bridge.getComments!({ target: { seriesId: "overgeared" } });
    expect(requests.filter((u) => u.endsWith("/series/overgeared"))).toHaveLength(1);
  });

  test("comments carry author, role, votes, flags, spoilers and GIFs", async () => {
    const { caps } = host(commentsApi);
    const { items } = await asura(caps).getComments!({ target: { seriesId: "overgeared" } });
    expect(items[0]).toMatchObject({
      id: "785948",
      author: { name: "reader1", role: "staff", avatar: "https://cdn.asurascans.com/asura-images/profiles/1001.abc123.webp" },
      votes: { up: 230, down: 29 },
      pinned: true,
      replyCount: 22,
      createdAt: Date.UTC(2025, 4, 10, 12),
    });
    expect(items[0]!.body).toEqual([
      { type: "text", text: "Long review of the first arc." },
      { type: "break" },
      { type: "break" },
      { type: "text", text: "Second paragraph with " },
      { type: "text", text: "a spoiler about the ending", spoiler: true },
      { type: "text", text: " and more." },
    ]);
    expect(items[1]).toMatchObject({ edited: true, author: { badges: ["Premium"] } });
    expect(items[2]!.author.avatar).toBeUndefined();
    expect(items[2]!.body).toEqual([{ type: "image", url: "https://cdn.asurascans.com/asura-images/gifs/5ce6c2.webp", animated: true }]);
  });

  test("a chapter thread maps the chapter number to the API's chapter id", async () => {
    const { caps, requests } = host(commentsApi);
    const page = await asura(caps).getComments!({ target: { seriesId: "overgeared", chapterId: "348" }, sort: "oldest" });
    expect(requests.slice(-2)).toEqual([
      "https://api.asurascans.com/api/series/overgeared/chapters",
      "https://api.asurascans.com/api/chapters/262950/comments?sort=oldest&offset=0&limit=20",
    ]);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeUndefined();
    expect(page.webUrl).toBe("https://asurascans.com/comics/overgeared-f212c582/chapter/348");
  });

  test("replies come back all at once, with the mention they open with", async () => {
    const { caps } = host(commentsApi);
    const page = await asura(caps).getComments!({ target: { seriesId: "overgeared" }, parentId: "785948" });
    expect(page.nextCursor).toBeUndefined();
    expect(page.items.map((c) => c.parentId)).toEqual(["785948", "785948"]);
    expect(page.items[1]!.body).toEqual([
      { type: "mention", name: "reader1" },
      { type: "text", text: " " },
      { type: "text", text: "It stays a game for a while", spoiler: true },
      { type: "text", text: " but it gets better" },
    ]);
  });

  test("a chapter the API doesn't list is an error, a missing thread an empty page", async () => {
    const { caps } = host(commentsApi);
    const bridge = asura(caps);
    await expect(bridge.getComments!({ target: { seriesId: "overgeared", chapterId: "999" } })).rejects.toThrow("no chapter 999");
    const missing = asura({
      ...caps,
      network: {
        request: async (req) =>
          new URL(req.url).pathname.endsWith("/comments")
            ? { url: req.url, status: 404, statusText: "Not Found", headers: {}, body: "" }
            : caps.network.request(req),
      },
    });
    expect((await missing.getComments!({ target: { seriesId: "overgeared" } })).items).toEqual([]);
  });

  test("comment bodies: unpaired spoiler bars stay as typed", () => {
    expect(asuraCommentBody("a || b")).toEqual([{ type: "text", text: "a || b" }]);
    expect(asuraCommentBody("||x|| y ||z")).toEqual([
      { type: "text", text: "x", spoiler: true },
      { type: "text", text: " y ||z" },
    ]);
    expect(asuraCommentBody("")).toEqual([]);
  });
});
