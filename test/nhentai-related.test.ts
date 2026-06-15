/**
 * Unit test for the nhentai related-series rail. The detail page surfaces nhentai's algorithmic
 * "More Like This" galleries (`GET /galleries/{id}/related`, which returns the same
 * `{ result: GalleryListItem[] }` shape as the list endpoints) as a single
 * `SeriesInfo.relatedSeriesGroups` entry labeled "More Like This" with kind "similar".
 *
 * Instantiates the bridge directly with a mock host that answers the detail + related endpoints with
 * canned JSON — no network, no build step. `@comical/*` resolve to the sibling monorepo source.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import factory from "../src/nhentai.ts";

interface RelatedGallery {
  id: number;
  media_id: string;
  english_title?: string;
  thumbnail?: string;
  tag_ids?: number[];
}

const R1: RelatedGallery = { id: 11, media_id: "m11", english_title: "Related One", thumbnail: "galleries/11/thumb.webp", tag_ids: [3] };
const R2: RelatedGallery = { id: 12, media_id: "m12", english_title: "Related Two", thumbnail: "galleries/12/thumb.webp", tag_ids: [4] };

/**
 * A host that serves the gallery detail and its /related list. `related` controls the related
 * payload so a test can exercise both the populated and empty cases.
 */
function detailHost(related: RelatedGallery[]): HostCapabilities {
  return {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        const path = new URL(req.url).pathname;
        let body: string;
        if (path.endsWith("/cdn")) {
          body = JSON.stringify({ image_servers: ["https://i.example"], thumb_servers: ["https://t.example"] });
        } else if (path.endsWith("/related")) {
          body = JSON.stringify({ result: related });
        } else {
          // Gallery detail (GalleryDetail shape).
          body = JSON.stringify({
            id: 1,
            media_id: "m1",
            title: { english: "Subject Gallery", pretty: "Subject" },
            cover: { path: "galleries/1/cover.webp" },
            tags: [{ id: 9, type: "tag", name: "example" }],
          });
        }
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
}

describe("nhentai related-series rail", () => {
  test('maps /related galleries into one "More Like This" (kind: similar) group', async () => {
    const bridge = factory(detailHost([R1, R2]));
    const info = await bridge.getSeriesDetails("1");
    const groups = info.relatedSeriesGroups ?? [];

    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("More Like This");
    expect(groups[0]!.kind).toBe("similar");
    expect(groups[0]!.series.map((s) => s.id)).toEqual(["11", "12"]);
    expect(groups[0]!.series[0]!.title).toBe("Related One");
    // Covers resolve through the bridge's CDN/thumb pipeline.
    expect(groups[0]!.series[0]!.thumbnailUrl).toContain("galleries/11/thumb.webp");
  });

  test("omits relatedSeriesGroups when the gallery has no related items", async () => {
    const bridge = factory(detailHost([]));
    const info = await bridge.getSeriesDetails("1");
    expect(info.relatedSeriesGroups).toBeUndefined();
  });
});
