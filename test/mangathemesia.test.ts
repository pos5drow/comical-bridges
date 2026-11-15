/**
 * The MangaThemesia engine (first site: King of Shojo) against fixtures cut from the site (Nov 2026):
 * browse URLs and cards, genres from the site's filter list, both detail layouts' fields, chapters,
 * the reader's ts_reader config (plain and base64-wrapped), and links.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import kingofshojo from "../src/kingofshojo.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "mangathemesia", name), "utf8");
const GENREZ = '<ul class="genrez"><li><input value="1"><label>Action</label></li><li><input value="7"><label>Romance</label></li></ul>';

function host(route?: (u: URL) => string | undefined) {
  const requests: string[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req.url);
        const u = new URL(req.url);
        const body =
          route?.(u) ??
          (u.pathname === "/manga/" && !u.search ? GENREZ
          : u.pathname === "/manga/" ? fixture("list.html")
          : u.pathname.startsWith("/manga/") ? fixture("series.html")
          : fixture("reader.html"));
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
  test("cards: slug ids, title, cover, type hints, latest chapter; next page from the pager", async () => {
    const { caps, requests } = host();
    const res = await kingofshojo(caps).getListItems!("popular");
    expect(requests[0]).toBe("https://kingofshojo.com/manga/?order=popular&page=1");
    expect(res.items[0]).toMatchObject({
      id: "tears-on-a-withered-flower",
      title: "Tears on a Withered Flower",
      subtitle: "Chapter 126",
      coverForm: "scroll",
    });
    expect(res.items[0]!.thumbnailUrl).toStartWith("https://i2.wp.com/kingofshojo.com/");
    expect(res.nextCursor).toBeDefined();
  });

  test("search carries title, status, type and genre[] values", async () => {
    const { caps, requests } = host();
    await kingofshojo(caps).getSearchResults!({ text: "love", filters: [{ key: "status", value: "ongoing" }, { key: "genres", value: ["1", "7"] }] });
    expect(requests[0]).toBe("https://kingofshojo.com/manga/?title=love&status=ongoing&genre[]=1&genre[]=7&order=&page=1");
  });

  test("genres come from the site's own filter list", async () => {
    const filters = await kingofshojo(host().caps).getFilters!();
    expect(filters.at(-1)).toEqual({ type: "multiselect", key: "genres", label: "Genres", options: [{ value: "1", label: "Action" }, { value: "7", label: "Romance" }] });
  });
});

describe("details, chapters, pages", () => {
  test("details from the info table: placeholders dropped", async () => {
    const info = await kingofshojo(host().caps).getSeriesDetails("tears-on-a-withered-flower");
    expect(info).toMatchObject({ id: "tears-on-a-withered-flower", title: "Tears on a Withered Flower", type: "Manhwa", coverForm: "scroll" });
    expect(info.author).toBeUndefined();
    expect(info.altTitles).toBeUndefined();
    expect(info.tagGroups?.[0]?.tags).toEqual(["Manhwa", "Mature", "Romance"]);
    expect(info.description).toContain("Na Hae-soo");
    expect(info.thumbnailUrl).toStartWith("https://i2.wp.com/");
  });

  test("the other layout's rows are read too", async () => {
    const tsinfo = `<h1 class="entry-title">X</h1><div class="tsinfo"><div class="imptdt">Status <i>Completed</i></div><div class="imptdt">Author <i>Kim, Lee</i></div></div>`;
    const info = await kingofshojo(host((u) => (u.pathname.startsWith("/manga/x") ? tsinfo : undefined)).caps).getSeriesDetails("x");
    expect(info).toMatchObject({ status: "completed", author: "Kim, Lee", authors: [{ name: "Kim" }, { name: "Lee" }] });
  });

  test("chapters: path ids, number, date", async () => {
    const chapters = await kingofshojo(host().caps).getChapters!("tears-on-a-withered-flower");
    expect(chapters[0]).toEqual({
      id: "tears-on-a-withered-flower-chapter-126",
      name: "Chapter 126",
      number: 126,
      publishedAt: Date.UTC(2026, 10, 7),
    });
  });

  test("pages from ts_reader, plain or base64-wrapped", async () => {
    const plain = await kingofshojo(host().caps).getChapterPages!("s", "tears-on-a-withered-flower-chapter-100");
    expect(plain.map((p) => p.imageUrl)).toEqual([
      "https://cdn.kingofshojo.com/king-bucket/136046/100/001.jpg",
      "https://cdn.kingofshojo.com/king-bucket/136046/100/002.jpg",
    ]);
    const wrapped = `<script src="data:text/javascript;base64,${btoa('ts_reader.run({"sources":[{"images":["https://cdn.example/1.jpg"]}]});')}"></script>`;
    const b64 = await kingofshojo(host(() => wrapped).caps).getChapterPages!("s", "x-chapter-1");
    expect(b64.map((p) => p.imageUrl)).toEqual(["https://cdn.example/1.jpg"]);
  });
});

describe("links", () => {
  test("a series link without a fetch; a reader link through its back link", async () => {
    const { caps, requests } = host();
    const bridge = kingofshojo(caps);
    expect(await bridge.resolveUrl!("https://kingofshojo.com/manga/tears-on-a-withered-flower/")).toEqual({ seriesId: "tears-on-a-withered-flower" });
    expect(requests).toEqual([]);
    expect(await bridge.resolveUrl!("https://kingofshojo.com/tears-on-a-withered-flower-chapter-100/")).toEqual({
      seriesId: "tears-on-a-withered-flower",
      chapterId: "tears-on-a-withered-flower-chapter-100",
    });
    expect(await bridge.resolveUrl!("https://elsewhere.com/manga/x/")).toBeNull();
  });
});
