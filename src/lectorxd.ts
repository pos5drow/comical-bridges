/**
 * LectorXD bridge — https://lectorxd.com, Spanish manga, manhwa and manhua on an Astro site.
 *  - lists and search: the catalog (`/catalogo?adult=safe&filters=true&orderBy=…&page=…`), with the
 *    text as `search` and the filters as its own query parameters (`types`, `status`,
 *    `demographics`, `tags`, `excludeTags`, comma-joined as the site's filter form sends them)
 *  - details: the series page (`/{type}/{slug}`, which is also the series id, e.g.
 *    `manga/nade-nade-skill-de-maryoku-chuunyuu`); chapters from the props of its `ChapterList`
 *    island (Astro's `[type, value]` encoding)
 *  - pages: the reader (`/{type}/{slug}/leer/{chapter}`, `?g={group}` for a group's version), its
 *    `img.page-image` images on the `cdnlxd.xyz` hosts
 *
 * The catalog is open, but the series and reader pages sit behind Cloudflare. Its clearance is
 * tied to the User-Agent, so every request carries the host's own browser User-Agent (or a fixed
 * desktop one), the same one a web check would pass with. The catalog's novels (`/novela/…`) are
 * text, not comics, and are left out. This is the site's general catalog: the bridge always asks
 * for `adult=safe`.
 *
 * Page images aren't declared in `info.images`: the reference extension loads them without a
 * Referer or any other header, and the image hosts weren't tried from here.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type Filter,
  type FilterValue,
  type HttpRequest,
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
  parseFilterIncludeExclude,
  seriesGoneMessage,
} from "@comical/sdk";
import { parseStatus, standardGuards } from "comical-bridge-kit";
import { hintsForType } from "./cover-hints";
import { guardResponse } from "./core/guarded";
import { absoluteUrl, hostOf, pathOf, queryParam } from "./core/urls";
import { bridgeIcon } from "./core/icon";

const SITE = "https://lectorxd.com";
const FALLBACK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** The series path segments the site uses for comics, with their display names. */
const TYPES: Readonly<Record<string, string>> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
  one_shot: "One Shot",
  doujinshi: "Doujinshi",
};

const SORTS: ReadonlyArray<SortOption> = [
  { key: "recent", label: "Recientes", directionless: true },
  { key: "rating", label: "Mejor valorados", directionless: true },
  { key: "views", label: "Más vistos", directionless: true },
  { key: "leyendo", label: "Más gente leyendo", directionless: true },
  { key: "por_leer", label: "Más gente por leer", directionless: true },
  { key: "completado", label: "Más completados", directionless: true },
  { key: "chapters", label: "Más capítulos", directionless: true },
];

const LISTS: ReadonlyArray<SeriesList> = [
  { id: "recent", name: "Recientes", layout: "grid", featured: true },
  { id: "rating", name: "Mejor valorados", layout: "grid", featured: true },
  { id: "views", name: "Más vistos", layout: "grid" },
];

/**
 * The catalog's own genre categories (ids from its filter form). The form lists some 1,300
 * categories, most of them per-series tags imported from other sites (and the explicit ones that
 * only matter outside the general catalog); these are the genres among them.
 */
const GENRES: ReadonlyArray<[string, string]> = [
  ["53", "Academia"], ["147", "Acción"], ["22", "Amigos de la infancia"], ["63", "Apocalíptico"],
  ["54", "Artes Marciales"], ["25", "Aventura"], ["62", "Boys Love"], ["55", "Ciencia Ficción"], ["397", "Cocina"],
  ["28", "Comedia"], ["293", "Comedia romántica"], ["234", "Crimen"], ["60", "Cultivo"], ["196", "Demonios"],
  ["164", "Deportes"], ["30", "Drama"], ["33", "Ecchi"], ["40", "Ejército"], ["165", "Escolar"], ["199", "Familia"],
  ["160", "Fantasía"], ["61", "Girls Love"], ["57", "Gore"], ["197", "Guerra"], ["21", "Harem"],
  ["243", "Harem Inverso"], ["149", "Historia"], ["248", "Histórico"], ["45", "Historias cortas"],
  ["65", "Hombres lobo"], ["47", "Isekai"], ["276", "Juegos"], ["48", "Magia"], ["245", "Mecha"], ["194", "Militar"],
  ["34", "Misterio"], ["180", "Monstruos"], ["171", "Murim"], ["220", "Música"], ["256", "Parodia"],
  ["233", "Policiaco"], ["37", "Primer amor"], ["52", "Psicológico"], ["66", "Realidad virtual"],
  ["35", "Recuentos de la vida"], ["172", "Reencarnación"], ["231", "Regresión"], ["41", "Relación secreta"],
  ["169", "Renacimiento"], ["181", "Rey Demonio"], ["27", "Romance"], ["176", "Sistema"],
  ["26", "Sistema de Niveles"], ["36", "Sobrenatural"], ["49", "Superpoderes"], ["151", "Supervivencia"],
  ["193", "Suspenso"], ["268", "Terror"], ["58", "Thriller"], ["46", "Tragedia"], ["213", "Transmigración"],
  ["38", "Universidad"], ["67", "Vampiros"], ["50", "Venganza"], ["370", "Viaje en el tiempo"],
  ["157", "Vida Escolar"], ["192", "Videojuegos"], ["146", "Yaoi"], ["221", "Yuri"],
];

/** A series id (`manga/{slug}`) and, for a reader link, its chapter id, from a site URL or path. */
function parseLink(urlOrPath: string): { seriesId: string; chapterId?: string } | undefined {
  let path = urlOrPath.trim();
  let group: string | null = null;
  try {
    const abs = absoluteUrl(path, `${SITE}/`);
    if (!abs || !/^(?:www\.)?lectorxd\.com$/i.test(hostOf(abs) ?? "")) return undefined;
    path = pathOf(abs) ?? "/";
    group = queryParam(abs, "g");
  } catch {
    return undefined;
  }
  const m = /^\/([a-z_]+)\/([^/]+)(?:\/leer\/([^/]+))?\/?$/.exec(path);
  if (!m || !(m[1]! in TYPES)) return undefined;
  const seriesId = `${m[1]}/${decodeURIComponent(m[2]!)}`;
  if (!m[3]) return { seriesId };
  const chapter = decodeURIComponent(m[3]);
  return { seriesId, chapterId: group && /^\d+$/.test(group) ? `${chapter}?g=${group}` : chapter };
}

/** Astro's island props: every value is `[type, value]` (1 an array, 0 a plain value or object). */
function unwrapAstro(v: unknown): unknown {
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number") {
    const [type, value] = v as [number, unknown];
    if (type === 1 && Array.isArray(value)) return value.map(unwrapAstro);
    if (type === 0 && value && typeof value === "object" && !Array.isArray(value)) return unwrapProps(value as Record<string, unknown>);
    return value;
  }
  return v;
}

function unwrapProps(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, unwrapAstro(v)]));
}

interface ChapterDto {
  chapter?: string | number | null;
  title?: string | null;
  groupId?: number | null;
  group?: { name?: string | null } | string | null;
  publishAt?: string | null;
  createdAt?: string | null;
  isVisible?: boolean | null;
}

interface ChapterListProps {
  chapters?: ChapterDto[];
  mangaType?: string;
  mangaStatus?: string;
}

class LectorXdBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.lectorxd",
    name: "LectorXD",
    version: "0.1.2",
    contractVersion: "2.1.0",
    languages: ["es"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort"],
    iconUrl: bridgeIcon("lectorxd"),
    // Its own extension keeps to one request every 2s on the site (the image hosts are free).
    rateLimit: { maxConcurrent: 1, minIntervalMs: 2000 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    linkHosts: ["lectorxd.com"],
  };

  private readonly guards = standardGuards(["lectorxd.com"]);

  protected override async request(req: HttpRequest): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  /** Cloudflare's clearance is tied to the User-Agent: the host's own when it is a browser's. */
  private get ua(): string {
    const h = this.userAgent;
    return h && h.startsWith("Mozilla/5.0") ? h : FALLBACK_UA;
  }

  private async html(url: string) {
    const res = await this.request({
      url,
      headers: { "User-Agent": this.ua, Accept: "text/html,application/xhtml+xml", Referer: `${SITE}/` },
    });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`LectorXD answered HTTP ${res.status} for ${new URL(url).pathname}`);
    return this.parse(res.body);
  }

  // ── Lists & search ──────────────────────────────────────────────────────────

  private async catalog(page: number, params: Record<string, string>): Promise<PagedResults<SeriesEntry>> {
    const $ = await this.html(catalogUrl(page, params));
    const items: SeriesEntry[] = [];
    const seen = new Set<string>();
    $(".manga-grid a[href]").each((_, el) => {
      const card = $(el);
      const id = parseLink(card.attr("href") ?? "")?.seriesId;
      const h4 = card.find("h4").first();
      const title = (h4.attr("title") || h4.text()).trim();
      if (!id || !title || seen.has(id)) return;
      seen.add(id);
      const e: SeriesEntry = { id, title, ...hintsForType(id.split("/")[0]) };
      const cover = imageOf(card.find("img").first());
      if (cover) {
        e.thumbnailUrl = cover;
        e.thumbnailAspect = 2 / 3;
      }
      const facts: Record<string, string> = {};
      card.find("span.material-icons-outlined").each((_, icon) => {
        const value = $(icon).next("span").text().trim();
        if (value) facts[$(icon).text().trim()] = value;
      });
      const subtitle = [facts["menu_book"], facts["info"]].filter(Boolean).join(" · ");
      if (subtitle) e.subtitle = subtitle;
      items.push(e);
    });
    const more = $('a[aria-label="Next page"][href*="page="]').length > 0;
    return { items, nextCursor: nextPageCursor(page, more) };
  }

  async getLists(): Promise<SeriesList[]> {
    return [...LISTS];
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    if (!LISTS.some((l) => l.id === listId)) throw new Error(`unknown list: ${listId}`);
    return this.catalog(pageFromCursor(req.cursor), { orderBy: listId });
  }

  async getFilters(): Promise<Filter[]> {
    return [
      {
        type: "multiselect",
        key: "types",
        label: "Tipo",
        options: ["manga", "manhwa", "manhua", "one_shot"].map((value) => ({ value, label: TYPES[value]! })),
      },
      {
        type: "select",
        key: "status",
        label: "Estado",
        options: [
          { value: "", label: "Todos" },
          { value: "en_emision", label: "En emisión" },
          { value: "completado", label: "Finalizado" },
        ],
      },
      {
        type: "multiselect",
        key: "demographics",
        label: "Demografía",
        options: [
          { value: "shounen", label: "Shounen" },
          { value: "seinen", label: "Seinen" },
          { value: "shoujo", label: "Shoujo" },
          { value: "josei", label: "Josei" },
          { value: "ninguno", label: "Otros" },
        ],
      },
      { type: "multiselect", key: "tags", label: "Géneros", excludable: true, options: GENRES.map(([value, label]) => ({ value, label })) },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const sort = SORTS.some((s) => s.key === req.sort?.key) ? req.sort!.key : "recent";
    return this.catalog(pageFromCursor(req.cursor), { orderBy: sort, search: req.text.trim(), ...filterParams(req.filters ?? []) });
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  private async series(seriesId: string) {
    if (parseLink(`/${seriesId}`)?.seriesId !== seriesId) throw new Error(seriesGoneMessage());
    return this.html(`${SITE}/${seriesId}`);
  }

  /** The `ChapterList` island's props, or undefined when the page has none. */
  private chapterProps($: ReturnType<BridgeBase["parse"]>): ChapterListProps | undefined {
    const raw = $('astro-island[component-url*="ChapterList"]').first().attr("props");
    if (!raw) return undefined;
    try {
      return unwrapProps(JSON.parse(raw) as Record<string, unknown>) as ChapterListProps;
    } catch {
      throw new Error("LectorXD changed its series pages (unreadable chapter data); this bridge needs an update");
    }
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const $ = await this.series(seriesId);
    const title = $("h1").first().text().trim();
    if (!title) throw new Error("LectorXD changed its series pages (no title found); this bridge needs an update");
    const info: SeriesInfo = { id: seriesId, title, shareUrl: `${SITE}/${seriesId}` };
    const props = this.chapterProps($);

    const alt = [
      $("#alternative-titles span[title]").first().attr("title"),
      ...$("#alternative-titles-rest > div").map((_, d) => $(d).text()).get(),
    ]
      .map((t) => t?.trim() ?? "")
      .filter((t, i, all) => t && t !== title && all.indexOf(t) === i);
    if (alt.length) info.altTitles = alt;

    const cover = imageOf($('img[src*="/covers/"], img[data-src*="/covers/"]').first()) ?? $('meta[property="og:image"]').attr("content");
    if (cover) {
      info.thumbnailUrl = absoluteUrl(cover, SITE) ?? cover;
      info.thumbnailAspect = 2 / 3;
    }

    const description = $("p.leading-relaxed").first().text().trim();
    if (description) info.description = description;

    const typeKey = props?.mangaType ?? seriesId.split("/")[0];
    const type = (typeKey && TYPES[typeKey]) || $('a[href*="types="]').first().text().trim();
    if (type) info.type = type;
    Object.assign(info, hintsForType(typeKey));

    const status = parseStatus(props?.mangaStatus?.replace(/_/g, " ") || $("h1").first().parent().parent().text());
    if (status !== "unknown") info.status = status;

    const groups: TagGroup[] = [];
    const tags: string[] = [];
    const tagIds: string[] = [];
    $('#manga-tags a[href*="tags="]').each((_, a) => {
      const id = /[?&]tags=(\d+)(?:&|$)/.exec($(a).attr("href") ?? "")?.[1];
      const name = $(a).text().trim();
      if (id && name && !tagIds.includes(id)) {
        tags.push(name);
        tagIds.push(id);
      }
    });
    if (tags.length) groups.push({ label: "Géneros", kind: "genre", tags, tagIds });
    const demographic = $('a[href*="demographics="]').first().text().trim();
    if (demographic) groups.push({ label: "Demografía", kind: "demographic", tags: [demographic] });
    if (groups.length) info.tagGroups = groups;
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const props = this.chapterProps(await this.series(seriesId));
    if (!props) throw new Error("LectorXD changed its series pages (no chapter list found); this bridge needs an update");
    const seen = new Set<string>();
    const out: Chapter[] = [];
    for (const c of props.chapters ?? []) {
      const n = String(c.chapter ?? "").trim();
      if (!n || c.isVisible === false) continue;
      const id = typeof c.groupId === "number" ? `${n}?g=${c.groupId}` : n;
      if (seen.has(id)) continue;
      seen.add(id);
      const title = c.title?.trim();
      const ch: Chapter = { id, name: title ? `Capítulo ${n}: ${title}` : `Capítulo ${n}` };
      const number = Number(n);
      if (/^\d+(?:\.\d+)?$/.test(n) && Number.isFinite(number)) ch.number = number;
      const group = (typeof c.group === "string" ? c.group : c.group?.name)?.trim();
      if (group) ch.group = group;
      const date = Date.parse(c.publishAt ?? c.createdAt ?? "");
      if (Number.isFinite(date)) ch.publishedAt = date;
      out.push(ch);
    }
    return out;
  }

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    const m = /^([\w.-]+)(\?g=\d+)?$/.exec(chapterId);
    if (!m || parseLink(`/${seriesId}`)?.seriesId !== seriesId) throw new Error(seriesGoneMessage("chapter removed from the source"));
    const $ = await this.html(`${SITE}/${seriesId}/leer/${encodeURIComponent(m[1]!)}${m[2] ?? ""}`);
    const urls: string[] = [];
    $("img.page-image").each((_, el) => {
      const src = imageOf($(el));
      if (src && !urls.includes(src)) urls.push(src);
    });
    if (urls.length === 0) throw new Error(seriesGoneMessage("chapter removed from the source"));
    return urls.map((imageUrl, index) => ({ index, imageUrl }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    if (!/^https?:\/\//i.test(url.trim())) return null;
    return parseLink(url) ?? null;
  }
}

/** An image's real URL (lazy images keep it in `data-src`; their `src` is a `data:` placeholder). */
function imageOf(img: { attr(name: string): string | undefined }): string | undefined {
  for (const name of ["data-src", "data-original-src", "data-lazy-src", "src"]) {
    const v = img.attr(name)?.trim();
    if (v && !v.startsWith("data:")) return absoluteUrl(v, SITE);
  }
  return undefined;
}

/** The catalog URL for page `page`, `params` in the order the site's form writes them. */
export function catalogUrl(page: number, params: Record<string, string>): string {
  const q = new URLSearchParams({ adult: "safe", filters: "true", orderBy: params.orderBy || "recent" });
  if (page > 1) q.set("page", String(page));
  for (const key of ["search", "types", "status", "demographics", "tags", "excludeTags"]) {
    if (params[key]) q.set(key, params[key]);
  }
  return `${SITE}/catalogo?${q}`;
}

/** The catalog's query parameters for these filters (lists comma-joined, unknown values dropped). */
export function filterParams(filters: readonly FilterValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  const value = (key: string) => filters.find((f) => f.key === key)?.value;
  const list = (key: string, allowed: (v: string) => boolean) => {
    const v = value(key);
    return (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []).filter((x) => typeof x === "string" && allowed(x));
  };
  const types = list("types", (v) => ["manga", "manhwa", "manhua", "one_shot"].includes(v));
  if (types.length) out.types = types.join(",");
  const status = value("status");
  if (status === "en_emision" || status === "completado") out.status = status;
  const demographics = list("demographics", (v) => ["shounen", "seinen", "shoujo", "josei", "ninguno"].includes(v));
  if (demographics.length) out.demographics = demographics.join(",");
  const tags = parseFilterIncludeExclude(value("tags"));
  const ids = (xs: string[]) => [...new Set(xs.filter((x) => /^\d+$/.test(x)))];
  if (ids(tags.include).length) out.tags = ids(tags.include).join(",");
  if (ids(tags.exclude).length) out.excludeTags = ids(tags.exclude).join(",");
  return out;
}

export default defineBridge((host) => new LectorXdBridge(host));
