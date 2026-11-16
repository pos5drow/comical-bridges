/**
 * BatCave bridge — https://batcave.biz, western comics on DataLife Engine (DLE).
 *  - latest: the home page (`/page/{n}/`); popular: the library sorted by rating (a POST of DLE's
 *    sort form to `/comix/page/{n}/`)
 *  - search: `/search/{text}/page/{n}/`; with no text, the library's filters (`/ComicList/{p=…/g=…/
 *    y[from]=…/}page/{n}/`, sorted by the same form)
 *  - details: the series page (`/{id}.html`, an id like `33051-absolute-batman-2024`); chapters from
 *    its `window.__DATA__`
 *  - pages: `POST /engine/ajax/controller.php?mod=api&action=reader/getChapterData` with the news
 *    and chapter ids
 *
 * The site sits behind DLE Guard, a browser check that answers a request without its trust cookie
 * by redirecting to `/_c?t=…`. The bridge turns that into a web check of the page it wanted (the
 * person, or the check by itself, passes it in a web view with this User-Agent); the cookies it
 * leaves let every request through for a day. Page images want the site's Referer.
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
  challengeMessage,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
} from "@comical/sdk";
import { parseStatus, standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";
import { absoluteUrl } from "./core/urls";
import { bridgeIcon } from "./core/icon";

const SITE = "https://batcave.biz";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const SORTS: ReadonlyArray<SortOption> = [
  { key: "date", label: "Date added" },
  { key: "editdate", label: "Last updated" },
  { key: "rating", label: "Rating" },
  { key: "news_read", label: "Most read" },
  { key: "comm_num", label: "Most comments" },
  { key: "title", label: "Title" },
];

const GENRES: ReadonlyArray<[string, number]> = [
  ["Action", 1], ["Adventure", 2], ["Anthology", 3], ["Anthropomorphic", 4], ["Biography", 5], ["Children", 6],
  ["Comedy", 7], ["Crime", 8], ["Drama", 9], ["Family", 10], ["Fantasy", 11], ["Fighting", 12],
  ["Graphic Novels", 13], ["Historical", 14], ["Horror", 15], ["Leading Ladies", 16], ["LGBTQ", 17],
  ["Literature", 18], ["Manga", 19], ["Martial Arts", 20], ["Mature", 21], ["Military", 22], ["Mini-Series", 23],
  ["Movies & TV", 24], ["Music", 25], ["Mystery", 26], ["Mythology", 27], ["Personal", 28], ["Political", 29],
  ["Post-Apocalyptic", 30], ["Psychological", 31], ["Pulp", 32], ["Religious", 33], ["Robots", 34], ["Romance", 35],
  ["Satire", 50], ["School Life", 36], ["Sci-Fi", 37], ["Slice of Life", 38], ["Sport", 39], ["Spy", 40],
  ["Superhero", 41], ["Supernatural", 42], ["Suspense", 43], ["Teen", 51], ["Thriller", 44], ["Vampires", 45],
  ["Video Games", 46], ["War", 47], ["Western", 48], ["Zombies", 49],
];

/** The larger publishers (the site lists some 1,800). */
const PUBLISHERS: ReadonlyArray<[string, number]> = [
  ["DC Comics", 16], ["Marvel", 80], ["Image Comics", 24], ["Dark Horse Comics", 97], ["IDW Publishing", 102],
  ["Boom Studios", 13], ["Dynamite Entertainment", 100], ["Oni Press", 29], ["Titan Comics", 1458],
  ["Valiant Comics", 1505], ["Archie Comics", 232], ["Aftershock Comics", 5], ["Vault Comics", 1513],
  ["Mad Cave Studios", 977], ["Ablaze", 3], ["Avatar Press", 48], ["Zenescope Entertainment", 87],
  ["Scout Comics", 34], ["Humanoids", 22], ["2000 AD", 128], ["Vertigo", 1522], ["Wildstorm", 1568],
];

interface DataDto {
  news_id: number;
  xhash?: string;
  chapters?: { id: number; posi?: number; title: string; date?: string; broken?: boolean }[];
}

/** A series id (`33051-absolute-batman-2024`) from a site URL or path, or undefined. */
function seriesIdOf(urlOrPath: string): string | undefined {
  const path = urlOrPath.replace(/^https?:\/\/(?:www\.)?batcave\.biz/, "").replace(/[?#].*$/, "");
  return /^\/(\d+-[\w-]+)\.html$/.exec(path)?.[1];
}

const newsIdOf = (seriesId: string) => /^(\d+)-/.exec(seriesId)?.[1];

/** A `d.m.yyyy` date as epoch ms (UTC midnight). */
function dmy(s: string | undefined): number | undefined {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s?.trim() ?? "");
  return m ? Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : undefined;
}

class BatCaveBridge extends BridgeBase {
  /** The platform User-Agent when the host gives a browser one (the web check's web view sends it too), else a fixed desktop Chrome one. */
  private get ua(): string {
    const host = this.userAgent;
    return host && host.startsWith("Mozilla/5.0") ? host : UA;
  }

  readonly info: BridgeInfo = {
    id: "pos5drow.batcave",
    name: "BatCave",
    version: "0.1.2",
    contractVersion: "2.1.0",
    languages: ["en"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort"],
    iconUrl: bridgeIcon("batcave"),
    rateLimit: { maxConcurrent: 2, minIntervalMs: 500 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    linkHosts: ["batcave.biz"],
    images: { hosts: ["img.batcave.biz"], headers: { Referer: `${SITE}/` } },
  };

  private readonly guards = standardGuards(["batcave.biz"]);

  /** DLE Guard's redirect becomes a web check of the page wanted (the home page for a POST). */
  protected override async request(req: HttpRequest): Promise<HttpResponse> {
    const res = await super.request(req);
    let path = "";
    try {
      path = new URL(res.url || req.url).pathname;
    } catch {
      // Not a URL; let the guards judge it.
    }
    if (path === "/_c" || path.startsWith("/_c/")) {
      const page = (req.method ?? "GET").toUpperCase() === "GET" ? req.url : `${SITE}/`;
      throw new Error(challengeMessage({ url: page, userAgent: this.ua, reason: "BatCave wants to check this is a browser" }));
    }
    return guardResponse(res, this.guards, req);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { "User-Agent": this.ua, Accept: "text/html,application/xhtml+xml", Referer: `${SITE}/`, ...extra };
  }

  private async html(url: string, form?: Record<string, string>) {
    const res = await this.request({
      url,
      method: form ? "POST" : "GET",
      headers: this.headers(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(form ? { body: new URLSearchParams(form).toString() } : {}),
    });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`BatCave answered HTTP ${res.status} for ${new URL(url).pathname}`);
    return { $: this.parse(res.body), body: res.body };
  }

  /** DLE's sort form, for `scope` (`cat_1` for the library, `xfilter` for filtered lists). */
  private sortForm(scope: string, key: string, ascending: boolean): Record<string, string> {
    return { dlenewssortby: key, dledirection: ascending ? "asc" : "desc", set_new_sort: `dle_sort_${scope}`, set_direction_sort: `dle_direction_${scope}` };
  }

  private poster(seriesId: string): string {
    return `${SITE}/uploads/posts/hd/${newsIdOf(seriesId) ?? ""}.webp`;
  }

  private entry(href: string | undefined, title: string, subtitle?: string): SeriesEntry | undefined {
    const id = href ? seriesIdOf(href) : undefined;
    if (!id || !title.trim()) return undefined;
    const e: SeriesEntry = { id, title: title.trim(), thumbnailUrl: this.poster(id), thumbnailAspect: 2 / 3 };
    if (subtitle?.trim()) e.subtitle = subtitle.trim();
    return e;
  }

  /** Library-style result cards (`.readed`): popular, search, filtered lists. */
  private cards(page: number, $: ReturnType<BridgeBase["parse"]>): PagedResults<SeriesEntry> {
    const items: SeriesEntry[] = [];
    $("#dle-content > .readed").each((_, el) => {
      const a = $(el).find(".readed__title > a").first();
      const meta = $(el).find(".readed__meta-item").map((_, m) => $(m).text().trim()).get().filter(Boolean).join(" · ");
      const e = this.entry(a.attr("href"), a.text(), meta);
      if (e) items.push(e);
    });
    const last = $("div.pagination__pages").first().children().last();
    return { items, nextCursor: nextPageCursor(page, last.is("a")) };
  }

  // ── Lists & search ──────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return [
      { id: "latest", name: "Latest issues", layout: "grid", featured: true },
      { id: "popular", name: "Top rated", layout: "grid", featured: true },
    ];
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(req.cursor);
    if (listId === "popular") {
      const { $ } = await this.html(`${SITE}/comix/${page > 1 ? `page/${page}/` : ""}`, this.sortForm("cat_1", "rating", false));
      return this.cards(page, $);
    }
    if (listId !== "latest") throw new Error(`unknown list: ${listId}`);
    const { $ } = await this.html(page > 1 ? `${SITE}/page/${page}/` : `${SITE}/`);
    const items: SeriesEntry[] = [];
    const seen = new Set<string>();
    $("#content-load > .latest.grid-item").each((_, el) => {
      const a = $(el).find(".latest__title > a").first();
      const e = this.entry(a.attr("href"), a.text(), $(el).find(".latest__chapter a").first().text().replace(/^[\d.]+\s*-\s*/, ""));
      if (e && !seen.has(e.id)) {
        seen.add(e.id);
        items.push(e);
      }
    });
    return { items, nextCursor: nextPageCursor(page, $("li.pagination a[href]").length > 0) };
  }

  async getFilters(): Promise<Filter[]> {
    return [
      { type: "multiselect", key: "publisher", label: "Publisher", options: PUBLISHERS.map(([label, id]) => ({ value: String(id), label })) },
      { type: "multiselect", key: "genre", label: "Genre", options: GENRES.map(([label, id]) => ({ value: String(id), label })) },
      { type: "number", key: "from", label: "From year", min: 1929 },
      { type: "number", key: "to", label: "To year", min: 1929 },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(req.cursor);
    const paged = page > 1 ? `page/${page}/` : "";
    const text = req.text.trim();
    // DLE's search takes text alone; the filters apply to the library.
    if (text) {
      const { $ } = await this.html(`${SITE}/search/${encodeURIComponent(text)}/${paged}`);
      return this.cards(page, $);
    }
    const path = filterPath(req.filters ?? []) || `y[from]=1929/y[to]=${new Date().getUTCFullYear()}/`;
    const sort = req.sort ?? { key: "date", ascending: false };
    const { $ } = await this.html(`${SITE}/ComicList/${path}${paged}`, this.sortForm("xfilter", sort.key, sort.ascending ?? false));
    return this.cards(page, $);
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  private async series(seriesId: string) {
    if (!seriesIdOf(`/${seriesId}.html`)) throw new Error(seriesGoneMessage());
    return this.html(`${SITE}/${seriesId}.html`);
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const { $ } = await this.series(seriesId);
    const title = $("header.page__header h1").first().text().trim();
    if (!title) throw new Error("BatCave changed its series pages (no title found); this bridge needs an update");
    const info: SeriesInfo = { id: seriesId, title, shareUrl: `${SITE}/${seriesId}.html` };
    const poster = $("div.page__poster img").first().attr("src");
    info.thumbnailUrl = (poster && absoluteUrl(poster, SITE)) || this.poster(seriesId);
    info.thumbnailAspect = 2 / 3;
    const item = (label: string) => {
      const li = $(".page__list > li").filter((_, el) => $(el).children("div").first().text().trim().replace(/:$/, "") === label).first();
      const linked = li.children("a").map((_, a) => $(a).text().trim()).get().filter(Boolean);
      return linked.length ? linked : [li.clone().children().remove().end().text().trim()].filter(Boolean);
    };
    const writers = item("Writer");
    const artists = item("Artist");
    if (writers.length) {
      info.authors = writers.map((name) => ({ name }));
      info.author = writers.join(", ");
    }
    if (artists.length) {
      info.artists = artists.map((name) => ({ name }));
      info.artist = artists.join(", ");
    }
    const status = parseStatus(item("Release type")[0]);
    if (status !== "unknown") info.status = status;
    const description = $("div.page__text").first().text().trim();
    if (description) info.description = description;
    const groups: TagGroup[] = [];
    const genres = $("div.page__tags").first().find("a").map((_, a) => $(a).text().trim()).get().filter(Boolean);
    if (genres.length) groups.push({ label: "Genres", kind: "genre", tags: genres });
    const publisher = item("Publisher");
    if (publisher.length) groups.push({ label: "Publisher", kind: "other", tags: publisher });
    const year = item("Year");
    if (year.length) groups.push({ label: "Year", kind: "other", tags: year });
    if (groups.length) info.tagGroups = groups;
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const { body } = await this.series(seriesId);
    const data = dataOf(body);
    return (data.chapters ?? [])
      .filter((c) => !c.broken)
      .map((c) => {
        const ch: Chapter = { id: `${data.news_id}/${c.id}`, name: c.title.trim() };
        if (typeof c.posi === "number" && Number.isFinite(c.posi)) ch.number = c.posi;
        const date = dmy(c.date);
        if (date !== undefined) ch.publishedAt = date;
        return ch;
      });
  }

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    const m = /^(\d+)\/(\d+)$/.exec(chapterId);
    if (!m || newsIdOf(seriesId) !== m[1]) throw new Error(seriesGoneMessage("chapter removed from the source"));
    const res = await this.request({
      url: `${SITE}/engine/ajax/controller.php?mod=api&action=reader/getChapterData`,
      method: "POST",
      headers: this.headers({ Accept: "application/json", "Content-Type": "application/json", Referer: `${SITE}/reader/${m[1]}/${m[2]}`, "X-Requested-With": "XMLHttpRequest" }),
      body: JSON.stringify({ news_id: m[1], chapter_id: m[2] }),
    });
    if (res.status >= 400) throw new Error(`BatCave answered HTTP ${res.status} for this chapter's pages`);
    let images: string[] = [];
    try {
      images = (JSON.parse(res.body) as { data?: { images?: string[] } }).data?.images ?? [];
    } catch {
      throw new Error("BatCave sent something that isn't JSON for this chapter's pages");
    }
    if (images.length === 0) throw new Error(seriesGoneMessage("chapter removed from the source"));
    return images.map((src, index) => ({ index, imageUrl: new URL(src.trim(), SITE).href }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const id = seriesIdOf(url);
    return id ? { seriesId: id } : null;
  }
}

/** The series page's `window.__DATA__`. */
function dataOf(html: string): DataDto {
  const at = html.indexOf("window.__DATA__ = ");
  if (at < 0) throw new Error("BatCave changed its series pages (no chapter data found); this bridge needs an update");
  const rest = html.slice(at + "window.__DATA__ = ".length);
  // The object is followed by `;` and more script, so read exactly one JSON value.
  let depth = 0;
  let inString = false;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(rest.slice(0, i + 1)) as DataDto;
  }
  throw new Error("BatCave changed its series pages (chapter data cut short); this bridge needs an update");
}

/** The library's filter path (`p=1,2/g=3/y[from]=2000/`) for these filters, or "" for none. */
export function filterPath(filters: readonly FilterValue[]): string {
  let out = "";
  const list = (key: string) => {
    const v = filters.find((f) => f.key === key)?.value;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^\d+$/.test(x)) : [];
  };
  const year = (key: string) => {
    const v = Number(filters.find((f) => f.key === key)?.value);
    return Number.isInteger(v) && v >= 1929 && v <= 2100 ? v : undefined;
  };
  const p = list("publisher");
  if (p.length) out += `p=${p.join(",")}/`;
  const g = list("genre");
  if (g.length) out += `g=${g.join(",")}/`;
  const from = year("from");
  if (from) out += `y[from]=${from}/`;
  const to = year("to");
  if (to) out += `y[to]=${to}/`;
  return out;
}

export default defineBridge((host) => new BatCaveBridge(host));
