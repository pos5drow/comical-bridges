/**
 * Mangago bridge — https://www.mangago.me, server-rendered pages:
 *  - lists & browse: `/genre/{genres|all}/{page}/?f&o&sortby&e` (`.updatesli` cards)
 *  - search: `/r/l_search/?name&page` (filters don't apply to a text search, as on the site)
 *  - details + chapters: `/read-manga/{slug}/`; pages: the chapter's reader page
 *
 * A series id is its slug; a chapter id is its reader link's path after the slug, as linked
 * (`uu/br_chapter-246211/pg-1/`). Those paths change now and then, so a chapter that has moved is
 * found again on the series page by its chapter segment.
 *
 * The reader page carries the page list AES-CBC encrypted (`imgsrcs`), with the key and IV in the
 * site's `chapter.js`, itself obfuscated (sojson v4: character codes split by letters). The list
 * may hold only a batch of the chapter's pages, the rest blank; the other batches are on the
 * reader's later pages (`input#curl`, `pg-{page}`). Some images (`cspiclink`) are scrambled into a
 * grid of tiles; `chapter.js` holds the tile orders, keyed by part of the image URL, which ride in
 * `Page.process.context` for `layoutPageImage`. All of `chapter.js` is read as data; none of it runs.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type CheerioRoot,
  type ContentRating,
  type Filter,
  type HttpResponse,
  type LinkTarget,
  type ListRequest,
  type Page,
  type PageImageLayout,
  type PageImageLayoutRequest,
  type PagedResults,
  type SearchRequest,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SettingDescriptor,
  type SortOption,
  base64ToBytes,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
  tileLayout,
} from "@comical/sdk";
import { aesCbcDecrypt, parseAbsoluteDate, parseStatus, standardGuards, stripZeroPadding } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";
import { absoluteUrl } from "./core/urls";

const SITE = "https://www.mangago.me";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const SORTS: ReadonlyArray<SortOption> = [
  { key: "view", label: "Views" },
  { key: "comment_count", label: "Popularity" },
  { key: "create_date", label: "New manga" },
  { key: "update_date", label: "Latest update" },
  { key: "random", label: "Random" },
];

const LISTS: ReadonlyArray<SeriesList & { sort: string }> = [
  { id: "popular", name: "Most viewed", layout: "grid", featured: true, sort: "view" },
  { id: "latest", name: "Latest updates", layout: "grid", featured: true, sort: "update_date" },
  { id: "new", name: "New manga", layout: "grid", sort: "create_date" },
];

const GENRES = [
  "Action", "Adult", "Adventure", "Bara", "Comedy", "Doujinshi", "Drama", "Ecchi", "Fantasy", "Gender Bender",
  "Harem", "Historical", "Horror", "Josei", "Martial Arts", "Mature", "Mecha", "Mystery", "One Shot", "Psychological",
  "Romance", "School Life", "Sci-fi", "Seinen", "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai", "Slice Of Life", "Smut",
  "Sports", "Supernatural", "Tragedy", "Webtoons", "Yaoi", "Yuri",
];

/** The site's own warning, prepended to the summaries of mature series. */
const MATURE_NOTICE = /The following content is intended for mature audiences[^.]*\.\s*Discretion is advised\./i;

function ratingOf(genres: string[]): ContentRating | undefined {
  const g = new Set(genres.map((x) => x.trim().toLowerCase()));
  if (g.has("adult") || g.has("smut")) return "adult";
  if (g.has("mature") || g.has("ecchi")) return "mature";
  return undefined;
}

/** What `chapter.js` gives the bridge: the list's key and IV, and the tile orders. */
interface ReaderScript {
  key: Uint8Array;
  iv: Uint8Array;
  cols: number;
  defaultOrder: string;
  /** URL substring → tile order. Later entries win, as the site's loop over them does. */
  orders: [string, string][];
}

const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));

/** sojson v4: the payload is character codes separated by runs of letters, between a fixed prologue and epilogue. */
export function deobfuscateSojson(js: string): string {
  if (!js.startsWith("['sojson.v4']")) return js;
  return js
    .slice(240, js.length - 59)
    .split(/[a-zA-Z]+/)
    .filter(Boolean)
    .map((n) => String.fromCharCode(Number(n)))
    .join("");
}

/** The site's string shuffle (`dorder`), undone with the four digits it pulled out of the string. */
function dorder(str: string, key: string): string {
  const chars = str.split("");
  const pass = (j: number) => {
    const k = Number(key[j]);
    if (!Number.isInteger(k)) return;
    for (let i = chars.length - 1; i - k >= 0; i--) {
      if (i % 2 === 0) continue;
      const t = chars[i - k]!;
      chars[i - k] = chars[i]!;
      chars[i] = t;
    }
  };
  for (const j of [3, 2, 1, 0]) pass(j);
  return chars.join("");
}

/** A tile order that the script stores shuffled: four digits at 19, 23, 31, 39 are the shuffle's key. */
function unshuffleOrder(s: string): string {
  const key = s.charAt(19) + s.charAt(23) + s.charAt(31) + s.charAt(39);
  const rest = s.slice(0, 19) + s.slice(20, 23) + s.slice(24, 31) + s.slice(32, 39) + s.slice(40);
  return dorder(rest, key);
}

export function parseReaderScript(raw: string): ReaderScript {
  const js = deobfuscateSojson(raw);
  // The list's key and IV are the ones right after `imgsrcs` is checked.
  const block = js.slice(Math.max(0, js.indexOf("typeof(imgsrcs)")));
  const key = /var\s+key\s*=\s*CryptoJS\.enc\.Hex\.parse\("([0-9a-fA-F]+)"\)/.exec(block)?.[1];
  const iv = /var\s+iv\s*=\s*CryptoJS\.enc\.Hex\.parse\("([0-9a-fA-F]+)"\)/.exec(block)?.[1];
  if (!key || !iv) throw new Error("Mangago changed its reader script (no list key found); this bridge needs an update");
  const ren = js.slice(Math.max(0, js.indexOf("var renImg")));
  const orders: [string, string][] = [...ren.matchAll(/_imgkeys_\["([^"]+)"\]\s*=\s*"([0-9a]*)"/g)].map((m) => [m[1]!, m[2]!]);
  const defaultOrder = /var\s+key\s*=\s*"([0-9a]+)"/.exec(ren)?.[1] ?? "";
  // Two URL markers whose orders are stored shuffled: `src.indexOf("A")>0?"<order A>":"<order B>"`.
  const special = /img\.src\.indexOf\("([0-9a-f]+)"\)>0\|\|img\.src\.indexOf\("([0-9a-f]+)"\)>0\)\{\s*var\s+\w+\s*=\s*img\.src\.indexOf\("[0-9a-f]+"\)>0\?"([0-9a]+)":"([0-9a]+)"/.exec(ren);
  if (special) orders.push([special[1]!, unshuffleOrder(special[3]!)], [special[2]!, unshuffleOrder(special[4]!)]);
  const cols = Number(/var\s*widthnum\s*=\s*heightnum\s*=\s*(\d+)/.exec(ren)?.[1] ?? 9);
  return { key: hexBytes(key), iv: hexBytes(iv), cols, defaultOrder, orders };
}

/** The tile order for one scrambled image URL. */
function orderFor(url: string, script: ReaderScript): string {
  let order = script.defaultOrder;
  for (const [marker, o] of script.orders) if (url.indexOf(marker) > 0) order = o;
  return order;
}

class MangagoBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.mangago",
    name: "Mangago",
    version: "0.1.3",
    contractVersion: "2.1.0",
    languages: ["en"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort", "settings", "content-rating"],
    iconUrl: `${SITE}/favicon.ico`,
    rateLimit: { maxConcurrent: 1, minIntervalMs: 1000 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    // No headers: covers and plain pages load directly; scrambled pages are routed for their layout.
    images: { hosts: ["mangapicgallery.com"], process: { layout: true } },
    linkHosts: ["mangago.me"],
  };

  private readonly guards = standardGuards(["mangago.me", "mangapicgallery.com"]);
  private readonly scripts = new Map<string, Promise<ReaderScript>>();

  getSettings(): SettingDescriptor[] {
    return [{ type: "boolean", key: "raws", label: "Show raw (untranslated) chapters", default: false }];
  }

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  private async page(url: string): Promise<{ $: CheerioRoot; url: string }> {
    const res = await this.request({ url, headers: { "User-Agent": UA, Accept: "text/html", Referer: `${SITE}/`, Cookie: "_m_superu=1" } });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`Mangago answered HTTP ${res.status} for ${url}`);
    return { $: this.parse(res.body), url: res.url || url };
  }

  private cards($: CheerioRoot): SeriesEntry[] {
    const seen = new Set<string>();
    const out: SeriesEntry[] = [];
    $("a.thm-effect[href*='/read-manga/']").each((_, a) => {
      const $a = $(a);
      const slug = /\/read-manga\/([^/?#]+)/.exec($a.attr("href") ?? "")?.[1];
      const title = ($a.attr("title") ?? "").trim();
      if (!slug || !title || seen.has(slug)) return;
      seen.add(slug);
      const e: SeriesEntry = { id: slug, title };
      const $img = $a.find("img");
      const cover = $img.attr("data-src") || $img.attr("data-cfsrc") || $img.attr("src");
      if (cover && /^https?:/.test(cover)) e.thumbnailUrl = cover;
      // Search results list their genres.
      const genres = $a.closest("li").find(".row-4 .gray").text().split(",").map((g) => g.trim()).filter(Boolean);
      const rating = ratingOf(genres);
      if (rating) e.contentRating = rating;
      out.push(e);
    });
    return out;
  }

  private hasNext($: CheerioRoot): boolean {
    return $(".pagination li.current + li > a").length > 0;
  }

  // ── Lists & search ──────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ sort: _, ...l }) => l);
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    return this.browse({ sort: list.sort }, req.cursor);
  }

  async getFilters(): Promise<Filter[]> {
    return [
      { type: "select", key: "status", label: "Status", options: [{ value: "completed", label: "Completed" }, { value: "ongoing", label: "Ongoing" }] },
      { type: "multiselect", key: "genres", label: "Genres", options: GENRES.map((g) => ({ value: g, label: g })), excludable: true },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const text = req.text.trim();
    if (text) {
      const page = pageFromCursor(req.cursor);
      const { $ } = await this.page(`${SITE}/r/l_search/?${new URLSearchParams({ name: text, page: String(page) })}`);
      return { items: this.cards($), nextCursor: nextPageCursor(page, this.hasNext($)) };
    }
    let include: string[] = [];
    let exclude: string[] = [];
    let status: string | undefined;
    for (const f of req.filters ?? []) {
      if (f.key === "status" && typeof f.value === "string") status = f.value;
      if (f.key === "genres" && f.value && typeof f.value === "object") {
        const v = Array.isArray(f.value) ? { include: f.value as string[] } : (f.value as { include?: string[]; exclude?: string[] });
        include = (v.include ?? []).filter((g) => GENRES.includes(g));
        exclude = (v.exclude ?? []).filter((g) => GENRES.includes(g));
      }
    }
    return this.browse({ sort: req.sort?.key ?? "view", include, exclude, status }, req.cursor);
  }

  private async browse(
    o: { sort: string; include?: string[]; exclude?: string[]; status?: string | undefined },
    cursor: string | undefined,
  ): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(cursor);
    const genres = o.include?.length ? o.include.map(encodeURIComponent).join(",") : "all";
    const q = `f=${o.status === "ongoing" ? 0 : 1}&o=${o.status === "completed" ? 0 : 1}&sortby=${encodeURIComponent(o.sort)}&e=${(o.exclude ?? []).map(encodeURIComponent).join(",")}`;
    const { $ } = await this.page(`${SITE}/genre/${genres}/${page}/?${q}`);
    return { items: this.cards($), nextCursor: nextPageCursor(page, this.hasNext($)) };
  }

  // ── Details & chapters ──────────────────────────────────────────────────────

  private series(seriesId: string): Promise<{ $: CheerioRoot; url: string }> {
    if (!/^[\w-]+$/.test(seriesId)) throw new Error(seriesGoneMessage());
    return this.page(`${SITE}/read-manga/${seriesId}/`);
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const { $ } = await this.series(seriesId);
    const title = $(".w-title h1").first().text().replace(/\s+/g, " ").trim();
    if (!title) throw new Error(seriesGoneMessage());
    const info: SeriesInfo = { id: seriesId, title, shareUrl: `${SITE}/read-manga/${seriesId}/` };
    const $info = $("#information");
    const cover = $info.find("img").first().attr("src");
    if (cover) info.thumbnailUrl = cover;
    const summaryText = $info.find(".manga_summary").first().text().replace(/\s+/g, " ").trim();
    const mature = MATURE_NOTICE.test(summaryText);
    const summary = summaryText.replace(MATURE_NOTICE, "").trim();
    if (summary && !/^not found\.*$/i.test(summary)) info.description = summary;
    const genres: string[] = [];
    $info.find(".manga_info li, .manga_right tr").each((_, row) => {
      const $row = $(row);
      const label = $row.find("b, label").first().text().trim().toLowerCase();
      const links = $row.find("a").toArray().map((a) => $(a).text().trim()).filter(Boolean);
      if (label === "status:") {
        const st = parseStatus($row.find("span").first().text());
        if (st !== "unknown") info.status = st;
      } else if (label === "author:" || label === "author(s):") {
        if (links.length) {
          info.authors = links.map((name) => ({ name }));
          info.author = links.join(", ");
        }
      } else if (label === "genre(s):") {
        genres.push(...links);
      } else if (label === "alternative:") {
        const raw = $row.text().replace(/\s+/g, " ").trim().replace(/^alternative:\s*/i, "");
        const alts = raw.split(/[/;]/.test(raw) ? /[/;]/ : /,/).map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== "none");
        if (alts.length) info.altTitles = [...new Set(alts)];
      }
    });
    if (genres.length) info.tagGroups = [{ label: "Genres", kind: "genre", tags: genres }];
    const rating = ratingOf(genres) ?? (mature ? "mature" : undefined);
    if (rating) info.contentRating = rating;
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const { $ } = await this.series(seriesId);
    const raws = this.settings["raws"] === true;
    const prefix = `/read-manga/${seriesId}/`;
    const seen = new Set<string>();
    const out: Chapter[] = [];
    $("table#chapter_table > tbody > tr, table#raws_table > tbody > tr, table.uk-table > tbody > tr").each((_, tr) => {
      const $tr = $(tr);
      const $a = $tr.find("a.chico").first();
      const href = ($a.attr("href") ?? "").replace(/^https?:\/\/[^/]+/, "");
      if (!href.startsWith(prefix)) return;
      if (!raws && href.includes("/raw/")) return;
      const id = href.slice(prefix.length);
      const name = $a.text().replace(/\s+/g, " ").trim();
      if (!id || !name || seen.has(id)) return;
      seen.add(id);
      const ch: Chapter = { id, name };
      const n = /\bch(?:apter)?\.?\s*(\d+(?:\.\d+)?)/i.exec(name)?.[1];
      if (n) ch.number = Number(n);
      const group = $tr.find("td.no a, td.uk-table-shrink a").first().text().trim();
      if (group) ch.group = group;
      const date = parseAbsoluteDate($tr.find("td").last().text().trim());
      if (date !== undefined) ch.publishedAt = date;
      out.push(ch);
    });
    return out;
  }

  // ── Pages ───────────────────────────────────────────────────────────────────

  /** The reader page for a chapter, finding it again on the series page if its link has moved. */
  private async reader(seriesId: string, chapterId: string): Promise<{ $: CheerioRoot; url: string }> {
    if (!/^[\w-]+$/.test(seriesId) || /\.\.|^\//.test(chapterId)) throw new Error(seriesGoneMessage("chapter removed from the source"));
    try {
      return await this.page(`${SITE}/read-manga/${seriesId}/${chapterId}`);
    } catch (e) {
      if (!String((e as Error).message).includes(seriesGoneMessage())) throw e;
      const segment = chapterId.split("/")[1];
      const moved = segment ? (await this.getChapters(seriesId)).find((c) => c.id.split("/")[1] === segment) : undefined;
      if (!moved || moved.id === chapterId) throw new Error(seriesGoneMessage("chapter removed from the source"));
      return this.page(`${SITE}/read-manga/${seriesId}/${moved.id}`);
    }
  }

  private script(url: string): Promise<ReaderScript> {
    let s = this.scripts.get(url);
    if (!s) {
      s = (async () => {
        const res = await this.request({ url, headers: { "User-Agent": UA, Referer: `${SITE}/` } });
        if (res.status >= 400) throw new Error(`Mangago answered HTTP ${res.status} for its reader script`);
        return parseReaderScript(res.body);
      })();
      s.catch(() => this.scripts.delete(url));
      this.scripts.set(url, s);
    }
    return s;
  }

  /** One reader page's list: every page's slot, blank where this batch doesn't have it. */
  private async readerList($: CheerioRoot): Promise<{ list: string[]; script: ReaderScript }> {
    const data = $("script").toArray().map((s) => $(s).html() ?? "").find((t) => t.includes("imgsrcs"));
    const enc = data && /imgsrcs\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/.exec(data)?.[1];
    const src = $("script[src*='chapter.js']").attr("src");
    if (!enc || !src) throw new Error("Mangago: this chapter has no pages to show");
    const script = await this.script(src.startsWith("//") ? `https:${src}` : (absoluteUrl(src, SITE) ?? src));
    const plain = new TextDecoder().decode(stripZeroPadding(aesCbcDecrypt(base64ToBytes(enc), script.key, script.iv)));
    // Blank slots are pages in other batches; a trailing non-URL item is a flag, not a page.
    const list = plain.split(",").map((u) => (/^https?:\/\//.test(u.trim()) ? u.trim() : ""));
    while (list.length && !list.at(-1)) list.pop();
    return { list, script };
  }

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    const first = await this.reader(seriesId, chapterId);
    const { $ } = first;
    const total = Number(/total_pages\s*=\s*(\d+)/.exec($("script").toArray().map((s) => $(s).html() ?? "").join("\n"))?.[1] ?? 0);
    const { list, script } = await this.readerList($);
    const urls = list.slice();
    const template = $("input#curl").attr("value");
    const batch = urls.filter(Boolean).length;
    if (total > urls.filter(Boolean).length && template?.includes("{page}") && batch > 0) {
      // The reader's page n lives at the reader's base + the template; each holds one batch.
      const base = first.url.replace(/\/[^/]+\/[^/]+\/pg-\d+\/?$/, "");
      for (let start = 1; start <= total; start += batch) {
        if (urls[start - 1]) continue;
        const { $: $b } = await this.page(`${base}${template.replace("{page}", String(start))}`);
        const more = (await this.readerList($b)).list;
        more.forEach((u, i) => {
          if (u && !urls[i]) urls[i] = u;
        });
      }
    }
    const pages: Page[] = [];
    urls.slice(0, total || urls.length).forEach((imageUrl) => {
      if (!imageUrl) return;
      const page: Page = { index: pages.length, imageUrl };
      if (imageUrl.includes("cspiclink")) {
        const order = orderFor(imageUrl, script);
        if (order) page.process = { context: { order, cols: String(script.cols) } };
      }
      pages.push(page);
    });
    if (pages.length === 0) throw new Error("Mangago: this chapter has no pages to show");
    return pages;
  }

  /** A scrambled image: source tile i belongs at tile `order[i]` (the site's `a`-separated list). */
  async layoutPageImage(req: PageImageLayoutRequest): Promise<PageImageLayout | null> {
    const cols = Number(req.context?.["cols"]);
    const parts = (req.context?.["order"] ?? "").split("a");
    if (!Number.isInteger(cols) || cols < 1 || cols > 16 || parts.length < cols * cols) return null;
    const order = new Array<number>(cols * cols);
    for (let i = 0; i < cols * cols; i++) {
      const dst = Number(parts[i] || "0");
      if (!Number.isInteger(dst) || dst < 0 || dst >= cols * cols) return null;
      order[dst] = i;
    }
    try {
      return tileLayout(req.width, req.height, cols, cols, order);
    } catch {
      return null;
    }
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const m = /^https?:\/\/(?:www\.)?mangago\.me\/read-manga\/([\w-]+)\/(.*)$/.exec(url.replace(/[?#].*$/, ""));
    if (!m) return null;
    return m[2] ? { seriesId: m[1]!, chapterId: m[2] } : { seriesId: m[1]! };
  }
}

export default defineBridge((host) => new MangagoBridge(host));
