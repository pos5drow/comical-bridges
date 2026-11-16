/**
 * Olympus Scanlation bridge — Spanish, https://olympusxyz.com (the domain moves; see `base`).
 *
 * A JSON API under `/api` plus the reader page for images:
 *  - popular: `/rankings?page&period=total_ranking`; latest: `/new-chapters?page`
 *  - browse with filters: `/series?page&direction&type=comic&genres&status`
 *  - the full catalogue (id, name, slug, cover): `/series/list` — search runs over it, as the site
 *    has no search endpoint
 *  - details: `/series/{slug}?type=comic`; chapters: `/series/{slug}/chapters?page&direction=desc&type=comic`
 *  - pages: the reader at `/capitulo/{chapterId}/comic-{slug}` (`main.strip div.panel > img`)
 *
 * Slugs are scrambled and rotate, so a series' id is its numeric id and the slug is looked up from
 * the catalogue when a URL needs one. The current domain is published by a redirector page
 * (`olympus.pages.dev`'s `og:url`, which itself redirects); it is discovered, cached, and can be
 * overridden in settings.
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
  type SettingDescriptor,
  type SortOption,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
} from "@comical/sdk";
import { chapterNumber, fold, parseAbsoluteDate, parseStatus, pickMirror, siteHost, standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";
import { bridgeIcon } from "./core/icon";

const DEFAULT_BASE = "https://olympusxyz.com";
const REDIRECTOR = "https://olympus.pages.dev";
const DOMAIN_TTL_MS = 6 * 60 * 60 * 1000;
/** After a failed discovery, how long to keep using what was known before asking again. */
const DOMAIN_RETRY_MS = 10 * 60 * 1000;
const CATALOGUE_TTL_MS = 60 * 60 * 1000;
const SEARCH_PAGE = 24;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

interface SeriesDto {
  id: number;
  name: string;
  slug: string;
  cover?: string | null;
  type?: string | null;
  summary?: string | null;
  status?: { id?: number; name?: string } | null;
  genres?: { id: number; name: string }[] | null;
  team?: { name?: string } | null;
  is_mature?: boolean;
}

interface Paged<T> {
  data: T[];
  current_page?: number;
  last_page?: number;
}

interface ChapterDto {
  id: number;
  name: string;
  published_at?: string | null;
  team?: { name?: string } | null;
}

const LISTS: ReadonlyArray<SeriesList & { path: string }> = [
  { id: "popular", name: "Populares", layout: "grid", featured: true, path: "/rankings?period=total_ranking" },
  { id: "latest", name: "Últimos capítulos", layout: "grid", featured: true, path: "/new-chapters" },
];

const STATUSES = [
  { value: "1", label: "Activo" },
  { value: "4", label: "Finalizado" },
  { value: "3", label: "Pausado" },
  { value: "5", label: "Cancelado" },
];

/** The site's status ids, which say more than its labels. */
const STATUS_IDS: Record<number, SeriesInfo["status"]> = { 1: "ongoing", 3: "hiatus", 4: "completed", 5: "cancelled" };

class OlympusBridge extends BridgeBase {
  /**
   * The platform User-Agent when the host gives a browser one (what its web check's web view sends),
   * else a fixed desktop Chrome one. A challenge answered in a web view with a borrowed User-Agent
   * never clears, so a bridge behind Cloudflare sends the platform's.
   */
  private get ua(): string {
    const host = this.userAgent;
    return host && host.startsWith("Mozilla/5.0") ? host : UA;
  }

  readonly info: BridgeInfo = {
    id: "pos5drow.olympus",
    name: "Olympus Scanlation",
    version: "0.1.4",
    contractVersion: "2.1.0",
    languages: ["es"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort", "settings"],
    iconUrl: bridgeIcon("olympus"),
    rateLimit: { maxConcurrent: 2, minIntervalMs: 400 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    linkHosts: ["olympusxyz.com", "olympusbiblioteca.com"],
    coverForm: "scroll",
    readingDirection: "vertical",
  };

  private discovered: { origin: string; at: number } | undefined;
  private catalogue: { at: number; byId: Map<number, SeriesDto>; byName: SeriesDto[] } | undefined;

  getSettings(): SettingDescriptor[] {
    return [
      {
        type: "string",
        key: "customDomain",
        label: "Dominio",
        description: "Normalmente se detecta solo. Si el sitio se muda y deja de cargar, escribe aquí su nueva dirección (https://…).",
      },
    ];
  }

  // ── Domain ──────────────────────────────────────────────────────────────────

  /** The site's current origin: the user's override, else the redirector's answer (cached), else the default. */
  private async base(): Promise<string> {
    const custom = this.settings["customDomain"];
    if (typeof custom === "string" && custom.trim()) return pickMirror([DEFAULT_BASE], custom);
    const now = Date.now();
    if (!this.discovered) {
      const stored = await this.storage.get("domain");
      if (stored) {
        try {
          this.discovered = JSON.parse(stored) as { origin: string; at: number };
        } catch {
          // ignore a corrupt cache
        }
      }
    }
    if (this.discovered && now - this.discovered.at < DOMAIN_TTL_MS) return this.discovered.origin;
    try {
      const page = await super.request({ url: REDIRECTOR, headers: { "User-Agent": this.ua } });
      const og = /property="og:url"\s+content="([^"]+)"|content="([^"]+)"\s+property="og:url"/.exec(page.body);
      const target = og?.[1] ?? og?.[2];
      if (target) {
        const landed = await super.request({ url: target, headers: { "User-Agent": this.ua } });
        const origin = /^https:\/\/[^/]+/.exec(landed.url)?.[0];
        if (origin && landed.status < 400) {
          this.discovered = { origin, at: now };
          await this.storage.set("domain", JSON.stringify(this.discovered));
          return origin;
        }
      }
    } catch {
      // fall through to whatever was known
    }
    // Keep what was known (or the default), and don't ask again on every request.
    this.discovered = { origin: this.discovered?.origin ?? DEFAULT_BASE, at: now - DOMAIN_TTL_MS + DOMAIN_RETRY_MS };
    return this.discovered.origin;
  }

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    const res = await super.request(req);
    const hosts = ["olympusxyz.com", "olympusbiblioteca.com", "imagesolymp.xyz", siteHost(await this.base()) ?? ""];
    return guardResponse(res, standardGuards(hosts.filter(Boolean)), req);
  }

  private async api<T>(path: string): Promise<T> {
    const base = await this.base();
    const res = await this.request({ url: `${base}/api${path}`, headers: { "User-Agent": this.ua, Accept: "application/json", Referer: `${base}/` } });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`Olympus answered HTTP ${res.status} for ${path}`);
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`Olympus sent something that isn't JSON for ${path}`);
    }
  }

  // ── Catalogue (slugs and search) ────────────────────────────────────────────

  private async loadCatalogue(force = false): Promise<NonNullable<OlympusBridge["catalogue"]>> {
    const now = Date.now();
    if (!force && this.catalogue && now - this.catalogue.at < CATALOGUE_TTL_MS) return this.catalogue;
    const { data } = await this.api<{ data: SeriesDto[] }>("/series/list");
    const comics = data.filter((s) => s.type === "comic");
    this.catalogue = { at: now, byId: new Map(comics.map((s) => [s.id, s])), byName: comics };
    return this.catalogue;
  }

  /** The current slug for a series id; reloads the catalogue once if the id isn't in it. */
  private async slugOf(id: string): Promise<string> {
    const n = Number(id);
    let s = (await this.loadCatalogue()).byId.get(n);
    if (!s) s = (await this.loadCatalogue(true)).byId.get(n);
    if (!s) throw new Error(seriesGoneMessage());
    return s.slug;
  }

  private entry(s: SeriesDto): SeriesEntry {
    const e: SeriesEntry = { id: String(s.id), title: s.name.trim() };
    if (s.cover) e.thumbnailUrl = s.cover;
    return e;
  }

  // ── Browse & search ─────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ path: _p, ...l }) => l);
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    const page = pageFromCursor(req.cursor);
    const res = await this.api<Paged<SeriesDto>>(`${list.path}${list.path.includes("?") ? "&" : "?"}page=${page}`);
    return {
      items: res.data.filter((s) => s.type === "comic").map((s) => this.entry(s)),
      nextCursor: nextPageCursor(page, (res.current_page ?? page) < (res.last_page ?? page)),
    };
  }

  async getFilters(): Promise<Filter[]> {
    const { genres } = await this.api<{ genres: { id: number; name: string }[] }>("/genres-statuses");
    return [
      { type: "select", key: "genre", label: "Género (sin búsqueda de texto)", options: genres.map((g) => ({ value: String(g.id), label: g.name.trim() })) },
      { type: "select", key: "status", label: "Estado (sin búsqueda de texto)", options: STATUSES },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [{ key: "recent", label: "Recientes" }];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(req.cursor);
    const text = fold(req.text.trim());
    if (text) {
      const words = text.split(/\s+/);
      const hits = (await this.loadCatalogue()).byName.filter((s) => {
        const name = fold(s.name);
        return words.every((w) => name.includes(w));
      });
      const slice = hits.slice((page - 1) * SEARCH_PAGE, page * SEARCH_PAGE);
      return { items: slice.map((s) => this.entry(s)), nextCursor: nextPageCursor(page, page * SEARCH_PAGE < hits.length) };
    }
    const q = new URLSearchParams({ page: String(page), direction: req.sort?.ascending ? "asc" : "desc", type: "comic" });
    for (const f of req.filters ?? []) {
      if (f.key === "genre" && typeof f.value === "string" && f.value) q.set("genres", f.value);
      if (f.key === "status" && typeof f.value === "string" && f.value) q.set("status", f.value);
    }
    const res = await this.api<{ data: { series: Paged<SeriesDto> } }>(`/series?${q}`);
    const series = res.data.series;
    return {
      items: series.data.map((s) => this.entry(s)),
      nextCursor: nextPageCursor(page, (series.current_page ?? page) < (series.last_page ?? page)),
    };
  }

  // ── Details & chapters ──────────────────────────────────────────────────────

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const slug = await this.slugOf(seriesId);
    const { data: s } = await this.api<{ data: SeriesDto }>(`/series/${encodeURIComponent(slug)}?type=comic`);
    const info: SeriesInfo = { ...this.entry(s), id: seriesId, shareUrl: `${await this.base()}/series/comic-${s.slug}` };
    if (s.summary?.trim()) info.description = s.summary.trim();
    const status = (s.status?.id !== undefined ? STATUS_IDS[s.status.id] : undefined) ?? parseStatus(s.status?.name);
    if (status && status !== "unknown") info.status = status;
    const genres = (s.genres ?? []).map((g) => g.name.trim()).filter(Boolean);
    if (genres.length) info.tagGroups = [{ label: "Géneros", kind: "genre", tags: genres }];
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const slug = await this.slugOf(seriesId);
    const out: Chapter[] = [];
    for (let page = 1; page <= 100; page++) {
      const res = await this.api<{ data: ChapterDto[]; meta?: { last_page?: number } }>(
        `/series/${encodeURIComponent(slug)}/chapters?page=${page}&direction=desc&type=comic`,
      );
      for (const c of res.data) {
        const ch: Chapter = { id: String(c.id), name: `Capítulo ${c.name}` };
        const n = chapterNumber(c.name);
        if (n !== undefined) ch.number = n;
        const at = c.published_at ? parseAbsoluteDate(c.published_at) : undefined;
        if (at !== undefined) ch.publishedAt = at;
        if (c.team?.name?.trim()) ch.group = c.team.name.trim();
        out.push(ch);
      }
      if (page >= (res.meta?.last_page ?? 1)) break;
    }
    return out;
  }

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    const slug = await this.slugOf(seriesId);
    const base = await this.base();
    const res = await this.request({
      url: `${base}/capitulo/${encodeURIComponent(chapterId)}/comic-${encodeURIComponent(slug)}`,
      headers: { "User-Agent": this.ua, Accept: "text/html", Referer: `${base}/` },
    });
    if (res.status === 404) throw new Error(seriesGoneMessage("capítulo eliminado"));
    const $ = this.parse(res.body);
    return $("main.strip div.panel > img")
      .toArray()
      .map((img) => $(img).attr("src") ?? "")
      .filter((src) => /^https?:/.test(src))
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const chapter = /\/capitulo\/(\d+)\/comic-([^/?#]+)/.exec(url);
    const series = chapter ? undefined : /\/series\/comic-([^/?#]+)/.exec(url);
    const slug = chapter?.[2] ?? series?.[1];
    if (!slug) return null;
    const find = async (force: boolean) => (await this.loadCatalogue(force)).byName.find((s) => s.slug === slug);
    const s = (await find(false)) ?? (await find(true));
    if (!s) return null;
    return chapter ? { seriesId: String(s.id), chapterId: chapter[1]! } : { seriesId: String(s.id) };
  }
}

export default defineBridge((host) => new OlympusBridge(host));
