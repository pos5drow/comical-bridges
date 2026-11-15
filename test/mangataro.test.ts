/**
 * The MangaTaro engine (MangaTaro, Rolia Scan) against fixtures cut from the sites (Nov 2026): the
 * chapter token, browse bodies and Rolia's page folding, the site's own text search, details from
 * WordPress, English chapters only, the clock-skew retry, taken-down chapters, and links.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import { chapterToken, unescapeHtml } from "../src/engines/mangataro.ts";
import mangataro from "../src/mangataro.ts";
import roliascan from "../src/roliascan.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "mangataro", name), "utf8");

type Reply = Partial<HttpResponse> & { body: string };

function host(route?: (req: HttpRequest, u: URL) => Reply | undefined) {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req);
        const u = new URL(req.url);
        const r = route?.(req, u) ?? site(u);
        return { url: req.url, status: 200, statusText: "OK", headers: {}, ...r };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, requests };
}

function site(u: URL): Reply {
  const p = u.pathname;
  // A full API page (24 rows) is what tells the engine there may be another.
  if (p === "/wp-json/manga/v1/load") return { body: JSON.stringify(Array.from({ length: 8 }, () => JSON.parse(fixture("browse.json"))).flat()) };
  if (p === "/auth/search") return { body: JSON.stringify({ results: [{ id: 5, slug: "x", title: "Tom &amp;amp; Jerry", thumbnail: "https://c/x.jpg", type: "Manga", status: "Ongoing" }, { id: 6, slug: "n", title: "A Novel", type: "Novel" }] }) };
  if (p.startsWith("/wp-json/wp/v2/manga/")) return { body: fixture("details.json") };
  if (p === "/auth/manga-chapters") return { body: fixture("chapters.json") };
  if (p === "/auth/chapter-content") return { body: fixture("pages.json") };
  if (p.startsWith("/manga/")) return { body: '<body data-manga-id="47">' };
  return { body: "{}", status: 404 };
}

describe("helpers", () => {
  test("the chapter token is md5 of seconds + mng_ch_ + the UTC hour, first 16 hex", () => {
    const at = Date.UTC(2026, 10, 15, 7, 41, 9);
    const sec = Math.floor(at / 1000);
    expect(chapterToken(at)).toEqual({ t: createHash("md5").update(`${sec}mng_ch_2026111507`).digest("hex").slice(0, 16), ts: String(sec) });
  });

  test("entities, double-escaped included", () => {
    expect(unescapeHtml("Tom &amp;amp; Jerry &#8217;s &#x41;")).toBe("Tom & Jerry ’s A");
  });
});

describe("browse and search", () => {
  test("lists POST the browse body; Rolia folds five API pages into one", async () => {
    const { caps, requests } = host();
    const res = await roliascan(caps).getListItems!("latest");
    expect(requests).toHaveLength(5);
    expect(JSON.parse(requests[0]!.body!)).toEqual({ page: 1, search: "", years: "[]", genres: "[]", types: "[]", statuses: "[]", sort: "post_desc", genreMatchMode: "any" });
    expect(JSON.parse(requests[4]!.body!).page).toBe(5);
    expect(res.items[0]).toMatchObject({ id: "7", title: "My Bias Gets on the Last Train", coverForm: "scroll" });
    // The same three series every page: folded, they appear once.
    expect(res.items).toHaveLength(3);
  });

  test("a plain text search uses the site's search, novels left out", async () => {
    const { caps, requests } = host();
    const res = await mangataro(caps).getSearchResults!({ text: "tom" });
    expect(requests[0]!.url).toBe("https://mangataro.org/auth/search");
    expect(JSON.parse(requests[0]!.body!)).toEqual({ query: "tom", limit: 25 });
    expect(res.items).toEqual([{ id: "5", title: "Tom & Jerry", thumbnailUrl: "https://c/x.jpg", coverForm: "volume", readingDirection: "rtl" }]);
  });

  test("filters or a sort switch to the browse endpoint", async () => {
    const { caps, requests } = host();
    await mangataro(caps).getSearchResults!({ text: "tom", filters: [{ key: "genres", value: ["7", "12"] }, { key: "type", value: "Manhwa" }], sort: { key: "title", ascending: true } });
    expect(JSON.parse(requests[0]!.body!)).toMatchObject({ search: "tom", genres: "[7,12]", types: '["Manhwa"]', sort: "title_asc" });
  });
});

describe("details, chapters, pages", () => {
  test("details from WordPress", async () => {
    const info = await mangataro(host().caps).getSeriesDetails("47");
    expect(info).toMatchObject({ id: "47", title: "One Piece", type: "Manga", thumbnailUrl: "https://mangataro.org/content/media/one-piece.jpg" });
    expect(info.tagGroups?.[0]?.tags).toContain("Adventure");
    expect(info.description).not.toContain("<");
  });

  test("English chapters only, placeholders dropped, relative dates", async () => {
    const chapters = await roliascan(host().caps).getChapters!("7");
    expect(chapters.map((c) => c.id)).toEqual(["299017", chapters[1]!.id]);
    expect(chapters[0]).toMatchObject({ id: "299017", name: "Chapter 91", number: 91, group: "Rolia Uploaders" });
    expect(chapters[0]!.publishedAt).toBeLessThan(Date.now() - 80 * 86_400_000);
  });

  test("a refused token is retried once against the server's clock", async () => {
    let first = true;
    const { caps, requests } = host((_req, u) => {
      if (u.pathname !== "/auth/manga-chapters") return undefined;
      if (first) {
        first = false;
        return { status: 403, headers: { Date: new Date(Date.now() + 3_600_000).toUTCString() }, body: "{}" };
      }
      return undefined;
    });
    const chapters = await roliascan(caps).getChapters!("7");
    expect(chapters.length).toBe(2);
    const [refused, retried] = requests.map((r) => new URL(r.url).searchParams.get("_ts")!).map(Number);
    expect(retried! - refused!).toBeGreaterThan(3_500);
  });

  test("pages, and a taken-down chapter says so", async () => {
    expect((await roliascan(host().caps).getChapterPages!("7", "299017")).map((p) => p.imageUrl)).toEqual(JSON.parse(fixture("pages.json")).images);
    const gone = host((_r, u) => (u.pathname === "/auth/chapter-content" ? { status: 404, body: '{"success":false,"message":"Chapter not available"}' } : undefined));
    await expect(mangataro(gone.caps).getChapterPages!("47", "707396")).rejects.toThrow("MangaTaro: Chapter not available");
  });
});

describe("links", () => {
  test("series and reader links find the post id on the series page", async () => {
    const bridge = mangataro(host().caps);
    expect(await bridge.resolveUrl!("https://mangataro.org/manga/one-piece")).toEqual({ seriesId: "47" });
    expect(await bridge.resolveUrl!("https://mangataro.org/read/one-piece/ch1198-707396")).toEqual({ seriesId: "47", chapterId: "707396" });
    expect(await bridge.resolveUrl!("https://roliascan.com/manga/x")).toBeNull();
  });
});
