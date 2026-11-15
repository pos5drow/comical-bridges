/**
 * ZonaTMO against fixtures cut from the site (Nov 2026): the library's ajax view (popular, search,
 * filters, sort), latest uploads mapped to their series through the cover id, details from the new
 * page header, chapters from both the shown and the folded lists, viewer pages, and links.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import { nextPageCursor } from "@comical/sdk";
import zonatmo from "../src/zonatmo.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "zonatmo", name), "utf8");

function host() {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req);
        const p = new URL(req.url).pathname;
        const body =
          p === "/biblioteca" ? fixture("library.json")
          : p === "/ultimas-subidas" ? fixture("latest.html")
          : p.startsWith("/view_uploads/") ? fixture("viewer.html")
          : fixture("series.html");
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, requests };
}

describe("lists and search", () => {
  test("popular: the library's ajax view, cards with ids, covers, types and the +18 badge", async () => {
    const { caps, requests } = host();
    const res = await zonatmo(caps).getListItems!("popular");
    expect(requests[0]!.url).toBe("https://zonatmo.org/biblioteca?title=&filter_by=title&order_item=likes_count&order_dir=desc&_pg=1&page=1");
    expect(requests[0]!.headers?.["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(res.items).toHaveLength(3);
    expect(res.items[0]).toEqual({
      id: "31352",
      title: "La Ventura Del Caballero Blanco",
      thumbnailUrl: "https://zonatmo.org/tc/31352-271f224fe0.webp?r=2",
      contentRating: "adult",
      coverForm: "scroll",
      readingDirection: "vertical",
    });
    expect(res.nextCursor).toBeDefined();
  });

  test("search: text, filters (genres repeated) and sort", async () => {
    const { caps, requests } = host();
    await zonatmo(caps).getSearchResults!({
      text: "solo",
      filters: [{ key: "type", value: "manhwa" }, { key: "genders", value: ["1", "27"] }],
      sort: { key: "score", ascending: true },
      cursor: nextPageCursor(1, true),
    });
    const q = new URL(requests[0]!.url).searchParams;
    expect(q.get("title")).toBe("solo");
    expect(q.get("type")).toBe("manhwa");
    expect(q.getAll("genders[]")).toEqual(["1", "27"]);
    expect([q.get("order_item"), q.get("order_dir"), q.get("page")]).toEqual(["score", "asc", "2"]);
  });

  test("latest: uploads become their series once each, the id from the cover", async () => {
    const { caps, requests } = host();
    const res = await zonatmo(caps).getListItems!("latest");
    expect(requests[0]!.url).toBe("https://zonatmo.org/ultimas-subidas?page=1");
    expect(res.items.map((e) => [e.id, e.title, e.subtitle, e.contentRating])).toEqual([
      ["33440", "Mika", "Capítulo 5", undefined],
      ["33296", "Como sobrevivir como un sirviente obsesivo", "Capítulo 12", undefined],
      ["33473", "Mi Papi", "Capítulo 19", "adult"],
    ]);
    expect(res.items[0]).toMatchObject({ coverForm: "volume", readingDirection: "rtl" });
    expect(res.nextCursor).toBeDefined();
  });
});

describe("details, chapters, pages", () => {
  test("details from the page header; any type and slug redirect to the series", async () => {
    const { caps, requests } = host();
    const info = await zonatmo(caps).getSeriesDetails("6426");
    expect(requests[0]!.url).toBe("https://zonatmo.org/library/manga/6426/-");
    expect(info).toMatchObject({
      id: "6426",
      title: "Solo Leveling",
      shareUrl: "https://zonatmo.org/library/manhwa/6426/solo-leveling",
      type: "Manhwa",
      status: "completed",
      author: "jang, sung-rak",
      thumbnailUrl: "https://storage.zonatmo.org/proxy/aad1b611e20cedfe4a8fa93d0325c85b.webp",
    });
    expect(info.altTitles).toContain("I Level Up Alone");
    expect(info.tagGroups?.[0]?.tags).toContain("Acción");
    expect(info.contentRating).toBeUndefined();
    expect(info.description).toStartWith("Hace 10 años");
  });

  test("chapters from both lists, one per upload, with group and date", async () => {
    const chapters = await zonatmo(host().caps).getChapters!("6426");
    expect(chapters.map((c) => [c.number, c.name])).toEqual([
      [201, "Capítulo 201"],
      [200.5, "Capítulo 200.5"],
      [192, "Capítulo 192"],
    ]);
    expect(chapters[0]).toEqual({ id: "969671", name: "Capítulo 201", number: 201, group: "TMO Bot", publishedAt: Date.UTC(2026, 4, 27) });
  });

  test("pages from the reader", async () => {
    const pages = await zonatmo(host().caps).getChapterPages!("6426", "969671");
    expect(pages.map((p) => p.imageUrl)).toEqual([1, 2, 3].map((n) => `https://storage.zonatmo.org/chapters/969671/${n}.webp`));
  });

  test("a malformed id is gone without a request", async () => {
    const { caps, requests } = host();
    await expect(zonatmo(caps).getSeriesDetails("manhwa/6426")).rejects.toThrow(/removed from the source/);
    expect(requests).toEqual([]);
  });
});

test("links: library links directly; an upload link through the series its reader names", async () => {
  const { caps, requests } = host();
  const bridge = zonatmo(caps);
  expect(await bridge.resolveUrl!("https://zonatmo.org/library/manhwa/6426/solo-leveling")).toEqual({ seriesId: "6426" });
  expect(requests).toEqual([]);
  expect(await bridge.resolveUrl!("https://zonatmo.org/view_uploads/969671")).toEqual({ seriesId: "6426", chapterId: "969671" });
  expect(await bridge.resolveUrl!("https://zonatmo.org/biblioteca?type=manhwa")).toBeNull();
});
