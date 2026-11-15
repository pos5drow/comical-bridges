/**
 * Mangago against pages cut from the site (Nov 2026). `chapter.js` keeps the real sojson v4
 * prologue and epilogue around the parts the bridge reads, re-encoded. Batched and scrambled
 * reader pages are synthetic: built here, encrypted with the script's key like the site's.
 */
import { describe, expect, test } from "bun:test";
import { createCipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import mangago, { deobfuscateSojson, parseReaderScript } from "../src/mangago.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "mangago", name), "utf8");
const SCRIPT = parseReaderScript(fixture("chapter.js"));

/** A reader page whose list is `urls` (blank = another batch's page), encrypted like the site's. */
function readerPage(urls: string[], total: number): string {
  const plain = Buffer.from(urls.join(","));
  const padded = Buffer.concat([plain, Buffer.alloc((16 - (plain.length % 16)) % 16)]);
  const c = createCipheriv("aes-128-cbc", Buffer.from(SCRIPT.key), Buffer.from(SCRIPT.iv)).setAutoPadding(false);
  const enc = Buffer.concat([c.update(padded), c.final()]).toString("base64");
  return `<html><body><input type="hidden" id="curl" value="/uu/br_chapter-1/pg-{page}/">
<script>var imgsrcs = '${enc}';</script><script>var total_pages=${total},manga_name="x";</script>
<script src="https://pic1.mangapicgallery.com/js/chapter.js?895"></script></body></html>`;
}

function host(readers: Record<string, string> = {}) {
  const requests: string[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req.url);
        const p = new URL(req.url).pathname;
        const body =
          p.endsWith("chapter.js") ? fixture("chapter.js")
          : p.startsWith("/genre/") ? fixture("popular.html")
          : p.startsWith("/r/l_search") ? fixture("search.html")
          : readers[p] ?? (/^\/read-manga\/[^/]+\/$/.test(p) ? fixture("series.html") : fixture("reader.html"));
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, requests };
}

const isPermutation = (order: string, n: number) => {
  const nums = order.split("a").map((x) => Number(x || "0"));
  return nums.length === n && new Set(nums).size === n && nums.every((x) => x >= 0 && x < n);
};

describe("the reader script, read as data", () => {
  test("sojson v4 decodes to the script", () => {
    expect(deobfuscateSojson(fixture("chapter.js"))).toContain("CryptoJS.AES.decrypt");
  });

  test("list key and IV, tile size, and every tile order a permutation", () => {
    expect(Buffer.from(SCRIPT.key).toString("hex")).toBe("e11adc3949ba59abbe56e057f20f883e");
    expect(Buffer.from(SCRIPT.iv).toString("hex")).toBe("1234567890abcdef1234567890abcdef");
    expect(SCRIPT.cols).toBe(9);
    expect(SCRIPT.orders.length).toBe(23);
    expect(isPermutation(SCRIPT.defaultOrder, 81)).toBe(true);
    // Including the two stored shuffled, which only come out as permutations once unshuffled.
    for (const [, order] of SCRIPT.orders) expect(isPermutation(order, 81)).toBe(true);
  });
});

describe("lists and search", () => {
  test("browse: cards with lazy covers, paging", async () => {
    const { caps, requests } = host();
    const res = await mangago(caps).getListItems!("popular");
    expect(requests[0]).toBe("https://www.mangago.me/genre/all/1/?f=1&o=1&sortby=view&e=");
    expect(res.items[0]).toEqual({
      id: "cherry_blossoms_after_winter",
      title: "Cherry Blossoms After Winter",
      thumbnailUrl: "https://i0.mangapicgallery.com/r/coverlink/rROHYYKHa8HlWy3U7kHm8eI5JAZfLBWBoYekEkCcx-BVB-N.png?4",
    });
    expect(res.nextCursor).toBeDefined();
  });

  test("filters: genres in the path, excluded and status in the query", async () => {
    const { caps, requests } = host();
    await mangago(caps).getSearchResults!({
      text: "",
      sort: { key: "update_date", ascending: false },
      filters: [{ key: "status", value: "ongoing" }, { key: "genres", value: { include: ["Romance", "School Life"], exclude: ["Smut"] } }],
    });
    expect(requests[0]).toBe("https://www.mangago.me/genre/Romance,School%20Life/1/?f=0&o=1&sortby=update_date&e=Smut");
  });

  test("text search", async () => {
    const { caps, requests } = host();
    const res = await mangago(caps).getSearchResults!({ text: "alex" });
    expect(requests[0]).toBe("https://www.mangago.me/r/l_search/?name=alex&page=1");
    expect(res.items.map((e) => e.id).slice(0, 2)).toEqual(["alexandros_dream_for_world_conquest", "oujo_alexandra"]);
    expect(res.nextCursor).toBeDefined();
  });
});

describe("details, chapters, pages", () => {
  test("details: the site's mature notice dropped from the summary, rated from genres", async () => {
    const info = await mangago(host().caps).getSeriesDetails("bj_alex");
    expect(info).toMatchObject({ id: "bj_alex", title: "BJ alex (Yaoi)", status: "completed", author: "Mingwa", altTitles: ["BJ 알렉스"], contentRating: "adult" });
    expect(info.description).toStartWith("Every night at 10");
    expect(info.tagGroups?.[0]?.tags).toContain("Yaoi");
  });

  test("chapters: ids are the reader paths; numbers only from real chapter labels", async () => {
    const chapters = await mangago(host().caps).getChapters!("bj_alex");
    expect(chapters.map((c) => [c.id, c.number])).toEqual([
      ["uu/ibx_chapter-end/pg-1/", undefined],
      ["uu/iur_chapter-side4/pg-1/", undefined],
      ["uu/iur_chapter-side3/pg-1/", undefined],
      ["uu/br_chapter-8296/pg-1/", undefined],
    ]);
    expect(chapters[3]).toMatchObject({ group: "RndmFudanshi", publishedAt: Date.UTC(2021, 4, 8) });
  });

  test("pages: the real list, decrypted with the script's key", async () => {
    const pages = await mangago(host().caps).getChapterPages!("bj_alex", "uu/br_chapter-246211/pg-1/");
    expect(pages.map((p) => p.imageUrl)).toEqual(
      ["39828748", "39828750", "39828751"].map((n) => `https://iweb_2.mangapicgallery.com/r/newpiclink/bj_alex/246211/246211_${n}.jpg`),
    );
    expect(pages.every((p) => !p.process)).toBe(true);
  });

  test("batches: blank slots filled from the reader's later pages", async () => {
    const u = (n: number) => `https://iweb1.mangapicgallery.com/r/newpiclink/x/1/${n}.jpg`;
    const { caps, requests } = host({
      "/read-manga/x/uu/br_chapter-1/pg-1/": readerPage([u(1), u(2), "", "", ""], 5),
      "/read-manga/x/uu/br_chapter-1/pg-3/": readerPage(["", "", u(3), u(4), ""], 5),
      "/read-manga/x/uu/br_chapter-1/pg-5/": readerPage(["", "", "", "", u(5)], 5),
    });
    const pages = await mangago(caps).getChapterPages!("x", "uu/br_chapter-1/pg-1/");
    expect(pages.map((p) => p.imageUrl)).toEqual([1, 2, 3, 4, 5].map(u));
    expect(requests.filter((r) => r.includes("/read-manga/")).map((r) => r.split("/").slice(-2, -1)[0])).toEqual(["pg-1", "pg-3", "pg-5"]);
  });

  test("scrambled pages: marked with their tile order, laid back out as a 9×9 grid", async () => {
    const scrambled = `https://iweb1.mangapicgallery.com/r/cspiclink/x/1/${SCRIPT.orders[0]![0]}.jpg`;
    const bridge = mangago(host({ "/read-manga/x/uu/br_chapter-1/pg-1/": readerPage([scrambled, "https://iweb1.mangapicgallery.com/r/newpiclink/x/1/2.jpg"], 2) }).caps);
    const pages = await bridge.getChapterPages!("x", "uu/br_chapter-1/pg-1/");
    expect(pages[0]!.process?.context).toEqual({ order: SCRIPT.orders[0]![1], cols: "9" });
    expect(pages[1]!.process).toBeUndefined();

    const layout = await bridge.layoutPageImage!({ url: scrambled, width: 905, height: 1300, headers: {}, context: pages[0]!.process!.context! });
    // 81 tiles of 100×144, plus the right and bottom remainders copied through.
    expect(layout!.ops).toHaveLength(83);
    const first = Number(SCRIPT.orders[0]![1].split("a")[0] || "0");
    expect(layout!.ops).toContainEqual({ op: "copy", src: { x: 0, y: 0, w: 100, h: 144 }, dst: { x: (first % 9) * 100, y: Math.floor(first / 9) * 144, w: 100, h: 144 } });
    expect(await bridge.layoutPageImage!({ url: scrambled, width: 900, height: 900, headers: {}, context: { order: "1a1", cols: "9" } })).toBeNull();
  });
});

test("links", async () => {
  const bridge = mangago(host().caps);
  expect(await bridge.resolveUrl!("https://www.mangago.me/read-manga/bj_alex/")).toEqual({ seriesId: "bj_alex" });
  expect(await bridge.resolveUrl!("https://www.mangago.me/read-manga/bj_alex/uu/br_chapter-246211/pg-1/")).toEqual({ seriesId: "bj_alex", chapterId: "uu/br_chapter-246211/pg-1/" });
  expect(await bridge.resolveUrl!("https://www.mangago.me/genre/all/")).toBeNull();
});
