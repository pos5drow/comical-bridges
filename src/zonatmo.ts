/**
 * ZonaTMO bridge — Spanish, https://zonatmo.org, the TuMangaOnline successor (server-rendered pages):
 *  - popular & search: the library's ajax view (`/biblioteca?title&filter_by=title&order_item&order_dir&page`
 *    with `X-Requested-With`) answers `{html}`, the `#library-grid .element` cards
 *  - latest: `/ultimas-subidas?page` — upload cards that link a chapter, not its series; the series id
 *    is read from the cover (`/tc/{id}-{hash}.webp`)
 *  - details + every chapter (the folded ones too) on `/library/{type}/{id}/{slug}`
 *  - pages: `/view_uploads/{uploadId}`, the `#reader-wrap img.reader-image` images
 *
 * A series id is its numeric library id: the site redirects `/library/{any type}/{id}/{any slug}` to
 * the canonical page, so neither the type nor the slug needs keeping. A chapter id is its upload id;
 * one chapter number can have several uploads, one per group. Adult series are mixed in (`+18` badges
 * on cards, `+18`/`Adulto`/… tags on the page), reported as `contentRating: "adult"`. Covers and
 * pages (`zonatmo.org/tc`, `storage.zonatmo.org`) load without a Referer, so they aren't proxied.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type CheerioRoot,
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
import { parseAbsoluteDate, parseStatus, standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";
import { hintsForType } from "./cover-hints";
import { bridgeIcon } from "./core/icon";

const SITE = "https://zonatmo.org";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const SORTS: ReadonlyArray<SortOption> = [
  { key: "likes_count", label: "Me gusta" },
  { key: "score", label: "Puntuación" },
  { key: "creation", label: "Creación" },
  { key: "release_date", label: "Fecha estreno" },
  { key: "num_chapters", label: "Núm. capítulos" },
];

const LISTS: ReadonlyArray<SeriesList> = [
  { id: "popular", name: "Populares", layout: "grid", featured: true },
  { id: "latest", name: "Últimas subidas", layout: "grid", featured: true },
  { id: "new", name: "Recién añadidos", layout: "grid" },
];

/** The library's genre ids (its own Spanish ones; the duplicated English and scan-group tags left out). */
const GENRES: ReadonlyArray<[string, string]> = [
  ["1", "Acción"], ["111", "Academia"], ["32", "Adulto"], ["47", "Apocalíptico"], ["41", "Artes Marciales"],
  ["2", "Aventura"], ["30", "Boys Love"], ["62", "Ciberpunk"], ["9", "Ciencia Ficción"], ["3", "Comedia"],
  ["66", "Crimen"], ["112", "Cultivo"], ["50", "Demonios"], ["11", "Deportes"], ["4", "Drama"], ["19", "Ecchi"],
  ["18", "Escolar"], ["25", "Familia"], ["5", "Fantasía"], ["54", "Género Bender"], ["35", "Girls Love"],
  ["44", "Gore"], ["64", "Guerra"], ["20", "Harem"], ["40", "Harem Inverso"], ["14", "Histórico"], ["6", "Horror"],
  ["16", "Isekai"], ["26", "Magia"], ["17", "Mecha"], ["43", "Militar"], ["7", "Misterio"], ["138", "Murim"],
  ["63", "Musica"], ["56", "Parodia"], ["65", "Policiaco"], ["15", "Psicológico"], ["49", "Realidad Virtual"],
  ["22", "Recuentos de la vida"], ["36", "Reencarnación"], ["24", "Regresion"], ["8", "Romance"],
  ["59", "Samurái"], ["39", "Sistema"], ["12", "Sobrenatural"], ["58", "Superpoderes"], ["48", "Supervivencia"],
  ["13", "Thriller"], ["37", "Tragedia"], ["38", "Transmigración"], ["57", "Vampiros"], ["128", "Venganza"],
  ["124", "Viaje en el tiempo"], ["105", "Vida Cotidiana"], ["31", "Yaoi"], ["52", "Yuri"],
  ["133", "+15"], ["27", "+18"], ["144", "+19"],
];

/** Tags on a series page that mark it adult (cards say so with their own `+18` badge). */
const ADULT_TAGS = new Set(["+18", "+19", "adulto", "erotica", "smut", "manhwa +19"]);

/** The numeric series id in a library link or a `/tc/` cover URL. */
const libraryId = (href: string) => /\/library\/[^/]+\/(\d+)/.exec(href)?.[1];
const coverId = (src: string) => /\/tc\/(\d+)-/.exec(src)?.[1];

class ZonaTmoBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.zonatmo",
    name: "ZonaTMO",
    version: "0.1.3",
    contractVersion: "2.1.0",
    languages: ["es"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort", "content-rating"],
    iconUrl: bridgeIcon("zonatmo"),
    rateLimit: { maxConcurrent: 2, minIntervalMs: 500 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    linkHosts: ["zonatmo.org"],
  };

  private readonly guards = standardGuards(["zonatmo.org"]);

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  private async fetchResponse(url: string, ajax = false): Promise<HttpResponse> {
    const headers: Record<string, string> = { "User-Agent": UA, Accept: ajax ? "application/json" : "text/html", Referer: `${SITE}/biblioteca` };
    if (ajax) headers["X-Requested-With"] = "XMLHttpRequest";
    const res = await this.request({ url, headers });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`ZonaTMO answered HTTP ${res.status} for ${url}`);
    return res;
  }

  private async page(url: string): Promise<CheerioRoot> {
    return this.parse((await this.fetchResponse(url)).body);
  }

  // ── Lists & search ──────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return [...LISTS];
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    if (listId === "popular") return this.library(new URLSearchParams(), req.cursor);
    if (listId === "new") return this.library(new URLSearchParams({ order_item: "creation" }), req.cursor);
    if (listId === "latest") return this.latest(req.cursor);
    throw new Error(`unknown list: ${listId}`);
  }

  async getFilters(): Promise<Filter[]> {
    const select = (key: string, label: string, options: [string, string][]): Filter => ({
      type: "select",
      key,
      label,
      options: options.map(([value, l]) => ({ value, label: l })),
    });
    return [
      select("type", "Tipo", [
        ["manga", "Manga"], ["manhua", "Manhua"], ["manhwa", "Manhwa"], ["webtoon", "Webtoon"], ["novel", "Novela"],
        ["comic", "Comic"], ["one_shot", "One shot"], ["doujinshi", "Doujinshi"], ["oel", "OEL"],
      ]),
      select("demography", "Demografía", [["seinen", "Seinen"], ["shoujo", "Shoujo"], ["shounen", "Shounen"], ["josei", "Josei"], ["kodomo", "Kodomo"]]),
      select("status", "Estado", [["ongoing", "En emisión"], ["completed", "Completado"], ["ended", "Finalizado"], ["hiatus", "En pausa"], ["cancelled", "Cancelado"]]),
      { type: "multiselect", key: "genders", label: "Géneros", options: GENRES.map(([value, label]) => ({ value, label })) },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const q = new URLSearchParams({ title: req.text.trim() });
    for (const f of req.filters ?? []) {
      if (f.key === "genders" && Array.isArray(f.value)) for (const g of f.value) q.append("genders[]", String(g));
      else if (typeof f.value === "string" && f.value && ["type", "demography", "status"].includes(f.key)) q.set(f.key, f.value);
    }
    if (req.sort) {
      q.set("order_item", req.sort.key);
      q.set("order_dir", req.sort.ascending ? "asc" : "desc");
    }
    return this.library(q, req.cursor);
  }

  /** One page of the library's ajax view, with `params` over the defaults (likes, descending). */
  private async library(params: URLSearchParams, cursor: string | undefined): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(cursor);
    const q = new URLSearchParams({ title: "", filter_by: "title", order_item: "likes_count", order_dir: "desc", _pg: "1" });
    for (const [k, v] of params) {
      if (k.endsWith("[]")) q.append(k, v);
      else q.set(k, v);
    }
    q.set("page", String(page));
    const res = await this.fetchResponse(`${SITE}/biblioteca?${q}`, true);
    let html: string;
    try {
      html = (JSON.parse(res.body) as { html?: string }).html ?? "";
    } catch {
      throw new Error("ZonaTMO sent something that isn't JSON for its library");
    }
    const $ = this.parse(html);
    const seen = new Set<string>();
    const items: SeriesEntry[] = [];
    $("#library-grid .element").each((_, el) => {
      const $el = $(el);
      const id = $el.attr("data-identifier") ?? libraryId($el.find("a[href*='/library/']").attr("href") ?? "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      const title = $el.find(".thumbnail-title h4").attr("title")?.trim() || $el.find(".thumbnail-title h4").text().trim();
      const type = $el.find(".book-type").first().text().trim();
      const e: SeriesEntry = { id, title: title || id, ...hintsForType(type) };
      const cover = $el.find("img.cover-bg-img").attr("src") ?? $el.find(".thumbnail.book").attr("data-bg");
      if (cover) e.thumbnailUrl = cover;
      if ($el.find(".book-meta-mature").length) e.contentRating = "adult";
      items.push(e);
    });
    return { items, nextCursor: nextPageCursor(page, $("a[rel=next]").length > 0) };
  }

  /** Latest uploads, one card per series (a series with several new uploads shows once). */
  private async latest(cursor: string | undefined): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(cursor);
    const $ = await this.page(`${SITE}/ultimas-subidas?page=${page}`);
    const seen = new Set<string>();
    const items: SeriesEntry[] = [];
    $(".upload-file-row").each((_, el) => {
      const $el = $(el);
      const cover = $el.find("img.upc__img").attr("src") ?? "";
      const id = coverId(cover);
      if (!id || seen.has(id)) return;
      seen.add(id);
      const e: SeriesEntry = { id, title: $el.find(".upc__title").text().trim() || id, thumbnailUrl: cover, ...hintsForType($el.attr("data-zt-type")) };
      const cap = $el.find(".upc__cap").text().replace(/\s+/g, " ").trim();
      if (cap) e.subtitle = cap;
      if ($el.attr("data-zt-adult") === "1") e.contentRating = "adult";
      items.push(e);
    });
    return { items, nextCursor: nextPageCursor(page, $("a[rel=next]").length > 0) };
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  /** The series page; any type and slug redirect to the canonical one. */
  private series(seriesId: string): Promise<CheerioRoot> {
    if (!/^\d+$/.test(seriesId)) throw new Error(seriesGoneMessage());
    return this.page(`${SITE}/library/manga/${seriesId}/-`);
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const $ = await this.series(seriesId);
    const title = $("h1.zt-hd__title").first().text().trim() || $("h1.element-title").first().text().trim();
    const canonical = $('link[rel="canonical"]').attr("href");
    const info: SeriesInfo = { id: seriesId, title, shareUrl: canonical && libraryId(canonical) === seriesId ? canonical : `${SITE}/library/manga/${seriesId}/-` };
    const cover = $(".zt-hd__cover img").attr("src") ?? $("img.book-thumbnail").attr("src");
    if (cover) info.thumbnailUrl = cover;
    const synopsis = $("#manga-synopsis").first().text().trim();
    if (synopsis) info.description = synopsis;
    const alts = $(".zt-hd__alt").first().text().split(";").map((s) => s.trim()).filter((s) => s && s !== title);
    if (alts.length) info.altTitles = [...new Set(alts)];
    const type = $(".zt-hd__kicker a").first().text().trim();
    if (type) info.type = type[0]!.toUpperCase() + type.slice(1);
    Object.assign(info, hintsForType(type));
    const stateClass = /zt-hd__state--([a-z]+)/.exec($(".zt-hd__state").attr("class") ?? "")?.[1];
    const status = parseStatus(stateClass === "ended" ? "completed" : stateClass ?? $(".zt-hd__state").text());
    if (status !== "unknown") info.status = status;
    const genres = $(".zt-hd__genres a, .element-header-content-text a[href*='/tag/']").toArray().map((a) => $(a).text().trim()).filter(Boolean);
    if (genres.length) info.tagGroups = [{ label: "Géneros", kind: "genre", tags: [...new Set(genres)] }];
    if (genres.some((g) => ADULT_TAGS.has(g.toLowerCase()))) info.contentRating = "adult";
    const facts = (labels: string[]) =>
      $(".zt-hd__facts > div")
        .toArray()
        .filter((d) => labels.includes($(d).find("dt").text().trim()))
        .flatMap((d) => $(d).find("dd a").toArray().map((a) => $(a).text().trim()))
        .filter(Boolean);
    const authors = [...new Set(facts(["Autor", "Autores", "Autor/es"]))];
    const artists = [...new Set(facts(["Arte", "Artista", "Artistas", "Artista/s"]))];
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
    const $ = await this.series(seriesId);
    const seen = new Set<string>();
    const out: Chapter[] = [];
    // `#chapters-list` and the folded `#chapters-hidden` are both in the page, newest first.
    $("li.upload-link").each((_, li) => {
      const $li = $(li);
      const numText = $li.attr("data-chapter-number") || $li.find(".chapter-number").attr("data-number") || "";
      const number = Number(numText);
      $li.find(".chapter-detail a[href*='/view_uploads/']").each((_, a) => {
        const id = /\/view_uploads\/(\d+)/.exec($(a).attr("href") ?? "")?.[1];
        if (!id || seen.has(id)) return;
        seen.add(id);
        const row = $(a).parent();
        const ch: Chapter = { id, name: `Capítulo ${numText}`.trim() };
        if (numText && Number.isFinite(number)) ch.number = number;
        const group = row.find("a[href*='/groups/']").first().text().trim();
        if (group) ch.group = group;
        const date = row.find(".text-muted.small").first().text().trim();
        const published = date ? parseAbsoluteDate(date, { order: "dmy" }) : undefined;
        if (published !== undefined) ch.publishedAt = published;
        out.push(ch);
      });
    });
    return out;
  }

  override async getChapterPages(_seriesId: string, chapterId: string): Promise<Page[]> {
    if (!/^\d+$/.test(chapterId)) throw new Error(seriesGoneMessage("chapter removed from the source"));
    const $ = await this.page(`${SITE}/view_uploads/${chapterId}`);
    return $("#reader-wrap img.reader-image")
      .toArray()
      .map((img) => $(img).attr("data-src") || $(img).attr("src") || "")
      .filter((u) => /^https?:/.test(u))
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  /** A library link directly; an upload (reader) link through the series it names. */
  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const m = /^https?:\/\/(?:www\.)?zonatmo\.org(\/[^?#]*)/.exec(url);
    if (!m) return null;
    const id = libraryId(m[1]!);
    if (id) return { seriesId: id };
    const upload = /^\/view_uploads\/(\d+)/.exec(m[1]!)?.[1];
    if (!upload) return null;
    const $ = await this.page(`${SITE}/view_uploads/${upload}`);
    const series = $("a[href*='/library/']").toArray().map((a) => libraryId($(a).attr("href") ?? "")).find(Boolean);
    return series ? { seriesId: series, chapterId: upload } : null;
  }
}

export default defineBridge((host) => new ZonaTmoBridge(host));
