/**
 * Unit tests for the e-hentai viewer sprite-thumbnail parser. The tricky cases are mixed-size
 * galleries: tiles of different heights, tiles wrapped onto a second montage row (a `y` offset), and
 * a viewer page whose thumbnails span more than one montage sheet. Each montage sheet must be sized
 * from its own tiles' extents — using a tile's height as the sheet height, or a global width across
 * sheets, crops the wrong region and renders neighbouring tiles.
 */
import { describe, expect, test } from "bun:test";
import { extractViewerThumbnails, normalizeThumbUrl, proxiedThumbUrl } from "../src/ehentai.ts";

/** Build one viewer-thumbnail anchor in the shape the parser scrapes. `y` omitted → single row. */
function tile(page: number, src: string, x: number, w: number, h: number, y?: number): string {
  const pos = y === undefined ? `-${x}px 0px` : `-${x}px -${y}px`;
  return (
    `<a href="https://e-hentai.org/s/abc123/12345-${page}">` +
    `<div style="width:${w}px;height:${h}px;background:transparent url(${src}) ${pos} no-repeat"></div></a>`
  );
}

const SRC = "https://ehgt.org/m/0001/sheet0.jpg";

describe("extractViewerThumbnails", () => {
  test("uniform strip: equal tiles share the full sheet width", () => {
    const html = tile(1, SRC, 0, 200, 289) + tile(2, SRC, 200, 200, 289);
    const map = extractViewerThumbnails(html);
    expect(map.get(1)).toEqual({ src: SRC, x: 0, y: 0, w: 200, h: 289, sheetWidth: 400, sheetHeight: 289 });
    expect(map.get(2)).toEqual({ src: SRC, x: 200, y: 0, w: 200, h: 289, sheetWidth: 400, sheetHeight: 289 });
  });

  test("mixed tile heights: sheetHeight is the tallest tile, not the per-tile height", () => {
    const html = tile(1, SRC, 0, 150, 300) + tile(2, SRC, 150, 260, 200);
    const map = extractViewerThumbnails(html);
    // The short tile must still report the full sheet height (300), or its crop letterboxes.
    expect(map.get(2)).toMatchObject({ h: 200, sheetWidth: 410, sheetHeight: 300 });
    expect(map.get(1)).toMatchObject({ h: 300, sheetWidth: 410, sheetHeight: 300 });
  });

  test("second montage row: the y offset is captured and grows sheetHeight", () => {
    const html =
      tile(1, SRC, 0, 200, 300) +
      tile(2, SRC, 200, 200, 300) +
      tile(3, SRC, 0, 200, 250, 300); // wrapped to row 2 at y=300
    const map = extractViewerThumbnails(html);
    expect(map.get(3)).toMatchObject({ x: 0, y: 300, w: 200, h: 250, sheetHeight: 550 });
    expect(map.get(1)).toMatchObject({ y: 0, sheetHeight: 550 });
  });

  test("multiple sheets on one viewer page: each sheet is sized independently", () => {
    const SRC2 = "https://ehgt.org/m/0001/sheet1.jpg";
    const html =
      tile(1, SRC, 0, 200, 289) +
      tile(2, SRC, 200, 200, 289) +
      tile(3, SRC2, 0, 300, 400);
    const map = extractViewerThumbnails(html);
    expect(map.get(1)).toMatchObject({ src: SRC, sheetWidth: 400, sheetHeight: 289 });
    expect(map.get(3)).toMatchObject({ src: SRC2, sheetWidth: 300, sheetHeight: 400 });
  });
});

describe("thumbnail proxying", () => {
  // Covers/thumbnails must be served via the host's same-origin /img-proxy, never fetched from the
  // adult CDN (ehgt.org) directly — direct fetches get blocked by content filters / DNS on remote
  // clients, which is why e-hentai covers were blank when accessed through the reverse proxy.
  test("proxiedThumbUrl wraps and url-encodes the CDN url", () => {
    expect(proxiedThumbUrl("https://ehgt.org/ab/cd.jpg")).toBe(
      "/img-proxy?url=https%3A%2F%2Fehgt.org%2Fab%2Fcd.jpg",
    );
  });

  test("the cover path is same-origin and points at an allowlisted CDN host", () => {
    // s.exhentai.org thumbs normalize to ehgt.org (on the proxy allowlist), then get proxied.
    const url = proxiedThumbUrl(normalizeThumbUrl("https://s.exhentai.org/t/ab/cd_250.jpg"));
    expect(url).toBe("/img-proxy?url=https%3A%2F%2Fehgt.org%2Fab%2Fcd_250.jpg");
    expect(url.startsWith("/img-proxy?url=")).toBe(true);
    expect(decodeURIComponent(url.split("url=")[1]!)).toMatch(/^https:\/\/ehgt\.org\//);
  });
});
