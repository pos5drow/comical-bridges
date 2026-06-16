/**
 * E-Hentai bridge — https://e-hentai.org / https://exhentai.org
 *
 * Gallery-oriented site (doujinshi, manga, artist CGs, …). Galleries have no chapter
 * structure, so this bridge uses the "direct" capability: `getSeriesPages` returns a
 * flat list of image URLs for each gallery.
 *
 * Auth is cookie-based: the user pastes their e-hentai session cookies into the
 * settings field. Without auth, browsing is limited to the default content filter.
 * ExHentai (sadpanda) additionally requires a valid `igneous` cookie.
 *
 * API surface:
 *  - Gallery listing/search: HTML scraping of /?page=N&f_search=Q
 *  - Gallery metadata: JSON via POST api.e-hentai.org/api.php (gdata method)
 *  - Page image URLs: gallery viewer HTML for filehashes + showpage API per image
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Filter,
  type InferSettings,
  type ListOptions,
  type Page,
  type PagedResults,
  type SearchOptions,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SortOption,
  type SettingDescriptor,
  type TagGroup,
  type TagKind,
  defineBridge,
  defineSettings,
} from "@comical/sdk";

const EH_BASE = "https://e-hentai.org";
const EX_BASE = "https://exhentai.org";
const EH_API = "https://api.e-hentai.org/api.php";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// f_cats is a bitmask of **excluded** categories; 0 = show all.
// To show only selected categories: f_cats = ALL_CATS_MASK ^ selected_bits.
const CAT_BITS: Record<string, number> = {
  misc: 1,
  doujinshi: 2,
  manga: 4,
  "artist-cg": 8,
  "game-cg": 16,
  "image-set": 32,
  cosplay: 64,
  "asian-porn": 128,
  "non-h": 256,
  western: 512,
};
const ALL_CATS_MASK = Object.values(CAT_BITS).reduce((a, b) => a | b, 0); // 1023

// ── Settings ──────────────────────────────────────────────────────────────────

const SETTINGS = defineSettings([
  {
    type: "string",
    key: "cookies",
    label: "Cookies",
    description:
      "Paste your e-hentai.org session cookies (ipb_member_id, ipb_pass_hash). " +
      "Required for age-restricted content. Add igneous cookie for ExHentai access.",
    secret: true,
  },
  {
    type: "boolean",
    key: "exhentai",
    label: "Use ExHentai (Sadpanda)",
    description: "Browse exhentai.org instead of e-hentai.org. Requires a valid igneous cookie.",
    default: false,
  },
]);
type Settings = InferSettings<typeof SETTINGS>;

// ── DTOs ──────────────────────────────────────────────────────────────────────

interface GMetadata {
  gid: number;
  token: string;
  title: string;
  title_jpn?: string;
  category?: string;
  thumb?: string;
  uploader?: string;
  filecount?: string;
  rating?: string;
  tags?: string[];
  error?: string;
  expunged?: boolean;
}

interface GDataResponse {
  gmetadata?: GMetadata[];
}


// ── HTML parsing helpers ──────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

/**
 * Extract ordered { gid, token } pairs from a gallery listing page.
 * Deduplicates so each gallery appears once (every listing card links to its
 * gallery twice — once for the thumbnail, once for the title).
 */
function extractGalleryPairs(html: string): Array<{ gid: number; token: string }> {
  const pairs: Array<{ gid: number; token: string }> = [];
  const seen = new Set<string>();
  const re = /href="https?:\/\/(?:e-hentai|exhentai)\.org\/g\/(\d+)\/([a-f0-9]+)\/"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = `${m[1]}:${m[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ gid: parseInt(m[1]!, 10), token: m[2]! });
    }
  }
  return pairs;
}

/**
 * True when the listing page likely has more results.
 * E-hentai always serves 25 items per page; a full page means there are more.
 */
function listingHasNextPage(_html: string, resultCount: number): boolean {
  return resultCount >= 25;
}

/**
 * Extract the next-page cursor URL from a listing page.
 * E-hentai uses `?next=GID` cursor pagination; the next-page link is the
 * only anchor on the page whose href contains `?next=` or `&next=`.
 */
function extractNextUrl(html: string): string | undefined {
  return html.match(/href=["']([^"']*[?&]next=\d+[^"']*)["']/)?.[1];
}

/** Pull the full image URL from a showpage HTML page. */
function extractImageUrl(fragment: string): string | undefined {
  return (
    fragment.match(/id="img"\s+src="([^"]+)"/)?.[1] ??
    fragment.match(/src="([^"]+)"\s[^>]*id="img"/)?.[1]
  );
}

/** Extract { hash, pageNum } pairs from a gallery viewer page. */
function extractPageHashes(html: string): Array<{ hash: string; pageNum: number }> {
  const re = /href="https?:\/\/(?:e-hentai|exhentai)\.org\/s\/([a-f0-9]+)\/\d+-(\d+)"/g;
  const results: Array<{ hash: string; pageNum: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    results.push({ hash: m[1]!, pageNum: parseInt(m[2]!, 10) });
  }
  return results;
}

/** Parse total image count from "Showing 1 - 40 of 185 images" banner. */
function extractFilecount(html: string): number {
  // E-hentai formats counts ≥1000 with commas ("1,110"), so strip them before parsing.
  return parseInt((html.match(/of ([\d,]+) images?/)?.[1] ?? "0").replace(/,/g, ""), 10);
}

// ── Tag helpers ───────────────────────────────────────────────────────────────

/** Group gdata tags (format "namespace:value") by namespace. */
function groupTagsByNs(tags: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const t of tags) {
    const colon = t.indexOf(":");
    const ns = colon === -1 ? "misc" : t.slice(0, colon);
    const val = colon === -1 ? t : t.slice(colon + 1);
    let arr = map.get(ns);
    if (!arr) { arr = []; map.set(ns, arr); }
    arr.push(val);
  }
  return map;
}

// Namespaces that map to a semantic TagKind; others get no kind.
const TAG_KINDS: Record<string, TagKind> = {
  female: "theme",
  male: "theme",
  tag: "theme",
};

// Human-readable labels for known EH tag namespaces.
const NS_LABELS: Record<string, string> = {
  artist: "Artists",
  group: "Groups",
  parody: "Parodies",
  character: "Characters",
  female: "Female Tags",
  male: "Male Tags",
  tag: "Tags",
  language: "Languages",
  misc: "Misc",
};

// ── Bridge ────────────────────────────────────────────────────────────────────

const VIEWER_PAGE_SIZE = 40;

class EHentaiBridge extends BridgeBase<Settings> {
  // Next-page cursor URLs keyed by context ("home" or "search:{params}").
  // Populated when page N is fetched; consumed when page N+1 is requested.
  private readonly nextUrls = new Map<string, string>();
  // Cache for viewer-page hashes: key = `${gid}:${viewerPageIndex}`, value = pageNum → hash.
  // Avoids re-fetching the same viewer page when multiple resolvePage calls land simultaneously.
  private readonly hashCache = new Map<string, Map<number, string>>();
  private readonly hashCachePending = new Map<string, Promise<Map<number, string>>>();

  readonly info: BridgeInfo = {
    id: "e-hentai",
    name: "E-Hentai",
    version: "0.1.0",
    contractVersion: "1.0.0",
    languages: ["multi"],
    nsfw: true,
    capabilities: ["lists", "search", "filters", "sort", "settings", "direct"],
    rateLimit: { maxConcurrent: 3, minIntervalMs: 500 },
  };

  getSettings(): SettingDescriptor[] {
    return [...SETTINGS];
  }

  private base(): string {
    return this.setting("exhentai") ? EX_BASE : EH_BASE;
  }

  private headers(forHtml = false): Record<string, string> {
    const h: Record<string, string> = {
      "User-Agent": UA,
      Accept: forHtml
        ? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        : "application/json, */*",
      "Accept-Language": "en-US,en;q=0.9",
    };
    const userCookies = this.setting("cookies")?.trim() ?? "";
    // nw=1 bypasses the "Offensive For Everyone" content warning site-wide
    h["Cookie"] = userCookies ? `${userCookies}; nw=1` : "nw=1";
    return h;
  }

  private resolveUrl(href: string): string {
    return href.startsWith("http") ? href : this.base() + href;
  }

  private async getHtml(url: string): Promise<string> {
    const res = await this.request({ url, method: "GET", headers: this.headers(true) });
    if (res.status >= 400) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return res.body;
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await this.request({
      url,
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status >= 400) throw new Error(`HTTP ${res.status} from API`);
    return JSON.parse(res.body) as T;
  }

  // ── Lists ─────────────────────────────────────────────────────────────────

  getLists(): Promise<SeriesList[]> {
    return Promise.resolve([
      { id: "home", name: "Home", layout: "grid", featured: true },
      { id: "popular", name: "Popular", layout: "grid", featured: true, page: true },
    ]);
  }

  async getListItems(listId: string, page: number, _options?: ListOptions): Promise<PagedResults<SeriesEntry>> {
    if (listId === "home") {
      const url = page === 1 ? `${this.base()}/` : (this.nextUrls.get("home") ?? `${this.base()}/`);
      const { result, nextUrl } = await this.fetchListing(url, page);
      if (nextUrl) this.nextUrls.set("home", this.resolveUrl(nextUrl));
      else this.nextUrls.delete("home");
      return result;
    }
    if (listId === "popular") {
      return (await this.fetchListing(`${this.base()}/popular`, page, false)).result;
    }
    throw new Error(`Unknown list: ${listId}`);
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async getSearchResults(query: string, page: number, options?: SearchOptions): Promise<PagedResults<SeriesEntry>> {
    const params = new URLSearchParams();
    const parts: string[] = [];

    if (query.trim()) parts.push(query.trim());

    // Language → search-syntax tags (e.g. "language:english")
    for (const lang of ((options?.filters?.find((f) => f.key === "language")?.value ?? []) as string[])) {
      parts.push(`language:${lang}`);
    }

    // Category multiselect → exclusion bitmask (f_cats = all ^ selected)
    const cats = (options?.filters?.find((f) => f.key === "category")?.value ?? []) as string[];
    if (cats.length > 0) {
      const included = cats.reduce((acc, c) => acc | (CAT_BITS[c] ?? 0), 0);
      params.set("f_cats", String(ALL_CATS_MASK ^ included));
    }

    // Free-form tag search string passed straight to e-hentai's search syntax
    const tagStr = options?.filters?.find((f) => f.key === "tags")?.value as string | undefined;
    if (tagStr?.trim()) parts.push(tagStr.trim());

    if (parts.length) params.set("f_search", parts.join(" "));

    // Sort: "date" is the default and needs no param; others use ?o=KEY
    const sortKey = options?.sort?.key;
    if (sortKey && sortKey !== "date") params.set("o", sortKey);

    // Use cursor pagination: page 1 always fetches the first page; subsequent pages
    // use the ?next=GID cursor extracted from the previous page's HTML.
    const searchKey = `search:${params.toString()}`;
    let url: string;
    if (page === 1) {
      url = `${this.base()}/?${params.toString()}`;
      this.nextUrls.delete(searchKey);
    } else {
      url = this.nextUrls.get(searchKey) ?? `${this.base()}/?${params.toString()}`;
    }

    const { result, nextUrl } = await this.fetchListing(url, page);
    if (nextUrl) this.nextUrls.set(searchKey, this.resolveUrl(nextUrl));
    else this.nextUrls.delete(searchKey);
    return result;
  }

  private async fetchListing(
    url: string,
    page: number,
    paginated = true,
  ): Promise<{ result: PagedResults<SeriesEntry>; nextUrl?: string }> {
    const html = await this.getHtml(url);
    const pairs = extractGalleryPairs(html);
    const hasNext = paginated && listingHasNextPage(html, pairs.length);
    const nextUrl = paginated ? extractNextUrl(html) : undefined;

    if (pairs.length === 0) return { result: { items: [], page, hasNextPage: false } };

    // gdata API accepts at most 25 pairs per request; chunk accordingly.
    const GDATA_BATCH = 25;
    const metaById = new Map<string, GMetadata>();
    for (let i = 0; i < pairs.length; i += GDATA_BATCH) {
      const chunk = pairs.slice(i, i + GDATA_BATCH);
      const resp = await this.postJson<GDataResponse>(EH_API, {
        method: "gdata",
        gidlist: chunk.map(({ gid, token }) => [gid, token]),
        namespace: 1,
      });
      for (const m of resp.gmetadata ?? []) {
        metaById.set(`${m.gid}:${m.token}`, m);
      }
    }

    const items: SeriesEntry[] = pairs.map(({ gid, token }): SeriesEntry => {
      const id = `${gid}:${token}`;
      const meta = metaById.get(id);
      if (!meta || meta.error || meta.expunged) return { id, title: id };
      const entry: SeriesEntry = { id, title: meta.title ?? id };
      if (meta.thumb) entry.thumbnailUrl = meta.thumb;
      return entry;
    });

    return { result: { items, page, hasNextPage: hasNext }, nextUrl };
  }

  // ── Filters / sort ────────────────────────────────────────────────────────

  getFilters(): Promise<Filter[]> {
    return Promise.resolve([
      {
        type: "multiselect",
        key: "category",
        label: "Category",
        options: [
          { value: "doujinshi", label: "Doujinshi" },
          { value: "manga", label: "Manga" },
          { value: "artist-cg", label: "Artist CG" },
          { value: "game-cg", label: "Game CG" },
          { value: "western", label: "Western" },
          { value: "non-h", label: "Non-H" },
          { value: "image-set", label: "Image Set" },
          { value: "cosplay", label: "Cosplay" },
          { value: "asian-porn", label: "Asian Porn" },
          { value: "misc", label: "Misc" },
        ],
      },
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
          { value: "french", label: "French" },
          { value: "german", label: "German" },
        ],
      },
      { type: "text", key: "tags", label: "Tags" },
    ]);
  }

  getSortOptions(): Promise<SortOption[]> {
    return Promise.resolve([
      { key: "date", label: "Newest", directionless: true },
      { key: "r", label: "Top Rated", directionless: true },
      { key: "f", label: "Most Favorited", directionless: true },
    ]);
  }

  // ── Series detail ─────────────────────────────────────────────────────────

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const [gid, token] = parseId(seriesId);
    const resp = await this.postJson<GDataResponse>(EH_API, {
      method: "gdata",
      gidlist: [[gid, token]],
      namespace: 1,
    });
    const meta = resp.gmetadata?.[0];
    if (meta?.error) throw new Error(`E-Hentai API error: ${meta.error}`);

    const info: SeriesInfo = {
      id: seriesId,
      title: meta?.title ?? seriesId,
      status: "completed",
    };

    if (meta?.thumb) info.thumbnailUrl = meta.thumb;
    if (meta?.category) info.genres = [meta.category];
    if (meta?.title_jpn) info.description = meta.title_jpn;

    if (meta?.tags?.length) {
      const byNs = groupTagsByNs(meta.tags);
      const tagGroups: TagGroup[] = [];

      // Author: prefer artist namespace, fall back to group
      const credits = byNs.get("artist") ?? byNs.get("group");
      if (credits?.length) info.author = credits.join(", ");

      // Languages via the dedicated field
      const langs = byNs.get("language");
      if (langs?.length) info.languages = langs;

      // Build tag groups for all namespaces
      for (const [ns, tags] of byNs) {
        if (ns === "language") continue; // surfaced via info.languages already
        const label = NS_LABELS[ns] ?? (ns[0]!.toUpperCase() + ns.slice(1));
        const kind = TAG_KINDS[ns];
        const group: TagGroup = { label, tags };
        if (kind) group.kind = kind;
        tagGroups.push(group);
      }

      if (tagGroups.length) info.tagGroups = tagGroups;
    }

    const pageCount = meta?.filecount ? parseInt(meta.filecount, 10) : NaN;
    if (pageCount > 0) info.pageCount = pageCount;

    return info;
  }

  // ── Direct pages ──────────────────────────────────────────────────────────

  /**
   * Fetch page list via MPV (1 request, requires auth) or viewer scraping fallback.
   *
   * MPV path: all hashes known upfront → proxy URLs embed the hash directly.
   * Fallback path: only the first viewer page is fetched to get the total count.
   *   Proxy URLs embed "_" as the hash sentinel; resolvePage resolves the real
   *   hash on demand using a per-viewer-page cache.
   */
  async getSeriesPages(seriesId: string): Promise<Page[]> {
    const [gid, token] = parseId(seriesId);
    const encSeriesId = encodeURIComponent(seriesId);

    // Try MPV first — 1 request, but requires a logged-in session.
    console.log(`[e-hentai] getSeriesPages ${seriesId}: trying MPV`);
    const mpvHtml = await this.getHtml(`${this.base()}/mpv/${gid}/${token}/`);
    if (!mpvHtml.includes("eeenope")) {
      // dotAll flag handles imagelist JSON that may span multiple lines
      const match = mpvHtml.match(/var imagelist\s*=\s*(\[[\s\S]+?\]);/);
      if (match) {
        const imagelist = JSON.parse(match[1]) as Array<{ k: string }>;
        if (imagelist.length > 0) {
          console.log(`[e-hentai] getSeriesPages ${seriesId}: MPV OK, ${imagelist.length} pages`);
          return imagelist.map((entry, i) => ({
            index: i,
            imageUrl: `/bridges/e-hentai/series/${encSeriesId}/page-image/${entry.k}/${gid}-${i + 1}`,
          }));
        }
      }
    }

    // Fallback: fetch only the first viewer page to get total count, then return
    // proxy URLs with "_" as a hash placeholder. Hashes are resolved lazily in
    // resolvePage as the reader scrolls, with viewer pages cached to avoid
    // redundant fetches (all 40 images on viewer page 0 share one fetch).
    console.log(`[e-hentai] getSeriesPages ${seriesId}: MPV unavailable, falling back to viewer scraping`);
    const firstHtml = await this.getHtml(`${this.base()}/g/${gid}/${token}/?p=0`);
    const filecount = extractFilecount(firstHtml);
    if (filecount === 0) {
      console.error(`[e-hentai] getSeriesPages ${seriesId}: could not extract page count from viewer HTML`);
      throw new Error("Gallery not found or expunged.");
    }

    // Pre-populate cache for the first viewer page so pages 1–40 resolve instantly.
    const firstEntries = extractPageHashes(firstHtml);
    this.hashCache.set(`${gid}:0`, new Map(firstEntries.map((e) => [e.pageNum, e.hash])));
    console.log(`[e-hentai] getSeriesPages ${seriesId}: viewer fallback OK, ${filecount} pages (${firstEntries.length} hashes cached)`);

    return Array.from({ length: filecount }, (_, i) => ({
      index: i,
      imageUrl: `/bridges/e-hentai/series/${encSeriesId}/page-image/_/${gid}-${i + 1}`,
    }));
  }

  /** Fetch and cache the hash map for a single viewer page (deduplicates concurrent calls). */
  private getViewerPageHashes(gid: number, token: string, viewerPage: number): Promise<Map<number, string>> {
    const key = `${gid}:${viewerPage}`;
    const cached = this.hashCache.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = this.hashCachePending.get(key);
    if (pending) return pending;
    const promise = this.getHtml(`${this.base()}/g/${gid}/${token}/?p=${viewerPage}`).then((html) => {
      const map = new Map(extractPageHashes(html).map((e) => [e.pageNum, e.hash]));
      this.hashCache.set(key, map);
      this.hashCachePending.delete(key);
      return map;
    });
    this.hashCachePending.set(key, promise);
    return promise;
  }

  /** Resolve the CDN URL for a single page on demand (called by the host-server proxy route). */
  async resolvePage(seriesId: string, hash: string, gidRef: string): Promise<string> {
    // "_" sentinel: hash wasn't known at getSeriesPages time — look it up lazily.
    if (hash === "_") {
      const [gid, token] = parseId(seriesId);
      const pageNum = parseInt(gidRef.split("-")[1]!, 10);
      const viewerPage = Math.floor((pageNum - 1) / VIEWER_PAGE_SIZE);
      console.log(`[e-hentai] resolvePage ${gidRef}: fetching hash from viewer page ${viewerPage}`);
      const map = await this.getViewerPageHashes(gid, token, viewerPage);
      const resolved = map.get(pageNum);
      if (!resolved) {
        console.error(`[e-hentai] resolvePage ${gidRef}: hash not found in viewer page ${viewerPage} (${map.size} entries)`);
        throw new Error(`Hash not found for page ${pageNum}`);
      }
      hash = resolved;
    }

    const pageUrl = `${this.base()}/s/${hash}/${gidRef}`;
    const pageHtml = await this.getHtml(pageUrl);
    const imageUrl = extractImageUrl(pageHtml);
    if (imageUrl) return imageUrl;
    // Image URL missing — CDN assignment may have expired; retry with nl token if present
    const nlMatch = pageHtml.match(/return nl\('([^']+)'\)/);
    if (nlMatch) {
      console.log(`[e-hentai] resolvePage ${gidRef}: image URL missing, retrying with nl token`);
      const retryHtml = await this.getHtml(`${pageUrl}?nl=${encodeURIComponent(nlMatch[1]!)}`);
      const retryUrl = extractImageUrl(retryHtml);
      if (retryUrl) return retryUrl;
    }
    console.error(`[e-hentai] resolvePage ${gidRef}: could not extract image URL`);
    throw new Error(`Could not extract image URL for page ${gidRef}`);
  }
}

/** "2875621:5e748ef5c5" → [2875621, "5e748ef5c5"] */
function parseId(seriesId: string): [number, string] {
  const colon = seriesId.indexOf(":");
  return [parseInt(seriesId.slice(0, colon), 10), seriesId.slice(colon + 1)];
}

export default defineBridge((host) => new EHentaiBridge(host));
