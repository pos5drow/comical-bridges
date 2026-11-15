/**
 * Dynasty Scans against fixtures cut from its JSON views (Nov 2026): latest chapters mapped to their
 * series (oneshots standing alone), search, details from tags, chapters with volume headers and
 * scanlators, pages, and links.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import dynasty from "../src/dynasty.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "dynasty", name), "utf8");

function host() {
  const requests: string[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req.url);
        const p = new URL(req.url).pathname;
        const body =
          p === "/chapters/added.json" ? fixture("added.json")
          : p === "/search" ? fixture("search.html")
          : p.startsWith("/chapters/") ? fixture("chapter.json")
          : fixture("series.json");
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, requests };
}

describe("browse and search", () => {
  test("latest chapters become their series, once each", async () => {
    const { caps, requests } = host();
    const res = await dynasty(caps).getListItems!("latest");
    expect(requests[0]).toBe("https://dynasty-scans.com/chapters/added.json?page=1");
    expect(res.items[0]).toEqual({ id: "series/all_through_the_night", title: "All Through the Night", subtitle: "All Through the Night ch01" });
    expect(new Set(res.items.map((e) => e.id)).size).toBe(res.items.length);
    expect(res.nextCursor).toBeDefined();
  });

  test("search defaults to every container kind and reads the result list", async () => {
    const { caps, requests } = host();
    const res = await dynasty(caps).getSearchResults!({ text: "citrus" });
    expect(requests[0]).toBe("https://dynasty-scans.com/search?q=citrus&classes%5B%5D=Series&classes%5B%5D=Anthology&classes%5B%5D=Doujin&classes%5B%5D=Issue&page=1");
    expect(res.items[0]).toEqual({ id: "series/citrus_1", title: "Citrus +" });
  });
});

describe("details, chapters, pages", () => {
  test("details: authors, tags, cover, description from the series view", async () => {
    const info = await dynasty(host().caps).getSeriesDetails("series/citrus");
    expect(info).toMatchObject({ id: "series/citrus", title: "Citrus", author: "Saburouta", shareUrl: "https://dynasty-scans.com/series/citrus" });
    expect(info.thumbnailUrl).toStartWith("https://dynasty-scans.com/system/tag_contents_covers/");
    expect(info.tagGroups?.[0]?.tags).toContain("Yuri");
    expect(info.description).toBe("Continued in Citrus +");
  });

  test("chapters newest first, with volumes from the headers and scanlators as groups", async () => {
    const chapters = await dynasty(host().caps).getChapters!("series/citrus");
    expect(chapters.map((c) => [c.id, c.volume, c.number])).toEqual([
      ["citrus_ch03", 2, 3],
      ["citrus_ch02", 1, 2],
      ["citrus_ch01", 1, 1],
    ]);
    expect(chapters[2]).toMatchObject({ name: "Chapter 1: love affair!?", group: "Yuri Project", publishedAt: Date.UTC(2013, 3, 6) });
  });

  test("a oneshot is its own series with one chapter", async () => {
    const chapters = await dynasty(host().caps).getChapters!("chapters/citrus_ch01");
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.id).toBe("citrus_ch01");
  });

  test("pages are absolute", async () => {
    const pages = await dynasty(host().caps).getChapterPages!("series/citrus", "citrus_ch01");
    expect(pages[0]!.imageUrl).toBe("https://dynasty-scans.com/system/releases/000/005/265/citrus_ch01_01.webp");
  });

  test("an unknown directory is gone", async () => {
    await expect(dynasty(host().caps).getSeriesDetails("nope/x")).rejects.toThrow(/removed from the source/);
  });
});

test("links: container links directly; a chapter link through its series tag", async () => {
  const bridge = dynasty(host().caps);
  expect(await bridge.resolveUrl!("https://dynasty-scans.com/anthologies/foo")).toEqual({ seriesId: "anthologies/foo" });
  expect(await bridge.resolveUrl!("https://dynasty-scans.com/chapters/citrus_ch01")).toEqual({ seriesId: "series/citrus", chapterId: "citrus_ch01" });
  expect(await bridge.resolveUrl!("https://dynasty-scans.com/tags/yuri")).toBeNull();
});
