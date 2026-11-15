/**
 * Olympus Scanlation against fixtures cut from the live site (Nov 2026): domain discovery through
 * the redirector (cached, overridable), numeric ids with slugs looked up from the catalogue, search
 * over the catalogue, filtered browse, details, paged chapters, reader pages and links.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import olympus from "../src/olympus.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "olympus", name), "utf8");
const SLUG = "20-225-2sabueso13424";

type Reply = { body: string; url?: string; status?: number };

function host(opts: { settings?: Record<string, string>; route?: (u: URL) => Reply | undefined } = {}) {
  const requests: string[] = [];
  const store = new Map<string, string>();
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req.url);
        const u = new URL(req.url);
        const r = opts.route?.(u) ?? site(u);
        return { url: r.url ?? req.url, status: r.status ?? 200, statusText: "OK", headers: {}, body: r.body };
      },
    },
    storage: {
      get: async (k) => store.get(k),
      set: async (k, v) => void store.set(k, v),
      delete: async (k) => void store.delete(k),
      keys: async () => [...store.keys()],
      secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: opts.settings ?? {},
  };
  return { caps, requests, store };
}

function site(u: URL): Reply {
  if (u.host === "olympus.pages.dev") return { body: '<meta property="og:url" content="https://olympusbiblioteca.com/">' };
  if (u.host === "olympusbiblioteca.com") return { body: "<html></html>", url: "https://olympusxyz.com/" };
  const p = u.pathname;
  if (p === "/api/series/list") return { body: fixture("list.json") };
  if (p === "/api/rankings" || p === "/api/new-chapters") return { body: fixture("rankings.json") };
  if (p === "/api/series") return { body: JSON.stringify({ data: { series: { current_page: 1, last_page: 3, data: JSON.parse(fixture("rankings.json")).data } } }) };
  if (p === "/api/genres-statuses") return { body: JSON.stringify({ genres: [{ id: 1, name: "Acción " }], statuses: [] }) };
  if (p.endsWith("/chapters")) return { body: fixture("chapters.json") };
  if (p.startsWith("/api/series/")) return { body: fixture("detail.json") };
  if (p.startsWith("/capitulo/")) return { body: fixture("chapter.html") };
  return { body: "{}", status: 404 };
}

describe("domain", () => {
  test("found through the redirector, then cached", async () => {
    const { caps, requests, store } = host();
    const bridge = olympus(caps);
    await bridge.getListItems!("popular");
    await bridge.getListItems!("popular");
    expect(requests.filter((r) => r.includes("pages.dev"))).toHaveLength(1);
    expect(requests.at(-1)).toBe("https://olympusxyz.com/api/rankings?period=total_ranking&page=1");
    expect(JSON.parse(store.get("domain")!).origin).toBe("https://olympusxyz.com");
  });

  test("a custom domain wins and skips discovery", async () => {
    const { caps, requests } = host({ settings: { customDomain: "https://olympus-nuevo.net" } });
    await olympus(caps).getListItems!("latest");
    expect(requests).toEqual(["https://olympus-nuevo.net/api/new-chapters?page=1"]);
  });

  test("an unreachable redirector falls back to the default", async () => {
    const { caps, requests } = host({ route: (u) => (u.host === "olympus.pages.dev" ? { body: "", status: 500 } : undefined) });
    const bridge = olympus(caps);
    await bridge.getListItems!("popular");
    await bridge.getListItems!("latest");
    expect(requests.filter((r) => !r.includes("pages.dev"))).toEqual([
      "https://olympusxyz.com/api/rankings?period=total_ranking&page=1",
      "https://olympusxyz.com/api/new-chapters?page=1",
    ]);
    // A failed discovery is retried later, not on every request.
    expect(requests.filter((r) => r.includes("pages.dev"))).toHaveLength(1);
  });
});

describe("browse and search", () => {
  test("rankings: numeric ids, comics only, next page from the paging", async () => {
    const res = await olympus(host().caps).getListItems!("popular");
    expect(res.items[0]).toMatchObject({ id: "743", title: "La venganza del sabueso de sangre de hierro" });
    expect(res.nextCursor).toBeDefined();
  });

  test("text search runs over the catalogue, accent- and case-insensitive, novels left out", async () => {
    const bridge = olympus(host().caps);
    expect((await bridge.getSearchResults!({ text: "SABUESO hierro" })).items.map((e) => e.id)).toEqual(["743"]);
    expect((await bridge.getSearchResults!({ text: "cronicas demonio" })).items.map((e) => e.id)).toEqual(["5"]);
    expect((await bridge.getSearchResults!({ text: "bj ARCHIMAGO" })).items.map((e) => e.id)).toEqual(["4"]);
    expect((await bridge.getSearchResults!({ text: "novela" })).items).toEqual([]);
  });

  test("an empty search browses with genre, status and direction", async () => {
    const { caps, requests } = host();
    const res = await olympus(caps).getSearchResults!({
      text: "",
      filters: [{ key: "genre", value: "1" }, { key: "status", value: "4" }],
      sort: { key: "recent", ascending: true },
    });
    expect(Object.fromEntries(new URL(requests.at(-1)!).searchParams)).toEqual({ page: "1", direction: "asc", type: "comic", genres: "1", status: "4" });
    expect(res.nextCursor).toBeDefined();
  });

  test("genre options are trimmed", async () => {
    const filters = await olympus(host().caps).getFilters!();
    expect(filters[0]).toMatchObject({ key: "genre", options: [{ value: "1", label: "Acción" }] });
  });
});

describe("details, chapters, pages", () => {
  test("details use the slug from the catalogue", async () => {
    const { caps, requests } = host();
    const info = await olympus(caps).getSeriesDetails("743");
    expect(requests.some((r) => r.endsWith(`/api/series/${SLUG}?type=comic`))).toBe(true);
    expect(info).toMatchObject({ id: "743", title: "La venganza del sabueso de sangre de hierro", status: "ongoing" });
    expect(info.authors).toBeUndefined();
    expect(info.tagGroups?.[0]?.tags).toEqual(["Reencarnación", "Shonen"]);
    expect(info.shareUrl).toBe(`https://olympusxyz.com/series/comic-${SLUG}`);
  });

  test("chapters: id, Spanish name, number, date, team", async () => {
    const chapters = await olympus(host().caps).getChapters!("743");
    expect(chapters[0]).toEqual({ id: "135315", name: "Capítulo 188", number: 188, publishedAt: Date.parse("2026-11-08T14:14:39Z"), group: "Olympus" });
  });

  test("pages from the reader", async () => {
    const pages = await olympus(host().caps).getChapterPages!("743", "135315");
    expect(pages.map((p) => p.imageUrl)).toEqual([
      "https://media.imagesolymp.xyz/comics/743/135315/0_1.webp",
      "https://media.imagesolymp.xyz/comics/743/135315/0.webp",
      "https://media.imagesolymp.xyz/comics/743/135315/01_01.webp",
    ]);
  });

  test("an id the catalogue doesn't know, even after a reload, is gone", async () => {
    await expect(olympus(host().caps).getSeriesDetails("123456")).rejects.toThrow(/removed from the source/);
  });
});

describe("links", () => {
  test("series and chapter links map slugs back to ids", async () => {
    const bridge = olympus(host().caps);
    expect(await bridge.resolveUrl!(`https://olympusxyz.com/series/comic-${SLUG}`)).toEqual({ seriesId: "743" });
    expect(await bridge.resolveUrl!(`https://olympusxyz.com/capitulo/135315/comic-${SLUG}`)).toEqual({ seriesId: "743", chapterId: "135315" });
    expect(await bridge.resolveUrl!("https://olympusxyz.com/series/comic-nope")).toBeNull();
    expect(await bridge.resolveUrl!("https://olympusxyz.com/biblioteca")).toBeNull();
  });
});
