/**
 * Tests for atsumaru include/exclude filter support on genre and tag filters.
 * Both advertise `excludable: true` and accept `{ include, exclude }` values, which the bridge
 * maps to Typesense's `filter_by` syntax: `field:=\`id\`` for include, `field:!=\`id\`` for exclude.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import factory from "../src/bridge.ts";

/** A host that records search URLs and returns empty Typesense results. */
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

function filterBy(url: string): string {
  return new URL(url).searchParams.get("filter_by") ?? "";
}

describe("atsumaru genre filter include/exclude", () => {
  test("include produces genreIds:= clauses joined with &&", async () => {
    const { host, urls } = captureHost();
    await factory(host).getSearchResults("", 1, {
      filters: [{ key: "genre", value: { include: ["g1", "g2"], exclude: [] } }],
    });
    const fb = filterBy(urls[0]!);
    expect(fb).toContain("genreIds:=`g1`");
    expect(fb).toContain("genreIds:=`g2`");
    expect(fb).not.toContain("genreIds:!=");
  });

  test("exclude produces genreIds:!= clauses", async () => {
    const { host, urls } = captureHost();
    await factory(host).getSearchResults("", 1, {
      filters: [{ key: "genre", value: { include: [], exclude: ["g1"] } }],
    });
    const fb = filterBy(urls[0]!);
    expect(fb).toContain("genreIds:!=`g1`");
    expect(fb).not.toContain("genreIds:=`g1`");
  });

  test("mixed include and exclude produce both clause types", async () => {
    const { host, urls } = captureHost();
    await factory(host).getSearchResults("", 1, {
      filters: [{ key: "genre", value: { include: ["action"], exclude: ["horror"] } }],
    });
    const fb = filterBy(urls[0]!);
    expect(fb).toContain("genreIds:=`action`");
    expect(fb).toContain("genreIds:!=`horror`");
  });

  test("empty include+exclude → no genreIds clause", async () => {
    const { host, urls } = captureHost();
    await factory(host).getSearchResults("", 1, {
      filters: [{ key: "genre", value: { include: [], exclude: [] } }],
    });
    expect(filterBy(urls[0]!)).not.toContain("genreIds:");
  });

  test("legacy string[] value is treated as all-include", async () => {
    const { host, urls } = captureHost();
    await factory(host).getSearchResults("", 1, {
      filters: [{ key: "genre", value: ["action"] }],
    });
    const fb = filterBy(urls[0]!);
    expect(fb).toContain("genreIds:=`action`");
    expect(fb).not.toContain("genreIds:!=");
  });
});

describe("atsumaru tag filter include/exclude", () => {
  test("include produces tagIds:= clauses", async () => {
    const { host, urls } = captureHost();
    await factory(host).getSearchResults("", 1, {
      filters: [{ key: "tag", value: { include: ["t1", "t2"], exclude: [] } }],
    });
    const fb = filterBy(urls[0]!);
    expect(fb).toContain("tagIds:=`t1`");
    expect(fb).toContain("tagIds:=`t2`");
    expect(fb).not.toContain("tagIds:!=");
  });

  test("exclude produces tagIds:!= clauses", async () => {
    const { host, urls } = captureHost();
    await factory(host).getSearchResults("", 1, {
      filters: [{ key: "tag", value: { include: [], exclude: ["t1"] } }],
    });
    const fb = filterBy(urls[0]!);
    expect(fb).toContain("tagIds:!=`t1`");
    expect(fb).not.toContain("tagIds:=`t1`");
  });

  test("mixed include and exclude produce both clause types", async () => {
    const { host, urls } = captureHost();
    await factory(host).getSearchResults("", 1, {
      filters: [{ key: "tag", value: { include: ["want"], exclude: ["avoid"] } }],
    });
    const fb = filterBy(urls[0]!);
    expect(fb).toContain("tagIds:=`want`");
    expect(fb).toContain("tagIds:!=`avoid`");
  });

  test("blank/whitespace ids are skipped", async () => {
    const { host, urls } = captureHost();
    await factory(host).getSearchResults("", 1, {
      filters: [{ key: "tag", value: { include: ["  "], exclude: ["  "] } }],
    });
    const fb = filterBy(urls[0]!);
    expect(fb).not.toContain("tagIds:=``");
    expect(fb).not.toContain("tagIds:!=``");
  });

  test("per-filter exclude coexists with persistent excludedTags", async () => {
    const { host, urls } = captureHost();
    await factory(host).getSearchResults("", 1, {
      filters: [{ key: "tag", value: { include: ["want"], exclude: ["filter-avoid"] } }],
      excludedTags: ["persist-avoid"],
    });
    const fb = filterBy(urls[0]!);
    expect(fb).toContain("tagIds:=`want`");
    expect(fb).toContain("tagIds:!=`filter-avoid`");
    expect(fb).toContain("tagIds:!=`persist-avoid`");
  });
});

describe("atsumaru filter definitions", () => {
  test("genre and tag filters are excludable; status is not", async () => {
    const bridge = factory(captureHost().host);
    const filters = await bridge.getFilters!();
    const genre = filters.find((f) => f.key === "genre");
    const tag = filters.find((f) => f.key === "tag");
    const status = filters.find((f) => f.key === "status");
    expect((genre as any).excludable).toBe(true);
    expect((tag as any).excludable).toBe(true);
    expect((status as any)?.excludable).toBeUndefined();
  });
});
