/**
 * Cubari: links of every hosted kind mapped to `{source}/{slug}`, search as link lookup, details from
 * a gist's description lines, chapters per group, and pages both inline and behind a chapter link.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import cubari, { cubariRef } from "../src/cubari.ts";

const SERIES = {
  title: "My Comic",
  author: "Ann",
  cover: "https://img/cover.jpg",
  description: "A story.\nStatus: Ongoing\nTags: Fantasy, Comedy",
  groups: { "0": "Team A", "1": "Team B" },
  chapters: {
    "2": { volume: "1", title: "Two", groups: { "0": ["https://img/2a.jpg", { src: "https://img/2b.jpg" }] }, release_date: { "0": 1700000000 } },
    "1": { volume: "Uncategorized", title: "", groups: { "0": "/read/api/gist/chapter/abc/", "1": ["https://img/1.jpg"] } },
  },
};

function host() {
  const requests: string[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req.url);
        const body = req.url.includes("/chapter/abc/") ? JSON.stringify(["https://img/l1.jpg", "https://img/l2.jpg"]) : JSON.stringify(SERIES);
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, requests };
}

describe("cubariRef", () => {
  test.each([
    ["https://imgur.com/a/AbC12", { source: "imgur", slug: "AbC12" }],
    ["https://www.reddit.com/gallery/xyz", { source: "reddit", slug: "xyz" }],
    ["https://imgchest.com/p/q1w2", { source: "imgchest", slug: "q1w2" }],
    ["https://catbox.moe/c/zz9", { source: "catbox", slug: "zz9" }],
    ["https://cubari.moe/read/mangadex/a1c7/", { source: "mangadex", slug: "a1c7" }],
    ["cubari:imgur/AbC12", { source: "imgur", slug: "AbC12" }],
    ["gist/c29tZQ", { source: "gist", slug: "c29tZQ" }],
  ])("%p", (input, ref) => expect(cubariRef(input)).toEqual(ref));

  test("a raw GitHub file becomes a gist slug: base64 of host label + path, unpadded", () => {
    expect(cubariRef("https://raw.githubusercontent.com/u/r/main/x.json")).toEqual({ source: "gist", slug: btoa("raw/u/r/main/x.json").replace(/=+$/, "") });
  });

  test("anything else is not a Cubari link", () => {
    expect(cubariRef("one piece")).toBeUndefined();
    expect(cubariRef("https://example.com/a/b")).toBeUndefined();
  });
});

describe("bridge", () => {
  test("search is a link lookup; plain text finds nothing", async () => {
    const { caps, requests } = host();
    const bridge = cubari(caps);
    expect((await bridge.getSearchResults!({ text: "one piece" })).items).toEqual([]);
    expect(requests).toEqual([]);
    const res = await bridge.getSearchResults!({ text: "https://imgur.com/a/AbC12" });
    expect(requests[0]).toBe("https://cubari.moe/read/api/imgur/series/AbC12/");
    expect(res.items).toEqual([{ id: "imgur/AbC12", title: "My Comic", thumbnailUrl: "https://img/cover.jpg" }]);
  });

  test("details read the description's Status and Tags lines", async () => {
    const info = await cubari(host().caps).getSeriesDetails("imgur/AbC12");
    expect(info).toMatchObject({ description: "A story.", status: "ongoing", author: "Ann", shareUrl: "https://cubari.moe/read/imgur/AbC12/" });
    expect(info.tagGroups?.[0]).toEqual({ label: "Tags", kind: "genre", tags: ["Fantasy", "Comedy"] });
  });

  test("a chapter per group, numbered and named, newest first", async () => {
    const chapters = await cubari(host().caps).getChapters!("imgur/AbC12");
    expect(chapters.map((c) => [c.id, c.name, c.group])).toEqual([
      ["2/0", "Vol.1 Ch.2 - Two", "Team A"],
      ["1/0", "Ch.1", "Team A"],
      ["1/1", "Ch.1", "Team B"],
    ]);
    expect(chapters[0]!.publishedAt).toBe(1700000000000);
  });

  test("pages inline or behind a chapter link", async () => {
    const bridge = cubari(host().caps);
    expect((await bridge.getChapterPages!("imgur/AbC12", "2/0")).map((p) => p.imageUrl)).toEqual(["https://img/2a.jpg", "https://img/2b.jpg"]);
    expect((await bridge.getChapterPages!("imgur/AbC12", "1/0")).map((p) => p.imageUrl)).toEqual(["https://img/l1.jpg", "https://img/l2.jpg"]);
    await expect(bridge.getChapterPages!("imgur/AbC12", "9/0")).rejects.toThrow(/chapter removed/);
  });

  test("links open without a fetch", async () => {
    const { caps, requests } = host();
    expect(await cubari(caps).resolveUrl!("https://imgchest.com/p/q1w2")).toEqual({ seriesId: "imgchest/q1w2" });
    expect(requests).toEqual([]);
  });
});
