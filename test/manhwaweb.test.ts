/**
 * ManhwaWeb against fixtures cut from its API (Nov 2026): lists, search URL and filters, the adult
 * flag as a content rating, details, one chapter per version with its group, pages, and links.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import manhwaweb from "../src/manhwaweb.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "manhwaweb", name), "utf8");

function host() {
  const requests: string[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req.url);
        const p = new URL(req.url).pathname;
        const body =
          p === "/manhwa/library" ? fixture("search.json")
          : p === "/manhwa/nuevos" ? fixture("popular.json")
          : p === "/latest/new-manhwa" ? fixture("latest.json")
          : p.startsWith("/manhwa/see/") ? fixture("detail.json")
          : p.startsWith("/chapters/see/") ? fixture("pages.json")
          : "{}";
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, requests };
}

describe("lists", () => {
  test("new: library entries with their type's cover hints", async () => {
    const res = await manhwaweb(host().caps).getListItems!("new");
    expect(res.items).toHaveLength(2);
    expect(res.items[0]!.id).toBeTruthy();
    expect(res.nextCursor).toBeUndefined();
  });

  test("popular: ids from the series link", async () => {
    const res = await manhwaweb(host().caps).getListItems!("popular");
    expect(res.items[0]).toMatchObject({ id: "Milp_Hunter_from_another_world_1687782626618" });
    expect(res.items[0]!.thumbnailUrl).toStartWith("https://img1mw.xyz/");
  });

  test("latest: one entry per series, with its newest chapter", async () => {
    const res = await manhwaweb(host().caps).getListItems!("latest");
    expect(res.items).toHaveLength(3);
    expect(res.items[0]!.subtitle).toBe("Capítulo 9");
  });
});

describe("search", () => {
  test("text, filters, genres joined with 'a', sort and a 0-based page", async () => {
    const { caps, requests } = host();
    const res = await manhwaweb(caps).getSearchResults!({
      text: " solo ",
      filters: [{ key: "tipo", value: "manhwa" }, { key: "erotico", value: "no" }, { key: "generes", value: ["3", "29"] }],
      sort: { key: "alfabetico", ascending: true },
    });
    expect(Object.fromEntries(new URL(requests[0]!).searchParams)).toEqual({
      buscar: "solo",
      page: "0",
      tipo: "manhwa",
      erotico: "no",
      generes: "3a29",
      order_item: "alfabetico",
      order_dir: "asc",
    });
    expect(res.nextCursor).toBeDefined();
  });

  test("adult series are rated adult; others carry no rating", async () => {
    const res = await manhwaweb(host().caps).getSearchResults!({ text: "" });
    expect(res.items.map((e) => [e.id, e.contentRating])).toEqual([
      ["ldlive_1781589982404", undefined],
      ["countryside_1681701042099", "adult"],
    ]);
    expect(res.items[1]!.readingDirection).toBe("vertical");
  });
});

describe("details, chapters, pages", () => {
  test("details", async () => {
    const info = await manhwaweb(host().caps).getSeriesDetails("ldlive_1781589982404");
    expect(info).toMatchObject({ id: "ldlive_1781589982404", status: "ongoing", type: "Manga", shareUrl: "https://manhwaweb.com/manhwa/ldlive_1781589982404" });
    expect(info.tagGroups?.[0]?.tags).toContain("Romance");
    expect(info.description).toBeTruthy();
  });

  test("one chapter per released version, newest first, with its group", async () => {
    const chapters = await manhwaweb(host().caps).getChapters!("ldlive_1781589982404");
    expect(chapters.map((c) => c.id)).toEqual(["ldlive_1781589982404-2_01", "ldlive_1781589982404-1_01"]);
    expect(chapters[1]).toEqual({ id: "ldlive_1781589982404-1_01", name: "Capítulo 1", number: 1, publishedAt: 1781613129859, group: "nose.com" });
  });

  test("pages keep only real URLs", async () => {
    const pages = await manhwaweb(host().caps).getChapterPages!("ldlive_1781589982404", "ldlive_1781589982404-1_01");
    expect(pages).toHaveLength(2);
    expect(pages[0]!.imageUrl).toStartWith("https://img2mw.xyz/");
  });
});

describe("links", () => {
  test("series and reader links, no fetch", async () => {
    const { caps, requests } = host();
    const bridge = manhwaweb(caps);
    expect(await bridge.resolveUrl!("https://manhwaweb.com/manhwa/ldlive_1781589982404")).toEqual({ seriesId: "ldlive_1781589982404" });
    expect(await bridge.resolveUrl!("https://manhwaweb.com/leer/ldlive_1781589982404-1_01")).toEqual({ seriesId: "ldlive_1781589982404", chapterId: "ldlive_1781589982404-1_01" });
    expect(await bridge.resolveUrl!("https://manhwaweb.com/biblioteca")).toBeNull();
    expect(requests).toEqual([]);
  });
});
