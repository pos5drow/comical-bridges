/**
 * Hitomi.la bridge — https://hitomi.la (doujinshi / artist CG galleries).
 *
 * Galleries have no chapter structure, so this uses the "direct" capability: `getSeriesPages`
 * returns a flat page list. There is no HTML listing on the site (it's a client-rendered SPA);
 * browse/search instead read the site's binary `.nozomi` indexes — packed big-endian int32 arrays
 * of gallery ids — through the SDK's `fetchBytes` (base64 transport), a Range request per page.
 *
 * Data sources (all under ltn.gold-usergeneratedcontent.net):
 *  - `{area}.nozomi` — id lists (index / popular / type / tag / artist / …), binary.
 *  - `galleryblock/{id}.html` — a small card fragment (title + cover), one per browse result.
 *  - `galleries/{id}.js` — the full gallery info JSON (tags, files) for detail + pages.
 *  - `gg.js` — the rotating table that derives each page image's subdomain + path.
 *
 * Every image (covers and pages) is hotlink-protected — the CDN 404s without a
 * `Referer: https://hitomi.la/` — so all image URLs are served through the host's `/img-proxy`
 * (declared via `assetProxy`), which attaches that Referer server-side.
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
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SortOption,
  type TagGroup,
  base64ToBytes,
  defineBridge,
} from "@comical/sdk";
import { abbreviateLanguage } from "./lang.ts";

const SITE = "https://hitomi.la";
const D2 = "gold-usergeneratedcontent.net";
const LTN = `https://ltn.${D2}`;
const TN = `https://tn.${D2}`;
const REFERER = `${SITE}/`;
const PER_PAGE = 24;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ── gg.js (image path table) ────────────────────────────────────────────────────

/** Parsed gg.js: `b` base dir, plus the set of `g` cases that map to subdomain index 1 (else 0). */
interface Gg {
  b: string;
  cases: Set<number>;
}

// ── Gallery info DTOs (galleries/{id}.js) ───────────────────────────────────────

interface HitomiTag {
  tag?: string;
  male?: string;
  female?: string;
  url?: string;
}
interface HitomiNamed {
  url?: string;
  artist?: string;
  group?: string;
  parody?: string;
  character?: string;
}
interface HitomiFile {
  name: string;
  hash: string;
  haswebp?: number;
  hasavif?: number;
  width?: number;
  height?: number;
}
interface GalleryInfo {
  id: string | number;
  title: string;
  japanese_title?: string | null;
  language?: string | null;
  language_localname?: string | null;
  type?: string;
  date?: string;
  related?: number[];
  files: HitomiFile[];
  tags?: HitomiTag[];
  artists?: HitomiNamed[];
  groups?: HitomiNamed[] | null;
  parodys?: HitomiNamed[];
  characters?: HitomiNamed[];
}

// ── Static option lists ─────────────────────────────────────────────────────────

const LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "english", label: "English" },
  { value: "japanese", label: "Japanese" },
  { value: "chinese", label: "Chinese" },
  { value: "korean", label: "Korean" },
  { value: "spanish", label: "Spanish" },
  { value: "french", label: "French" },
  { value: "russian", label: "Russian" },
  { value: "german", label: "German" },
];

const TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "doujinshi", label: "Doujinshi" },
  { value: "manga", label: "Manga" },
  { value: "artistcg", label: "Artist CG" },
  { value: "gamecg", label: "Game CG" },
  { value: "imageset", label: "Image Set" },
  { value: "anime", label: "Anime" },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

interface ListDef extends SeriesList {
  area: string; // nozomi path prefix, e.g. "index" or "popular/today"
}

const LISTS: ReadonlyArray<ListDef> = [
  { id: "popular-today", name: "Popular Today", layout: "grid", featured: true, area: "popular/today" },
  { id: "popular-week", name: "Popular This Week", layout: "grid", featured: true, area: "popular/week" },
  { id: "latest", name: "Latest", layout: "grid", featured: true, area: "index" },
];

// Sort keys map to a nozomi "area"; the empty area means "keep the current list/tag area".
const SORTS: ReadonlyArray<{ key: string; label: string; area: string }> = [
  { key: "latest", label: "Latest", area: "index" },
  { key: "popular-today", label: "Popular Today", area: "popular/today" },
  { key: "popular-week", label: "Popular This Week", area: "popular/week" },
  { key: "popular-month", label: "Popular This Month", area: "popular/month" },
  { key: "popular-year", label: "Popular This Year", area: "popular/year" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** `real_full_path_from_hash`: "…a30" → "0/a3" (last char / previous two) — the tn thumbnail dir. */
function thumbDir(hash: string): string {
  return `${hash.slice(-1)}/${hash.slice(-3, -1)}`;
}

/**
 * Turn a Hitomi tag/artist/parody url (`/tag/female%3Abig%20breasts-all.html`) into the compact
 * `namespace/value` selector this bridge's search understands (`tag/female:big breasts`). Strips the
 * trailing `-{language}.html`; the value stays decoded (search re-encodes it for the nozomi path).
 */
function selectorFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const path = decodeURIComponent(url).replace(/^\//, "").replace(/-[a-z]+\.html$/i, "");
  return path || undefined;
}

// ── Bridge ──────────────────────────────────────────────────────────────────────

class HitomiBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.hitomi",
    name: "Hitomi.la",
    version: "0.1.2",
    contractVersion: "1.0.0",
    languages: ["multi"],
    nsfw: true,
    capabilities: ["lists", "search", "filters", "sort", "direct", "related-series"],
    iconUrl: `${SITE}/favicon.ico`,
    // Static CDN — tolerates parallel card fetches; a browse page pulls ~24 galleryblocks.
    rateLimit: { maxConcurrent: 5, minIntervalMs: 120 },
    // Every image (covers + pages) is served through the host's /img-proxy with the required Referer.
    assetProxy: { hosts: [D2], referer: REFERER },
  };

  private gg: { at: number; value: Gg } | undefined;

  private headers(): Record<string, string> {
    return { "User-Agent": UA, Referer: REFERER };
  }

  // ── /img-proxy URL builder ─────────────────────────────────────────────────

  /**
   * Server-relative proxied URL. Every hitomi image (covers AND pages) is Referer-gated, so all of
   * them route through the host's `/img-proxy` (declared via `assetProxy`), which attaches the
   * `hitomi.la` Referer. A relative path (not an absolute host URL) lets each client resolve it
   * against its own host — the network server on web, the in-process transport on device — instead
   * of a host baked in here that a device can't reach.
   */
  private proxied(absUrl: string): string {
    return `/img-proxy?url=${encodeURIComponent(absUrl)}`;
  }

  private coverUrl(hash: string): string {
    return `${TN}/webpbigtn/${thumbDir(hash)}/${hash}.webp`;
  }

  /**
   * Per-page thumbnail (reader strip). Hitomi only renders the big `webpbigtn` thumbnail for a
   * gallery's cover image(s); interior pages 404 on `webpbigtn` and are only available as the
   * smaller `webpsmalltn` — so page thumbnails must use that, while covers keep `coverUrl`.
   */
  private pageThumbUrl(hash: string): string {
    return `${TN}/webpsmalltn/${thumbDir(hash)}/${hash}.webp`;
  }

  // ── gg.js ──────────────────────────────────────────────────────────────────

  /** Fetch + parse gg.js, cached briefly. `b` rotates (~hourly), so a short TTL keeps page URLs fresh. */
  private async getGg(): Promise<Gg> {
    const GG_TTL_MS = 3 * 60 * 1000;
    if (this.gg && Date.now() - this.gg.at < GG_TTL_MS) return this.gg.value;
    const text = await this.fetchText(`${LTN}/gg.js`, this.headers());
    const b = text.match(/b:\s*'([^']+)'/)?.[1] ?? "";
    const cases = new Set<number>();
    for (const m of text.matchAll(/case\s+(\d+):/g)) cases.add(parseInt(m[1]!, 10));
    const value: Gg = { b, cases };
    this.gg = { at: Date.now(), value };
    return value;
  }

  /** Full image URL for one file, replicating hitomi's common.js url_from_url_from_hash (no base). */
  private imageUrl(gg: Gg, hash: string, ext: "webp" | "avif"): string {
    // s(hash): parseInt(lastChar + previousTwo, 16) — both the path key and the subdomain selector.
    const m = /(..)(.)$/.exec(hash)!;
    const g = parseInt(m[2]! + m[1]!, 16);
    const sub = (ext === "webp" ? "w" : "a") + (1 + (gg.cases.has(g) ? 1 : 0));
    return `https://${sub}.${D2}/${gg.b}${g}/${hash}.${ext}`;
  }

  // ── Nozomi (binary id index) ────────────────────────────────────────────────

  private nozomiPath(area: string, language: string): string {
    // `index` is the bare latest feed; every other area is a subdir (`popular/today`, `type/manga`, …).
    return `${LTN}/${area}-${language}.nozomi`;
  }

  /** Read one page of gallery ids from a nozomi index via a byte-range request. */
  private async nozomiIds(area: string, language: string, page: number): Promise<{ ids: number[]; hasNext: boolean }> {
    const start = (page - 1) * PER_PAGE * 4;
    const end = start + PER_PAGE * 4 - 1;
    const res = await this.request({
      url: this.nozomiPath(area, language),
      headers: { ...this.headers(), Range: `bytes=${start}-${end}` },
      responseType: "base64",
    });
    // 404 (no such tag/area) or 416 (past the end) → an empty page, not an error.
    if (res.status === 404 || res.status === 416) return { ids: [], hasNext: false };
    if (res.status >= 400) throw new Error(`nozomi ${area}: HTTP ${res.status}`);

    const bytes = base64ToBytes(res.body);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ids: number[] = [];
    for (let i = 0; i + 4 <= bytes.byteLength; i += 4) ids.push(view.getInt32(i, false));

    // Prefer the Content-Range total for exact pagination; else infer from a full slice.
    const total = Number(res.headers["content-range"]?.match(/\/(\d+)$/)?.[1]);
    const hasNext = Number.isFinite(total) ? start + bytes.byteLength < total : bytes.byteLength >= PER_PAGE * 4;
    return { ids, hasNext };
  }

  // ── Cards (galleryblock) ────────────────────────────────────────────────────

  private async galleryCard(id: number): Promise<SeriesEntry | null> {
    try {
      const $ = this.parse(await this.fetchText(`${LTN}/galleryblock/${id}.html`, this.headers()));
      const title = ($("h1.lillie a").first().text() || $(".lillie a").first().text()).trim();
      if (!title) return null;
      const entry: SeriesEntry = { id: String(id), title };
      // The card's cover hash rides along in the thumbnail img/source; proxy it (Referer-gated).
      const raw = $("img.lazyload").first().attr("data-src");
      const hash = raw?.match(/([0-9a-f]{64})\.\w+$/)?.[1];
      if (hash) entry.thumbnailUrl = this.proxied(this.coverUrl(hash));
      const lang = $(".dj-content tr:has(td:contains(Language)) a").first().text().trim();
      if (lang) entry.badges = [{ text: abbreviateLanguage(lang), position: "bottom-right", tone: "info" }];
      return entry;
    } catch {
      return null; // a deleted/expunged gallery — skip its card rather than fail the page
    }
  }

  private async idsToEntries(ids: number[]): Promise<SeriesEntry[]> {
    const cards = await Promise.all(ids.map((id) => this.galleryCard(id)));
    return cards.filter((c): c is SeriesEntry => c !== null);
  }

  private async browse(area: string, language: string, page: number): Promise<PagedResults<SeriesEntry>> {
    const { ids, hasNext } = await this.nozomiIds(area, language, page);
    return { items: await this.idsToEntries(ids), page, hasNextPage: hasNext };
  }

  // ── Lists ──────────────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ area: _a, ...list }) => list);
  }

  async getListItems(listId: string, page: number, _options?: ListOptions): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    return this.browse(list.area, "all", page);
  }

  // ── Filters / sort ───────────────────────────────────────────────────────────

  async getFilters(): Promise<Filter[]> {
    return [
      { type: "select", key: "language", label: "Language", options: [...LANGUAGES] },
      { type: "select", key: "type", label: "Type", options: [{ value: "", label: "Any" }, ...TYPES] },
      { type: "text", key: "tag", label: "Tag" },
      { type: "text", key: "artist", label: "Artist" },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return SORTS.map((s) => ({ key: s.key, label: s.label, directionless: true }));
  }

  // ── Search (nozomi-area selection; no free-text index in v1) ──────────────────

  async getSearchResults(query: string, page: number, options?: SearchOptions): Promise<PagedResults<SeriesEntry>> {
    let language = "all";
    let type = "";
    let tag = "";
    let artist = "";
    for (const f of options?.filters ?? []) {
      if (f.key === "language" && typeof f.value === "string") language = f.value || "all";
      if (f.key === "type" && typeof f.value === "string") type = f.value;
      if (f.key === "artist" && typeof f.value === "string") artist = f.value.trim();
      if (f.key === "tag" && typeof f.value === "string") tag = f.value.trim();
    }

    // Resolve which single nozomi area to read, most-specific first. A `namespace/value` selector
    // (from a detail chip, or "artist:name") is used verbatim; a bare word is treated as a tag.
    const q = query.trim();
    let area: string;
    if (q.includes("/")) area = this.encodeSelector(q);
    else if (artist) area = `artist/${encodeURIComponent(artist.toLowerCase())}`;
    else if (tag) area = `tag/${encodeURIComponent(tag.toLowerCase())}`;
    else if (q) area = `tag/${encodeURIComponent(q.toLowerCase())}`;
    else if (type) area = `type/${type}`;
    else area = this.sortArea(options) ?? "index";

    // A sort selection overrides the plain index/type browse (but not a specific tag/artist lookup).
    if (!q && !tag && !artist) {
      const sorted = this.sortArea(options);
      if (sorted && !type) area = sorted;
    }

    return this.browse(area, language, page);
  }

  /** Encode a `namespace/value` selector into a nozomi area (`tag/female:big breasts` → `tag/female%3A…`). */
  private encodeSelector(selector: string): string {
    const slash = selector.indexOf("/");
    const ns = selector.slice(0, slash);
    const value = selector.slice(slash + 1);
    return `${ns}/${encodeURIComponent(value)}`;
  }

  private sortArea(options?: SearchOptions): string | undefined {
    return SORTS.find((s) => s.key === options?.sort?.key)?.area;
  }

  // ── Series detail ─────────────────────────────────────────────────────────────

  private async fetchGallery(id: string): Promise<GalleryInfo> {
    const text = await this.fetchText(`${LTN}/galleries/${encodeURIComponent(id)}.js`, this.headers());
    // The file is `var galleryinfo = { … }` — strip the assignment prefix, parse the object.
    return JSON.parse(text.replace(/^var\s+galleryinfo\s*=\s*/, "")) as GalleryInfo;
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const g = await this.fetchGallery(seriesId);

    const info: SeriesInfo = {
      id: seriesId,
      title: g.title || seriesId,
      status: "completed",
    };
    if (g.files[0]?.hash) info.thumbnailUrl = this.proxied(this.coverUrl(g.files[0].hash));
    if (g.japanese_title) info.description = g.japanese_title;
    if (g.type) info.type = TYPE_LABELS[g.type] ?? g.type;
    if (g.language_localname || g.language) info.languages = [g.language_localname || g.language!];
    if (g.files.length) info.pageCount = g.files.length;

    const artists = (g.artists ?? []).map((a) => a.artist).filter((n): n is string => !!n);
    if (artists.length) {
      info.author = artists.join(", ");
      info.authors = artists.map((name) => ({ name }));
    }

    // Each taxonomy becomes a tag group whose chips carry a ready-to-run `namespace/value` search
    // (from the site's own url), so tapping a chip browses that tag/artist/series/character.
    const tagGroups: TagGroup[] = [];
    const namedGroup = (label: string, items: HitomiNamed[] | null | undefined, name: (n: HitomiNamed) => string | undefined) => {
      const list = items ?? [];
      const tags: string[] = [];
      const queries: string[] = [];
      for (const it of list) {
        const n = name(it);
        const sel = selectorFromUrl(it.url);
        if (n && sel) { tags.push(n); queries.push(sel); }
      }
      if (tags.length) tagGroups.push({ label, tags, tagQueries: queries });
    };

    if (g.tags?.length) {
      const tags: string[] = [];
      const queries: string[] = [];
      for (const t of g.tags) {
        if (!t.tag) continue;
        const prefix = t.female === "1" ? "♀ " : t.male === "1" ? "♂ " : "";
        const sel = selectorFromUrl(t.url);
        if (sel) { tags.push(prefix + t.tag); queries.push(sel); }
      }
      if (tags.length) tagGroups.push({ label: "Tags", kind: "theme", tags, tagQueries: queries });
    }
    namedGroup("Series", g.parodys, (n) => n.parody);
    namedGroup("Characters", g.characters, (n) => n.character);
    namedGroup("Groups", g.groups, (n) => n.group);
    if (tagGroups.length) info.tagGroups = tagGroups;

    return info;
  }

  // ── Related series (lazy) ──────────────────────────────────────────────────────

  async getRelatedSeries(seriesId: string): Promise<RelatedSeriesGroup[]> {
    const g = await this.fetchGallery(seriesId);
    if (!g.related?.length) return [];
    const series = await this.idsToEntries(g.related.slice(0, 10));
    return series.length ? [{ label: "Related", kind: "similar", series }] : [];
  }

  // ── Direct pages ────────────────────────────────────────────────────────────

  async getSeriesPages(seriesId: string): Promise<Page[]> {
    const [g, gg] = await Promise.all([this.fetchGallery(seriesId), this.getGg()]);
    return g.files.map((f, index): Page => {
      const ext: "webp" | "avif" = f.hasavif ? "avif" : "webp";
      return {
        index,
        imageUrl: this.proxied(this.imageUrl(gg, f.hash, ext)),
        thumbnail: { kind: "image", url: this.proxied(this.pageThumbUrl(f.hash)) },
      };
    });
  }
}

export default defineBridge((host) => new HitomiBridge(host));
