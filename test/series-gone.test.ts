/**
 * A series the source no longer has throws the contract's series-gone marker — from the detail call,
 * and from the chapter call when the empty list it got back turns out to mean "no such series" —
 * while a series that merely has no chapters, or a source that's failing, never does.
 *
 * Each bridge gets a mock host answering by URL with canned responses shaped like the live ones.
 */
import { describe, expect, test } from "bun:test";
import { type HostCapabilities, type HttpRequest, type HttpResponse, parseSeriesGone } from "@comical/contract";
import atsumaruFactory from "../src/bridge.ts";
import mangadexFactory from "../src/mangadex.ts";
import weebcentralFactory from "../src/weebcentral.ts";

type Reply = Partial<HttpResponse> & { body: string };

function host(route: (url: string) => Reply, settings: Record<string, string> = {}): HostCapabilities {
  return {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => ({
        url: req.url,
        status: 200,
        statusText: "OK",
        headers: {},
        ...route(req.url),
      }),
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings,
  };
}

/** The series-gone reason a rejected call carried, or null when it failed some other way. */
async function goneReason(call: Promise<unknown>): Promise<string | null> {
  try {
    await call;
  } catch (e) {
    return parseSeriesGone(e instanceof Error ? e.message : String(e))?.reason ?? null;
  }
  throw new Error("expected the call to reject");
}

describe("Atsumaru", () => {
  const gone = host((url) =>
    url.includes("/api/manga/page") ? { body: JSON.stringify({ mangaPage: null, moments: {} }) } : { body: '{"chapters":[]}' },
  );
  const empty = host((url) =>
    url.includes("/api/manga/page") ? { body: JSON.stringify({ mangaPage: { title: "Still here" } }) } : { body: '{"chapters":[]}' },
  );

  test("a null mangaPage is gone", async () => {
    expect(await goneReason(atsumaruFactory(gone).getSeriesDetails("x"))).toBeTruthy();
  });

  test("an empty chapter list for a vanished series is gone", async () => {
    expect(await goneReason(atsumaruFactory(gone).getChapters!("x"))).toBeTruthy();
  });

  test("an empty chapter list for a live series is just empty", async () => {
    expect(await atsumaruFactory(empty).getChapters!("x")).toEqual([]);
  });

  test("an HTTP 500 is not gone", async () => {
    const down = host(() => ({ status: 500, body: "oops" }));
    expect(await goneReason(atsumaruFactory(down).getSeriesDetails("x"))).toBeNull();
  });
});

describe("MangaDex", () => {
  const notFound = (id: string) =>
    JSON.stringify({
      result: "error",
      errors: [{ id: "e", status: 404, title: "not_found_http_exception", detail: `Manga \`${id}\` not found.`, context: null }],
    });
  const emptyFeed = JSON.stringify({ result: "ok", response: "collection", data: [], limit: 500, offset: 0, total: 0 });
  const manga = (id: string) =>
    JSON.stringify({ result: "ok", data: { id, type: "manga", attributes: { title: { en: "Still here" } }, relationships: [] } });

  const gone = host((url) => (url.includes("/feed") ? { body: emptyFeed } : { status: 404, body: notFound("x") }));
  const empty = host((url) => (url.includes("/feed") ? { body: emptyFeed } : { body: manga("x") }));

  test("a 404 naming the manga is gone", async () => {
    expect(await goneReason(mangadexFactory(gone).getSeriesDetails("x"))).toBeTruthy();
  });

  test("an empty feed for a vanished manga is gone", async () => {
    expect(await goneReason(mangadexFactory(gone).getChapters!("x"))).toBeTruthy();
  });

  test("an empty feed for a live manga is just empty", async () => {
    expect(await mangadexFactory(empty).getChapters!("x")).toEqual([]);
  });

  test("any other API error is not gone", async () => {
    const route404 = host(() => ({
      status: 404,
      body: JSON.stringify({ result: "error", errors: [{ status: 404, title: "not_found_http_exception", detail: 'No route found for "GET /x"' }] }),
    }));
    const err = await mangadexFactory(route404).getSeriesDetails("x").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(parseSeriesGone((err as Error).message)).toBeNull();
    expect((err as Error).message).toContain("No route found");
  });
});

describe("WeebCentral", () => {
  const notFoundPage = "<html><head><title>404 | Weeb Central</title></head><body>Not here</body></html>";
  const seriesPage = "<html><head><title>Still here | Weeb Central</title></head><body><h1>Still here</h1></body></html>";

  test("a redirect to /404 is gone", async () => {
    const gone = host((url) => ({ url: url.replace(/\/series\/.*/, "/404"), body: "<html></html>" }));
    expect(await goneReason(weebcentralFactory(gone).getSeriesDetails("x"))).toBeTruthy();
  });

  test("the rendered 404 page is gone even when the final URL wasn't reported", async () => {
    const gone = host(() => ({ body: notFoundPage }));
    expect(await goneReason(weebcentralFactory(gone).getSeriesDetails("x"))).toBeTruthy();
  });

  test("an empty chapter list for a vanished series is gone", async () => {
    const gone = host((url) => (url.endsWith("/full-chapter-list") ? { body: "<div></div>" } : { body: notFoundPage }));
    expect(await goneReason(weebcentralFactory(gone).getChapters!("x"))).toBeTruthy();
  });

  test("a live series still parses, and an empty list for it is just empty", async () => {
    const live = host((url) => (url.endsWith("/full-chapter-list") ? { body: "<div></div>" } : { body: seriesPage }));
    expect((await weebcentralFactory(live).getSeriesDetails("x")).title).toBe("Still here");
    expect(await weebcentralFactory(live).getChapters!("x")).toEqual([]);
  });
});
