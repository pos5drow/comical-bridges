/**
 * MANGA Plus against protobuf responses captured from its API (Nov 2026, repeated lists trimmed):
 * rankings and updates in the chosen language, search over the catalogue or the genre view, details,
 * the readable chapters, and pages whose view token rides the URL to the interceptor and whose XOR
 * key rides the process context to the decoder.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import { ProtoMessage } from "../src/core/protobuf.ts";
import mangaplus from "../src/mangaplus.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "mangaplus", name));

function host(settings: Record<string, string | boolean> = {}) {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req);
        const u = new URL(req.url);
        const p = u.pathname;
        const name =
          p.endsWith("/rankingV2") ? "ranking.bin"
          : p.endsWith("/web_homeV4") ? "home.bin"
          : p.endsWith("/allV2") ? "all.bin"
          : p.endsWith("/all_v3") ? "all_v3.bin"
          : p.endsWith("/title_detailV3") ? "detail.bin"
          : u.searchParams.get("chapter_id") === "1" ? "gone.bin"
          : "viewer.bin";
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body: fixture(name).toString("base64") };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings,
  };
  return { caps, requests };
}

test("protobuf reader: varints, strings, nested and repeated messages", () => {
  // {1: 150, 2: "hi", 3: {1: 7}, 3: {1: 8}}
  const m = new ProtoMessage(new Uint8Array([0x08, 0x96, 0x01, 0x12, 0x02, 0x68, 0x69, 0x1a, 0x02, 0x08, 0x07, 0x1a, 0x02, 0x08, 0x08]));
  expect([m.int(1), m.str(2), m.msgs(3).map((s) => s.int(1)), m.msg(3)?.int(1), m.has(9)]).toEqual([150, "hi", [7, 8], 8, false]);
  expect(() => new ProtoMessage(new Uint8Array([0x12, 0x05, 0x68]))).toThrow(/truncated/);
});

describe("lists and search", () => {
  test("rankings: binary responses, a session token, titles in the chosen language only", async () => {
    const { caps, requests } = host();
    const res = await mangaplus(caps).getListItems!("hottest");
    expect(requests[0]!.url).toBe("https://jumpg-webapi.tokyo-cdn.com/api/title_list/rankingV2?lang=eng&type=hottest&clang=eng");
    expect(requests[0]!.responseType).toBe("base64");
    expect(requests[0]!.headers?.["SESSION-TOKEN"]).toMatch(/^[0-9a-f]{32}$/);
    expect(res.items[0]).toMatchObject({ id: "100020", title: "One Piece", subtitle: "Eiichiro Oda" });
    expect(res.items[1]!.subtitle).toBe("Masashi Kishimoto, Mikio Ikemoto");
    expect(res.items.some((e) => e.title === "วันพีซ")).toBe(false);
  });

  test("another language picks its own titles and API language", async () => {
    const { caps, requests } = host({ language: "th" });
    const res = await mangaplus(caps).getListItems!("hottest");
    expect(requests[0]!.url).toContain("lang=tha");
    expect(res.items.map((e) => e.title)).toContain("วันพีซ");
  });

  test("updates, newest first", async () => {
    const res = await mangaplus(host().caps).getListItems!("latest");
    expect(res.items.slice(0, 2).map((e) => e.title)).toEqual(["Hero Organization", "Subaru the Invincible"]);
  });

  test("search: the whole catalogue by title, or the genre view", async () => {
    const { caps, requests } = host();
    const bridge = mangaplus(caps);
    expect((await bridge.getSearchResults!({ text: "orange" })).items.map((e) => e.title)).toEqual(["Apple to Orange"]);
    const comedy = await bridge.getSearchResults!({ text: "", filters: [{ key: "genre", value: "comedy" }] });
    expect(requests.map((r) => new URL(r.url).pathname.split("/").pop())).toEqual(["allV2", "all_v3"]);
    expect(requests[1]!.url).toContain("type=serializing");
    expect(comedy.items.slice(0, 2).map((e) => e.title)).toEqual(["Phantasma Lily", "Hey! Devil Girl!"]);
  });
});

describe("details, chapters, pages", () => {
  test("details", async () => {
    const info = await mangaplus(host().caps).getSeriesDetails("100020");
    expect(info).toMatchObject({ id: "100020", title: "One Piece", author: "Eiichiro Oda", status: "ongoing", shareUrl: "https://mangaplus.shueisha.co.jp/titles/100020" });
    expect(info.tagGroups?.[0]?.tags).toEqual(["Battle / Action", "Sci-Fi / Fantasy"]);
    expect(info.description).toContain("The latest 3 chapters are viewable");
  });

  test("a title in another language is refused", async () => {
    await expect(mangaplus(host({ language: "es" }).caps).getSeriesDetails("100020")).rejects.toThrow(/isn't published in the language/);
  });

  test("only readable chapters, newest first, numbered from their label", async () => {
    const chapters = await mangaplus(host().caps).getChapters!("100020");
    expect(chapters.map((c) => c.number)).toEqual([1198, 1197, 1196, 3, 2, 1]);
    expect(chapters[0]).toEqual({ id: "1030906", name: "Chapter 1198: Island of Monsters", number: 1198, publishedAt: 1794150000000 });
  });

  test("pages: the settings in the viewer request, the token in the fragment, the key in the context", async () => {
    const { caps, requests } = host({ quality: "high", split: false });
    const bridge = mangaplus(caps);
    const pages = await bridge.getChapterPages!("100020", "1030906");
    expect(requests[0]!.url).toContain("chapter_id=1030906&split=no&img_quality=high&clang=eng");
    expect(pages).toHaveLength(17);
    expect(pages[0]!.imageUrl).toEndWith(".jpg?hash=qmoNOwm7wUUl3BCLpGZlcw&expires=1794736800#vw=51a7358954e52065e3996f610544bd33");
    expect(pages[0]!.process?.context?.xor).toMatch(/^9a8b66b0[0-9a-f]{120}$/);

    expect(await bridge.interceptImageRequest!(pages[0]!.imageUrl)).toEqual({
      url: pages[0]!.imageUrl.split("#")[0]!,
      headers: { "Plus-Vw-Token": "51a7358954e52065e3996f610544bd33" },
    });
    expect(mangaplus(caps).info.images?.intercept).toEqual(["jumpg-assets3.tokyo-cdn.com"]);

    const transforms = await bridge.decodePageImage!({ url: pages[0]!.imageUrl, headers: {}, context: pages[0]!.process!.context! });
    expect(transforms).toHaveLength(1);
    const key = Buffer.from((transforms![0] as { key: string }).key, "base64").toString("hex");
    expect(key).toBe(pages[0]!.process!.context!["xor"] as string);
    expect(await bridge.decodePageImage!({ url: "x", headers: {}, context: {} })).toBeNull();
  });

  test("an expired chapter is gone, in the site's terms", async () => {
    await expect(mangaplus(host().caps).getChapterPages!("100020", "1")).rejects.toThrow(/chapter no longer readable/);
  });
});

test("links: titles and share links directly, a viewer link through its title", async () => {
  const { caps, requests } = host();
  const bridge = mangaplus(caps);
  expect(await bridge.resolveUrl!("https://mangaplus.shueisha.co.jp/titles/100020")).toEqual({ seriesId: "100020" });
  expect(await bridge.resolveUrl!("https://mangaplus.shueisha.co.jp/sns_share?title_id=100020")).toEqual({ seriesId: "100020" });
  expect(requests).toEqual([]);
  expect(await bridge.resolveUrl!("https://mangaplus.shueisha.co.jp/viewer/1030906")).toEqual({ seriesId: "100020", chapterId: "1030906" });
  expect(await bridge.resolveUrl!("https://mangaplus.shueisha.co.jp/updates")).toBeNull();
});
