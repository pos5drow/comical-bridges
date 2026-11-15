/**
 * Flame Comics against fixtures cut from its Next.js data routes (Nov 2026): the build id read from
 * the home page and refreshed after a redeploy's 404, popularity order, search and filters over the
 * catalogue, details, chapters by token, pages in image order, and links.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import flame from "../src/flamecomics.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "flamecomics", name), "utf8");
const home = (id: string) => `<script id="__NEXT_DATA__" type="application/json">{"buildId":"${id}"}</script>`;

function host(opts: { buildIds?: string[]; live?: string } = {}) {
  const ids = [...(opts.buildIds ?? ["B1"])];
  const live = opts.live ?? ids.at(-1)!;
  const requests: string[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req.url);
        const u = new URL(req.url);
        const reply = (body: string, status = 200): HttpResponse => ({ url: req.url, status, statusText: "", headers: {}, body });
        if (u.pathname === "/") return reply(home(ids.length > 1 ? ids.shift()! : ids[0]!));
        const m = /^\/_next\/data\/([^/]+)\/(.+)$/.exec(u.pathname);
        if (!m) return reply("", 404);
        if (m[1] !== live) return reply("Not Found", 404);
        const p = m[2]!;
        if (p === "browse.json") return reply(fixture("browse.json"));
        if (p === "latest.json") return reply(JSON.stringify({ pageProps: { allSeries: JSON.parse(fixture("browse.json")).pageProps.series.slice(0, 1) } }));
        if (/^series\/\d+\.json$/.test(p)) return reply(fixture("series.json"));
        return reply(fixture("chapter.json"));
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, requests };
}

describe("build id", () => {
  test("read once, then reused", async () => {
    const { caps, requests } = host();
    const bridge = flame(caps);
    await bridge.getListItems!("popular");
    await bridge.getListItems!("latest");
    expect(requests.filter((r) => r === "https://flamecomics.xyz")).toHaveLength(1);
    expect(requests).toContain("https://flamecomics.xyz/_next/data/B1/latest.json");
  });

  test("a redeploy's 404 re-reads it once and retries", async () => {
    const { caps, requests } = host({ buildIds: ["OLD", "NEW"], live: "NEW" });
    const res = await flame(caps).getListItems!("popular");
    expect(res.items).toHaveLength(3);
    expect(requests.filter((r) => r.includes("/_next/data/"))).toEqual([
      "https://flamecomics.xyz/_next/data/OLD/browse.json",
      "https://flamecomics.xyz/_next/data/NEW/browse.json",
    ]);
  });
});

describe("browse and search", () => {
  test("popular is the catalogue in rank order, with CDN covers", async () => {
    const res = await flame(host().caps).getListItems!("popular");
    expect(res.items.map((e) => e.id)).toEqual(["158", "165", "99"]);
    expect(res.items[1]!.thumbnailUrl).toBe("https://cdn.flamecomics.xyz/uploads/images/series/165/thumbnail.webp?1786358505");
  });

  test("search and filters run over the catalogue", async () => {
    const bridge = flame(host().caps);
    expect((await bridge.getSearchResults!({ text: "48 HOURS" })).items.map((e) => e.id)).toEqual(["99"]);
    expect((await bridge.getSearchResults!({ text: "", filters: [{ key: "status", value: "dropped" }] })).items.map((e) => e.id)).toEqual(["99"]);
    const genres = (await bridge.getFilters!()).find((f) => f.key === "genres");
    expect(genres).toMatchObject({ type: "multiselect" });
  });
});

describe("details, chapters, pages", () => {
  test("details", async () => {
    const info = await flame(host().caps).getSeriesDetails("165");
    expect(info).toMatchObject({
      id: "165",
      title: "30 Years Have Passed Since the Prologue",
      status: "ongoing",
      type: "Manhwa",
      author: "Markellaha",
      artist: "Studio GreenKirin",
      altTitles: ["30 Years Since the Prologue"],
      shareUrl: "https://flamecomics.xyz/series/165",
    });
    expect(info.tagGroups?.[0]?.tags).toContain("Academy");
  });

  test("chapters by token, numbered, dated", async () => {
    const chapters = await flame(host().caps).getChapters!("165");
    expect(chapters[0]).toEqual({
      id: "c4d31542ab40ff65",
      name: "Chapter 23 - There's Always an Attack at the Academy Practical Lesson (5)",
      number: 23,
      publishedAt: 1793849382000,
    });
  });

  test("pages in image order, on the CDN", async () => {
    const pages = await flame(host().caps).getChapterPages!("165", "c4d31542ab40ff65");
    expect(pages.map((p) => p.imageUrl)).toEqual([
      "https://cdn.flamecomics.xyz/uploads/images/series/165/c4d31542ab40ff65/30YRS-23-00.jpg?1793849382",
      expect.stringMatching(/^https:\/\/cdn\.flamecomics\.xyz\/uploads\/images\/series\/165\/c4d31542ab40ff65\/.+\?1793849382$/),
    ]);
  });
});

test("links", async () => {
  const bridge = flame(host().caps);
  expect(await bridge.resolveUrl!("https://flamecomics.xyz/series/165")).toEqual({ seriesId: "165" });
  expect(await bridge.resolveUrl!("https://flamecomics.xyz/series/165/c4d31542ab40ff65")).toEqual({ seriesId: "165", chapterId: "c4d31542ab40ff65" });
  expect(await bridge.resolveUrl!("https://flamecomics.xyz/browse")).toBeNull();
});
