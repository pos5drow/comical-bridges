/**
 * WEBTOON against fixtures cut from the site (Nov 2026): the Language setting in URLs and cookies,
 * ranking cards, search kinds, details, the mobile episode API (Canvas included), viewer pages only
 * from the image list, and links to list and viewer pages.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import webtoons from "../src/webtoons.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "webtoons", name), "utf8");
const SERIES = "/en/drama/this-wasnt-in-my-adoption-plan/list?title_no=7566";

function host(settings: Record<string, string> = {}) {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req);
        const u = new URL(req.url);
        const body =
          u.host === "m.webtoons.com" ? fixture("episodes.json")
          : u.pathname.endsWith("/viewer") ? fixture("viewer.html")
          : u.pathname.endsWith("/list") ? fixture("details.html")
          : fixture("ranking.html");
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings,
  };
  return { caps, requests };
}

describe("lists and search", () => {
  test("rankings in the chosen language, with the age-gate cookies", async () => {
    const { caps, requests } = host({ language: "es" });
    const res = await webtoons(caps).getListItems!("trending");
    expect(requests[0]!.url).toBe("https://www.webtoons.com/es/ranking/trending");
    expect(requests[0]!.headers?.Cookie).toBe("ageGatePass=true; locale=es; needGDPR=false");
    expect(res.items[0]).toMatchObject({ id: SERIES, title: "This Wasn’t in My Adoption Plan!" });
    expect(res.items[0]!.thumbnailUrl).toStartWith("https://webtoon-phinf.pstatic.net/");
  });

  test("search: combined first page, or one kind with paging", async () => {
    const { caps, requests } = host();
    const bridge = webtoons(caps);
    await bridge.getSearchResults!({ text: "tower" });
    const kind = await bridge.getSearchResults!({ text: "tower", filters: [{ key: "kind", value: "canvas" }] });
    expect(requests.map((r) => r.url)).toEqual([
      "https://www.webtoons.com/en/search?keyword=tower",
      "https://www.webtoons.com/en/search/canvas?keyword=tower",
    ]);
    expect(kind.nextCursor).toBeUndefined();
  });
});

describe("details, chapters, pages", () => {
  test("details", async () => {
    const info = await webtoons(host().caps).getSeriesDetails(SERIES);
    expect(info).toMatchObject({ id: SERIES, title: "This Wasn’t in My Adoption Plan!", status: "ongoing", shareUrl: `https://www.webtoons.com${SERIES}` });
    expect(info.authors?.map((a) => a.name)).toContain("Takbon");
    expect(info.tagGroups?.[0]?.tags).toEqual(["Drama"]);
    expect(info.thumbnailUrl).toStartWith("https://swebtoon-phinf.pstatic.net/");
  });

  test("episodes from the mobile API, newest first, numbered by episode", async () => {
    const { caps, requests } = host();
    const chapters = await webtoons(caps).getChapters!(SERIES);
    expect(requests[0]!.url).toBe("https://m.webtoons.com/api/v1/webtoon/7566/episodes?pageSize=99999");
    expect(chapters.at(-1)).toEqual({
      id: "/en/drama/this-wasnt-in-my-adoption-plan/episode-1/viewer?title_no=7566&episode_no=1",
      name: "Episode 1",
      number: 1,
      publishedAt: 1742688000000,
    });
  });

  test("Canvas titles use the canvas API in their own language", async () => {
    const { caps, requests } = host();
    await webtoons(caps).getChapters!("/fr/canvas/some-comic/list?title_no=1234");
    expect(requests[0]!.url).toBe("https://m.webtoons.com/api/v1/canvas/1234/episodes?pageSize=99999&readingLanguageCode=fr");
  });

  test("pages only from the episode's image list", async () => {
    const pages = await webtoons(host().caps).getChapterPages!(SERIES, "/en/x/y/episode-70/viewer?title_no=7566&episode_no=70");
    expect(pages).toHaveLength(2);
    expect(pages.every((p) => !p.imageUrl.includes("other-thumb"))).toBe(true);
  });
});

test("links: list pages and viewer pages, no fetch", async () => {
  const { caps, requests } = host();
  const bridge = webtoons(caps);
  expect(await bridge.resolveUrl!(`https://www.webtoons.com${SERIES}`)).toEqual({ seriesId: SERIES });
  expect(await bridge.resolveUrl!("https://m.webtoons.com/en/drama/this-wasnt-in-my-adoption-plan/episode-3/viewer?title_no=7566&episode_no=3")).toEqual({
    seriesId: SERIES,
    chapterId: "/en/drama/this-wasnt-in-my-adoption-plan/episode-3/viewer?title_no=7566&episode_no=3",
  });
  expect(await bridge.resolveUrl!("https://www.webtoons.com/en/ranking/trending")).toBeNull();
  expect(requests).toEqual([]);
});
