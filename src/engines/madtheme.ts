/**
 * MadTheme — the platform behind MangaK (ex-MangaBuddy), Toonily.me and their siblings (Keiyoushi's
 * `lib-multisrc/mangak`). Every site runs the same JSON API at `api.<site host>`:
 *  - lists & search: `/titles/search?page&limit&sort&window&q&status&type&demographic&content_rating&genres`
 *  - details: `/titles/{id}`; genres: `/genres`
 *  - chapters: `/titles/{id}/chapters`; pages: `/titles/{id}/chapters/{chapterId}` (`images`)
 *
 * Ids are the API's short ids (`PDmZ0n2E`), never slugs. Covers and pages live on image hosts that
 * rotate (`rx.qvzr?.org`, with `rx.rzyn.net` as the site's own fallback) and need the site's Referer.
 * Sites mix adult titles in; `is_adult` / `content_rating` become `contentRating` so the host can apply
 * the user's ceiling. A chapter's `number` is its position in the list, not its number: that comes
 * from the name.
 */
import {
  BridgeBase,
  type BridgeFactory,
  type BridgeInfo,
  type Chapter,
  type ContentRating,
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
import { chapterNumber, parseAbsoluteDate, parseStatus, standardGuards } from "comical-bridge-kit";
import { hintsForType } from "../cover-hints";
import { guardResponse } from "../core/guarded";

/** What distinguishes one MadTheme site from another. */
export interface MadThemeSite {
  id: string;
  name: string;
  version: string;
  /** The site's host, e.g. `mangak.io`; the API is at `api.<host>`. */
  host: string;
  /** Image hosts the site serves from besides the shared ones (its own `rx.<host>` is covered by `host`). */
  imageHosts?: readonly string[];
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PER_PAGE = 24;
/** The platform's shared image hosts: `rx.qvzr<a–z>.org` rotate; `rzyn.net` is the fallback, `resmk.org` covers. */
const SHARED_IMAGE_HOSTS = [
  ..."abcdefghijklmnopqrstuvwxyz".split("").map((c) => `qvzr${c}.org`),
  "rzyn.net",
  "resmk.org",
];

interface EntityDto {
  name: string;
  slug?: string;
}

interface TitleDto {
  id: string;
  url: string;
  name: string;
  cover?: string | null;
  summary?: string | null;
  status?: string | null;
  rating?: number | null;
  rating_stats?: { average?: number; total?: number } | null;
  is_adult?: boolean;
  content_rating?: string | null;
  type?: EntityDto | null;
  alt_names?: EntityDto[] | null;
  authors?: EntityDto[] | null;
  artists?: EntityDto[] | null;
  genres?: EntityDto[] | null;
  demographics?: EntityDto[] | null;
  formats?: EntityDto[] | null;
  themes?: EntityDto[] | null;
  tags?: EntityDto[] | null;
}

interface ChapterDto {
  id: string;
  url: string;
  name: string;
  updated_at?: string | null;
  images?: string[];
}

const SORTS: ReadonlyArray<SortOption> = [
  { key: "popular", label: "Popular (this week)", directionless: true },
  { key: "latest", label: "Latest update", directionless: true },
  { key: "rating", label: "Rating", directionless: true },
  { key: "views", label: "Most viewed", directionless: true },
  { key: "created", label: "Newest", directionless: true },
  { key: "name", label: "Name", directionless: true },
];

const LISTS: ReadonlyArray<SeriesList & { params: Record<string, string> }> = [
  { id: "popular", name: "Popular this week", layout: "grid", featured: true, params: { sort: "popular", window: "week" } },
  { id: "latest", name: "Latest updates", layout: "grid", featured: true, params: { sort: "latest" } },
];

/** The platform's content rating words as Comical's three levels. */
function ratingOf(t: Pick<TitleDto, "is_adult" | "content_rating">): ContentRating | undefined {
  switch (t.content_rating?.toLowerCase()) {
    case "safe":
      return "everyone";
    case "suggestive":
      return "mature";
    case "erotica":
    case "pornographic":
      return "adult";
  }
  return t.is_adult ? "adult" : undefined;
}

export class MadThemeBridge extends BridgeBase {
  readonly info: BridgeInfo;
  private readonly api: string;
  private readonly guards;
  private genres: EntityDto[] | undefined;

  constructor(
    host: ConstructorParameters<typeof BridgeBase>[0],
    protected readonly site: MadThemeSite,
  ) {
    super(host);
    this.api = `https://api.${site.host}`;
    const imageHosts = [site.host, ...SHARED_IMAGE_HOSTS, ...(site.imageHosts ?? [])];
    this.guards = standardGuards([site.host, ...imageHosts]);
    this.info = {
      id: site.id,
      name: site.name,
      version: site.version,
      contractVersion: "2.1.0",
      languages: ["en"],
      nsfw: false,
      capabilities: ["lists", "search", "filters", "sort", "content-rating"],
      iconUrl: `https://${site.host}/favicon.ico`,
      ratings: true,
      rateLimit: { maxConcurrent: 2, minIntervalMs: 300 },
      assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
      images: { hosts: imageHosts, headers: { Referer: `https://${site.host}/` } },
      linkHosts: [site.host],
    };
  }

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.request({
      url: `${this.api}${path}`,
      headers: { "User-Agent": UA, Accept: "application/json", Origin: `https://${this.site.host}`, Referer: `https://${this.site.host}/` },
    });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    let body: { success?: boolean; data?: T; message?: string };
    try {
      body = JSON.parse(res.body) as typeof body;
    } catch {
      throw new Error(`${this.site.name} sent something that isn't JSON for ${path} (HTTP ${res.status})`);
    }
    if (res.status >= 400 || body.success === false || body.data === undefined) {
      throw new Error(`${this.site.name}: ${body.message ?? `HTTP ${res.status}`} (${path})`);
    }
    return body.data;
  }

  private entry(t: TitleDto): SeriesEntry {
    const e: SeriesEntry = { id: t.id, title: t.name.trim(), ...hintsForType(t.type?.name) };
    if (t.cover) e.thumbnailUrl = t.cover;
    const rating = ratingOf(t);
    if (rating) e.contentRating = rating;
    return e;
  }

  // ── Browse & search ─────────────────────────────────────────────────────────

  private async search(page: number, params: Record<string, string>): Promise<PagedResults<SeriesEntry>> {
    const q = new URLSearchParams({ page: String(page), limit: String(PER_PAGE), ...params });
    const data = await this.get<{ items: TitleDto[]; pagination?: { has_next?: boolean } }>(`/titles/search?${q}`);
    return { items: data.items.map((t) => this.entry(t)), nextCursor: nextPageCursor(page, !!data.pagination?.has_next) };
  }

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ params: _p, ...l }) => l);
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    return this.search(pageFromCursor(req.cursor), list.params);
  }

  async getFilters(): Promise<Filter[]> {
    this.genres ??= (await this.get<{ items: EntityDto[] }>("/genres")).items;
    const select = (key: string, label: string, values: [string, string][]): Filter => ({
      type: "select",
      key,
      label,
      options: values.map(([value, l]) => ({ value, label: l })),
    });
    return [
      select("status", "Status", [["ongoing", "Ongoing"], ["completed", "Completed"], ["hiatus", "Hiatus"], ["cancelled", "Cancelled"]]),
      select("type", "Type", [["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"]]),
      select("demographic", "Demographic", [["shounen", "Shounen"], ["shoujo", "Shoujo"], ["seinen", "Seinen"], ["josei", "Josei"]]),
      select("content_rating", "Content rating", [["safe", "Safe"], ["suggestive", "Suggestive"], ["erotica", "Erotica"], ["pornographic", "Pornographic"]]),
      {
        type: "multiselect",
        key: "genres",
        label: "Genres",
        options: this.genres.filter((g) => g.slug).map((g) => ({ value: g.slug!, label: g.name })),
      },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const params: Record<string, string> = {};
    // The API takes letters, digits and spaces, up to 50 characters.
    const text = req.text.replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 50);
    if (text) params["q"] = text;
    if (req.sort?.key) params["sort"] = req.sort.key;
    if (req.sort?.key === "popular") params["window"] = "week";
    for (const f of req.filters ?? []) {
      if (f.key === "genres" && Array.isArray(f.value) && f.value.length) params["genres"] = f.value.join(",");
      else if (typeof f.value === "string" && f.value && ["status", "type", "demographic", "content_rating"].includes(f.key)) params[f.key] = f.value;
    }
    return this.search(pageFromCursor(req.cursor), params);
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const { title: t } = await this.get<{ title: TitleDto }>(`/titles/${encodeURIComponent(seriesId)}`);
    const info: SeriesInfo = { ...this.entry(t), id: seriesId, shareUrl: `https://${this.site.host}${t.url}` };
    if (t.summary?.trim()) info.description = t.summary.trim();
    const status = parseStatus(t.status);
    if (status !== "unknown") info.status = status;
    if (t.type?.name && t.type.name !== "other") info.type = t.type.name[0]!.toUpperCase() + t.type.name.slice(1);
    const names = (list?: EntityDto[] | null) => (list ?? []).map((e) => e.name.trim()).filter(Boolean);
    const alts = names(t.alt_names).filter((n) => n !== info.title);
    if (alts.length) info.altTitles = [...new Set(alts)];
    const authors = names(t.authors);
    const artists = names(t.artists);
    if (authors.length) {
      info.authors = authors.map((name) => ({ name }));
      info.author = authors.join(", ");
    }
    if (artists.length) {
      info.artists = artists.map((name) => ({ name }));
      info.artist = artists.join(", ");
    }
    const tagGroups: TagGroup[] = [];
    const genres = names([...(t.demographics ?? []), ...(t.genres ?? []), ...(t.themes ?? [])]);
    if (genres.length) tagGroups.push({ label: "Genres", kind: "genre", tags: [...new Set(genres)] });
    const formats = names(t.formats);
    if (formats.length) tagGroups.push({ label: "Format", tags: formats });
    const tags = names(t.tags);
    if (tags.length) tagGroups.push({ label: "Tags", tags });
    if (tagGroups.length) info.tagGroups = tagGroups;
    const avg = t.rating_stats?.average ?? t.rating;
    if (typeof avg === "number" && avg > 0 && avg <= 5) {
      const votes = t.rating_stats?.total;
      info.rating = typeof votes === "number" ? { score: avg / 5, votes } : { score: avg / 5 };
    }
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    // The list is cached at the edge for a day; a fresh `cv` asks past that cache, as the site does.
    const data = await this.get<{ chapters: ChapterDto[] }>(`/titles/${encodeURIComponent(seriesId)}/chapters?cv=${Date.now()}`);
    return data.chapters.map((c) => {
      const ch: Chapter = { id: c.id, name: c.name.trim() || c.id };
      const n = chapterNumber(c.name);
      if (n !== undefined) ch.number = n;
      const at = c.updated_at ? parseAbsoluteDate(c.updated_at) : undefined;
      if (at !== undefined) ch.publishedAt = at;
      return ch;
    });
  }

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    const data = await this.get<{ chapter: ChapterDto }>(`/titles/${encodeURIComponent(seriesId)}/chapters/${encodeURIComponent(chapterId)}`);
    return (data.chapter.images ?? []).filter((u) => /^https?:/.test(u)).map((imageUrl, index) => ({ index, imageUrl }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  /** A site link names a slug; its page says which id that is (and the chapter list maps chapter URLs). */
  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const m = new RegExp(`^https?://(?:www\\.)?${this.site.host.replace(/\./g, "\\.")}/([^/?#]+)(?:/([^/?#]+))?`).exec(url);
    if (!m) return null;
    const page = await this.request({ url: `https://${this.site.host}/${m[1]}`, headers: { "User-Agent": UA, Accept: "text/html" } });
    const next = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(page.body)?.[1];
    let id: string | undefined;
    try {
      id = next ? (JSON.parse(next) as { props?: { pageProps?: { initialManga?: { id?: string } } } }).props?.pageProps?.initialManga?.id : undefined;
    } catch {
      id = undefined;
    }
    if (!id) return null;
    if (!m[2]) return { seriesId: id };
    const path = `/${m[1]}/${m[2]}`;
    const chapter = (await this.get<{ chapters: ChapterDto[] }>(`/titles/${encodeURIComponent(id)}/chapters`)).chapters.find((c) => c.url === path);
    return chapter ? { seriesId: id, chapterId: chapter.id } : { seriesId: id };
  }
}

/** A bridge factory for one MadTheme site. */
export function madTheme(site: MadThemeSite): BridgeFactory {
  return defineBridge((host) => new MadThemeBridge(host, site));
}
