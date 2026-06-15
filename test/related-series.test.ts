/**
 * Unit test for related-series mapping in getSeriesDetails. atsu.moe's `mangaPage` payload carries
 * three related sources — typed editorial `relations` (SpinOff/Sequel/…), plus algorithmic
 * `similarManga` and `recommendations`. The bridge folds these into `SeriesInfo.relatedSeriesGroups`:
 * one labeled+kinded group per relation type, then "Similar" and "Recommended" rails.
 *
 * Instantiates the bridge directly with a mock host that answers the detail request with a canned
 * payload — no network, no build step. `@comical/*` resolve to the sibling monorepo source.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import factory from "../src/bridge.ts";

/** A host that answers the manga-page request with `mangaPage` JSON and 404s everything else. */
function detailHost(mangaPage: Record<string, unknown>): HostCapabilities {
  return {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        const body = req.url.includes("/api/manga/page")
          ? JSON.stringify({ mangaPage })
          : "{}";
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
}

const card = (id: string, title: string) => ({ id, title, image: `posters/${id}.jpg` });

describe("getSeriesDetails related-series mapping", () => {
  test("maps typed relations, similar, and recommendations into labeled groups", async () => {
    const bridge = factory(
      detailHost({
        id: "s1",
        title: "Series One",
        relations: [
          { type: "SpinOff", manga: card("sp1", "Spin One") },
          { type: "SpinOff", manga: card("sp2", "Spin Two") },
          { type: "Sequel", manga: card("sq1", "Sequel One") },
        ],
        similarManga: [card("si1", "Similar One"), card("si2", "Similar Two")],
        recommendations: [card("re1", "Rec One")],
      }),
    );

    const info = await bridge.getSeriesDetails("s1");
    const groups = info.relatedSeriesGroups ?? [];

    // Relations grouped by type (order preserved), then Similar, then Recommended.
    expect(groups.map((g) => g.label)).toEqual(["Spin-offs", "Sequels", "Similar", "Recommended"]);

    const spin = groups[0]!;
    expect(spin.kind).toBe("spin-off");
    expect(spin.series.map((s) => s.id)).toEqual(["sp1", "sp2"]);
    // Covers resolve through the bridge's image pipeline.
    expect(spin.series[0]!.thumbnailUrl).toContain("sp1.jpg");

    expect(groups.find((g) => g.label === "Similar")?.kind).toBe("similar");
    expect(groups.find((g) => g.label === "Recommended")?.kind).toBe("recommended");
  });

  test("omits relatedSeriesGroups entirely when all sources are empty", async () => {
    const bridge = factory(detailHost({ id: "s2", title: "Series Two", relations: [], similarManga: [], recommendations: [] }));
    const info = await bridge.getSeriesDetails("s2");
    expect(info.relatedSeriesGroups).toBeUndefined();
  });

  test("unknown relation types degrade to a humanized label with kind 'other'", async () => {
    const bridge = factory(
      detailHost({
        id: "s3",
        title: "Series Three",
        relations: [{ type: "AnthologyArc", manga: card("a1", "Arc One") }],
      }),
    );
    const groups = (await bridge.getSeriesDetails("s3")).relatedSeriesGroups ?? [];
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Anthology Arc");
    expect(groups[0]!.kind).toBe("other");
  });

  test("drops relation entries missing an id or title", async () => {
    const bridge = factory(
      detailHost({
        id: "s4",
        title: "Series Four",
        relations: [
          { type: "Sequel", manga: card("ok", "Valid") },
          { type: "Sequel", manga: { id: "", title: "No Id" } },
          { type: "Sequel", manga: { id: "noTitle", title: "" } },
        ],
      }),
    );
    const groups = (await bridge.getSeriesDetails("s4")).relatedSeriesGroups ?? [];
    expect(groups).toHaveLength(1);
    expect(groups[0]!.series.map((s) => s.id)).toEqual(["ok"]);
  });
});
