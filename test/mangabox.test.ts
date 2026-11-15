/**
 * The MangaBox engine (Mangakakalot, Manganato, Mangabat) against fixtures cut from the live sites
 * (Nov 2026): listing, search and browse URLs, card/detail/chapter/page parsing, domain settings, and
 * the kit guards (Cloudflare challenge → back-off, redirect off-site → "moved").
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import { parseChallenge } from "@comical/sdk";
import mangabat from "../src/mangabat.ts";
import mangakakalot from "../src/mangakakalot.ts";
import manganato from "../src/manganato.ts";
import { normaliseQuery } from "../src/engines/mangabox.ts";

const FIX = join(import.meta.dir, "fixtures", "mangabox");
const fixture = (name: string) => readFileSync(join(FIX, name), "utf8");

type Responder = (req: HttpRequest) => Partial<HttpResponse> & { body: string };

function host(respond: Responder, settings: Record<string, string> = {}) {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req);
        return { url: req.url, status: 200, statusText: "OK", headers: {}, ...respond(req) };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings,
  };
  return { caps, requests };
}

/** Routes the fixture set by URL shape. */
const site: Responder = (req) => {
  const u = req.url;
  if (u.includes("/api/manga/")) return { body: fixture("chapters.json"), headers: { "content-type": "application/json" } };
  if (u.includes("/search/story/")) return { body: fixture("search.html") };
  if (/\/manga\/[^/]+\/chapter-/.test(u)) return { body: fixture("chapter.html") };
  if (/\/manga\/[^/?]+$/.test(u)) return { body: fixture("details.html") };
  return { body: fixture("list.html") };
};

describe("info", () => {
  test("three sites, one engine, distinct ids and domains", () => {
    const infos = [mangakakalot, manganato, mangabat].map((f) => f(host(site).caps).info);
    expect(infos.map((i) => i.id)).toEqual(["pos5drow.mangakakalot", "pos5drow.manganato", "pos5drow.mangabat"]);
    for (const i of infos) {
      expect(i.capabilities).toEqual(["lists", "search", "filters", "sort", "settings"]);
      expect(i.images?.hosts).toContain("2xstorage.com");
      expect(i.images?.headers?.Referer).toMatch(/^https:\/\/www\./);
    }
    expect(infos[0]!.linkHosts).toEqual(["kakamanga.com", "mangakakalove.com", "mangakakalot.gg"]);
  });
});

describe("listings", () => {
  test("cards: slug ids, title, cover, latest chapter; next page from the pager", async () => {
    const { caps, requests } = host(site);
    const res = await manganato(caps).getListItems!("hot");
    expect(requests[0]!.url).toBe("https://www.manganato.gg/manga-list/hot-manga?page=1");
    expect(res.items).toHaveLength(3);
    expect(res.items[0]).toEqual({
      id: "martial-peak",
      title: "Martial Peak",
      thumbnailUrl: "https://img-r1.2xstorage.com/thumb/martial-peak.webp",
      subtitle: "Chapter 3862",
    });
    expect(res.nextCursor).toBeDefined();
  });

  test("search normalises the query into the site's slug and parses the search layout", async () => {
    const { caps, requests } = host(site);
    const res = await mangabat(caps).getSearchResults!({ text: "Solo Leveling!" });
    expect(requests[0]!.url).toBe("https://www.mangabats.com/search/story/solo_leveling?page=1");
    expect(res.items[0]).toMatchObject({ id: "solo-leveling", title: "Solo Leveling", subtitle: "Chapter 200" });
    expect(res.nextCursor).toBeDefined();
  });

  test("an empty search browses a genre with sort × status packed into one filter id", async () => {
    const { caps, requests } = host(site);
    const bridge = manganato(caps);
    await bridge.getSearchResults!({ text: "", filters: [{ key: "genre", value: "action" }, { key: "status", value: "completed" }], sort: { key: "latest", ascending: false } });
    await bridge.getSearchResults!({ text: "" });
    expect(requests.map((r) => r.url)).toEqual([
      "https://www.manganato.gg/genre/action?filter=5&page=1",
      "https://www.manganato.gg/genre/all?filter=7&page=1",
    ]);
  });

  test("normaliseQuery matches the site's change_alias rule", () => {
    expect(normaliseQuery("  Kimetsu no Yaiba: Đặc biệt! ")).toBe("kimetsu_no_yaiba_dac_biet");
    expect(normaliseQuery("one-piece")).toBe("one_piece");
  });
});

describe("details, chapters, pages", () => {
  test("details", async () => {
    const info = await manganato(host(site).caps).getSeriesDetails("martial-peak");
    expect(info).toMatchObject({
      id: "martial-peak",
      title: "Martial Peak",
      thumbnailUrl: "https://img-r1.2xstorage.com/thumb/martial-peak.webp",
      author: "Momo (Ii)",
      status: "ongoing",
      shareUrl: "https://www.manganato.gg/manga/martial-peak",
      rating: { score: 0.86, votes: 37 },
    });
    expect(info.tagGroups?.[0]?.tags).toEqual(["Fantasy", "Action", "Adventure", "Historical", "Martial arts"]);
    expect(info.description).toStartWith("You are reading Martial Peak manga");
    expect(info.description).not.toContain("summary:");
  });

  test("chapters from the JSON API", async () => {
    const chapters = await manganato(host(site).caps).getChapters!("martial-peak");
    expect(chapters[0]).toEqual({
      id: "chapter-3862",
      name: "Chapter 3862",
      number: 3862,
      publishedAt: Date.parse("2025-12-22T19:57:22.000Z"),
    });
    expect(chapters).toHaveLength(3);
  });

  test("pages from the inline cdns + chapterImages script", async () => {
    const pages = await manganato(host(site).caps).getChapterPages!("martial-peak", "chapter-3862");
    expect(pages.map((p) => p.imageUrl)).toEqual([
      "https://img-r1.2xstorage.com/martial-peak/3862/0.webp",
      "https://img-r1.2xstorage.com/martial-peak/3862/1.webp",
      "https://img-r1.2xstorage.com/martial-peak/3862/2.webp",
    ]);
  });

  test("a 404 series page is series-gone", async () => {
    const { caps } = host(() => ({ status: 404, body: "<title>Error 404</title>" }));
    await expect(manganato(caps).getSeriesDetails("nope")).rejects.toThrow(/removed from the source/);
  });
});

describe("links", () => {
  test("series and chapter links on any of the site's domains, no fetch", async () => {
    const { caps, requests } = host(site);
    const bridge = mangakakalot(caps);
    expect(await bridge.resolveUrl!("https://www.mangakakalot.gg/manga/solo-leveling/chapter-200")).toEqual({ seriesId: "solo-leveling", chapterId: "chapter-200" });
    expect(await bridge.resolveUrl!("https://www.kakamanga.com/manga/solo-leveling")).toEqual({ seriesId: "solo-leveling" });
    expect(await bridge.resolveUrl!("https://www.kakamanga.com/genre/action")).toBeNull();
    expect(requests).toEqual([]);
  });
});

describe("domains and guards", () => {
  test("the domain setting picks a mirror; a custom https origin overrides it", async () => {
    const a = host(site, { domain: "https://www.natomanga.com" });
    await manganato(a.caps).getListItems!("latest");
    expect(a.requests[0]!.url).toBe("https://www.natomanga.com/manga-list/latest-manga?page=1");

    const b = host(site, { domain: "https://www.natomanga.com", customDomain: "https://www.newnato.io" });
    await manganato(b.caps).getListItems!("latest");
    expect(b.requests[0]!.url).toBe("https://www.newnato.io/manga-list/latest-manga?page=1");
  });

  test("a Cloudflare challenge is a web check to pass, with the request's User-Agent, not an empty result", async () => {
    const { caps } = host(() => ({ status: 403, headers: { "cf-mitigated": "challenge" }, body: "<title>Just a moment...</title>" }));
    const err = await mangabat(caps).getSearchResults!({ text: "spy" }).catch((e: Error) => e);
    const challenge = parseChallenge((err as Error).message);
    expect(challenge?.url).toStartWith("https://www.mangabats.com/");
    expect(challenge?.userAgent).toMatch(/^Mozilla\/5\.0/);
  });

  test("a redirect off the site's domains says it moved", async () => {
    const { caps } = host((req) => ({ url: req.url.replace("www.mangabats.com", "parked-domain.net"), body: "<html></html>" }));
    await expect(mangabat(caps).getListItems!("hot")).rejects.toThrow(/parked-domain\.net.*may have moved/);
  });
});
