/**
 * Opening a pasted web link (`linkHosts` + `resolveUrl`, contract 2.1). Series links parse with no
 * fetch; a chapter link that doesn't name its series is looked up once.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import atsumaru from "../src/bridge.ts";
import mangadex from "../src/mangadex.ts";
import weebcentral from "../src/weebcentral.ts";

/** A host that answers every request with `respond(url)` and records what was fetched. */
function host(respond: (url: string) => string = () => "{}") {
  const urls: string[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        urls.push(req.url);
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body: respond(req.url) };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { caps, urls };
}

describe("atsumaru resolveUrl", () => {
  const { caps, urls } = host();
  const bridge = atsumaru(caps);

  test("declares its site", () => {
    expect(bridge.info.linkHosts).toEqual(["atsu.moe"]);
  });

  test("opens series and reader links without fetching", async () => {
    expect(await bridge.resolveUrl!("https://atsu.moe/manga/v8Kbg")).toEqual({ seriesId: "v8Kbg" });
    expect(await bridge.resolveUrl!("https://atsu.moe/manga/v8Kbg/chapters?x=1")).toEqual({ seriesId: "v8Kbg" });
    expect(await bridge.resolveUrl!("https://atsu.moe/read/v8Kbg/ch1#p3")).toEqual({ seriesId: "v8Kbg", chapterId: "ch1" });
    expect(urls).toEqual([]);
  });

  test("ignores other pages", async () => {
    for (const url of ["https://atsu.moe/", "https://atsu.moe/search?q=x", "https://atsu.moe/novel/abc", "https://atsu.moe/read/only"]) {
      expect(await bridge.resolveUrl!(url)).toBeNull();
    }
  });
});

describe("mangadex resolveUrl", () => {
  const SERIES = "a1c7c817-4e59-43b7-9365-09675a149a6f";
  const CHAPTER = "0b5e6a1d-6b0a-4f5e-9d0c-2b7f4c1e9a10";

  test("declares its site", () => {
    expect(mangadex(host().caps).info.linkHosts).toEqual(["mangadex.org"]);
  });

  test("opens a title link without fetching", async () => {
    const { caps, urls } = host();
    const bridge = mangadex(caps);
    expect(await bridge.resolveUrl!(`https://mangadex.org/title/${SERIES}/one-piece`)).toEqual({ seriesId: SERIES });
    expect(await bridge.resolveUrl!(`https://mangadex.org/title/${SERIES.toUpperCase()}`)).toEqual({ seriesId: SERIES });
    expect(urls).toEqual([]);
  });

  test("looks a chapter link up for its series", async () => {
    const { caps, urls } = host((url) =>
      url.endsWith(`/chapter/${CHAPTER}`)
        ? JSON.stringify({
            result: "ok",
            data: { id: CHAPTER, relationships: [{ id: "g1", type: "scanlation_group" }, { id: SERIES, type: "manga" }] },
          })
        : "{}",
    );
    const bridge = mangadex(caps);
    expect(await bridge.resolveUrl!(`https://mangadex.org/chapter/${CHAPTER}/2`)).toEqual({ seriesId: SERIES, chapterId: CHAPTER });
    expect(urls).toHaveLength(1);
  });

  test("a chapter with no series, or any other page, opens nothing", async () => {
    const bridge = mangadex(host(() => JSON.stringify({ result: "ok", data: { id: CHAPTER, relationships: [] } })).caps);
    expect(await bridge.resolveUrl!(`https://mangadex.org/chapter/${CHAPTER}`)).toBeNull();
    expect(await bridge.resolveUrl!("https://mangadex.org/titles/latest")).toBeNull();
    expect(await bridge.resolveUrl!("https://mangadex.org/title/not-a-uuid")).toBeNull();
  });
});

describe("weebcentral resolveUrl", () => {
  const SERIES = "01J76XYCERXE60T7FKXVCCAQ0H";
  const CHAPTER = "01J76XZ2A9Y4WQAXQ0D3RKH8ZB";

  test("declares its site", () => {
    expect(weebcentral(host().caps).info.linkHosts).toEqual(["weebcentral.com"]);
  });

  test("opens a series link without fetching", async () => {
    const { caps, urls } = host();
    const bridge = weebcentral(caps);
    expect(await bridge.resolveUrl!(`https://weebcentral.com/series/${SERIES}/One-Piece`)).toEqual({ seriesId: SERIES });
    expect(urls).toEqual([]);
  });

  test("follows a chapter page back to its series", async () => {
    // The nav's random link and the share buttons come first on the real page.
    const page = `<html><body><a href="/series/random">Random</a>
      <a href="https://twitter.com/intent/tweet?text=https://weebcentral.com/series/${SERIES}">Share</a>
      <a href="https://weebcentral.com/series/${SERIES}/One-Piece">One Piece</a></body></html>`;
    const { caps, urls } = host(() => page);
    const bridge = weebcentral(caps);
    expect(await bridge.resolveUrl!(`https://weebcentral.com/chapters/${CHAPTER}`)).toEqual({ seriesId: SERIES, chapterId: CHAPTER });
    expect(urls).toEqual([`https://weebcentral.com/chapters/${CHAPTER}`]);
  });

  test("a chapter page with no series link, or any other page, opens nothing", async () => {
    const bridge = weebcentral(host(() => "<html><body></body></html>").caps);
    expect(await bridge.resolveUrl!(`https://weebcentral.com/chapters/${CHAPTER}`)).toBeNull();
    expect(await bridge.resolveUrl!("https://weebcentral.com/search?text=x")).toBeNull();
  });
});
