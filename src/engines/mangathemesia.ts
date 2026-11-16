/**
 * MangaThemesia — the WordPress theme behind a long tail of scanlation sites (Keiyoushi's
 * `lib-multisrc/mangathemesia`, ~115 sites). Plain HTML:
 *  - browse & search: `{directory}/?page&order&title&status&type&genre[]` (`.listupd .bs .bsx` cards)
 *  - details + chapters: `{directory}/{slug}/` (`#chapterlist li`)
 *  - pages: the reader's `ts_reader.run({…sources:[{images}]})` — some sites wrap that script in a
 *    base64 `data:` URI — else `#readerarea img`
 *
 * Series ids are the slug under the directory; chapter ids the reader's path segment, so ids survive
 * a domain move. The theme ships two detail layouts (an `.infotable` and `.tsinfo .imptdt` rows);
 * both are read. Genres for the filter come from the site's own filter list (`ul.genrez`).
 */
import {
  BridgeBase,
  type BridgeFactory,
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
  base64ToBytes,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
} from "@comical/sdk";
import { chapterNumber, parseDate, parseStatus, siteHost, standardGuards } from "comical-bridge-kit";
import { hintsForType } from "../cover-hints";
import { guardResponse } from "../core/guarded";
import { bridgeIcon } from "../core/icon";

/** What distinguishes one MangaThemesia site from another. */
export interface MangaThemesiaSite {
  id: string;
  name: string;
  version: string;
  /** The site's origin, `https://host`. */
  base: string;
  /** Where series live, default `/manga`. */
  directory?: string;
  languages?: string[];
  nsfw?: boolean;
  /** Image hosts that need the site's Referer, if any. */
  refererImageHosts?: string[];
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
/** Values the theme prints for an empty field. */
const EMPTY = new Set(["", "-", "n/a", "na", "unknown", "?", "updating"]);

const SORTS: ReadonlyArray<SortOption> = [
  { key: "popular", label: "Popular", directionless: true },
  { key: "update", label: "Latest update", directionless: true },
  { key: "latest", label: "Latest added", directionless: true },
  { key: "title", label: "Title A–Z", directionless: true },
  { key: "titlereverse", label: "Title Z–A", directionless: true },
];

const LISTS: ReadonlyArray<SeriesList & { order: string }> = [
  { id: "popular", name: "Popular", layout: "grid", featured: true, order: "popular" },
  { id: "update", name: "Latest updates", layout: "grid", featured: true, order: "update" },
];

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const present = (s: string | undefined) => (EMPTY.has(clean(s).toLowerCase()) ? undefined : clean(s));

export class MangaThemesiaBridge extends BridgeBase {
  /**
   * The platform User-Agent when the host gives a browser one (what its web check's web view sends),
   * else a fixed desktop Chrome one. A challenge answered in a web view with a borrowed User-Agent
   * never clears, so a bridge behind Cloudflare sends the platform's.
   */
  private get ua(): string {
    const host = this.userAgent;
    return host && host.startsWith("Mozilla/5.0") ? host : UA;
  }

  readonly info: BridgeInfo;
  private readonly directory: string;
  private readonly siteHostName: string;
  private genres: { value: string; label: string }[] | undefined;

  constructor(
    host: ConstructorParameters<typeof BridgeBase>[0],
    protected readonly site: MangaThemesiaSite,
  ) {
    super(host);
    this.directory = (site.directory ?? "/manga").replace(/\/+$/, "");
    this.siteHostName = siteHost(site.base) ?? site.base;
    this.info = {
      id: site.id,
      name: site.name,
      version: site.version,
      contractVersion: "2.1.0",
      languages: site.languages ?? ["en"],
      nsfw: site.nsfw ?? false,
      capabilities: ["lists", "search", "filters", "sort"],
      iconUrl: bridgeIcon(site.id),
      rateLimit: { maxConcurrent: 2, minIntervalMs: 500 },
      assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
      linkHosts: [this.siteHostName],
      ...(site.refererImageHosts?.length
        ? { images: { hosts: site.refererImageHosts, headers: { Referer: `${site.base}/` } } }
        : {}),
    };
  }

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), standardGuards([this.siteHostName, ...(this.site.refererImageHosts ?? [])]), req);
  }

  private async page(url: string): Promise<{ $: CheerioRoot; res: HttpResponse }> {
    const res = await this.request({ url, headers: { "User-Agent": this.ua, Accept: "text/html", Referer: `${this.site.base}/` } });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`${this.site.name} answered HTTP ${res.status} for ${url}`);
    return { $: this.parse(res.body), res };
  }

  /** An `<img>`'s real source: lazy loaders keep it in a data attribute. */
  private img($: CheerioRoot, el: Parameters<CheerioRoot>[0]): string | undefined {
    const $el = $(el);
    for (const attr of ["data-lazy-src", "data-src", "data-cfsrc", "src"]) {
      const v = $el.attr(attr)?.trim();
      if (v && !v.startsWith("data:")) return v.startsWith("//") ? `https:${v}` : v;
    }
    return undefined;
  }

  /** The slug a `{directory}/{slug}/` link names. */
  private slugOf(href: string | undefined): string | undefined {
    if (!href) return undefined;
    const path = href.replace(/^https?:\/\/[^/]+/, "");
    const m = new RegExp(`^${this.directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^/?#]+)`).exec(path);
    return m?.[1];
  }

  // ── Browse & search ─────────────────────────────────────────────────────────

  private async browse(page: number, params: URLSearchParams): Promise<PagedResults<SeriesEntry>> {
    params.set("page", String(page));
    const { $ } = await this.page(`${this.site.base}${this.directory}/?${params.toString().replace(/genre%5B%5D/g, "genre[]")}`);
    const items: SeriesEntry[] = [];
    const seen = new Set<string>();
    $(".listupd .bs .bsx, .utao .uta .imgu, .listo .bs .bsx").each((_, el) => {
      const $el = $(el);
      const a = $el.find("a").first();
      const id = this.slugOf(a.attr("href"));
      if (!id || seen.has(id)) return;
      seen.add(id);
      const title = clean(a.attr("title")) || clean($el.find(".tt").first().text()) || id;
      const typeClass = $el.find("span.type").attr("class")?.replace(/\btype\b/, "").trim();
      const entry: SeriesEntry = { id, title, ...hintsForType(typeClass) };
      const img = $el.find("img").get(0);
      const cover = img ? this.img($, img) : undefined;
      if (cover) entry.thumbnailUrl = cover;
      const latest = clean($el.find(".epxs").first().text());
      if (latest) entry.subtitle = latest;
      items.push(entry);
    });
    const hasNext = $("div.pagination .next, div.hpage .r").length > 0;
    return { items, nextCursor: nextPageCursor(page, hasNext) };
  }

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ order: _o, ...l }) => l);
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    return this.browse(pageFromCursor(req.cursor), new URLSearchParams({ order: list.order }));
  }

  async getFilters(): Promise<Filter[]> {
    if (!this.genres) {
      const { $ } = await this.page(`${this.site.base}${this.directory}/`);
      this.genres = $("ul.genrez li")
        .toArray()
        .map((li) => ({ value: $(li).find("input").attr("value") ?? "", label: clean($(li).find("label").text()) }))
        .filter((g) => g.value && g.label);
    }
    return [
      { type: "select", key: "status", label: "Status", options: [["ongoing", "Ongoing"], ["completed", "Completed"], ["hiatus", "Hiatus"]].map(([value, label]) => ({ value: value!, label: label! })) },
      { type: "select", key: "type", label: "Type", options: [["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"], ["comic", "Comic"]].map(([value, label]) => ({ value: value!, label: label! })) },
      ...(this.genres.length ? [{ type: "multiselect" as const, key: "genres", label: "Genres", options: this.genres }] : []),
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const params = new URLSearchParams();
    if (req.text.trim()) params.set("title", req.text.trim());
    for (const f of req.filters ?? []) {
      if ((f.key === "status" || f.key === "type") && typeof f.value === "string" && f.value) params.set(f.key, f.value);
      if (f.key === "genres" && Array.isArray(f.value)) for (const g of f.value) params.append("genre[]", g);
    }
    params.set("order", req.sort?.key ?? (req.text.trim() ? "" : "popular"));
    return this.browse(pageFromCursor(req.cursor), params);
  }

  // ── Details & chapters ──────────────────────────────────────────────────────

  private seriesUrl(seriesId: string): string {
    return `${this.site.base}${this.directory}/${encodeURIComponent(seriesId)}/`;
  }

  /** A labelled detail, from whichever of the theme's two layouts the site uses. */
  private field($: CheerioRoot, labels: string[]): string | undefined {
    const want = (text: string) => labels.some((l) => text.toLowerCase().startsWith(l.toLowerCase()));
    for (const tr of $(".infotable tr").toArray()) {
      const tds = $(tr).find("td");
      if (tds.length >= 2 && want(clean(tds.first().text()))) return present(tds.last().text());
    }
    for (const row of $(".tsinfo .imptdt, .fmed").toArray()) {
      const $row = $(row);
      const label = clean($row.find("b, h1").first().text()) || clean($row.clone().children().remove().end().text());
      if (want(label)) return present($row.find("i, a, span").first().text());
    }
    return undefined;
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const { $ } = await this.page(this.seriesUrl(seriesId));
    const title = clean($(".entry-title").first().text());
    if (!title) throw new Error(`${this.site.name}: no series on the page for ${seriesId}`);
    const info: SeriesInfo = { id: seriesId, title, shareUrl: this.seriesUrl(seriesId) };
    const thumb = $(".thumb img, .infomanga > div[itemprop=image] img").get(0);
    const cover = thumb ? this.img($, thumb) : undefined;
    if (cover) info.thumbnailUrl = cover;
    const desc = $("[itemprop=description], .desc").first().clone();
    desc.find("script, style").remove();
    const description = desc.text().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (description) info.description = description;
    const author = this.field($, ["Author", "Auteur", "Autor", "Mangaka", "Pengarang"]);
    if (author) {
      info.author = author;
      info.authors = author.split(/\s*[,/]\s*/).filter(Boolean).map((name) => ({ name }));
    }
    const artist = this.field($, ["Artist", "Artiste", "Artista", "Ilustrador"]);
    if (artist) {
      info.artist = artist;
      info.artists = artist.split(/\s*[,/]\s*/).filter(Boolean).map((name) => ({ name }));
    }
    const status = parseStatus(this.field($, ["Status", "Statut", "Estado", "Durum"]));
    if (status !== "unknown") info.status = status;
    const type = this.field($, ["Type", "Tipe", "Tipo"]);
    if (type) {
      info.type = type;
      Object.assign(info, hintsForType(type));
    }
    const alt = this.field($, ["Alternative", "Alternatif", "Other name"]) ?? present($(".alternative, .seriestualt").first().text());
    if (alt) info.altTitles = alt.split(/\s*[,;|]\s*/).filter(Boolean);
    const genres = $(".seriestugenre a, .mgen a, div.gnr a").toArray().map((a) => clean($(a).text())).filter(Boolean);
    if (genres.length) info.tagGroups = [{ label: "Genres", kind: "genre", tags: [...new Set(genres)] }];
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const { $ } = await this.page(this.seriesUrl(seriesId));
    const chapters: Chapter[] = [];
    $("#chapterlist li, div.bxcl li, div.cl li").each((_, li) => {
      const $li = $(li);
      const href = $li.find("a").first().attr("href");
      const id = href?.replace(/^https?:\/\/[^/]+/, "").replace(/^\/+|\/+$/g, "");
      if (!id) return;
      const name = clean($li.find(".chapternum, .lch a").first().text()) || clean($li.find("a").first().text()) || id;
      const ch: Chapter = { id, name };
      const n = chapterNumber(name) ?? (Number.isFinite(Number($li.attr("data-num"))) ? Number($li.attr("data-num")) : undefined);
      if (n !== undefined) ch.number = n;
      const at = parseDate(clean($li.find(".chapterdate").first().text()));
      if (at !== undefined) ch.publishedAt = at;
      chapters.push(ch);
    });
    return chapters;
  }

  // ── Pages ───────────────────────────────────────────────────────────────────

  /** The reader's `ts_reader.run({…})` argument, read plain or out of a base64 `data:` script. */
  private readerConfig($: CheerioRoot): { sources?: { images?: string[] }[] } | undefined {
    const scripts = $("script").toArray().map((s) => $(s).html() ?? "");
    for (const src of $("script[src^='data:']").toArray().map((s) => $(s).attr("src") ?? "")) {
      const b64 = src.split(",")[1];
      if (b64) scripts.push(String.fromCharCode(...base64ToBytes(b64)));
    }
    for (const text of scripts) {
      const m = /ts_reader\.run\((\{[\s\S]*?\})\);?\s*$/m.exec(text) ?? /ts_reader\.run\((\{[\s\S]*\})\)/.exec(text);
      if (!m) continue;
      try {
        return JSON.parse(m[1]!) as { sources?: { images?: string[] }[] };
      } catch {
        continue;
      }
    }
    return undefined;
  }

  override async getChapterPages(_seriesId: string, chapterId: string): Promise<Page[]> {
    const { $ } = await this.page(`${this.site.base}/${chapterId}/`);
    let urls = (this.readerConfig($)?.sources?.[0]?.images ?? []).filter((u) => /^https?:/.test(u));
    if (urls.length === 0) {
      urls = $("div#readerarea img")
        .toArray()
        .map((img) => this.img($, img) ?? "")
        .filter((u) => /^https?:/.test(u));
    }
    return urls.map((imageUrl, index) => ({ index, imageUrl }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    if (siteHost(url) !== this.siteHostName) return null;
    const series = this.slugOf(url);
    if (series) return { seriesId: series };
    // A reader link: its page links back to the series.
    const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").replace(/^\/+|\/+$/g, "");
    if (!path || path.includes("/")) return null;
    const { $ } = await this.page(`${this.site.base}/${path}/`);
    const back = $("a[href]").toArray().map((a) => this.slugOf($(a).attr("href"))).find(Boolean);
    return back ? { seriesId: back, chapterId: path } : null;
  }
}

/** A bridge factory for one MangaThemesia site. */
export function mangaThemesia(site: MangaThemesiaSite): BridgeFactory {
  return defineBridge((host) => new MangaThemesiaBridge(host, site));
}
