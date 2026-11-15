/**
 * Toonkotsu against responses captured from its API (Nov 2026, trimmed; chapters 229 and 228 are
 * synthetic, to cover partial uploads): browse, latest (once per series), search parameters,
 * details, the one-per-group chapter list, encrypted pages and their AES-CTR transform, and links.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import { base64UrlToBytes, bytesToBase64 } from "../src/core/bytes.ts";
import toonkotsu from "../src/toonkotsu.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "toonkotsu", name), "utf8");

function host(over?: (url: string) => HttpResponse | undefined) {
  const requests: string[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req.url);
        const hit = over?.(req.url);
        if (hit) return hit;
        const p = new URL(req.url).pathname;
        const body =
          p === "/cdn/v1/browse" ? fixture("browse.json")
          : p === "/cdn/v1/latest" ? fixture("latest.json")
          : p.startsWith("/api/manga/chapter/") ? fixture("chapter.json")
          : fixture("series.json");
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, requests };
}

test("base64 helpers round-trip URL-safe input", () => {
  const bytes = base64UrlToBytes("4i-3GInSL_thR_inSMcUSa5snd8rUgOfHvKyCzuvgAk")!;
  expect(bytes).toHaveLength(32);
  expect(bytesToBase64(bytes)).toBe("4i+3GInSL/thR/inSMcUSa5snd8rUgOfHvKyCzuvgAk=");
  expect(bytesToBase64(new Uint8Array([1, 2]))).toBe("AQI=");
  expect(base64UrlToBytes("a")).toBeUndefined();
});

describe("lists and search", () => {
  test("popular: series by code, the larger cover, type hints, adult rated", async () => {
    const { caps, requests } = host();
    const res = await toonkotsu(caps).getListItems!("popular");
    expect(requests[0]).toBe("https://toonkotsu.com/cdn/v1/browse?sort=popular&order=desc&page=1&limit=42");
    expect(res.items[0]).toMatchObject({ id: "vz5r6i", title: "Chainsaw Man", thumbnailUrl: "https://toonkotsu.com/cdn/c/ldk62/muxe4yv4/720.webp", coverForm: "volume" });
    expect(res.items.at(-1)!.contentRating).toBe("adult");
    expect(res.nextCursor).toBeDefined();
  });

  test("latest: once per series, with the uploaded chapter", async () => {
    const res = await toonkotsu(host().caps).getListItems!("latest");
    expect(res.items).toHaveLength(new Set(res.items.map((e) => e.id)).size);
    expect(res.items[0]!.subtitle).toBe("Chapter 146 [Flame Comics]");
  });

  test("search: text, sort, multiselects and include/exclude genres", async () => {
    const { caps, requests } = host();
    await toonkotsu(caps).getSearchResults!({
      text: "solo",
      sort: { key: "score", ascending: true },
      filters: [
        { key: "type", value: "Manhwa" },
        { key: "status", value: ["Ongoing", "Hiatus"] },
        { key: "genres", value: { include: ["Action"], exclude: ["Romance", "Harem"] } },
      ],
    });
    const q = new URL(requests[0]!).searchParams;
    expect(Object.fromEntries(q)).toMatchObject({ sort: "score", order: "asc", q: "solo", type: "Manhwa", status: "Ongoing,Hiatus", genres: "Action", exclude: "Romance,Harem" });
  });
});

describe("details, chapters, pages", () => {
  test("details: titles, authors, tags without spoilers, status", async () => {
    const info = await toonkotsu(host().caps).getSeriesDetails("vz5r6i");
    expect(info).toMatchObject({ id: "vz5r6i", title: "Chainsaw Man", author: "FUJIMOTO Tatsuki", status: "completed", type: "Manga", shareUrl: "https://toonkotsu.com/title/vz5r6i" });
    expect(info.altTitles).toContain("チェンソーマン");
    expect(info.tagGroups?.[0]?.tags).not.toContain(JSON.parse(fixture("series.json")).series.spoilerTags[0]);
    expect(info.description).toStartWith("Denji");
  });

  test("chapters: one upload per chapter and group, complete before partial", async () => {
    const chapters = await toonkotsu(host().caps).getChapters!("vz5r6i");
    expect(chapters.filter((c) => c.number === 232).map((c) => [c.id, c.group])).toEqual([
      ["1897633", "WeebCentral"],
      ["3795825", "Official"],
      ["4264144", "Rolia Scans"],
    ]);
    // 229: the partial upload is hidden because Official has the whole chapter; 228 is partial-only.
    expect(chapters.filter((c) => c.number === 229).map((c) => c.group)).toEqual(["Official"]);
    expect(chapters.filter((c) => c.number === 228).map((c) => c.group)).toEqual(["Partial Scans (incomplete)"]);
    expect(chapters[0]).toMatchObject({ name: "Chapter 232", publishedAt: 1774365736903 });
  });

  test("pages carry their key and nonce; the decoder pads the nonce into the counter", async () => {
    const bridge = toonkotsu(host().caps);
    const pages = await bridge.getChapterPages!("vz5r6i", "1897633");
    expect(pages).toHaveLength(3);
    expect(pages[0]!.imageUrl).toBe("https://toonkotsu.com/cdn/e/2pIgOEeohhj71YGdK5_q6cY7B_StnHNCh8KnaECYU7I.bin");
    const t = await bridge.decodePageImage!({ url: pages[0]!.imageUrl, headers: {}, context: pages[0]!.process!.context! });
    expect(t).toEqual([{ kind: "aes-ctr", key: "4i+3GInSL/thR/inSMcUSa5snd8rUgOfHvKyCzuvgAk=", counter: "rXjVa0NwAaoAAAAAAAAAAA==" }]);
    expect(await bridge.decodePageImage!({ url: "x", headers: {}, context: { k: "short", n: "x" } })).toBeNull();
  });

  test("the site's human check becomes a clear message", async () => {
    const { caps } = host((u) =>
      u.includes("/api/manga/chapter/") ? { url: u, status: 429, statusText: "", headers: {}, body: '{"error":"Too many","code":"manga-limit","reason":"verify"}' } : undefined,
    );
    await expect(toonkotsu(caps).getChapterPages!("vz5r6i", "1")).rejects.toThrow(/human check/);
  });
});

test("links: a code directly, an older hid link through the series", async () => {
  const { caps, requests } = host();
  const bridge = toonkotsu(caps);
  expect(await bridge.resolveUrl!("https://toonkotsu.com/title/vz5r6i-chainsaw-man")).toEqual({ seriesId: "vz5r6i" });
  expect(await bridge.resolveUrl!("https://toonkotsu.com/title/vz5r6i-chainsaw-man/1897633")).toEqual({ seriesId: "vz5r6i", chapterId: "1897633" });
  expect(requests).toEqual([]);
  expect(await bridge.resolveUrl!("https://toonkotsu.com/title/ldk62")).toEqual({ seriesId: "vz5r6i" });
  expect(await bridge.resolveUrl!("https://toonkotsu.com/browse")).toBeNull();
});
