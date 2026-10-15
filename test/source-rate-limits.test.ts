/**
 * Politeness that lives in the bridges themselves: MangaDex reuses an at-home server assignment
 * instead of spending its tight per-endpoint budget on every re-resolve of a chapter, and Weeb
 * Central turns a Cloudflare challenge into a rate-limited error rather than parsing it as an
 * empty page.
 */
import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import { parseRateLimited } from "@comical/sdk";
import mangadexFactory from "../src/mangadex.ts";
import weebcentralFactory from "../src/weebcentral.ts";

function host(respond: (req: HttpRequest) => Partial<HttpResponse>): HostCapabilities {
  return {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => ({
        url: req.url,
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        ...respond(req),
      }),
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
}

afterEach(() => setSystemTime());

describe("mangadex at-home assignments", () => {
  let asked = 0;
  const atHome = () =>
    host(() => {
      asked++;
      return {
        body: JSON.stringify({ baseUrl: `https://node${asked}.example`, chapter: { hash: "h", data: ["1.png", "2.png"] } }),
      };
    });

  test("a chapter re-resolved within five minutes reuses its assignment", async () => {
    asked = 0;
    const bridge = mangadexFactory(atHome());
    const first = await bridge.getChapterPages("s", "c1");
    const again = await bridge.getChapterPages("s", "c1");
    expect(asked).toBe(1);
    expect(again).toEqual(first);
    expect(first[1]?.imageUrl).toBe("https://node1.example/data/h/2.png");
  });

  test("an expired assignment, or another chapter, asks again", async () => {
    asked = 0;
    const bridge = mangadexFactory(atHome());
    setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await bridge.getChapterPages("s", "c1");
    await bridge.getChapterPages("s", "c2");
    expect(asked).toBe(2);
    setSystemTime(new Date("2026-01-01T00:05:01Z"));
    const fresh = await bridge.getChapterPages("s", "c1");
    expect(asked).toBe(3);
    expect(fresh[0]?.imageUrl).toBe("https://node3.example/data/h/1.png");
  });
});

describe("weebcentral Cloudflare challenge", () => {
  test("a challenged response is a rate-limited error", async () => {
    const bridge = weebcentralFactory(
      host(() => ({ status: 403, headers: { "CF-Mitigated": "challenge" }, body: "<html>Just a moment...</html>" })),
    );
    const err = (await bridge.getSeriesDetails("01ABC").catch((e: unknown) => e)) as Error;
    expect(parseRateLimited(err.message)?.retryAfterMs).toBe(5 * 60 * 1000);
  });

  test("an unchallenged page is parsed as usual", async () => {
    const bridge = weebcentralFactory(host(() => ({ body: "<html><h1>Title</h1></html>" })));
    const err = await bridge.getSeriesDetails("01ABC").then(() => undefined, (e: unknown) => e as Error);
    expect(err === undefined || parseRateLimited(err.message) === null).toBe(true);
  });
});
