/**
 * MangaFire against API responses captured Nov 2026 (trimmed). The request token is checked against
 * a signature the live API accepted (it refuses requests without one, "Missing token", or with a
 * wrong one, "Invalid token").
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import mangafire, { apiUrl, vrf } from "../src/mangafire.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "mangafire", name), "utf8");

function host(settings: Record<string, string> = {}, over?: (url: string) => HttpResponse | undefined) {
  const requests: string[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        requests.push(req.url);
        const hit = over?.(req.url);
        if (hit) return hit;
        const p = new URL(req.url).pathname;
        const body =
          p === "/api/titles" ? fixture("titles.json")
          : p.endsWith("/chapters") ? fixture("chapters.json")
          : p.startsWith("/api/chapters/") ? fixture("pages.json")
          : fixture("detail.json");
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings,
  };
  return { caps, requests };
}

describe("the request token", () => {
  test("matches a signature the live API accepted", () => {
    expect(vrf("/titles?languages[0]=en&limit=50&order[views_30d]=desc&page=1")).toBe(
      "8sK3xtqdFZdDWTKuDVd13pWwhD44iM3livd8XbC0A2LleSdV44JJHt-XhAc2dQlCxBg_vIDx03846DWcLw",
    );
  });

  test("signs the sorted query, numbering repeated `[]` keys", () => {
    const url = new URL(apiUrl("/titles", [["page", "1"], ["genres_in[]", "5"], ["genres_in[]", "1"], ["keyword", "a b"]]));
    expect([...url.searchParams.keys()]).toEqual(["genres_in[]", "genres_in[]", "keyword", "page", "vrf"]);
    expect(url.searchParams.get("vrf")).toBe(vrf("/titles?genres_in[0]=5&genres_in[1]=1&keyword=a b&page=1"));
  });
});

describe("lists and search", () => {
  test("popular: signed, in the chosen language, cards rated", async () => {
    const { caps, requests } = host({ language: "pt-BR" });
    const res = await mangafire(caps).getListItems!("popular");
    const u = new URL(requests[0]!);
    expect(u.pathname).toBe("/api/titles");
    expect(u.searchParams.get("order[views_30d]")).toBe("desc");
    expect(u.searchParams.get("languages[]")).toBe("pt-br");
    expect(u.searchParams.get("vrf")).toBeTruthy();
    expect(res.items[0]).toMatchObject({ id: "728q1", title: "Overgeared (Team Argo)", coverForm: "scroll", subtitle: "Ch. 348" });
    expect(res.items[0]!.thumbnailUrl).toStartWith("https://static.mfcdn.nl/");
    expect(res.nextCursor).toBeDefined();
  });

  test("search: keyword, include/exclude genres, other multiselects, sort", async () => {
    const { caps, requests } = host();
    await mangafire(caps).getSearchResults!({
      text: "tower",
      sort: { key: "score", ascending: false },
      filters: [
        { key: "genres", value: { include: ["1"], exclude: ["268932", "268930"] } },
        { key: "types", value: ["manhwa"] },
        { key: "ratings", value: ["safe", "suggestive"] },
      ],
    });
    const q = new URL(requests[0]!).searchParams;
    expect(q.get("keyword")).toBe("tower");
    expect(q.getAll("genres_in[]")).toEqual(["1"]);
    expect(q.getAll("genres_ex[]")).toEqual(["268932", "268930"]);
    expect(q.getAll("types[]")).toEqual(["manhwa"]);
    expect(q.getAll("content_rating[]")).toEqual(["safe", "suggestive"]);
    expect(q.get("order[score]")).toBe("desc");
  });
});

describe("details, chapters, pages", () => {
  test("details: synopsis as text, taxonomies grouped, rating mapped", async () => {
    const info = await mangafire(host().caps).getSeriesDetails("728q1");
    expect(info).toMatchObject({
      id: "728q1",
      title: "Overgeared (Team Argo)",
      status: "ongoing",
      type: "Manhwa",
      contentRating: "everyone",
      author: "LEE Dong Wook, PARK Saenal",
      artist: "Redice, Team Argo",
      shareUrl: "https://mangafire.to/title/728q1-overgeared-team-argoo",
    });
    expect(info.description).toStartWith("From Yen Press:\nYoungwoo Shin");
    expect(info.description).not.toContain("<");
    expect(info.tagGroups?.map((g) => g.kind)).toEqual(["genre", "theme", "demographic"]);
    expect(info.subtitle).toBeUndefined();
  });

  test("chapters: every page of the list, duplicates dropped", async () => {
    const { caps, requests } = host();
    const chapters = await mangafire(caps).getChapters!("728q1");
    expect(requests.map((r) => new URL(r).searchParams.get("page"))).toEqual(["1", "2"]);
    expect(chapters).toHaveLength(3);
    expect(chapters[0]).toEqual({ id: "9567589", name: "Ch. 348", number: 348, group: "Unofficial", publishedAt: 1794582003000 });
  });

  test("pages, on the host that needs the Referer", async () => {
    const pages = await mangafire(host().caps).getChapterPages!("728q1", "9567589");
    expect(pages).toHaveLength(3);
    expect(pages[0]!.imageUrl).toStartWith("https://q73.mfcdn2.xyz/mf/");
  });

  test("the firewall's captcha becomes a plain message", async () => {
    const { caps } = host({}, (u) => (u.includes("/api/chapters/") ? { url: u, status: 403, statusText: "", headers: {}, body: '{"error":"captcha_required"}' } : undefined));
    await expect(mangafire(caps).getChapterPages!("728q1", "1")).rejects.toThrow(/captcha/);
  });
});

test("links", async () => {
  const bridge = mangafire(host().caps);
  expect(await bridge.resolveUrl!("https://mangafire.to/title/728q1-overgeared-team-argoo")).toEqual({ seriesId: "728q1" });
  expect(await bridge.resolveUrl!("https://mangafire.to/filter?keyword=x")).toBeNull();
});
