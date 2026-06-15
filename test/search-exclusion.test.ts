/**
 * Unit test for the "exclude-tags" capability: persistent per-bridge tag exclusions must be
 * pushed down into the Typesense `filter_by` string as `tagIds:!=` negation clauses, so excluded
 * tags never surface in any search result (no host-side post-filtering, no extra request).
 *
 * Instantiates the bridge directly with a mock host that captures the outgoing search URL — no
 * network, no build step. `@comical/*` resolve to the sibling monorepo source via tsconfig paths.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import factory from "../src/bridge.ts";

/** A host that records every request URL and answers searches with an empty Typesense payload. */
function captureHost(): { host: HostCapabilities; urls: string[] } {
  const urls: string[] = [];
  const host: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        urls.push(req.url);
        return {
          url: req.url,
          status: 200,
          statusText: "OK",
          headers: {},
          body: '{"hits":[],"found":0,"page":1,"request_params":{"per_page":40}}',
        };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
  return { host, urls };
}

/** Decode the `filter_by` Typesense clause out of the captured search URL. */
function filterBy(url: string): string {
  return new URL(url).searchParams.get("filter_by") ?? "";
}

describe("getSearchResults exclude-tags push-down", () => {
  test("each excluded tag becomes a tagIds:!= negation clause", async () => {
    const { host, urls } = captureHost();
    const bridge = factory(host);

    await bridge.getSearchResults("naruto", 1, { excludedTags: ["t1", "t2"] });

    expect(urls).toHaveLength(1);
    const fb = filterBy(urls[0]!);
    expect(fb).toContain("tagIds:!=`t1`");
    expect(fb).toContain("tagIds:!=`t2`");
  });

  test("no excluded tags → no negation clause", async () => {
    const { host, urls } = captureHost();
    const bridge = factory(host);

    await bridge.getSearchResults("naruto", 1, {});

    expect(filterBy(urls[0]!)).not.toContain("tagIds:!=");
  });

  test("blank / whitespace-only ids are skipped", async () => {
    const { host, urls } = captureHost();
    const bridge = factory(host);

    await bridge.getSearchResults("naruto", 1, { excludedTags: ["  ", "real"] });

    const fb = filterBy(urls[0]!);
    expect(fb).toContain("tagIds:!=`real`");
    expect(fb).not.toContain("tagIds:!=``");
  });

  test("exclusion negation coexists with an inclusion tag filter", async () => {
    const { host, urls } = captureHost();
    const bridge = factory(host);

    await bridge.getSearchResults("naruto", 1, {
      filters: [{ key: "tag", value: ["want"] }],
      excludedTags: ["avoid"],
    });

    const fb = filterBy(urls[0]!);
    expect(fb).toContain("tagIds:=`want`"); // inclusion preserved
    expect(fb).toContain("tagIds:!=`avoid`"); // exclusion appended
  });
});
