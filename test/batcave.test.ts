/**
 * BatCave against pages captured Nov 2026 through a session that had passed the site's DLE Guard
 * check (scripts and styles stripped, the data scripts kept): the home page, the library sorted by
 * rating, a search, a series page and one chapter's page list, plus the guard's own page.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import { nextPageCursor, parseChallenge } from "@comical/sdk";
import batcave, { filterPath } from "../src/batcave.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "batcave", name), "utf8");
const ID = "33051-absolute-batman-2024";

function host(opts: { guarded?: boolean } = {}) {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req);
        const u = new URL(req.url);
        if (opts.guarded) return { url: "https://batcave.biz/_c?t=abc&u=x", status: 404, statusText: "", headers: {}, body: fixture("guard.html") };
        const body =
          u.pathname === "/engine/ajax/controller.php" ? fixture("chapter.json")
          : u.pathname.startsWith("/search/") ? fixture("search.html")
          : u.pathname.startsWith("/comix/") || u.pathname.startsWith("/ComicList/") ? fixture("popular.html")
          : u.pathname.endsWith(".html") ? fixture("series.html")
          : fixture("latest.html");
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, requests };
}

describe("lists and search", () => {
  test("latest issues from the home page, each series once, with its full poster", async () => {
    const res = await batcave(host().caps).getListItems!("latest");
    expect(res.items.length).toBeGreaterThan(10);
    expect(res.items[0]).toEqual({
      id: "37528-spider-man-long-way-home-2026",
      title: "Spider-Man: Long Way Home (2026-)",
      subtitle: "Spider-Man: Long Way Home (2026-) #4",
      thumbnailUrl: "https://batcave.biz/uploads/posts/hd/37528.webp",
      thumbnailAspect: 2 / 3,
    });
    expect(new Set(res.items.map((e) => e.id)).size).toBe(res.items.length);
    expect(res.nextCursor).toBe(nextPageCursor(1, true));
  });

  test("top rated posts DLE's sort form to the library", async () => {
    const { caps, requests } = host();
    const res = await batcave(caps).getListItems!("popular", { cursor: nextPageCursor(1, true)! });
    expect(requests[0]).toMatchObject({ url: "https://batcave.biz/comix/page/2/", method: "POST", body: "dlenewssortby=rating&dledirection=desc&set_new_sort=dle_sort_cat_1&set_direction_sort=dle_direction_cat_1" });
    expect(res.items[0]).toMatchObject({ id: "33408-harley-quinn-fartacular-silent-butt-deadly-2025", subtitle: "DC Comics · 2025" });
    expect(res.items).toHaveLength(10);
  });

  test("text search reads the result cards and their pages", async () => {
    const { caps, requests } = host();
    const res = await batcave(caps).getSearchResults!({ text: "superman" });
    expect(requests[0]!.url).toBe("https://batcave.biz/search/superman/");
    expect(res.items).toHaveLength(10);
    expect(res.items.every((e) => /^\d+-/.test(e.id))).toBe(true);
    expect(res.nextCursor).toBe(nextPageCursor(1, true));
  });

  test("with no text, filters go to the library's path, sorted by the form", async () => {
    const { caps, requests } = host();
    await batcave(caps).getSearchResults!({ text: "", filters: [{ key: "publisher", value: ["16", "80"] }, { key: "genre", value: ["41"] }, { key: "from", value: 2020 }], sort: { key: "title", ascending: true } });
    expect(requests[0]).toMatchObject({ url: "https://batcave.biz/ComicList/p=16,80/g=41/y[from]=2020/", body: "dlenewssortby=title&dledirection=asc&set_new_sort=dle_sort_xfilter&set_direction_sort=dle_direction_xfilter" });
    expect(filterPath([{ key: "genre", value: ["x", "2"] }, { key: "to", value: 1800 }])).toBe("g=2/");
  });
});

describe("a series", () => {
  test("details from the series page", async () => {
    const info = await batcave(host().caps).getSeriesDetails(ID);
    expect(info).toMatchObject({
      id: ID,
      title: "Absolute Batman (2024-)",
      author: "Scott Snyder",
      artist: "Nick Dragotta",
      status: "ongoing",
      thumbnailUrl: "https://batcave.biz/uploads/posts/hd/33051.webp",
      shareUrl: "https://batcave.biz/33051-absolute-batman-2024.html",
    });
    expect(info.description).toStartWith("In the stark, rain-slicked streets of Gotham City");
    expect(info.tagGroups).toEqual([
      { label: "Genres", kind: "genre", tags: ["action", "adventure", "crime", "fighting", "mystery", "political", "superhero"] },
      { label: "Publisher", kind: "other", tags: ["DC Comics"] },
      { label: "Year", kind: "other", tags: ["2024"] },
    ]);
  });

  test("chapters from the page's data, newest first, dated", async () => {
    const chapters = await batcave(host().caps).getChapters!(ID);
    expect(chapters).toHaveLength(26);
    expect(chapters[0]).toEqual({ id: "33051/277339", name: "Absolute Batman (2024-) #25", number: 26, publishedAt: Date.UTC(2026, 9, 28) });
    expect(chapters.at(-1)).toMatchObject({ id: "33051/233702", number: 1, publishedAt: Date.UTC(2024, 9, 9) });
  });

  test("pages from the reader API, on the image host that wants the Referer", async () => {
    const { caps, requests } = host();
    const bridge = batcave(caps);
    const pages = await bridge.getChapterPages!(ID, "33051/233702");
    expect(requests[0]).toMatchObject({ method: "POST", body: '{"news_id":"33051","chapter_id":"233702"}' });
    expect(pages).toHaveLength(45);
    expect(pages[0]!.imageUrl).toStartWith("https://img.batcave.biz/img/34/33051/233702/1-");
    expect(bridge.info.images).toEqual({ hosts: ["img.batcave.biz"], headers: { Referer: "https://batcave.biz/" } });
    await expect(bridge.getChapterPages!("1-other", "33051/233702")).rejects.toThrow();
  });

  test("links to series pages", async () => {
    const bridge = batcave(host().caps);
    expect(await bridge.resolveUrl!("https://batcave.biz/33051-absolute-batman-2024.html")).toEqual({ seriesId: ID });
    expect(await bridge.resolveUrl!("https://batcave.biz/comix/")).toBeNull();
  });
});

describe("DLE Guard", () => {
  test("the guard's redirect asks for a web check of the page wanted, with the bridge's User-Agent", async () => {
    const err = await batcave(host({ guarded: true }).caps).getSearchResults!({ text: "superman" }).catch((e: Error) => e);
    expect(parseChallenge((err as Error).message)).toMatchObject({ url: "https://batcave.biz/search/superman/", userAgent: expect.stringContaining("Mozilla/5.0") });
  });

  test("a guarded POST checks the home page instead", async () => {
    const err = await batcave(host({ guarded: true }).caps).getListItems!("popular").catch((e: Error) => e);
    expect(parseChallenge((err as Error).message)?.url).toBe("https://batcave.biz/");
  });
});
