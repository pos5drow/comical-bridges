/**
 * Toonkotsu bridge — https://toonkotsu.com, an aggregator with its own JSON API:
 *  - popular / recently added / search: `/cdn/v1/browse?sort&order&page&limit&q&type&status&…`
 *  - latest: `/cdn/v1/latest?page&limit` — one item per uploaded chapter, shown once per series
 *  - details + every upload: `/cdn/v1/series/{hid}`; pages: `/api/manga/chapter/{id}`
 *
 * A series id is its `code`, the token in the site's links (`/title/{code}-{slug}`; the API takes
 * it as well as the internal `hid`); a chapter id is an upload's id. A chapter often has several
 * uploads (groups, and copies of one group's from different sources); the list keeps one per group
 * and chapter, as the site's own list does, preferring complete uploads and the site's pick.
 *
 * Page images are AES-CTR encrypted, each with its own key and nonce (URL-safe base64, the counter
 * being the 8-byte nonce followed by zeros). Both ride in `Page.process.context`, and
 * `decodePageImage` hands the host an `aes-ctr` transform. Covers aren't encrypted and load
 * directly. Adult series carry `adult: true`, reported as `contentRating: "adult"`.
 *
 * The site sits behind Cloudflare bot management that challenges Node and Bun's TLS fingerprint
 * (curl and the phone network stacks pass), and after some chapters asks for a Turnstile check
 * before more pages; see the roadmap's blocked table.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type ContentRating,
  type Filter,
  type HttpResponse,
  type LinkTarget,
  type ListRequest,
  type Page,
  type PageByteTransform,
  type PageImageDecodeRequest,
  type PagedResults,
  type SearchRequest,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SortOption,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
} from "@comical/sdk";
import { parseStatus, standardGuards } from "comical-bridge-kit";
import { base64UrlToBytes, bytesToBase64 } from "./core/bytes";
import { guardResponse } from "./core/guarded";
import { hintsForType } from "./cover-hints";

const SITE = "https://toonkotsu.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PER_PAGE = 42;

interface GroupDto {
  name: string;
  slug?: string;
}

interface SeriesDto {
  id: number;
  hid: string;
  code: string;
  title: string;
  cover?: string | null;
  type?: string | null;
  status?: string | null;
  adult?: boolean;
  tags?: string[];
  spoilerTags?: string[];
  authors?: string[];
  description?: string | null;
  titles?: { english?: string | null; romaji?: string | null; native?: string | null } | null;
  alt?: string[];
  year?: number | null;
}

interface AltDto {
  id: number;
  label?: string | null;
  at?: number | null;
  group?: GroupDto | null;
  partial?: boolean;
}

interface ChapterDto extends AltDto {
  n: number | null;
  vol?: string | null;
  label: string;
  alts?: AltDto[];
}

interface Upload {
  id: number;
  n: number | null;
  vol?: string | null | undefined;
  label: string;
  at?: number | null | undefined;
  group?: GroupDto | null | undefined;
  partial: boolean;
  /** The upload this one is an alternative of (the site's pick), when it is one. */
  parent?: number;
}

const SORTS: ReadonlyArray<SortOption> = [
  { key: "relevance", label: "Relevance" },
  { key: "popular", label: "Popular" },
  { key: "latest", label: "Latest upload" },
  { key: "new", label: "Recently added" },
  { key: "score", label: "Rating" },
  { key: "title", label: "Title" },
  { key: "year", label: "Year" },
  { key: "chapters", label: "Chapters" },
];

const LISTS: ReadonlyArray<SeriesList> = [
  { id: "popular", name: "Popular", layout: "grid", featured: true },
  { id: "latest", name: "Latest updates", layout: "grid", featured: true },
  { id: "new", name: "Recently added", layout: "grid" },
];

/** The site's top-level genres (the facet list's uncategorised ones). */
const GENRES = [
  "Action", "Adult", "Adventure", "Comedy", "Doujinshi", "Drama", "Ecchi", "Fantasy", "Gender Bender", "Gourmet",
  "Harem", "Hentai", "Horror", "Mahou Shoujo", "Mature", "Mecha", "Music", "Mystery", "Psychological", "Romance",
  "School Life", "Sci-fi", "Shoujo Ai", "Shounen Ai", "Slice of Life", "Smut", "Sports", "Supernatural", "Suspense",
  "Thriller", "Yaoi",
];

const rating = (s: SeriesDto): { contentRating?: ContentRating } =>
  s.adult ? { contentRating: "adult" } : (s.tags ?? []).some((t) => t === "Mature" || t === "Smut" || t === "Ecchi") ? { contentRating: "mature" } : {};

/** The cover at the size the site's title page shows (`…/460.webp` → `…/720.webp`). */
const coverUrl = (path: string | null | undefined) => (path ? `${SITE}${path.replace(/\/\d+\.webp$/, "/720.webp")}` : undefined);

class ToonkotsuBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.toonkotsu",
    name: "Toonkotsu",
    version: "0.1.2",
    contractVersion: "2.1.0",
    languages: ["en"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort", "content-rating"],
    iconUrl: `${SITE}/favicon.ico`,
    rateLimit: { maxConcurrent: 2, minIntervalMs: 500 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    // No headers: covers load directly; encrypted pages are routed for decoding.
    images: { hosts: ["toonkotsu.com"], process: { bytes: true } },
    linkHosts: ["toonkotsu.com"],
  };

  private readonly guards = standardGuards(["toonkotsu.com"]);

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  private async api<T>(path: string): Promise<T> {
    const res = await this.request({ url: `${SITE}${path}`, headers: { "User-Agent": UA, Accept: "application/json", Referer: `${SITE}/` } });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status === 429) {
      let limit: { error?: string; code?: string; reason?: string } = {};
      try {
        limit = JSON.parse(res.body);
      } catch {
        // not the site's JSON
      }
      if (limit.reason === "verify") {
        throw new Error("Toonkotsu wants a human check before more chapters: open one on toonkotsu.com in a browser, pass the check, then try again");
      }
      throw new Error(`Toonkotsu: ${limit.error ?? "too many requests, try again later"}`);
    }
    if (res.status >= 400) throw new Error(`Toonkotsu answered HTTP ${res.status} for ${path.split("?")[0]}`);
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`Toonkotsu sent something that isn't JSON for ${path.split("?")[0]}`);
    }
  }

  private entry(s: SeriesDto): SeriesEntry {
    const e: SeriesEntry = { id: s.code, title: s.title.trim(), ...rating(s), ...hintsForType(s.type ?? undefined) };
    const cover = coverUrl(s.cover);
    if (cover) e.thumbnailUrl = cover;
    return e;
  }

  // ── Lists & search ──────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return [...LISTS];
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    if (listId === "popular" || listId === "new") return this.browse(new URLSearchParams({ sort: listId }), req.cursor);
    if (listId !== "latest") throw new Error(`unknown list: ${listId}`);
    const page = pageFromCursor(req.cursor);
    const res = await this.api<{ items: { series: SeriesDto; chapter?: { label?: string } }[]; hasNextPage?: boolean }>(`/cdn/v1/latest?page=${page}&limit=70`);
    const seen = new Set<string>();
    const items: SeriesEntry[] = [];
    for (const it of res.items) {
      if (seen.has(it.series.code)) continue;
      seen.add(it.series.code);
      const e = this.entry(it.series);
      if (it.chapter?.label) e.subtitle = it.chapter.label;
      items.push(e);
    }
    return { items, nextCursor: nextPageCursor(page, !!res.hasNextPage) };
  }

  async getFilters(): Promise<Filter[]> {
    const opts = (pairs: ReadonlyArray<[string, string]>) => pairs.map(([value, label]) => ({ value, label }));
    return [
      { type: "select", key: "type", label: "Type", options: opts([["Manga", "Manga"], ["Manhwa", "Manhwa"], ["Manhua", "Manhua"], ["OEL", "OEL"], ["Other", "Other"]]) },
      { type: "multiselect", key: "status", label: "Status", options: opts([["Ongoing", "Ongoing"], ["Complete", "Complete"], ["Hiatus", "Hiatus"], ["Canceled", "Canceled"]]) },
      { type: "multiselect", key: "originalLanguage", label: "Country", options: opts([["ja", "Japan"], ["ko", "Korea"], ["zh", "China"], ["en", "Western"]]) },
      { type: "multiselect", key: "genres", label: "Genres", options: GENRES.map((g) => ({ value: g, label: g })), excludable: true },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const text = req.text.trim();
    const q = new URLSearchParams({ sort: req.sort?.key ?? (text ? "relevance" : "popular") });
    if (req.sort) q.set("order", req.sort.ascending ? "asc" : "desc");
    if (text) q.set("q", text);
    for (const f of req.filters ?? []) {
      const v = f.value;
      if (f.key === "type" && typeof v === "string" && v) q.set("type", v);
      else if ((f.key === "status" || f.key === "originalLanguage") && Array.isArray(v) && v.length) q.set(f.key, v.join(","));
      else if (f.key === "genres" && v && typeof v === "object") {
        const { include = [], exclude = [] } = Array.isArray(v) ? { include: v as string[] } : (v as { include?: string[]; exclude?: string[] });
        if (include.length) q.set("genres", include.join(","));
        if (exclude.length) q.set("exclude", exclude.join(","));
      }
    }
    return this.browse(q, req.cursor);
  }

  private async browse(params: URLSearchParams, cursor: string | undefined): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(cursor);
    const q = new URLSearchParams({ sort: "popular", order: "desc" });
    for (const [k, v] of params) q.set(k, v);
    q.set("page", String(page));
    q.set("limit", String(PER_PAGE));
    const res = await this.api<{ items: SeriesDto[]; hasNextPage?: boolean }>(`/cdn/v1/browse?${q}`);
    return { items: res.items.map((s) => this.entry(s)), nextCursor: nextPageCursor(page, !!res.hasNextPage) };
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  private series(seriesId: string): Promise<{ series: SeriesDto; chapters: ChapterDto[] }> {
    if (!/^[a-z0-9]+$/i.test(seriesId)) throw new Error(seriesGoneMessage());
    return this.api(`/cdn/v1/series/${seriesId}`);
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const { series: s } = await this.series(seriesId);
    const info: SeriesInfo = { ...this.entry(s), id: seriesId, shareUrl: `${SITE}/title/${s.code}` };
    if (s.description?.trim()) info.description = s.description.trim();
    const alts = [s.titles?.english, s.titles?.romaji, s.titles?.native, ...(s.alt ?? [])].map((t) => t?.trim() ?? "").filter((t) => t && t !== info.title);
    if (alts.length) info.altTitles = [...new Set(alts)];
    const authors = (s.authors ?? []).map((a) => a.trim()).filter(Boolean);
    if (authors.length) {
      info.authors = authors.map((name) => ({ name }));
      info.author = authors.join(", ");
    }
    const spoilers = new Set(s.spoilerTags ?? []);
    const tags = (s.tags ?? []).filter((t) => !spoilers.has(t));
    if (tags.length) info.tagGroups = [{ label: "Tags", kind: "genre", tags }];
    const status = parseStatus(s.status === "Complete" ? "completed" : s.status === "Canceled" ? "cancelled" : s.status);
    if (status !== "unknown") info.status = status;
    if (s.type) info.type = s.type;
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const { chapters } = await this.series(seriesId);
    const uploads: Upload[] = chapters.flatMap((c) => [
      { id: c.id, n: c.n, vol: c.vol, label: c.label, at: c.at, group: c.group, partial: !!c.partial },
      ...[...(c.alts ?? [])]
        .sort((a, b) => a.id - b.id)
        .map((a) => ({ id: a.id, n: c.n, vol: c.vol, label: a.label ?? c.label, at: a.at ?? c.at, group: a.group, partial: !!a.partial, parent: c.id })),
    ]);
    // The site splits rows by volume when three or more chapter numbers span several volumes.
    const volumesByNumber = new Map<number, Set<string>>();
    for (const u of uploads) {
      if (u.n === null || !u.vol?.trim() || !Number.isFinite(Number(u.vol))) continue;
      const set = volumesByNumber.get(u.n) ?? new Set<string>();
      set.add(String(Number(u.vol)));
      volumesByNumber.set(u.n, set);
    }
    const byVolume = [...volumesByNumber.values()].filter((v) => v.size > 1).length >= 3;
    const row = (u: Upload, byGroup: boolean) =>
      [byVolume ? (u.vol?.trim().toLowerCase() ?? "") : "", u.n ?? u.parent ?? u.id, byGroup ? (u.group?.slug ?? u.group?.name ?? "") : ""].join("|");
    // One upload per chapter and group: complete before partial, the site's pick before its alternatives.
    const ranked = [...uploads].sort((a, b) => Number(a.partial) - Number(b.partial) || Number(a.parent !== undefined) - Number(b.parent !== undefined));
    const picks = new Map<string, Upload>();
    for (const u of ranked) if (!picks.has(row(u, true))) picks.set(row(u, true), u);
    // A partial-only row is hidden when another group has the whole chapter.
    const complete = new Set([...picks.values()].filter((u) => !u.partial).map((u) => row(u, false)));
    const kept = new Set([...picks.values()].filter((u) => !u.partial || !complete.has(row(u, false))));
    return uploads
      .filter((u) => kept.has(u))
      .map((u) => {
        const ch: Chapter = { id: String(u.id), name: u.label.trim() };
        if (u.n !== null && Number.isFinite(u.n)) ch.number = u.n;
        const vol = Number(u.vol);
        if (u.vol?.trim() && Number.isFinite(vol)) ch.volume = vol;
        if (u.at) ch.publishedAt = u.at;
        if (u.group?.name) ch.group = u.partial ? `${u.group.name} (incomplete)` : u.group.name;
        return ch;
      });
  }

  override async getChapterPages(_seriesId: string, chapterId: string): Promise<Page[]> {
    if (!/^\d+$/.test(chapterId)) throw new Error(seriesGoneMessage("chapter removed from the source"));
    const res = await this.api<{ chapter: { pages: { src: string; k: string; n: string }[] } }>(`/api/manga/chapter/${chapterId}`);
    return res.chapter.pages.map((p, index) => {
      const page: Page = { index, imageUrl: p.src.startsWith("http") ? p.src : `${SITE}${p.src}` };
      if (p.k && p.n) page.process = { context: { k: p.k, n: p.n } };
      return page;
    });
  }

  async decodePageImage(req: PageImageDecodeRequest): Promise<PageByteTransform[] | null> {
    const key = base64UrlToBytes(req.context?.["k"] ?? "");
    const nonce = base64UrlToBytes(req.context?.["n"] ?? "");
    if (!key || !nonce || ![16, 24, 32].includes(key.length) || nonce.length === 0 || nonce.length > 16) return null;
    const counter = new Uint8Array(16);
    counter.set(nonce);
    return [{ kind: "aes-ctr", key: bytesToBase64(key), counter: bytesToBase64(counter) }];
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  /** `/title/{code}[-slug][/{chapterId}]`; an older link naming the 5-character `hid` is looked up. */
  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const m = /^https?:\/\/(?:www\.)?toonkotsu\.com\/title\/([a-z0-9]{5,6})(?=[-/?#]|$)(?:-[^/?#]*)?(?:\/(\d+))?/i.exec(url);
    if (!m) return null;
    const seriesId = m[1]!.length === 6 ? m[1]!.toLowerCase() : (await this.series(m[1]!.toLowerCase())).series.code;
    return m[2] ? { seriesId, chapterId: m[2] } : { seriesId };
  }
}

export default defineBridge((host) => new ToonkotsuBridge(host));
