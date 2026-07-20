/**
 * Weeb Central bridge — https://weebcentral.com
 *
 * The successor to MangaSee/MangaLife (same operator). Pure HTML scrape:
 *  - Lists / search / latest: one `/search/data` endpoint (offset paging, htmx fragments).
 *  - Details: the series page `/series/{id}`.
 *  - Chapters: `/series/{id}/full-chapter-list` (htmx fragment).
 *  - Pages: `/chapters/{chapterId}/images` (htmx fragment, long-strip img list).
 *
 * Series ids are the site's ULID path segment (e.g. `01J76XYD7E91K8QP6CY0Y53900`); every
 * content URL is rebuildable from it without the human-readable slug. Covers are served from
 * a fixed CDN (`temp.compsci88.com/cover/{size}/{id}.webp`) and page images from another
 * (`scans-hot.planeptune.us`); both are sent with a `weebcentral.com` Referer.
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
  type TagGroup,
  defineBridge,
} from "@comical/sdk";

const BASE = "https://weebcentral.com";
const COVER_BASE = "https://temp.compsci88.com/cover";
const PER_PAGE = 32;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the ULID series id from a `/series/{id}[/slug]` href. */
function seriesIdFromUrl(href: string | undefined): string | undefined {
  return href?.match(/\/series\/([^/?#]+)/)?.[1];
}

/** Extract the ULID chapter id from a `/chapters/{id}` href. */
function chapterIdFromUrl(href: string | undefined): string | undefined {
  return href?.match(/\/chapters\/([^/?#]+)/)?.[1];
}

/** Deterministic cover URL from a series id. The site references the `normal` webp for every
 *  card, so it exists site-wide; `size` picks the card (small/normal) vs detail (normal) variant. */
function coverUrl(id: string, size: "small" | "normal" = "normal"): string {
  return `${COVER_BASE}/${size}/${id}.webp`;
}

const STATUS_MAP: Record<string, SeriesStatus> = {
  ongoing: "ongoing",
  complete: "completed",
  completed: "completed",
  hiatus: "hiatus",
  canceled: "cancelled",
  cancelled: "cancelled",
  discontinued: "cancelled",
};

// ── Lists ─────────────────────────────────────────────────────────────────────

interface ListDef extends SeriesList {
  sort: string;
  order: string;
}

const LISTS: ReadonlyArray<ListDef> = [
  { id: "popular", name: "Popular", layout: "grid", featured: true, sort: "Popularity", order: "Descending" },
  { id: "latest", name: "Recently Updated", layout: "grid", featured: true, sort: "Latest Updates", order: "Descending" },
];

// Sort keys map 1:1 to the site's `sort` param values; label is what the host shows.
const SORTS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "Best Match", label: "Best Match" },
  { key: "Popularity", label: "Popularity" },
  { key: "Latest Updates", label: "Latest Updates" },
  { key: "Alphabet", label: "Alphabet" },
];

// ── Bridge ────────────────────────────────────────────────────────────────────

class WeebCentralBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.weebcentral",
    name: "Weeb Central",
    version: "0.1.0",
    contractVersion: "1.0.0",
    languages: ["en"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort"],
    iconUrl: `${BASE}/favicon.ico`,
    // The site is strict — its own extension throttles to 1 request / 2s.
    rateLimit: { maxConcurrent: 1, minIntervalMs: 2000 },
  };

  private headers(): Record<string, string> {
    return {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: `${BASE}/`,
    };
  }

  // ── Browse / search share the /search/data endpoint ─────────────────────────

  /** Build a `/search/data` URL. `text` empty for pure browse; sort/order/official/status as given. */
  private searchDataUrl(params: {
    text?: string;
    page: number;
    sort: string;
    order: string;
    official?: string | undefined;
    status?: string | undefined;
  }): string {
    const q = new URLSearchParams();
    q.set("limit", String(PER_PAGE));
    q.set("offset", String((params.page - 1) * PER_PAGE));
    q.set("sort", params.sort);
    q.set("order", params.order);
    q.set("official", params.official ?? "Any");
    q.set("display_mode", "Full Display");
    if (params.text?.trim()) q.set("text", params.text.trim());
    if (params.status) q.append("included_status", params.status);
    return `${BASE}/search/data?${q.toString()}`;
  }

  /** Parse a `/search/data` htmx fragment into entries + whether a "View More" button is present. */
  private parseListing(html: string, page: number): PagedResults<SeriesEntry> {
    const $ = this.parse(html);
    const items: SeriesEntry[] = [];
    $("article.bg-base-300").each((_, el) => {
      const $el = $(el);
      const href = $el.find('a[href*="/series/"]').first().attr("href");
      const id = seriesIdFromUrl(href);
      if (!id) return;
      // Full Display carries the title as the desktop section's link; fall back to the mobile
      // overlay label, then the slug.
      const title =
        $el.find(".text-lg.font-semibold a").first().text().trim() ||
        $el.find(".text-ellipsis.truncate").first().text().trim() ||
        href!.split("/").pop()!.replace(/-/g, " ");
      const entry: SeriesEntry = { id, title, thumbnailUrl: coverUrl(id, "small") };
      items.push(entry);
    });
    // The endpoint appends a "View More Results…" button (its own hx-get to the next offset) only
    // when another page exists; trust that over a 32-per-page count (the last page can be full).
    const hasNextPage = $("button[hx-get*='/search/data']").length > 0;
    return { items, page, hasNextPage };
  }

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ sort: _s, order: _o, ...list }) => list);
  }

  async getListItems(listId: string, page: number): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    const html = await this.fetchText(
      this.searchDataUrl({ page, sort: list.sort, order: list.order }),
      this.headers(),
    );
    return this.parseListing(html, page);
  }

  async getFilters(): Promise<Filter[]> {
    return [
      {
        type: "select",
        key: "status",
        label: "Status",
        options: [
          { value: "Ongoing", label: "Ongoing" },
          { value: "Complete", label: "Complete" },
          { value: "Hiatus", label: "Hiatus" },
          { value: "Canceled", label: "Canceled" },
        ],
      },
      {
        type: "select",
        key: "official",
        label: "Official Translation",
        options: [
          { value: "Any", label: "Any" },
          { value: "True", label: "Official only" },
          { value: "False", label: "Fan translations" },
        ],
      },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return SORTS.map((s) => ({ key: s.key, label: s.label }));
  }

  async getSearchResults(
    query: string,
    page: number,
    options?: SearchOptions,
  ): Promise<PagedResults<SeriesEntry>> {
    const sort = options?.sort?.key ?? (query.trim() ? "Best Match" : "Popularity");
    const order = options?.sort && options.sort.ascending ? "Ascending" : "Descending";
    let official: string | undefined;
    let status: string | undefined;
    for (const f of options?.filters ?? []) {
      if (f.key === "official" && typeof f.value === "string") official = f.value;
      if (f.key === "status" && typeof f.value === "string") status = f.value;
    }
    const html = await this.fetchText(
      this.searchDataUrl({ text: query, page, sort, order, official, status }),
      this.headers(),
    );
    return this.parseListing(html, page);
  }

  // ── Series detail ───────────────────────────────────────────────────────────

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const $ = this.parse(await this.fetchText(`${BASE}/series/${encodeURIComponent(seriesId)}`, this.headers()));

    const info: SeriesInfo = {
      id: seriesId,
      title: $("h1").first().text().trim() || seriesId,
      thumbnailUrl: coverUrl(seriesId, "normal"),
    };

    // Metadata rows are `<li><strong>Label:</strong> …</li>`; :has/:contains locate each by label.
    const authors: Credit[] = [];
    $('li:has(strong:contains("Author")) a').each((_, a) => {
      const name = $(a).text().trim();
      if (name) authors.push({ name });
    });
    if (authors.length) {
      info.author = authors.map((c) => c.name).join(", ");
      info.authors = authors;
    }

    const statusText = $('li:has(strong:contains("Status")) a').first().text().trim().toLowerCase();
    if (statusText) info.status = STATUS_MAP[statusText] ?? "unknown";

    const type = $('li:has(strong:contains("Type")) a, li:has(strong:contains("Type")) span').first().text().trim();
    if (type) info.type = type;

    const desc = $('li:has(strong:contains("Description")) p').first().text().trim();
    if (desc) info.description = desc;

    const genres: string[] = [];
    $('li:has(strong:contains("Tag")) a').each((_, a) => {
      const g = $(a).text().trim();
      if (g) genres.push(g);
    });
    if (genres.length) {
      const tagGroups: TagGroup[] = [{ label: "Genres", kind: "genre", tags: genres }];
      info.tagGroups = tagGroups;
    }

    return info;
  }

  // ── Chapters ────────────────────────────────────────────────────────────────

  async getChapters(seriesId: string): Promise<Chapter[]> {
    const $ = this.parse(
      await this.fetchText(`${BASE}/series/${encodeURIComponent(seriesId)}/full-chapter-list`, this.headers()),
    );
    const chapters: Chapter[] = [];
    $('a[href*="/chapters/"]').each((_, a) => {
      const $a = $(a);
      const id = chapterIdFromUrl($a.attr("href"));
      if (!id) return;
      // The chapter label lives in a nested span (e.g. "Chapter 354"); fall back to the anchor text.
      const name = ($a.find("span.flex span").first().text().trim() || $a.text().trim().split("\n")[0]!.trim()) || id;
      const ch: Chapter = { id, name };
      const num = name.match(/(\d+(?:\.\d+)?)/)?.[1];
      if (num) ch.number = parseFloat(num);
      const dt = $a.find("time[datetime]").first().attr("datetime");
      if (dt) {
        const ms = Date.parse(dt);
        if (Number.isFinite(ms)) ch.publishedAt = ms;
      }
      chapters.push(ch);
    });
    return chapters;
  }

  // ── Pages ───────────────────────────────────────────────────────────────────

  async getChapterPages(_seriesId: string, chapterId: string): Promise<Page[]> {
    const url = `${BASE}/chapters/${encodeURIComponent(chapterId)}/images?is_prev=False&reading_style=long_strip`;
    const $ = this.parse(await this.fetchText(url, this.headers()));
    const pages: Page[] = [];
    $("section img").each((i, img) => {
      const src = $(img).attr("src");
      // Skip the site's broken-image placeholder (a relative /static path) — only real CDN pages.
      if (!src || !/^https?:/.test(src)) return;
      pages.push({ index: pages.length, imageUrl: src, headers: { Referer: `${BASE}/` } });
      void i;
    });
    return pages;
  }
}

export default defineBridge((host) => new WeebCentralBridge(host));
