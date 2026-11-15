/**
 * MangaTaro — the WordPress-based platform behind MangaTaro and Rolia Scan (Keiyoushi's
 * `lib-multisrc/mangataro`). On the site's own origin:
 *  - browse with filters: `POST /wp-json/manga/v1/load` (array filters sent as JSON strings)
 *  - text search: `POST /auth/search`
 *  - details: `/wp-json/wp/v2/manga/{id}?_embed`
 *  - chapters: `/auth/manga-chapters?manga_id&offset&limit&order&_t&_ts`, where `_t` is the first 16
 *    hex of md5(`{seconds}mng_ch_{yyyyMMddHH UTC}`) and is only accepted within about a minute of the
 *    server's clock — a 403 is answered by correcting against the response's Date header, once
 *  - pages: `/auth/chapter-content?chapter_id`
 *
 * Series ids are the WordPress post id; chapters their numeric id. Novels are left out, and only
 * English chapters kept. Some chapters are taken down ("Chapter not available") and say so.
 */
import {
  BridgeBase,
  type BridgeFactory,
  type BridgeInfo,
  type Chapter,
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
  type SortOption,
  type TagGroup,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
} from "@comical/sdk";
import { chapterNumber, md5, parseRelativeDate, parseStatus, standardGuards } from "comical-bridge-kit";
import { hintsForType } from "../cover-hints";
import { guardResponse } from "../core/guarded";

/** What distinguishes one MangaTaro site from another. */
export interface MangaTaroSite {
  id: string;
  name: string;
  version: string;
  /** The site's origin, `https://host`. */
  base: string;
  /** Image hosts besides the site itself (pages live on a sibling domain). */
  imageHosts: readonly string[];
  /** The site's genre tags, `[name, id]`. */
  tags: ReadonlyArray<readonly [string, number]>;
  /**
   * API pages folded into one page of results. Some sites pad browse pages with blank chapter-level
   * rows, so one API page can hold only a few real series.
   */
  apiPagesPerPage?: number;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const API_PAGE_SIZE = 24;
const PLACEHOLDERS = new Set(["", "N/A", "—"]);

interface BrowseDto {
  id: string;
  url: string;
  title: string;
  cover?: string;
  type?: string;
  description?: string;
  status?: string;
}

interface SearchDto {
  id: number;
  slug: string;
  title: string;
  thumbnail?: string;
  type?: string;
  status?: string;
}

interface DetailsDto {
  id: number;
  slug: string;
  type?: string;
  link?: string;
  title: { rendered: string };
  content: { rendered: string };
  _embedded?: {
    "wp:featuredmedia"?: { source_url?: string }[];
    "wp:term"?: { name: string; taxonomy: string }[][];
  };
}

interface ChapterDto {
  id: string;
  url: string;
  chapter: string;
  title?: string | null;
  date?: string;
  group_name?: string | null;
  language?: string;
}

const SORTS: ReadonlyArray<SortOption> = [
  { key: "popular", label: "Popular" },
  { key: "post", label: "Latest update" },
  { key: "release", label: "Release date" },
  { key: "title", label: "Title" },
];

// Latest first: the most popular titles are the licensed ones these sites take chapters down from.
const LISTS: ReadonlyArray<SeriesList & { sort: string }> = [
  { id: "latest", name: "Latest updates", layout: "grid", featured: true, sort: "post_desc" },
  { id: "popular", name: "Popular", layout: "grid", featured: true, sort: "popular_desc" },
];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML entities decoded (repeatedly: the API double-escapes some titles). */
export function unescapeHtml(text: string): string {
  let prev = "";
  let out = text;
  while (out !== prev) {
    prev = out;
    out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  }
  return out;
}

function htmlToText(html: string): string {
  return unescapeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The chapter-list token: md5(`{seconds}mng_ch_{yyyyMMddHH}`) in UTC, first 16 hex. */
export function chapterToken(nowMs: number): { t: string; ts: string } {
  const sec = Math.floor(nowMs / 1000);
  const d = new Date(sec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const hour = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`;
  return { t: md5(`${sec}mng_ch_${hour}`).slice(0, 16), ts: String(sec) };
}

export class MangaTaroBridge extends BridgeBase {
  readonly info: BridgeInfo;
  private readonly guards;
  /** Server clock minus ours, learned from a refused chapter request. */
  private clockSkewMs = 0;

  constructor(
    host: ConstructorParameters<typeof BridgeBase>[0],
    protected readonly site: MangaTaroSite,
  ) {
    super(host);
    const siteHost = new URL(site.base).host.replace(/^www\./, "");
    this.guards = standardGuards([siteHost, ...site.imageHosts]);
    this.info = {
      id: site.id,
      name: site.name,
      version: site.version,
      contractVersion: "2.1.0",
      languages: ["en"],
      nsfw: false,
      capabilities: ["lists", "search", "filters", "sort"],
      iconUrl: `${site.base}/favicon.ico`,
      rateLimit: { maxConcurrent: 2, minIntervalMs: 400 },
      assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
      linkHosts: [siteHost],
    };
  }

  private headers(json = false): Record<string, string> {
    return {
      "User-Agent": UA,
      Accept: "application/json",
      Origin: this.site.base,
      Referer: `${this.site.base}/`,
      "X-Requested-With": "XMLHttpRequest",
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  private parseJson<T>(res: HttpResponse, what: string): T {
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`${this.site.name} sent something that isn't JSON for ${what} (HTTP ${res.status})`);
    }
  }

  private browseEntry(m: BrowseDto): SeriesEntry {
    const e: SeriesEntry = { id: String(m.id), title: unescapeHtml(m.title).trim(), ...hintsForType(m.type) };
    if (m.cover) e.thumbnailUrl = m.cover;
    return e;
  }

  // ── Browse & search ─────────────────────────────────────────────────────────

  private async browsePage(apiPage: number, params: { search?: string; genres?: number[]; types?: string[]; statuses?: string[]; sort: string }): Promise<BrowseDto[]> {
    const body = {
      page: apiPage,
      search: params.search ?? "",
      years: "[]",
      genres: JSON.stringify(params.genres ?? []),
      types: JSON.stringify(params.types ?? []),
      statuses: JSON.stringify(params.statuses ?? []),
      sort: params.sort,
      genreMatchMode: "any",
    };
    const res = await this.request({ url: `${this.site.base}/wp-json/manga/v1/load`, method: "POST", headers: this.headers(true), body: JSON.stringify(body) });
    if (res.status >= 400) throw new Error(`${this.site.name} answered HTTP ${res.status} for its catalogue`);
    return this.parseJson<BrowseDto[]>(res, "its catalogue");
  }

  private async browse(page: number, params: Parameters<MangaTaroBridge["browsePage"]>[1]): Promise<PagedResults<SeriesEntry>> {
    const per = this.site.apiPagesPerPage ?? 1;
    const items: SeriesEntry[] = [];
    const seen = new Set<string>();
    let full = false;
    for (let p = (page - 1) * per + 1; p <= page * per; p++) {
      const rows = await this.browsePage(p, params);
      for (const m of rows) {
        if (m.type === "Novel" || !m.url || seen.has(String(m.id))) continue;
        seen.add(String(m.id));
        items.push(this.browseEntry(m));
      }
      full = rows.length >= API_PAGE_SIZE;
      if (!full) break;
    }
    return { items, nextCursor: nextPageCursor(page, full) };
  }

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ sort: _s, ...l }) => l);
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    return this.browse(pageFromCursor(req.cursor), { sort: list.sort });
  }

  async getFilters(): Promise<Filter[]> {
    return [
      { type: "select", key: "type", label: "Type", options: ["Manga", "Manhwa", "Manhua"].map((v) => ({ value: v, label: v })) },
      { type: "select", key: "status", label: "Status", options: ["Ongoing", "Completed"].map((v) => ({ value: v, label: v })) },
      { type: "multiselect", key: "genres", label: "Genres", options: this.site.tags.map(([name, id]) => ({ value: String(id), label: name })) },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(req.cursor);
    const text = req.text.trim();
    const filters = req.filters ?? [];
    const filtered = filters.some((f) => (Array.isArray(f.value) ? f.value.length > 0 : !!f.value));
    if (text && !filtered && !req.sort) {
      // The site's own search: better matches, one page of 25.
      if (page > 1) return { items: [] };
      const res = await this.request({
        url: `${this.site.base}/auth/search`,
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify({ query: text, limit: 25 }),
      });
      const { results } = this.parseJson<{ results?: SearchDto[] }>(res, "search");
      return {
        items: (results ?? [])
          .filter((m) => m.type !== "Novel")
          .map((m) => {
            const e: SeriesEntry = { id: String(m.id), title: unescapeHtml(m.title).trim(), ...hintsForType(m.type) };
            if (m.thumbnail) e.thumbnailUrl = m.thumbnail;
            return e;
          }),
      };
    }
    const one = (key: string) => {
      const v = filters.find((f) => f.key === key)?.value;
      return typeof v === "string" && v ? [v] : [];
    };
    const genres = filters.find((f) => f.key === "genres")?.value;
    return this.browse(page, {
      search: text,
      types: one("type"),
      statuses: one("status"),
      genres: Array.isArray(genres) ? genres.map(Number).filter(Number.isFinite) : [],
      sort: `${req.sort?.key ?? "popular"}_${req.sort?.ascending ? "asc" : "desc"}`,
    });
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const res = await this.request({ url: `${this.site.base}/wp-json/wp/v2/manga/${encodeURIComponent(seriesId)}?_embed`, headers: this.headers() });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    const d = this.parseJson<DetailsDto>(res, "series details");
    const info: SeriesInfo = {
      id: seriesId,
      title: unescapeHtml(d.title.rendered).trim(),
      shareUrl: d.link ?? `${this.site.base}/manga/${d.slug}`,
      ...hintsForType(d.type),
    };
    const description = htmlToText(d.content.rendered);
    if (description) info.description = description;
    const cover = d._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
    if (cover) info.thumbnailUrl = cover;
    const terms = (taxonomy: string) =>
      (d._embedded?.["wp:term"] ?? []).flat().filter((t) => t.taxonomy === taxonomy).map((t) => unescapeHtml(t.name).trim()).filter(Boolean);
    const authors = terms("manga_author");
    if (authors.length) {
      info.authors = authors.map((name) => ({ name }));
      info.author = authors.join(", ");
    }
    const tags = terms("post_tag");
    if (tags.length) {
      const tagGroups: TagGroup[] = [{ label: "Genres", kind: "genre", tags }];
      info.tagGroups = tagGroups;
    }
    if (d.type) info.type = d.type[0]!.toUpperCase() + d.type.slice(1);
    return info;
  }

  private async chapterPage(seriesId: string, offset: number): Promise<{ chapters: ChapterDto[]; has_more?: boolean }> {
    const url = (now: number) => {
      const { t, ts } = chapterToken(now);
      const q = new URLSearchParams({ manga_id: seriesId, offset: String(offset), limit: "500", order: "DESC", _t: t, _ts: ts });
      return `${this.site.base}/auth/manga-chapters?${q}`;
    };
    let res = await this.request({ url: url(Date.now() + this.clockSkewMs), headers: this.headers() });
    if (res.status === 403) {
      // The token is only good within a minute of the server's clock: correct ours from its Date, once.
      const date = Object.entries(res.headers).find(([k]) => k.toLowerCase() === "date")?.[1];
      const server = date ? Date.parse(date) : NaN;
      if (!Number.isFinite(server)) throw new Error(`${this.site.name} refused the chapter list`);
      this.clockSkewMs = server - Date.now();
      res = await this.request({ url: url(Date.now() + this.clockSkewMs), headers: this.headers() });
    }
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`${this.site.name} answered HTTP ${res.status} for the chapter list`);
    return this.parseJson(res, "the chapter list");
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const all: ChapterDto[] = [];
    for (let guard = 0; guard < 20; guard++) {
      const page = await this.chapterPage(seriesId, all.length);
      all.push(...page.chapters);
      if (!page.has_more || page.chapters.length === 0) break;
    }
    const now = Date.now();
    return all
      .filter((c) => (c.language ?? "en").toLowerCase() === "en")
      .map((c) => {
        const title = c.title && !PLACEHOLDERS.has(c.title.trim()) ? `: ${unescapeHtml(c.title).trim()}` : "";
        const ch: Chapter = { id: String(c.id), name: `Chapter ${c.chapter}${title}` };
        const n = chapterNumber(c.chapter);
        if (n !== undefined) ch.number = n;
        const at = c.date ? parseRelativeDate(c.date, now) : undefined;
        if (at !== undefined) ch.publishedAt = Math.round(at);
        if (c.group_name && !PLACEHOLDERS.has(c.group_name.trim())) ch.group = c.group_name.trim();
        return ch;
      });
  }

  override async getChapterPages(_seriesId: string, chapterId: string): Promise<Page[]> {
    const res = await this.request({ url: `${this.site.base}/auth/chapter-content?chapter_id=${encodeURIComponent(chapterId)}`, headers: this.headers() });
    const body = this.parseJson<{ success?: boolean; message?: string; images?: string[] }>(res, "chapter pages");
    if (body.success === false || res.status >= 400) {
      throw new Error(`${this.site.name}: ${body.message ?? `HTTP ${res.status}`}`);
    }
    return (body.images ?? []).filter((u) => /^https?:/.test(u)).map((imageUrl, index) => ({ index, imageUrl }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const host = new URL(this.site.base).host.replace(/^www\./, "").replace(/\./g, "\\.");
    const m = new RegExp(`^https?://(?:www\\.)?${host}/(manga|read)/([^/?#]+)(?:/([^/?#]+))?`).exec(url);
    if (!m) return null;
    const page = await this.request({ url: `${this.site.base}/manga/${m[2]}`, headers: { "User-Agent": UA, Accept: "text/html" } });
    const id = /data-manga-id="(\d+)"/.exec(page.body)?.[1];
    if (!id) return null;
    const chapter = m[1] === "read" && m[3] ? /-(\d+)$/.exec(m[3])?.[1] : undefined;
    return chapter ? { seriesId: id, chapterId: chapter } : { seriesId: id };
  }
}

/** A bridge factory for one MangaTaro site. */
export function mangaTaro(site: MangaTaroSite): BridgeFactory {
  return defineBridge((host) => new MangaTaroBridge(host, site));
}
