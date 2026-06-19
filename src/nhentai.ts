/**
 * nhentai bridge (v2 API) — https://nhentai.net
 *
 * Uses the official v2 JSON API. Auth is an API key the user creates at
 * nhentai.net › Account › API Keys — no cookies, no CloudFlare wrestling.
 * The key is optional for browsing (public endpoints work without it); it
 * unlocks higher rate limits and enables favorites.
 *
 * Galleries have no chapter structure, so this bridge uses the "direct"
 * capability: `getSeriesPages` returns a flat page list.
 *
 * NOTE: The v2 list endpoints (GalleryListItem) and detail endpoint
 * (GalleryDetail) use different schemas. List items carry flat title strings
 * and a bare thumbnail path; the detail carries a title object and full page
 * metadata. CDN base URLs come from /api/v2/cdn and are cached for the life
 * of the bridge instance.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Filter,
  type ListOptions,
  type Page,
  type PagedResults,
  type RelatedSeriesGroup,
  type SearchOptions,
  type CardBadge,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SortOption,
  type InferSettings,
  type SettingDescriptor,
  type Tag,
  type TagGroup,
  defineBridge,
  defineSettings,
} from "@comical/sdk";

const BASE = "https://nhentai.net/api/v2";
const IMG_FALLBACK = "https://i1.nhentai.net";
const THUMB_FALLBACK = "https://t1.nhentai.net";

const PER_PAGE = 25;

/**
 * Placeholder title for an entry redacted by the user's tag exclusions. Carries no real name; the
 * host renders its own blank placeholder for `excluded` entries, and an unaware host degrades to a
 * coverless "Hidden" card. Never the actual gallery title.
 */
const REDACTED_TITLE = "Hidden";

const SETTINGS = defineSettings([
  {
    type: "string",
    key: "apiKey",
    label: "API key",
    description:
      "Optional for browsing — required for favorites. Create one at nhentai.net › Account › API Keys.",
    secret: true,
  },
]);
type Settings = InferSettings<typeof SETTINGS>;

// ── DTOs ──────────────────────────────────────────────────────────────────────
// List items and detail use different shapes in the v2 API.

/** Lightweight gallery as returned by list/search endpoints. */
interface GalleryListItem {
  id: number;
  media_id: string;
  /** Flat string — NOT a nested object like the detail endpoint. */
  english_title?: string;
  japanese_title?: string;
  /** Relative CDN path, e.g. "galleries/3979254/thumb.webp". Prefix with thumb server. */
  thumbnail?: string;
  num_pages?: number;
  tag_ids?: number[];
}

/** Full gallery from the detail endpoint. */
interface GalleryTitle {
  english?: string;
  japanese?: string;
  pretty?: string;
}
interface PathDim {
  path: string;
  width?: number;
  height?: number;
}
interface PageItem {
  number: number;
  /** Relative CDN path, e.g. "galleries/3979254/1.webp". Prefix with image server. */
  path: string;
  width?: number;
  height?: number;
}
interface GalleryTag {
  id: number;
  type: string; // tag | language | artist | group | parody | category | character
  name: string;
}
interface GalleryDetail {
  id: number;
  media_id: string;
  title: GalleryTitle;
  cover?: PathDim;
  thumbnail?: PathDim;
  pages?: PageItem[];
  tags?: GalleryTag[];
  num_pages?: number;
}

interface PaginatedGalleries {
  result?: GalleryListItem[];
  num_pages?: number;
}

interface CdnConfigResponse {
  image_servers?: string[];
  thumb_servers?: string[];
}

interface TagDto {
  id: number;
  type: string;
  name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * nhentai's permanent tag ids for the three languages it carries, used to put a language badge on a
 * card. List/search payloads only ship a flat `tag_ids` array (no tag names), so this tiny constant
 * map reads the language straight from data already in hand — no name lookup, no extra request. The
 * "translated" modifier tag is intentionally excluded so the badge shows the actual language.
 */
const LANGUAGE_TAG_IDS: Record<number, string> = {
  12227: "English",
  6346: "Japanese",
  29963: "Chinese",
};

/** Language badge for a card from its inline tag ids (top-right), or none when no language is tagged. */
function languageBadges(tagIds: number[] | undefined): CardBadge[] {
  for (const id of tagIds ?? []) {
    const lang = LANGUAGE_TAG_IDS[id];
    if (lang) return [{ text: lang, position: "top-right", tone: "info" }];
  }
  return [];
}

/** Prefix a relative CDN path with its server origin. */
function cdnUrl(relativePath: string, server: string): string {
  return `${server}/${relativePath}`;
}

/**
 * Derive nhentai's small thumbnail path from a full-page path by inserting the `t` suffix before the
 * extension: "galleries/123/1.webp" → "galleries/123/1t.webp". Served off the thumb CDN, this is a
 * ~250px preview — no extra request to discover it, just a filename transform on data we already have.
 */
function thumbPath(pagePath: string): string {
  return pagePath.replace(/\.(\w+)$/, "t.$1");
}

function listItemTitle(item: GalleryListItem): string {
  return item.english_title ?? item.japanese_title ?? String(item.id);
}

// ── Lists ─────────────────────────────────────────────────────────────────────

interface ListDef extends SeriesList {
  path: string;
  paginated: boolean;
}

const LISTS: ReadonlyArray<ListDef> = [
  // nhentai's homepage "Popular Now" feed. NOTE: distinct from the `popular-today` *sort* option
  // below (search?sort=popular-today) — `galleries/popular` is the live homepage rail and matches
  // the site's "Popular Now" section exactly.
  { id: "popular-now", name: "Popular Now", layout: "grid", featured: true, path: "galleries/popular", paginated: false },
  { id: "new", name: "New Arrivals", layout: "grid", featured: true, path: "galleries", paginated: true },
];

// ── Bridge ────────────────────────────────────────────────────────────────────

class NhentaiBridge extends BridgeBase<Settings> {
  readonly info: BridgeInfo = {
    id: "nhentai",
    name: "nhentai",
    version: "0.1.0",
    contractVersion: "1.0.0",
    languages: ["multi"],
    nsfw: true,
    capabilities: ["lists", "search", "filters", "sort", "settings", "favorites", "direct", "exclude-tags", "resolve-tags"],
    rateLimit: { maxConcurrent: 1, minIntervalMs: 1200 },
  };

  private cdnImageServer: string | undefined;
  private cdnThumbServer: string | undefined;
  private cdnFetched = false;
  private tagNames = new Map<string, string>(); // tagId → name
  private lastDetail: { id: string; data: GalleryDetail } | undefined;

  getSettings(): SettingDescriptor[] {
    return [...SETTINGS];
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    };
    const key = this.setting("apiKey");
    if (key) h["Authorization"] = `Key ${key}`;
    return h;
  }

  private getJson<T>(url: string): Promise<T> {
    return this.fetchJson<T>(url, this.headers());
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await this.request({
      url,
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return JSON.parse(res.body) as T;
  }

  private async deleteReq(url: string): Promise<void> {
    const res = await this.request({ url, method: "DELETE", headers: this.headers() });
    if (res.status >= 400) throw new Error(`${res.status} ${res.statusText}`);
  }

  // ── CDN ───────────────────────────────────────────────────────────────────

  private async ensureCdn(): Promise<void> {
    if (this.cdnFetched) return;
    this.cdnFetched = true;
    try {
      const cfg = await this.getJson<CdnConfigResponse>(`${BASE}/cdn`);
      this.cdnImageServer = cfg.image_servers?.[0];
      this.cdnThumbServer = cfg.thumb_servers?.[0];
    } catch { /* fall back to hardcoded servers below */ }
  }

  private async imageServer(): Promise<string> {
    await this.ensureCdn();
    return this.cdnImageServer ?? IMG_FALLBACK;
  }

  private async thumbServer(): Promise<string> {
    await this.ensureCdn();
    return this.cdnThumbServer ?? THUMB_FALLBACK;
  }

  // ── Gallery detail (single-slot cache) ───────────────────────────────────

  private async fetchDetail(seriesId: string): Promise<GalleryDetail> {
    if (this.lastDetail?.id === seriesId) return this.lastDetail.data;
    const data = await this.getJson<GalleryDetail>(`${BASE}/galleries/${encodeURIComponent(seriesId)}`);
    this.lastDetail = { id: seriesId, data };
    return data;
  }

  /**
   * nhentai's algorithmic "More Like This" rail: `GET /galleries/{id}/related` returns the same
   * `{ result: GalleryListItem[] }` shape as the list endpoints (typically 5 galleries), so the
   * items reuse the standard `toEntry` pipeline. Best-effort — any failure yields an empty rail
   * rather than breaking the detail page.
   */
  private async fetchRelated(seriesId: string): Promise<GalleryListItem[]> {
    try {
      const data = await this.getJson<PaginatedGalleries>(
        `${BASE}/galleries/${encodeURIComponent(seriesId)}/related`,
      );
      return data.result ?? [];
    } catch {
      return [];
    }
  }

  // ── Convert list item → SeriesEntry ──────────────────────────────────────

  private toEntry(item: GalleryListItem, thumb: string, excluded?: Set<string>): SeriesEntry {
    // Redact items carrying an excluded tag (capability "exclude-tags"). The inline `tag_ids` ride
    // along in every list/search payload, so this match costs no extra request. We keep the slot
    // but strip the title and thumbnail: the host shows a blank placeholder and never fetches a cover.
    if (excluded?.size && (item.tag_ids ?? []).some((t) => excluded.has(String(t)))) {
      return { id: String(item.id), title: REDACTED_TITLE, excluded: true };
    }
    const entry: SeriesEntry = {
      id: String(item.id),
      title: listItemTitle(item),
    };
    if (item.thumbnail) entry.thumbnailUrl = cdnUrl(item.thumbnail, thumb);
    const badges = languageBadges(item.tag_ids);
    if (badges.length) entry.badges = badges;
    return entry;
  }

  private async listToEntries(items: GalleryListItem[], excluded?: Set<string>): Promise<SeriesEntry[]> {
    const thumb = await this.thumbServer();
    return items.map((item) => this.toEntry(item, thumb, excluded));
  }

  /** Build the excluded-tag-id set from injected options (numeric tag ids, as `getTags()` returns). */
  private excludedSet(options?: { excludedTags?: string[] }): Set<string> | undefined {
    const ids = options?.excludedTags;
    if (!ids?.length) return undefined;
    const set = new Set(ids.map((s) => String(s).trim()).filter(Boolean));
    return set.size ? set : undefined;
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  async getTags(query = ""): Promise<Tag[]> {
    try {
      const results = await this.postJson<TagDto[]>(`${BASE}/tags/search`, {
        query: query.trim(),
        type: "tag",
      });
      return (results ?? []).slice(0, 50).map((r) => {
        this.tagNames.set(String(r.id), r.name);
        return { id: String(r.id), label: r.name };
      });
    } catch {
      return [];
    }
  }

  /**
   * Reverse lookup, the inverse of `getTags`'s name search: resolve bare tag ids back to names via
   * nhentai's `tags/ids` batch endpoint (the host uses it to put names on persisted exclusions). Only
   * numeric ids are queryable; unresolved ids are silently omitted, and any failure yields nothing
   * (the host then shows the id). Resolved names seed `tagNames` for redaction reuse.
   */
  async resolveTags(ids: string[]): Promise<Tag[]> {
    const numeric = ids
      .map((id) => id.trim())
      .filter((s) => s.length > 0 && Number.isInteger(Number(s)));
    if (numeric.length === 0) return [];
    try {
      // GET /api/v2/tags/ids?ids=19440,32341 → bare TagDto[] (id/type/name/…).
      const results = await this.getJson<TagDto[]>(`${BASE}/tags/ids?ids=${numeric.join(",")}`);
      return (results ?? []).map((r) => {
        this.tagNames.set(String(r.id), r.name);
        return { id: String(r.id), label: r.name };
      });
    } catch {
      return [];
    }
  }

  // ── Filters / sort ────────────────────────────────────────────────────────

  getFilters(): Promise<Filter[]> {
    return Promise.resolve([
      {
        type: "multiselect",
        key: "language",
        label: "Language",
        options: [
          { value: "english", label: "English" },
          { value: "japanese", label: "Japanese" },
          { value: "chinese", label: "Chinese" },
          { value: "korean", label: "Korean" },
          { value: "spanish", label: "Spanish" },
        ],
      },
      {
        type: "multiselect",
        key: "category",
        label: "Category",
        options: [
          { value: "doujinshi", label: "Doujinshi" },
          { value: "manga", label: "Manga" },
          { value: "artistcg", label: "Artist CG" },
          { value: "gamecg", label: "Game CG" },
          { value: "western", label: "Western" },
        ],
      },
      { type: "tag-multiselect", key: "tag", label: "Tag" },
      { type: "text", key: "author", label: "Artist" },
    ]);
  }

  getSortOptions(): Promise<SortOption[]> {
    return Promise.resolve([
      { key: "date", label: "New Arrivals", directionless: true },
      { key: "popular", label: "All-Time Popular", directionless: true },
      { key: "popular-today", label: "Popular Today", directionless: true },
      { key: "popular-week", label: "Popular This Week", directionless: true },
      { key: "popular-month", label: "Popular This Month", directionless: true },
    ]);
  }

  // ── Lists ─────────────────────────────────────────────────────────────────

  getLists(): Promise<SeriesList[]> {
    return Promise.resolve(LISTS.map(({ path: _p, paginated: _q, ...list }) => list));
  }

  async getListItems(listId: string, page: number, options?: ListOptions): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    const excluded = this.excludedSet(options);

    if (!list.paginated) {
      const raw = await this.getJson<GalleryListItem[] | PaginatedGalleries>(`${BASE}/${list.path}`);
      const rawItems = Array.isArray(raw) ? raw : (raw.result ?? []);
      return { items: await this.listToEntries(rawItems, excluded), page: 1, hasNextPage: false };
    }

    const data = await this.getJson<PaginatedGalleries>(
      `${BASE}/${list.path}?page=${page}&per_page=${PER_PAGE}`,
    );
    return {
      items: await this.listToEntries(data.result ?? [], excluded),
      page,
      hasNextPage: page < (data.num_pages ?? 0),
    };
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async getSearchResults(
    query: string,
    page: number,
    options?: SearchOptions,
  ): Promise<PagedResults<SeriesEntry>> {
    const sort = options?.sort?.key ?? "date";
    const excluded = this.excludedSet(options);
    const parts: string[] = [];
    if (query.trim()) parts.push(query.trim());

    for (const f of options?.filters ?? []) {
      const arr = Array.isArray(f.value) ? (f.value as string[]) : [];
      if (f.key === "language" && arr.length) {
        for (const lang of arr) parts.push(`language:${lang}`);
      } else if (f.key === "category" && arr.length) {
        for (const cat of arr) parts.push(`category:${cat}`);
      } else if (f.key === "tag" && arr.length) {
        for (const id of arr) {
          const name = this.tagNames.get(id);
          if (name) parts.push(`tag:"${name}"`);
        }
      } else if (f.key === "author" && typeof f.value === "string" && f.value.trim()) {
        parts.push(`artist:"${f.value.trim()}"`);
      }
    }

    // Empty date-sorted browse: use the list endpoint directly.
    if (!parts.length && sort === "date") {
      const data = await this.getJson<PaginatedGalleries>(
        `${BASE}/galleries?page=${page}&per_page=${PER_PAGE}`,
      );
      return {
        items: await this.listToEntries(data.result ?? [], excluded),
        page,
        hasNextPage: page < (data.num_pages ?? 0),
      };
    }

    const q = encodeURIComponent(parts.join(" ") || "*");
    const data = await this.getJson<PaginatedGalleries>(
      `${BASE}/search?query=${q}&sort=${encodeURIComponent(sort)}&page=${page}`,
    );
    return {
      items: await this.listToEntries(data.result ?? [], excluded),
      page,
      hasNextPage: page < (data.num_pages ?? 0),
    };
  }

  // ── Series detail ─────────────────────────────────────────────────────────

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const [g, thumb, related] = await Promise.all([
      this.fetchDetail(seriesId),
      this.thumbServer(),
      this.fetchRelated(seriesId),
    ]);

    const info: SeriesInfo = {
      id: seriesId,
      title: g.title.english ?? g.title.pretty ?? g.title.japanese ?? seriesId,
      status: "completed",
    };

    const coverPath = g.cover?.path ?? g.thumbnail?.path;
    if (coverPath) info.thumbnailUrl = cdnUrl(coverPath, thumb);

    const byType = new Map<string, string[]>();
    const idByType = new Map<string, string[]>();
    for (const tag of g.tags ?? []) {
      if (!byType.has(tag.type)) { byType.set(tag.type, []); idByType.set(tag.type, []); }
      byType.get(tag.type)!.push(tag.name);
      idByType.get(tag.type)!.push(String(tag.id));
      this.tagNames.set(String(tag.id), tag.name);
    }

    const artists = byType.get("artist") ?? [];
    const groups = byType.get("group") ?? [];
    const credits = artists.length ? artists : groups;
    if (credits.length) {
      info.author = credits.join(", ");
      // Per-credit chips for the host. No id: the "author" filter matches artist *names*
      // (see getSearchResults → `artist:"…"`), so a name is the precise, filterable value here.
      info.authors = credits.map((name) => ({ name }));
    }

    const categories = byType.get("category");
    if (categories?.length) info.genres = categories;

    const tagGroups: TagGroup[] = [];

    const contentTags = byType.get("tag");
    const contentTagIds = idByType.get("tag");
    if (contentTags?.length) {
      const group: TagGroup = { label: "Tags", kind: "theme", tags: contentTags };
      if (contentTagIds?.every(Boolean)) group.tagIds = contentTagIds;
      tagGroups.push(group);
    }

    const characters = byType.get("character");
    if (characters?.length) tagGroups.push({ label: "Characters", tags: characters });

    const parodies = byType.get("parody");
    if (parodies?.length) tagGroups.push({ label: "Parodies", tags: parodies });

    if (groups.length) tagGroups.push({ label: "Groups", tags: groups });

    const languages = byType.get("language");
    if (languages?.length) tagGroups.push({ label: "Languages", tags: languages });

    if (tagGroups.length) info.tagGroups = tagGroups;

    if (related.length) {
      const series = await this.listToEntries(related);
      const group: RelatedSeriesGroup = { label: "More Like This", kind: "similar", series };
      info.relatedSeriesGroups = [group];
    }

    if (g.num_pages) info.pageCount = g.num_pages;

    return info;
  }

  // ── Direct pages ──────────────────────────────────────────────────────────

  async getSeriesPages(seriesId: string): Promise<Page[]> {
    const [g, imgSrv, thumbSrv] = await Promise.all([
      this.fetchDetail(seriesId),
      this.imageServer(),
      this.thumbServer(),
    ]);
    const referer = `https://nhentai.net/g/${seriesId}/`;
    return (g.pages ?? []).map((p): Page => ({
      index: p.number - 1,
      imageUrl: cdnUrl(p.path, imgSrv),
      thumbnail: { kind: "image", url: cdnUrl(thumbPath(p.path), thumbSrv) },
      headers: { Referer: referer },
    }));
  }

  // ── Favorites ─────────────────────────────────────────────────────────────

  private requireKey(): void {
    if (!this.setting("apiKey")) {
      throw new Error("favorites require an API key (create one at nhentai.net › Account › API Keys)");
    }
  }

  async getFavorites(page: number): Promise<PagedResults<SeriesEntry>> {
    this.requireKey();
    const data = await this.getJson<PaginatedGalleries>(`${BASE}/favorites?page=${page}`);
    return {
      items: await this.listToEntries(data.result ?? []),
      page,
      hasNextPage: page < (data.num_pages ?? 0),
    };
  }

  async addFavorite(seriesId: string): Promise<void> {
    this.requireKey();
    await this.postJson(`${BASE}/galleries/${encodeURIComponent(seriesId)}/favorite`, {});
  }

  async removeFavorite(seriesId: string): Promise<void> {
    this.requireKey();
    await this.deleteReq(`${BASE}/galleries/${encodeURIComponent(seriesId)}/favorite`);
  }

  async isFavorite(seriesId: string): Promise<boolean> {
    this.requireKey();
    const data = await this.getJson<PaginatedGalleries>(`${BASE}/favorites?page=1`);
    const totalPages = data.num_pages ?? 1;
    if ((data.result ?? []).some((item) => String(item.id) === seriesId)) return true;
    for (let page = 2; page <= totalPages; page++) {
      const p = await this.getJson<PaginatedGalleries>(`${BASE}/favorites?page=${page}`);
      if ((p.result ?? []).some((item) => String(item.id) === seriesId)) return true;
    }
    return false;
  }
}

export default defineBridge((host) => new NhentaiBridge(host));
