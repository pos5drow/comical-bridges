/**
 * atsu.moe retired its `/api/infinite/{list}` routes (2026-10): every list is now either a Typesense
 * query with a `sort_by` or a dedicated `/api/home2/{endpoint}` route. Until the bridge moved, each
 * list read parsed the route's plain-text 404 as JSON and surfaced as an opaque
 * "getListItems threw: SyntaxError: JSON Parse error" on the home screen. These lock in the new
 * routes + query shapes, and that a dead endpoint now fails with a message naming the URL.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import factory from "../src/bridge.ts";

const TYPESENSE_EMPTY = { hits: [], found: 0, page: 1, request_params: { per_page: 40 } };

type Answer = { status?: number; body: unknown };

function captureHost(
  route: (url: string) => Answer,
  settings: Record<string, unknown> = {},
): { host: HostCapabilities; urls: string[] } {
  const urls: string[] = [];
  const host: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        urls.push(req.url);
        const { status = 200, body } = route(req.url);
        return {
          url: req.url,
          status,
          statusText: status === 200 ? "OK" : "Not Found",
          headers: {},
          body: typeof body === "string" ? body : JSON.stringify(body),
        };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings,
  };
  return { host, urls };
}

const doc = (id: string) => ({ id, title: `Series ${id}` });

describe("Atsumaru lists after the /api/infinite retirement", () => {
  test("trending is a wildcard Typesense search sorted by trending:desc", async () => {
    const { host, urls } = captureHost(() => ({
      body: { ...TYPESENSE_EMPTY, found: 2, hits: [{ document: doc("a") }, { document: doc("b") }] },
    }));
    const { items, nextCursor } = await factory(host).getListItems("trending");

    expect(urls).toHaveLength(1);
    const u = new URL(urls[0]!);
    expect(u.pathname).toBe("/collections/manga/documents/search");
    expect(u.searchParams.get("q")).toBe("*");
    expect(u.searchParams.get("sort_by")).toBe("trending:desc");
    expect(u.searchParams.get("page")).toBe("1");
    // Novels are indexed in the same collection now; a comic reader drops them.
    expect(u.searchParams.get("filter_by")).toContain("medium:!=[`Novel`]");
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(nextCursor).toBeUndefined(); // 2 of 2 found
  });

  test("recently updated hits /api/home2/recentlyUpdated with offset paging + comic narrowing", async () => {
    const items40 = Array.from({ length: 40 }, (_, i) => doc(String(i)));
    const { host, urls } = captureHost(() => ({ body: { items: items40 } }));
    const bridge = factory(host);

    const first = await bridge.getListItems("recentlyUpdated");
    expect(first.items).toHaveLength(40);
    expect(first.nextCursor).toBeDefined(); // a full page means there may be more

    await bridge.getListItems("recentlyUpdated", { cursor: first.nextCursor });

    expect(urls).toHaveLength(2);
    const [p1, p2] = urls.map((u) => new URL(u));
    expect(p1!.pathname).toBe("/api/home2/recentlyUpdated");
    expect(p1!.searchParams.get("offset")).toBe("0");
    expect(p1!.searchParams.get("limit")).toBe("40");
    expect(p1!.searchParams.get("mediums")).toBe("Comic");
    expect(p1!.searchParams.get("types")).toContain("Manga");
    expect(p1!.searchParams.get("adult")).toBeNull();
    expect(p2!.searchParams.get("offset")).toBe("40");
  });

  test("home2 lists carry the adult toggle and persistent tag exclusions", async () => {
    const { host, urls } = captureHost(() => ({ body: { items: [] } }), { adult: true });
    await factory(host).getListItems("recentlyUpdated", { excludedTags: ["t1", " t2 ", ""] });

    const u = new URL(urls[0]!);
    expect(u.searchParams.get("adult")).toBe("1");
    expect(u.searchParams.get("excludedTags")).toBe("t1,t2");
  });

  test("a retired route fails with the status + URL, not a JSON parse error", async () => {
    const { host } = captureHost(() => ({ status: 404, body: "404 Not Found" }));
    await expect(factory(host).getListItems("recentlyUpdated")).rejects.toThrow(/HTTP 404 .*\/api\/home2\/recentlyUpdated/);
  });

  test("a 200 with a non-JSON body names the URL too", async () => {
    const { host } = captureHost(() => ({ body: "<html>challenge</html>" }));
    await expect(factory(host).getListItems("recentlyUpdated")).rejects.toThrow(/non-JSON .*\/api\/home2\/recentlyUpdated/);
  });

  test("getLists exposes only the public SeriesList fields", async () => {
    const { host } = captureHost(() => ({ body: {} }));
    const lists = await factory(host).getLists();
    expect(lists.map((l) => l.id)).toEqual(["trending", "recentlyUpdated"]);
    for (const l of lists) {
      expect(l).not.toHaveProperty("source");
      expect(l).not.toHaveProperty("endpoint");
      expect(l).not.toHaveProperty("sort");
    }
  });
});
