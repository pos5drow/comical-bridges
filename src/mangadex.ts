/**
 * MangaDex bridge — https://mangadex.org (public API v5, no auth required for browsing).
 *
 * MangaDex exposes `links.mal` and `links.al` on every manga, so this bridge populates
 * `externalIds` in SeriesInfo — enabling the library's auto-link grouping when the same
 * title is added from another bridge that shares those IDs.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type Credit,
  type Filter,
  type Page,
  type PagedResults,
  type SearchOptions,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SeriesStatus,
  type SortOption,
  defineBridge,
} from "@comical/sdk";

const BASE = "https://api.mangadex.org";
const COVER_BASE = "https://uploads.mangadex.org/covers";
const PER_PAGE = 24;

// ── API DTOs ──────────────────────────────────────────────────────────────────

interface Relationship {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

interface MangaAttributes {
  title: Record<string, string>;
  altTitles?: Array<Record<string, string>>;
  description?: Record<string, string>;
  status?: string;
  year?: number;
  tags?: Array<{ id: string; attributes: { name: Record<string, string>; group: string } }>;
  links?: Record<string, string | null>;
  publicationDemographic?: string | null;
  contentRating?: string;
  availableTranslatedLanguages?: string[];
}

interface MangaData {
  id: string;
  attributes: MangaAttributes;
  relationships: Relationship[];
}

interface MangaListResponse {
  data: MangaData[];
  total: number;
  offset: number;
  limit: number;
}

interface MangaResponse {
  data: MangaData;
}

interface ChapterAttributes {
  title?: string | null;
  volume?: string | null;
  chapter?: string | null;
  publishAt?: string;
  translatedLanguage?: string;
  pages?: number;
  externalUrl?: string | null;
}

interface ChapterData {
  id: string;
  attributes: ChapterAttributes;
  relationships: Relationship[];
}

interface ChapterListResponse {
  data: ChapterData[];
  total: number;
  offset: number;
}

interface AtHomeResponse {
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, SeriesStatus> = {
  ongoing: "ongoing",
  completed: "completed",
  hiatus: "hiatus",
  cancelled: "cancelled",
};

function firstTitle(attrs: MangaAttributes): string {
  return attrs.title["en"] ?? Object.values(attrs.title)[0] ?? "Unknown";
}

// MangaDex serves three cover sizes: original (no suffix), `.512.jpg`, and `.256.jpg`. Cards default
// to 256 — what MangaDex's own grid loads — so the app doesn't download + decode a 512px cover per
// card (a real scroll cost); the detail hero asks for 512.
function coverUrl(mangaId: string, rels: Relationship[], size: 256 | 512 = 256): string | undefined {
  const cover = rels.find((r) => r.type === "cover_art");
  const fileName = cover?.attributes?.["fileName"];
  if (typeof fileName !== "string") return undefined;
  return `${COVER_BASE}/${mangaId}/${fileName}.${size}.jpg`;
}

/**
 * Named credits (name + MangaDex author/artist UUID) for one relationship type, built in a single
 * pass so each name stays paired with its own id. The id is the precise filter value — the `author`
 * filter sends it as `authors[]` (a UUID, not a name).
 */
function creditList(rels: Relationship[], type: "author" | "artist"): Credit[] {
  return rels
    .filter((r) => r.type === type)
    .map((r) => {
      const name = r.attributes?.["name"];
      return typeof name === "string" && name ? { name, id: r.id } : undefined;
    })
    .filter((c): c is Credit => !!c);
}

function toEntry(d: MangaData): SeriesEntry {
  const entry: SeriesEntry = { id: d.id, title: firstTitle(d.attributes) };
  const thumb = coverUrl(d.id, d.relationships);
  if (thumb) entry.thumbnailUrl = thumb;
  return entry;
}

function parseExternalId(links: Record<string, string | null> | undefined, key: string): number | undefined {
  const raw = links?.[key];
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// ── Bridge ────────────────────────────────────────────────────────────────────

const LISTS: ReadonlyArray<SeriesList & { order: Record<string, string> }> = [
  { id: "popular", name: "Popular", layout: "grid", featured: true, order: { followedCount: "desc" } },
  { id: "recent", name: "Recently Updated", layout: "grid", featured: true, order: { updatedAt: "desc" } },
  { id: "new", name: "New Titles", layout: "grid", featured: false, order: { createdAt: "desc" } },
];

const CONTENT_RATINGS = ["safe", "suggestive", "erotica", "pornographic"];
const DEFAULT_RATINGS = ["safe", "suggestive"];

class MangaDexBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "mangadex",
    name: "MangaDex",
    version: "0.1.0",
    contractVersion: "1.0.0",
    languages: ["en"],
    nsfw: false,
    capabilities: ["lists", "search", "filters"],
    iconUrl: "https://mangadex.org/favicon.ico",
    rateLimit: { maxConcurrent: 2, minIntervalMs: 350 },
  };

  private async getJson<T>(url: string): Promise<T> {
    return this.fetchJson<T>(url, {
      "User-Agent": "comical/0.1 (https://github.com/comical)",
    });
  }

  private contentRatingParams(): string {
    return DEFAULT_RATINGS.map((r) => `contentRating[]=${r}`).join("&");
  }

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ order: _, ...list }) => list);
  }

  async getListItems(listId: string, page: number): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);

    const offset = (page - 1) * PER_PAGE;
    const order = Object.entries(list.order).map(([k, v]) => `order[${k}]=${v}`).join("&");
    const url =
      `${BASE}/manga?limit=${PER_PAGE}&offset=${offset}` +
      `&${this.contentRatingParams()}&${order}` +
      `&includes[]=cover_art`;
    const res = await this.getJson<MangaListResponse>(url);
    const items = res.data.map(toEntry);
    return { items, page, hasNextPage: offset + items.length < res.total };
  }

  async getFilters(): Promise<Filter[]> {
    return [
      {
        type: "select",
        key: "contentRating",
        label: "Content rating",
        options: CONTENT_RATINGS.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) })),
      },
      {
        type: "select",
        key: "status",
        label: "Status",
        options: [
          { value: "ongoing", label: "Ongoing" },
          { value: "completed", label: "Completed" },
          { value: "hiatus", label: "Hiatus" },
          { value: "cancelled", label: "Cancelled" },
        ],
      },
      { type: "text", key: "author", label: "Author" },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [
      { key: "followedCount", label: "Popularity" },
      { key: "updatedAt", label: "Recently Updated" },
      { key: "createdAt", label: "Newest" },
      { key: "relevance", label: "Relevance" },
      { key: "rating", label: "Rating" },
      { key: "year", label: "Year" },
    ];
  }

  async getSearchResults(
    query: string,
    page: number,
    options?: SearchOptions,
  ): Promise<PagedResults<SeriesEntry>> {
    const offset = (page - 1) * PER_PAGE;
    const params = new URLSearchParams();
    params.set("limit", String(PER_PAGE));
    params.set("offset", String(offset));
    params.append("includes[]", "cover_art");

    if (query.trim()) params.set("title", query.trim());

    for (const rating of DEFAULT_RATINGS) params.append("contentRating[]", rating);

    for (const f of options?.filters ?? []) {
      if (f.key === "status" && typeof f.value === "string") params.set("status", f.value);
      if (f.key === "contentRating" && typeof f.value === "string") {
        params.delete("contentRating[]");
        params.append("contentRating[]", f.value);
      }
      if (f.key === "author" && typeof f.value === "string" && f.value.trim()) {
        params.append("authors[]", f.value.trim());
      }
    }

    if (options?.sort) {
      params.set(`order[${options.sort.key}]`, options.sort.ascending ? "asc" : "desc");
    } else if (!query.trim()) {
      params.set("order[followedCount]", "desc");
    }

    const url = `${BASE}/manga?${params.toString()}`;
    const res = await this.getJson<MangaListResponse>(url);
    const items = res.data.map(toEntry);
    return { items, page, hasNextPage: offset + items.length < res.total };
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const url = `${BASE}/manga/${encodeURIComponent(seriesId)}?includes[]=cover_art&includes[]=author&includes[]=artist`;
    const res = await this.getJson<MangaResponse>(url);
    const d = res.data;
    const attrs = d.attributes;

    const info: SeriesInfo = { id: d.id, title: firstTitle(attrs) };

    // Detail hero: the larger 512px cover (cards default to 256 via coverUrl).
    const thumb = coverUrl(d.id, d.relationships, 512);
    if (thumb) info.thumbnailUrl = thumb;

    const desc = attrs.description?.["en"] ?? Object.values(attrs.description ?? {})[0];
    if (desc?.trim()) info.description = desc.trim();

    const authors = creditList(d.relationships, "author");
    const artists = creditList(d.relationships, "artist");
    if (authors.length) {
      info.author = authors.map((c) => c.name).join(", ");
      info.authors = authors;
      if (authors[0]!.id) info.authorId = authors[0]!.id;
    }
    if (artists.length) {
      info.artist = artists.map((c) => c.name).join(", ");
      info.artists = artists;
      if (artists[0]!.id) info.artistId = artists[0]!.id;
    }

    if (attrs.status) info.status = STATUS_MAP[attrs.status] ?? "unknown";

    // Collect tag groups by MangaDex's `group` field (genre, theme, format, content, demographic).
    const tagsByGroup = new Map<string, string[]>();
    for (const tag of attrs.tags ?? []) {
      const name = tag.attributes.name["en"] ?? Object.values(tag.attributes.name)[0];
      if (!name) continue;
      const g = tag.attributes.group;
      if (!tagsByGroup.has(g)) tagsByGroup.set(g, []);
      tagsByGroup.get(g)!.push(name);
    }
    const genres = tagsByGroup.get("genre") ?? [];
    if (genres.length) info.genres = genres;

    const tagGroups = [];
    for (const [group, tags] of tagsByGroup) {
      if (group === "genre") continue;
      tagGroups.push({ label: group.charAt(0).toUpperCase() + group.slice(1), tags });
    }
    if (attrs.publicationDemographic) {
      tagGroups.push({ label: "Demographic", tags: [attrs.publicationDemographic] });
    }
    if (tagGroups.length) info.tagGroups = tagGroups;

    // externalIds — the key feature for cross-bridge grouping.
    const mal = parseExternalId(attrs.links, "mal");
    const al = parseExternalId(attrs.links, "al");
    const mu = typeof attrs.links?.["mu"] === "string" ? attrs.links["mu"] : undefined;
    if (mal !== undefined || al !== undefined || mu !== undefined) {
      info.externalIds = {
        ...(mal !== undefined && { mal }),
        ...(al !== undefined && { anilist: al }),
        ...(mu !== undefined && { mu }),
      };
    }

    return info;
  }

  async getChapters(seriesId: string): Promise<Chapter[]> {
    // MangaDex paginates chapters at 500 max. Fetch all pages.
    const all: ChapterData[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      const url =
        `${BASE}/manga/${encodeURIComponent(seriesId)}/feed` +
        `?limit=${limit}&offset=${offset}` +
        `&translatedLanguage[]=en` +
        `&order[chapter]=asc&order[publishAt]=asc` +
        `&includes[]=scanlation_group` +
        `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`;
      const res = await this.getJson<ChapterListResponse>(url);
      all.push(...res.data);
      offset += res.data.length;
      if (offset >= res.total) break;
    }

    return all
      .filter((c) => !c.attributes.externalUrl) // skip external-hosted chapters
      .map((c): Chapter => {
        const attrs = c.attributes;
        const num = attrs.chapter ? parseFloat(attrs.chapter) : undefined;
        const vol = attrs.volume ? `Vol.${attrs.volume} ` : "";
        const chNum = attrs.chapter ? `Ch.${attrs.chapter}` : "";
        const title = attrs.title?.trim();
        const name = title ? `${vol}${chNum} — ${title}`.trim() : `${vol}${chNum}`.trim() || c.id;

        const group = c.relationships.find((r) => r.type === "scanlation_group");
        const groupName = group?.attributes?.["name"];

        const ch: Chapter = { id: c.id, name };
        if (Number.isFinite(num)) ch.number = num;
        if (typeof groupName === "string") ch.group = groupName;
        if (typeof attrs.pages === "number") ch.pageCount = attrs.pages;
        if (attrs.publishAt) {
          const ms = Date.parse(attrs.publishAt);
          if (Number.isFinite(ms)) ch.publishedAt = ms;
        }
        return ch;
      });
  }

  async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    void seriesId;
    const res = await this.getJson<AtHomeResponse>(`${BASE}/at-home/server/${encodeURIComponent(chapterId)}`);
    const { baseUrl, chapter } = res;
    return chapter.data.map((filename, index): Page => ({
      index,
      imageUrl: `${baseUrl}/data/${chapter.hash}/${filename}`,
    }));
  }
}

export default defineBridge((host) => new MangaDexBridge(host));
