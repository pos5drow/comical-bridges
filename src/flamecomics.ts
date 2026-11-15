/**
 * Flame Comics bridge — https://flamecomics.xyz, a Next.js site read through its data routes,
 * `/_next/data/{buildId}/…json`:
 *  - `browse.json` (the whole catalogue, with popularity ranks) — popular and search
 *  - `latest.json` — latest updates
 *  - `series/{id}.json?id` — details + chapters
 *  - `series/{id}/{token}.json?id&token` — a chapter's images
 *
 * The build id changes on every deploy: it is read from the home page's `__NEXT_DATA__`, cached, and
 * re-read once when a data route 404s. Covers and pages are on `cdn.flamecomics.xyz`, built from the
 * series id, the chapter token and the file names. Series ids are numeric; chapter ids the token.
 */
import {
  BridgeBase,
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
  defineBridge,
  seriesGoneMessage,
} from "@comical/sdk";
import { fold, parseStatus, standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";
import { hintsForType } from "./cover-hints";

const SITE = "https://flamecomics.xyz";
const CDN = "https://cdn.flamecomics.xyz/uploads/images/series";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

interface SeriesDto {
  series_id: number;
  title: string;
  altTitles?: string[] | null;
  description?: string | null;
  type?: string | null;
  categories?: string[] | null;
  tags?: string[] | null;
  author?: string[] | string | null;
  artist?: string[] | string | null;
  status?: string | null;
  cover?: string | null;
  last_edit?: number | null;
  popularityRank?: number | null;
}

interface ChapterDto {
  chapter: string | number;
  title?: string | null;
  release_date: number;
  series_id: number;
  token: string;
}

interface ChapterImagesDto {
  series_id: number;
  token: string;
  release_date: number;
  images: Record<string, { name: string }>;
}

const LISTS: ReadonlyArray<SeriesList> = [
  { id: "popular", name: "Popular", layout: "grid", featured: true },
  { id: "latest", name: "Latest updates", layout: "grid", featured: true },
];

const names = (v: string[] | string | null | undefined) =>
  (Array.isArray(v) ? v : (v ?? "").split(/\s*,\s*/)).map((s) => s.trim()).filter(Boolean);

function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

class FlameComicsBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.flamecomics",
    name: "Flame Comics",
    version: "0.1.2",
    contractVersion: "2.1.0",
    languages: ["en"],
    nsfw: false,
    capabilities: ["lists", "search", "filters"],
    iconUrl: `${SITE}/favicon.ico`,
    // The site's own client asks about once a second.
    rateLimit: { maxConcurrent: 1, minIntervalMs: 1000 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    linkHosts: ["flamecomics.xyz"],
    coverForm: "scroll",
    readingDirection: "vertical",
  };

  private readonly guards = standardGuards(["flamecomics.xyz"]);
  private buildId: string | undefined;

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  private async readBuildId(): Promise<string> {
    const res = await this.request({ url: SITE, headers: { "User-Agent": UA, Accept: "text/html" } });
    const next = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(res.body)?.[1];
    let id: string | undefined;
    try {
      id = next ? (JSON.parse(next) as { buildId?: string }).buildId : undefined;
    } catch {
      id = undefined;
    }
    if (!id) throw new Error("Flame Comics: couldn't find the site's build id");
    this.buildId = id;
    return id;
  }

  /** A data route's `pageProps`; a 404 means the site redeployed, so the build id is re-read once. */
  private async data<T>(path: string): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = attempt === 0 && this.buildId ? this.buildId : await this.readBuildId();
      const res = await this.request({ url: `${SITE}/_next/data/${id}/${path}`, headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.status === 404 && attempt === 0) continue;
      if (res.status === 404) throw new Error(seriesGoneMessage());
      if (res.status >= 400) throw new Error(`Flame Comics answered HTTP ${res.status} for ${path}`);
      try {
        return (JSON.parse(res.body) as { pageProps: T }).pageProps;
      } catch {
        throw new Error(`Flame Comics sent something that isn't JSON for ${path}`);
      }
    }
    throw new Error(seriesGoneMessage());
  }

  private entry(s: SeriesDto): SeriesEntry {
    const e: SeriesEntry = { id: String(s.series_id), title: s.title.trim(), ...hintsForType(s.type ?? undefined) };
    if (s.cover) e.thumbnailUrl = `${CDN}/${s.series_id}/${encodeURIComponent(s.cover)}${s.last_edit ? `?${s.last_edit}` : ""}`;
    return e;
  }

  private async catalogue(): Promise<SeriesDto[]> {
    return (await this.data<{ series: SeriesDto[] }>("browse.json")).series;
  }

  // ── Browse & search ─────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return [...LISTS];
  }

  async getListItems(listId: string, _req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    if (listId === "popular") {
      const series = (await this.catalogue()).slice().sort((a, b) => (a.popularityRank ?? Infinity) - (b.popularityRank ?? Infinity));
      return { items: series.map((s) => this.entry(s)) };
    }
    if (listId === "latest") {
      return { items: (await this.data<{ allSeries: SeriesDto[] }>("latest.json")).allSeries.map((s) => this.entry(s)) };
    }
    throw new Error(`unknown list: ${listId}`);
  }

  async getFilters(): Promise<Filter[]> {
    const series = await this.catalogue();
    const genres = [...new Set(series.flatMap((s) => s.categories ?? []))].sort();
    return [
      { type: "select", key: "status", label: "Status", options: ["Ongoing", "Completed", "Hiatus", "Dropped"].map((v) => ({ value: v.toLowerCase(), label: v })) },
      { type: "select", key: "type", label: "Type", options: ["Manhwa", "Manhua", "Manga"].map((v) => ({ value: v.toLowerCase(), label: v })) },
      { type: "multiselect", key: "genres", label: "Genres", options: genres.map((g) => ({ value: g, label: g })) },
    ];
  }

  /** The whole catalogue comes in one file, so search and filters run over it here. */
  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const norm = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "");
    const words = fold(req.text).split(/\s+/).map((w) => w.replace(/[^a-z0-9]+/g, "")).filter(Boolean);
    let status: string | undefined;
    let type: string | undefined;
    let genres: string[] = [];
    for (const f of req.filters ?? []) {
      if (f.key === "status" && typeof f.value === "string") status = f.value;
      if (f.key === "type" && typeof f.value === "string") type = f.value;
      if (f.key === "genres" && Array.isArray(f.value)) genres = f.value;
    }
    const hits = (await this.catalogue()).filter((s) => {
      const hay = norm([s.title, ...(s.altTitles ?? [])].join(" "));
      if (!words.every((w) => hay.includes(w))) return false;
      if (status && s.status?.toLowerCase() !== status) return false;
      if (type && s.type?.toLowerCase() !== type) return false;
      return genres.every((g) => s.categories?.includes(g));
    });
    return { items: hits.map((s) => this.entry(s)) };
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  private seriesPage(seriesId: string) {
    return this.data<{ series: SeriesDto; chapters: ChapterDto[] }>(`series/${encodeURIComponent(seriesId)}.json?id=${encodeURIComponent(seriesId)}`);
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const { series: s } = await this.seriesPage(seriesId);
    const info: SeriesInfo = { ...this.entry(s), id: seriesId, shareUrl: `${SITE}/series/${seriesId}` };
    if (s.description) info.description = plainText(s.description);
    const alts = (s.altTitles ?? []).map((t) => t.trim()).filter((t) => t && t !== info.title);
    if (alts.length) info.altTitles = alts;
    const status = parseStatus(s.status === "Dropped" ? "cancelled" : s.status);
    if (status !== "unknown") info.status = status;
    if (s.type) info.type = s.type;
    const authors = names(s.author);
    const artists = names(s.artist);
    if (authors.length) {
      info.authors = authors.map((name) => ({ name }));
      info.author = authors.join(", ");
    }
    if (artists.length) {
      info.artists = artists.map((name) => ({ name }));
      info.artist = artists.join(", ");
    }
    const tags = s.tags ?? s.categories ?? [];
    if (tags.length) info.tagGroups = [{ label: "Genres", kind: "genre", tags }];
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const { chapters } = await this.seriesPage(seriesId);
    return chapters.map((c) => {
      const n = Number(c.chapter);
      const label = Number.isFinite(n) ? String(n) : String(c.chapter);
      const ch: Chapter = { id: c.token, name: c.title?.trim() ? `Chapter ${label} - ${c.title.trim()}` : `Chapter ${label}` };
      if (Number.isFinite(n)) ch.number = n;
      if (c.release_date) ch.publishedAt = c.release_date * 1000;
      return ch;
    });
  }

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    const q = `id=${encodeURIComponent(seriesId)}&token=${encodeURIComponent(chapterId)}`;
    const { chapter: c } = await this.data<{ chapter: ChapterImagesDto }>(`series/${encodeURIComponent(seriesId)}/${encodeURIComponent(chapterId)}.json?${q}`);
    return Object.entries(c.images)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, img], index) => ({
        index,
        imageUrl: `${CDN}/${c.series_id}/${c.token}/${encodeURIComponent(img.name)}?${c.release_date}`,
      }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const m = /^https?:\/\/(?:www\.)?flamecomics\.xyz\/series\/(\d+)(?:\/([0-9a-f]+))?/.exec(url);
    if (!m) return null;
    return m[2] ? { seriesId: m[1]!, chapterId: m[2] } : { seriesId: m[1]! };
  }
}

export default defineBridge((host) => new FlameComicsBridge(host));
