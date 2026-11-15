/**
 * WEBTOON bridge — https://www.webtoons.com, the official platform, originals and Canvas:
 *  - lists: the ranking pages (`/{lang}/ranking/{trending|popular|originals|canvas}`) and today's
 *    originals by update (`/{lang}/originals/{weekday}?sortOrder=UPDATE`)
 *  - search: `/{lang}/search[/{originals|canvas}]?keyword&page`
 *  - details: the series page; chapters: the mobile API (`m.webtoons.com/api/v1/{webtoon|canvas}/{titleNo}/episodes`)
 *  - pages: the viewer's `#_imageList` images (they need a webtoons.com Referer)
 *
 * One bridge for every language the site publishes in, picked in settings. A series id is its list
 * page's path (`/en/fantasy/tower-of-god/list?title_no=95`), which names its language, whether it is
 * Canvas, and its title number; a chapter id is its viewer path. Motion comics aren't supported.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type CheerioRoot,
  type Filter,
  type HttpResponse,
  type LinkTarget,
  type ListRequest,
  type Page,
  type PagedResults,
  type SearchRequest,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SettingDescriptor,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
} from "@comical/sdk";
import { standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";

const SITE = "https://www.webtoons.com";
const MOBILE = "https://m.webtoons.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Setting value / path segment → label. */
const LANGUAGES: ReadonlyArray<[string, string]> = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["id", "Bahasa Indonesia"],
  ["th", "ไทย"],
  ["zh-hant", "中文 (繁體)"],
];

const RANKINGS: ReadonlyArray<[string, string]> = [
  ["trending", "Trending"],
  ["popular", "Popular"],
  ["originals", "Originals ranking"],
  ["canvas", "Canvas ranking"],
];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

interface EpisodeDto {
  episodeNo: number;
  episodeTitle: string;
  viewerLink: string;
  exposureDateMillis?: number;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** A site URL as the path a series or chapter id is. */
const pathOf = (href: string) => href.replace(/^https?:\/\/(?:www\.|m\.)?webtoons\.com/, "");

class WebtoonsBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.webtoons",
    name: "WEBTOON",
    version: "0.1.2",
    contractVersion: "2.1.0",
    languages: ["en", "es", "fr", "de", "id", "th", "zh-Hant"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "settings", "content-rating"],
    iconUrl: `${SITE}/favicon.ico`,
    rateLimit: { maxConcurrent: 2, minIntervalMs: 500 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    images: { hosts: ["pstatic.net"], headers: { Referer: `${SITE}/` } },
    linkHosts: ["webtoons.com"],
    coverForm: "scroll",
    readingDirection: "vertical",
  };

  private readonly guards = standardGuards(["webtoons.com", "pstatic.net"]);

  getSettings(): SettingDescriptor[] {
    return [{ type: "enum", key: "language", label: "Language", options: LANGUAGES.map(([value, label]) => ({ value, label })), default: "en" }];
  }

  private get lang(): string {
    const v = this.settings["language"];
    return LANGUAGES.some(([code]) => code === v) ? (v as string) : "en";
  }

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  /** The age gate and GDPR prompt are cookies the site sets on a click; send them up front. */
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { "User-Agent": UA, Cookie: `ageGatePass=true; locale=${this.lang}; needGDPR=false`, ...extra };
  }

  private async page(url: string): Promise<CheerioRoot> {
    const res = await this.request({ url, headers: this.headers({ Accept: "text/html" }) });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`WEBTOON answered HTTP ${res.status} for ${url}`);
    return this.parse(res.body);
  }

  private cards($: CheerioRoot): SeriesEntry[] {
    const seen = new Set<string>();
    const out: SeriesEntry[] = [];
    $(".webtoon_list li a").each((_, a) => {
      const $a = $(a);
      const href = $a.attr("href");
      if (!href || !/title_no=\d+/.test(href)) return;
      const id = pathOf(href);
      if (seen.has(id)) return;
      seen.add(id);
      const e: SeriesEntry = { id, title: $a.find(".title").first().text().trim() || $a.find("img").attr("alt")?.trim() || id };
      const img = $a.find("img").attr("src");
      if (img) e.thumbnailUrl = img;
      if ($a.find("[data-title-unsuitable-for-children=true]").length) e.contentRating = "mature";
      out.push(e);
    });
    return out;
  }

  // ── Lists & search ──────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return [
      { id: "updated", name: "Updated today", layout: "grid", featured: true },
      ...RANKINGS.map(([id, name], i) => ({ id, name, layout: "grid" as const, featured: i < 2 })),
    ];
  }

  async getListItems(listId: string, _req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    if (listId === "updated") {
      const day = WEEKDAYS[new Date().getUTCDay()]!;
      return { items: this.cards(await this.page(`${SITE}/${this.lang}/originals/${day}?sortOrder=UPDATE`)) };
    }
    if (!RANKINGS.some(([id]) => id === listId)) throw new Error(`unknown list: ${listId}`);
    return { items: this.cards(await this.page(`${SITE}/${this.lang}/ranking/${listId}`)) };
  }

  async getFilters(): Promise<Filter[]> {
    return [{ type: "select", key: "kind", label: "Kind", options: [{ value: "originals", label: "Originals" }, { value: "canvas", label: "Canvas" }] }];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(req.cursor);
    const kind = req.filters?.find((f) => f.key === "kind")?.value;
    const q = new URLSearchParams({ keyword: req.text.trim() });
    // Only the per-kind search pages; the combined one shows a first page of each.
    if (typeof kind === "string" && kind && page > 1) q.set("page", String(page));
    const url = `${SITE}/${this.lang}/search${typeof kind === "string" && kind ? `/${kind}` : ""}?${q}`;
    const $ = await this.page(url);
    const hasNext = typeof kind === "string" && !!kind && $("a.pagination[aria-current=true] + a").length > 0;
    return { items: this.cards($), nextCursor: nextPageCursor(page, hasNext) };
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const $ = await this.page(`${SITE}${seriesId}`);
    const subj = $("h1.subj, h3.subj").first().clone();
    subj.find("br").replaceWith(" ");
    const info: SeriesInfo = { id: seriesId, title: subj.text().replace(/\s+/g, " ").trim(), shareUrl: `${SITE}${seriesId}` };
    const cover = $('meta[property="og:image"]').attr("content");
    if (cover) info.thumbnailUrl = cover;
    const authorArea = $(".detail_header .info .author_area, .detail_header .info .author").first().clone();
    authorArea.find("button, a.btn_author").remove();
    const authors = authorArea.text().replace(/\.\.\./g, "").split(",").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (authors.length) {
      info.authors = authors.map((name) => ({ name }));
      info.author = authors.join(", ");
    }
    const summary = $("p.summary").first().text().trim();
    if (summary) info.description = decode(summary);
    const day = $("p.day_info").first().text().toLowerCase();
    if (day.includes("completed")) info.status = "completed";
    else if (day.includes("hiatus")) info.status = "hiatus";
    else if (day.trim()) info.status = "ongoing";
    const genres = $(".detail_header .info .genre").toArray().map((g) => $(g).text().trim()).filter(Boolean);
    if (genres.length) info.tagGroups = [{ label: "Genres", kind: "genre", tags: [...new Set(genres)] }];
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const titleNo = /title_no=(\d+)/.exec(seriesId)?.[1];
    if (!titleNo) throw new Error(seriesGoneMessage());
    const segments = seriesId.split("?")[0]!.split("/").filter(Boolean);
    const canvas = segments[1] === "canvas";
    const q = new URLSearchParams({ pageSize: "99999" });
    if (canvas) q.set("readingLanguageCode", segments[0] ?? this.lang);
    const res = await this.request({
      url: `${MOBILE}/api/v1/${canvas ? "canvas" : "webtoon"}/${titleNo}/episodes?${q}`,
      headers: this.headers({ Accept: "application/json", Referer: `${MOBILE}/` }),
    });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`WEBTOON answered HTTP ${res.status} for the episode list`);
    const episodes = (JSON.parse(res.body) as { result?: { episodeList?: EpisodeDto[] } }).result?.episodeList ?? [];
    return episodes
      .map((e) => {
        const ch: Chapter = { id: pathOf(e.viewerLink), name: decode(e.episodeTitle).trim(), number: e.episodeNo };
        if (e.exposureDateMillis) ch.publishedAt = e.exposureDateMillis;
        return ch;
      })
      .reverse();
  }

  override async getChapterPages(_seriesId: string, chapterId: string): Promise<Page[]> {
    const $ = await this.page(`${SITE}${chapterId}`);
    const urls = $("div#_imageList > img")
      .toArray()
      .map((img) => $(img).attr("data-url") ?? "")
      .filter((u) => /^https?:/.test(u));
    if (urls.length === 0) throw new Error("WEBTOON: this episode has no images to show (it may be a motion comic, which isn't supported)");
    return urls.map((imageUrl, index) => ({ index, imageUrl }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    if (!/^https?:\/\/(?:www\.|m\.)?webtoons\.com\//.test(url)) return null;
    const path = pathOf(url);
    const titleNo = /[?&]title_no=(\d+)/.exec(path)?.[1];
    if (!titleNo) return null;
    const base = path.split("?")[0]!;
    if (base.endsWith("/viewer")) {
      // `/en/genre/slug/episode-1/viewer?title_no=…&episode_no=…` → the series' list page.
      const series = `${base.replace(/\/[^/]+\/viewer$/, "")}/list?title_no=${titleNo}`;
      return { seriesId: series, chapterId: path };
    }
    return base.endsWith("/list") ? { seriesId: `${base}?title_no=${titleNo}` } : null;
  }
}

export default defineBridge((host) => new WebtoonsBridge(host));
