/**
 * ManhwaWeb bridge — Spanish, https://manhwaweb.com, all from its JSON API (`api.manhwaweb.com`):
 *  - new / popular: `/manhwa/nuevos`; latest updates: `/latest/new-manhwa` — each a single page
 *  - search & browse: `/manhwa/library?buscar&page(0-based)&tipo&demografia&estado&erotico&generes&order_item&order_dir`
 *  - details + chapters: `/manhwa/see/{realId}`; pages: `/chapters/see/{chapterSlug}`
 *
 * Series ids are the API's `real_id`; a chapter id is the last segment of its reader link
 * (`{realId}-{chapter}_{version}`) — a chapter can come in several versions, one per group.
 * The site mixes adult series in; those carry `_erotico: "si"`, reported as `contentRating: "adult"`
 * so the host can apply the user's ceiling. Page images need a manhwaweb.com Referer.
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
import { guardResponse } from "./core/guarded";
import { hintsForType } from "./cover-hints";
import { bridgeIcon } from "./core/icon";

const SITE = "https://manhwaweb.com";
const API = "https://api.manhwaweb.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

interface LibraryDto {
  real_id: string;
  the_real_name?: string;
  name_esp?: string;
  _imagen?: string;
  _erotico?: string;
  _tipo?: string;
}

interface TopDto {
  link: string;
  name: string;
  imagen: string;
}

interface LatestDto {
  id_rel: string;
  name_manhwa: string;
  img: string;
  chapter?: number;
  _tipo?: string;
}

interface VersionDto {
  link: string;
  joint?: { name: string }[];
  create?: number | null;
}

interface DetailsDto extends LibraryDto {
  _id: string;
  _sinopsis?: string | null;
  _status?: string | null;
  _name?: string | null;
  others_name?: string[] | string | null;
  _categoris?: Record<string, string>[];
  autor?: { name: string }[];
  artista?: { name: string }[];
  chapters?: { chapter: number; versions: VersionDto[] }[];
}

const GENRES: ReadonlyArray<[number, string]> = [
  [3, "Acción"], [29, "Aventura"], [18, "Comedia"], [1, "Drama"], [42, "Recuentos de la vida"], [2, "Romance"],
  [5, "Venganza"], [6, "Harem"], [23, "Fantasía"], [31, "Sobrenatural"], [25, "Tragedia"], [43, "Psicológico"],
  [32, "Horror"], [44, "Thriller"], [28, "Historias cortas"], [30, "Ecchi"], [34, "Gore"], [27, "Girls love"],
  [45, "Boys love"], [41, "Reencarnación"], [37, "Sistema de niveles"], [33, "Ciencia ficción"], [38, "Apocalíptico"],
  [39, "Artes marciales"], [40, "Superpoderes"], [35, "Cultivación"], [8, "Milf"],
];

const SORTS: ReadonlyArray<SortOption> = [
  { key: "creacion", label: "Creación" },
  { key: "alfabetico", label: "Alfabético" },
  { key: "num_chapter", label: "Número de capítulos" },
];

const LISTS: ReadonlyArray<SeriesList> = [
  { id: "new", name: "Nuevos", layout: "grid", featured: true },
  { id: "popular", name: "Populares", layout: "grid", featured: true },
  { id: "latest", name: "Últimas actualizaciones", layout: "grid" },
];

const rating = (erotico?: string): Partial<Pick<SeriesEntry, "contentRating">> =>
  erotico === "si" ? { contentRating: "adult" as ContentRating } : {};

/** The last path segment of a link (`https://manhwaweb.com/manhwa/abc_123` → `abc_123`). */
const lastSegment = (link: string) => link.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";

class ManhwaWebBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.manhwaweb",
    name: "ManhwaWeb",
    version: "0.1.4",
    contractVersion: "2.1.0",
    languages: ["es"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort", "content-rating"],
    iconUrl: bridgeIcon("manhwaweb"),
    rateLimit: { maxConcurrent: 2, minIntervalMs: 400 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    images: { hosts: ["img1mw.xyz", "img2mw.xyz"], headers: { Referer: `${SITE}/` } },
    linkHosts: ["manhwaweb.com"],
    coverForm: "scroll",
    readingDirection: "vertical",
  };

  private readonly guards = standardGuards(["manhwaweb.com", "img1mw.xyz", "img2mw.xyz"]);

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  private async api<T>(path: string): Promise<T> {
    const res = await this.request({
      url: `${API}${path}`,
      headers: { "User-Agent": UA, Accept: "application/json", Origin: SITE, Referer: `${SITE}/` },
    });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`ManhwaWeb answered HTTP ${res.status} for ${path}`);
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`ManhwaWeb sent something that isn't JSON for ${path}`);
    }
  }

  private fromLibrary(s: LibraryDto): SeriesEntry {
    const e: SeriesEntry = {
      id: s.real_id,
      title: (s.the_real_name || s.name_esp || s.real_id).trim(),
      ...rating(s._erotico),
      ...hintsForType(s._tipo),
    };
    if (s._imagen) e.thumbnailUrl = s._imagen;
    return e;
  }

  // ── Lists ───────────────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return [...LISTS];
  }

  async getListItems(listId: string, _req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    if (listId === "new" || listId === "popular") {
      const res = await this.api<{ utimos_mangas_creados?: LibraryDto[]; top?: { manhwas_esp?: TopDto[] } }>("/manhwa/nuevos");
      if (listId === "new") return { items: (res.utimos_mangas_creados ?? []).map((s) => this.fromLibrary(s)) };
      return {
        items: (res.top?.manhwas_esp ?? []).map((t) => ({ id: lastSegment(t.link), title: t.name.trim(), thumbnailUrl: t.imagen })),
      };
    }
    if (listId === "latest") {
      const res = await this.api<{ manhwas?: { manhwas_esp?: LatestDto[] } }>("/latest/new-manhwa");
      const seen = new Set<string>();
      const items: SeriesEntry[] = [];
      for (const l of res.manhwas?.manhwas_esp ?? []) {
        if (seen.has(l.id_rel)) continue;
        seen.add(l.id_rel);
        const e: SeriesEntry = { id: l.id_rel, title: l.name_manhwa.trim(), thumbnailUrl: l.img, ...hintsForType(l._tipo) };
        if (typeof l.chapter === "number") e.subtitle = `Capítulo ${l.chapter}`;
        items.push(e);
      }
      return { items };
    }
    throw new Error(`unknown list: ${listId}`);
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  async getFilters(): Promise<Filter[]> {
    const select = (key: string, label: string, options: [string, string][]): Filter => ({
      type: "select",
      key,
      label,
      options: options.map(([value, l]) => ({ value, label: l })),
    });
    return [
      select("tipo", "Tipo", [["manhwa", "Manhwa"], ["manga", "Manga"], ["manhua", "Manhua"]]),
      select("demografia", "Demografía", [["seinen", "Seinen"], ["shonen", "Shonen"], ["josei", "Josei"], ["shojo", "Shojo"]]),
      select("estado", "Estado", [["publicandose", "Publicándose"], ["finalizado", "Finalizado"]]),
      select("erotico", "Erótico", [["si", "Sí"], ["no", "No"]]),
      { type: "multiselect", key: "generes", label: "Géneros", options: GENRES.map(([id, name]) => ({ value: String(id), label: name })) },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(req.cursor);
    const q = new URLSearchParams({ buscar: req.text.trim(), page: String(page - 1) });
    for (const f of req.filters ?? []) {
      if (f.key === "generes" && Array.isArray(f.value) && f.value.length) q.set("generes", f.value.join("a"));
      else if (typeof f.value === "string" && f.value && ["tipo", "demografia", "estado", "erotico"].includes(f.key)) q.set(f.key, f.value);
    }
    q.set("order_item", req.sort?.key ?? "creacion");
    q.set("order_dir", req.sort?.ascending ? "asc" : "desc");
    const res = await this.api<{ data: LibraryDto[]; next?: boolean }>(`/manhwa/library?${q}`);
    return { items: res.data.map((s) => this.fromLibrary(s)), nextCursor: nextPageCursor(page, !!res.next) };
  }

  // ── Details & chapters ──────────────────────────────────────────────────────

  private details(seriesId: string): Promise<DetailsDto> {
    return this.api<DetailsDto>(`/manhwa/see/${encodeURIComponent(seriesId)}`);
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const d = await this.details(seriesId);
    const info: SeriesInfo = { ...this.fromLibrary(d), id: seriesId, shareUrl: `${SITE}/manhwa/${d.real_id}` };
    if (d.name_esp?.trim()) info.title = d.name_esp.trim();
    if (d._sinopsis?.trim()) info.description = d._sinopsis.trim();
    const alts = [d._name, ...(Array.isArray(d.others_name) ? d.others_name : [d.others_name])]
      .flatMap((v) => (v ?? "").split(/\s*[,;]\s*/))
      .map((v) => v.trim())
      .filter((v) => v && v !== info.title);
    if (alts.length) info.altTitles = [...new Set(alts)];
    const status = parseStatus(d._status === "publicandose" ? "ongoing" : d._status);
    if (status !== "unknown") info.status = status;
    if (d._tipo) info.type = d._tipo[0]!.toUpperCase() + d._tipo.slice(1);
    const genres = (d._categoris ?? []).flatMap((c) => Object.values(c)).map((g) => g.trim()).filter(Boolean);
    if (genres.length) info.tagGroups = [{ label: "Géneros", kind: "genre", tags: genres }];
    const authors = (d.autor ?? []).map((a) => a.name.trim()).filter(Boolean);
    const artists = (d.artista ?? []).map((a) => a.name.trim()).filter(Boolean);
    if (authors.length) {
      info.authors = authors.map((name) => ({ name }));
      info.author = authors.join(", ");
    }
    if (artists.length) {
      info.artists = artists.map((name) => ({ name }));
      info.artist = artists.join(", ");
    }
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const d = await this.details(seriesId);
    const out: Chapter[] = [];
    for (const c of d.chapters ?? []) {
      for (const v of c.versions ?? []) {
        // An unreleased chapter has no date yet.
        if (!v.create) continue;
        const id = lastSegment(v.link.replace(d._id, d.real_id));
        if (!id) continue;
        const group = (v.joint ?? []).map((j) => j.name.trim()).filter(Boolean).join(", ");
        out.push({ id, name: `Capítulo ${c.chapter}`, number: c.chapter, publishedAt: v.create, group: group || "ManhwaWeb Bot" });
      }
    }
    return out.sort((a, b) => (b.number ?? 0) - (a.number ?? 0) || (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  }

  override async getChapterPages(_seriesId: string, chapterId: string): Promise<Page[]> {
    const res = await this.api<{ chapter?: { img?: string[] } }>(`/chapters/see/${encodeURIComponent(chapterId)}`);
    return (res.chapter?.img ?? []).filter((u) => /^https?:/.test(u)).map((imageUrl, index) => ({ index, imageUrl }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const m = /^https?:\/\/(?:www\.)?manhwaweb\.com\/(manhwa|manga|leer)\/([^/?#]+)/.exec(url);
    if (!m) return null;
    if (m[1] !== "leer") return { seriesId: m[2]! };
    // A reader link is `{realId}-{chapter}_{version}`.
    const dash = m[2]!.lastIndexOf("-");
    return dash > 0 ? { seriesId: m[2]!.slice(0, dash), chapterId: m[2]! } : null;
  }
}

export default defineBridge((host) => new ManhwaWebBridge(host));
