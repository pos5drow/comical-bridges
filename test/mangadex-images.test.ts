/**
 * MangaDex requires a client to name itself (no spoofed User-Agent) and to proxy what its users load
 * rather than hotlink it. Since 2026-11 a browser-looking request to uploads.mangadex.org is 302'd to
 * an HTML challenge, so the desktop's <img>s — Electron's Chrome User-Agent, straight off the CDN —
 * rendered every cover and page blank. These lock in that covers and pages route through the host's
 * image proxy under the bridge's own name, and that the API calls carry the same name.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import { bridgeInfoSchema } from "@comical/contract";
import { needsImageRoute } from "@comical/core";
import factory from "../src/mangadex.ts";

function host(seen: HttpRequest[]): HostCapabilities {
  return {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        seen.push(req);
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body: JSON.stringify({ result: "ok", data: [], total: 0 }) };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
}

const COVER = "https://uploads.mangadex.org/covers/77bee52c-d2d6-44ad-a33a-1734c1fe696a/6079dd31.jpg.256.jpg";
const PAGE = "https://cmdxd98sb0x3yprd.mangadex.network/data/cfdcdc22b8556e8adb22744ed24c05e7/x1-9906.jpg";

describe("mangadex images", () => {
  const { info } = factory(host([]));

  test("declares a valid images block", () => {
    expect(() => bridgeInfoSchema.parse(info)).not.toThrow();
  });

  test("covers and at-home pages go through the host's image proxy", () => {
    expect(needsImageRoute(info.images, COVER)).toBe(true);
    expect(needsImageRoute(info.images, PAGE)).toBe(true);
    expect(needsImageRoute(info.images, "https://example.com/x.jpg")).toBe(false);
  });

  test("images are fetched under the bridge's own name, not a browser's", () => {
    const ua = info.images?.headers?.["User-Agent"] ?? "";
    expect(ua).toContain("comical");
    expect(ua).not.toMatch(/Mozilla|Chrome|Safari/);
  });

  test("the icon isn't hotlinked from MangaDex (clients load it directly, with no proxy)", () => {
    const host = new URL(info.iconUrl ?? "").hostname;
    expect(host).toBe("raw.githubusercontent.com");
    expect(info.iconUrl).toContain("/pos5drow/comical-bridges/main/icons/mangadex.png");
  });

  test("API calls send the same name", async () => {
    const seen: HttpRequest[] = [];
    await factory(host(seen)).getSearchResults({ text: "spy" }).catch(() => undefined);
    expect(seen.length).toBeGreaterThan(0);
    for (const req of seen) expect(req.headers?.["User-Agent"]).toBe(info.images?.headers?.["User-Agent"]);
  });
});
