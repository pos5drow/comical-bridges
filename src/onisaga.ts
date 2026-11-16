/**
 * OniSaga bridge — https://onisaga.com, manga, manhwa and manhua in several languages (Next.js):
 *  - lists & search: the catalog RPC its own front end uses, `POST /api/rpc/catalog/browse` with
 *    `{json:{limit, q, genres, themes, tags, origin, form, status, demographic, ratings, year,
 *    languages, sort, cursor}}`, answered `{json:{items, nextCursor}}`. The API pages with signed
 *    cursors, so the bridge's cursor is the API's own.
 *  - details & chapters: the title page, `/title/{slug}?chapters=all&order=desc&lang={language}`
 *    (its JSON-LD for the facts, `a[data-unit], details[data-unit]` for the chapters: a chapter is a
 *    link, or a list of versions when several groups have it)
 *  - pages: the reader, `/read/{slug}/{releaseId}`, whose `manifest.pages` sit in the Next.js
 *    flight data (`self.__next_f.push` strings)
 *
 * One bridge for every language the site reads in, picked in settings. Series ids are slugs,
 * chapter ids release ids. This bridge keeps to the site's safe and suggestive ratings: titles rated
 * for adults sit behind an age statement (a "content gate" page), which it reports rather than makes.
 *
 * Covers and pages live on media.onisaga.com, which refuses requests without the site's Cloudflare
 * session, so they go through the host's image route (which carries the session's cookies) with the
 * site's Referer. Cloudflare ties that session to the User-Agent, so every request sends the host's
 * own browser User-Agent when it has one.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type CheerioRoot,
  type ContentRating,
  type Filter,
  type FilterValue,
  type HttpRequest,
  type HttpResponse,
  type LinkTarget,
  type ListRequest,
  type Page,
  type PagedResults,
  type ReadingDirection,
  type SearchRequest,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SettingDescriptor,
  type SortOption,
  type TagGroup,
  defineBridge,
  seriesGoneMessage,
} from "@comical/sdk";
import { standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";
import { absoluteUrl, withQuery } from "./core/urls";

const SITE = "https://onisaga.com";
const MEDIA_HOST = "media.onisaga.com";
const FALLBACK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PAGE_SIZE = 42;
/** Most chapter-list pages followed for one title (each is a full page load). */
const MAX_CHAPTER_PAGES = 30;

/** The languages the site carries translations in (its `lang` codes). */
const LANGUAGES: ReadonlyArray<[string, string]> = [
  ["en", "English"],
  ["es-419", "Español (Latinoamérica)"],
  ["fr", "Français"],
  ["pt-BR", "Português (Brasil)"],
];

/** The site's content ratings this bridge shows, and what they are in Comical's terms. */
const RATINGS: ReadonlyArray<[string, string, ContentRating]> = [
  ["safe", "Safe", "everyone"],
  ["suggestive", "Suggestive", "mature"],
];
const SAFE_RATINGS = RATINGS.map(([value]) => value);

const SORTS: ReadonlyArray<SortOption> = [
  { key: "relevance", label: "Relevance", directionless: true },
  { key: "updated", label: "Latest update", directionless: true },
  { key: "new", label: "Newest", directionless: true },
  { key: "published", label: "First published", directionless: true },
  { key: "title", label: "Title", directionless: true },
];

const LISTS: ReadonlyArray<SeriesList & { sort: string }> = [
  { id: "updated", name: "Latest updates", layout: "grid", featured: true, sort: "updated" },
  { id: "new", name: "Newest", layout: "grid", sort: "new" },
];

const TYPES: ReadonlyArray<[string, string]> = [
  ["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"], ["comic", "Comic"],
  ["other_asian", "Other Asian"], ["oel", "OEL"], ["other", "Other"],
];
const FORMATS: ReadonlyArray<[string, string]> = [
  ["serial", "Serial"], ["oneshot", "Oneshot"], ["anthology", "Anthology"], ["doujinshi", "Doujinshi"], ["artbook", "Artbook"],
];
const STATUSES: ReadonlyArray<[string, string]> = [
  ["releasing", "Ongoing"], ["completed", "Completed"], ["hiatus", "Hiatus"], ["cancelled", "Cancelled"],
  ["announced", "Announced"], ["unknown", "Unknown"],
];
const DEMOGRAPHICS: ReadonlyArray<[string, string]> = [
  ["shounen", "Shounen"], ["shoujo", "Shoujo"], ["seinen", "Seinen"], ["josei", "Josei"], ["kodomo", "Kodomo"],
];
const GENRES: ReadonlyArray<[string, string]> = [
  ["action", "Action"], ["adventure", "Adventure"], ["boys-love", "Boys' Love"], ["comedy", "Comedy"],
  ["cooking", "Cooking"], ["crime", "Crime"], ["drama", "Drama"], ["fantasy", "Fantasy"],
  ["gender-bender", "Gender Bender"], ["girls-love", "Girls' Love"], ["harem", "Harem"], ["historical", "Historical"],
  ["horror", "Horror"], ["isekai", "Isekai"], ["magical-girls", "Magical Girls"], ["martial-arts", "Martial Arts"],
  ["mecha", "Mecha"], ["medical", "Medical"], ["music", "Music"], ["mystery", "Mystery"],
  ["philosophical", "Philosophical"], ["psychological", "Psychological"], ["romance", "Romance"],
  ["science-fiction", "Science Fiction"], ["slice-of-life", "Slice of Life"], ["sports", "Sports"],
  ["superhero", "Superhero"], ["supernatural", "Supernatural"], ["thriller", "Thriller"], ["tragedy", "Tragedy"],
  ["wuxia", "Wuxia"],
];

const STATUS_TEXT: Record<string, SeriesInfo["status"]> = {
  publishing: "ongoing",
  "publication finished": "completed",
  "publication on hiatus": "hiatus",
  "publication cancelled": "cancelled",
};

// Labels are a number or "Chapter N", and titles often only repeat them ("Vol 1 - Chap 1").
const CHAPTER_NUMBER = /^(?:ch(?:ap(?:ter)?)?\.?\s*)?(\d+(?:\.\d+)?)$/i;
const GENERIC_TITLE = /^(?:vol(?:ume)?\.?\s*\d+(?:\.\d+)?\s*[-:,]?\s*)?ch(?:ap(?:ter)?)?\.?\s*\d+(?:\.\d+)?$/i;

interface Terms {
  include: string[];
  exclude: string[];
}

interface BrowseInput {
  limit: number;
  q?: string;
  genres?: Terms;
  themes?: Terms;
  tags?: Terms;
  origin?: string[];
  form?: string[];
  status?: string[];
  demographic?: string[];
  ratings: string[];
  year?: { from?: number; to?: number };
  languages: string[];
  sort?: string;
  cursor?: string;
}

interface WorkDto {
  slug: string;
  title: string;
  coverUrl?: string | null;
  medium?: string | null;
  origin?: string | null;
  layout?: string | null;
  contentRating?: string | null;
  latest?: { label?: string | null } | null;
}

interface BrowseDto {
  items?: WorkDto[];
  nextCursor?: string | null;
}

interface SeriesLd {
  name?: string;
  alternateName?: string[];
  author?: { name?: string }[];
  creator?: { name?: string }[];
  publisher?: { name?: string }[];
  genre?: string[];
  image?: string;
}

interface ReaderManifest {
  pages?: { ord?: number; url?: string }[];
}

/** A cover URL at full size (the site's `w` asks for a smaller one). */
function fullSizeCover(url: string): string {
  const abs = absoluteUrl(url, SITE);
  return abs ? withQuery(abs, { w: null }) : url;
}

/** A slug-shaped path segment, or undefined. */
const slugOf = (s: string | undefined) => (s && /^[\w-]+$/.test(s) ? s : undefined);

/** The site's slug form of a theme or tag name: no accents, lowercase, dashes. */
function toSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A chapter's name and number from its row label ("12", "Chapter 12") and title. */
function chapterName(label: string, title: string | undefined): { name: string; number?: number } {
  const number = CHAPTER_NUMBER.exec(label)?.[1];
  const base = number ? `Chapter ${number}` : label;
  const name = !title || title === label || GENERIC_TITLE.test(title) ? base : `${base}: ${title}`;
  return number ? { name, number: Number(number) } : { name };
}

class OniSagaBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.onisaga",
    name: "OniSaga",
    version: "0.1.0",
    contractVersion: "2.1.0",
    languages: LANGUAGES.map(([code]) => code),
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort", "settings", "content-rating"],
    iconUrl: `${SITE}/apple-icon`,
    // The site's pages are slow to render; Keiyoushi keeps it to two a second.
    rateLimit: { maxConcurrent: 2, minIntervalMs: 500 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    linkHosts: ["onisaga.com"],
    images: { hosts: [MEDIA_HOST], headers: { Referer: `${SITE}/` } },
  };

  private readonly guards = standardGuards(["onisaga.com", MEDIA_HOST]);

  getSettings(): SettingDescriptor[] {
    return [
      {
        type: "enum",
        key: "language",
        label: "Language",
        description: "Which translations to browse and read.",
        options: LANGUAGES.map(([value, label]) => ({ value, label })),
        default: "en",
      },
    ];
  }

  private get lang(): string {
    const v = this.settings["language"];
    return typeof v === "string" && LANGUAGES.some(([code]) => code === v) ? v : "en";
  }

  /** Cloudflare's clearance is tied to the User-Agent: the host's when it is a browser's. */
  private get ua(): string {
    const h = this.userAgent;
    return h && h.startsWith("Mozilla/5.0") ? h : FALLBACK_UA;
  }

  protected override async request(req: HttpRequest): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  private async page(url: string): Promise<{ $: CheerioRoot; body: string; url: string }> {
    const res = await this.request({ url, headers: { "User-Agent": this.ua, Accept: "text/html,application/xhtml+xml", Referer: `${SITE}/` } });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`OniSaga answered HTTP ${res.status} for ${new URL(url).pathname}`);
    const $ = this.parse(res.body);
    gateCheck($);
    return { $, body: res.body, url: res.url || url };
  }

  // ── Lists & search ──────────────────────────────────────────────────────────

  private async browse(input: BrowseInput, cursor: string | undefined): Promise<PagedResults<SeriesEntry>> {
    if (cursor) input.cursor = cursor;
    const res = await this.request({
      url: `${SITE}/api/rpc/catalog/browse`,
      method: "POST",
      headers: {
        "User-Agent": this.ua,
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: SITE,
        Referer: `${SITE}/browse`,
      },
      body: JSON.stringify({ json: input }),
    });
    if (res.status >= 400) throw new Error(`OniSaga's catalog answered HTTP ${res.status}`);
    let data: BrowseDto | undefined;
    try {
      data = (JSON.parse(res.body) as { json?: BrowseDto }).json;
    } catch {
      throw new Error("OniSaga's catalog sent something that isn't JSON");
    }
    if (!data || !Array.isArray(data.items)) throw new Error("OniSaga changed its catalog API (no items); this bridge needs an update");
    const items = data.items.map((w) => this.entry(w)).filter((e): e is SeriesEntry => e !== undefined);
    const next = data.nextCursor;
    return { items, nextCursor: typeof next === "string" && next && next.length <= 1024 ? next : undefined };
  }

  private entry(w: WorkDto): SeriesEntry | undefined {
    const id = slugOf(w.slug);
    if (!id || !w.title?.trim() || w.medium === "novel") return undefined;
    const rating = RATINGS.find(([value]) => value === w.contentRating);
    // Belt and braces: the RPC is asked for safe ratings only.
    if (w.contentRating && !rating) return undefined;
    const e: SeriesEntry = { id, title: w.title.trim() };
    if (w.coverUrl) {
      e.thumbnailUrl = fullSizeCover(w.coverUrl);
      e.thumbnailAspect = 2 / 3;
    }
    const direction = readingDirection(w.layout, w.origin);
    if (direction) e.readingDirection = direction;
    if (w.latest?.label?.trim()) e.subtitle = w.latest.label.trim();
    e.contentRating = rating?.[2] ?? "everyone";
    return e;
  }

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ sort: _, ...l }) => l);
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    return this.browse({ limit: PAGE_SIZE, ratings: [...SAFE_RATINGS], languages: [this.lang], sort: list.sort }, req.cursor);
  }

  async getFilters(): Promise<Filter[]> {
    const opts = (pairs: ReadonlyArray<readonly [string, string, ...unknown[]]>) => pairs.map(([value, label]) => ({ value, label }));
    return [
      { type: "multiselect", key: "type", label: "Type", options: opts(TYPES) },
      { type: "multiselect", key: "format", label: "Format", options: opts(FORMATS) },
      { type: "multiselect", key: "status", label: "Status", options: opts(STATUSES) },
      { type: "multiselect", key: "demographic", label: "Demographic", options: opts(DEMOGRAPHICS) },
      { type: "multiselect", key: "rating", label: "Content rating", options: opts(RATINGS) },
      { type: "multiselect", key: "genres", label: "Genres", options: opts(GENRES), excludable: true },
      { type: "text", key: "themes", label: "Themes (comma-separated, - before a name to exclude it)" },
      { type: "text", key: "tags", label: "Tags (comma-separated, - before a name to exclude it)" },
      { type: "number", key: "yearFrom", label: "From year", min: 1900 },
      { type: "number", key: "yearTo", label: "To year", min: 1900 },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const input = browseInput(req.filters ?? [], this.lang);
    const q = req.text.trim();
    if (q) input.q = q;
    if (req.sort && SORTS.some((s) => s.key === req.sort!.key)) input.sort = req.sort.key;
    return this.browse(input, req.cursor);
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  private titleUrl(slug: string): string {
    return withQuery(`${SITE}/title/${slug}`, { chapters: "all", order: "desc", lang: this.lang });
  }

  private async titlePage(seriesId: string) {
    if (!slugOf(seriesId)) throw new Error(seriesGoneMessage());
    return this.page(this.titleUrl(seriesId));
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const { $ } = await this.titlePage(seriesId);
    let ld: SeriesLd = {};
    try {
      ld = JSON.parse($('script[type="application/ld+json"]').first().text() || "{}") as SeriesLd;
    } catch {
      // Fall back to the page itself.
    }
    const title = (ld.name ?? $("h1#work-title").first().text()).trim();
    if (!title) throw new Error("OniSaga changed its title pages (no title found); this bridge needs an update");
    const info: SeriesInfo = { id: seriesId, title, shareUrl: `${SITE}/title/${seriesId}` };

    const alt = [...new Set((ld.alternateName ?? []).map((n) => n.trim()).filter((n) => n && n !== title))];
    if (alt.length) info.altTitles = alt;

    const cover = $("section[aria-labelledby=work-title] img[srcset]").first().attr("src") ?? ld.image;
    if (cover) {
      info.thumbnailUrl = fullSizeCover(cover);
      info.thumbnailAspect = 2 / 3;
    }

    const names = (list: { name?: string }[] | undefined) => (list ?? []).map((p) => p.name?.trim() ?? "").filter(Boolean);
    const authors = names(ld.author);
    const artists = names(ld.creator);
    if (authors.length) {
      info.authors = authors.map((name) => ({ name }));
      info.author = authors.join(", ");
    }
    if (artists.length) {
      info.artists = artists.map((name) => ({ name }));
      info.artist = artists.join(", ");
    }

    const synopsis = $("p#synopsis").first().text().trim();
    if (synopsis) info.description = synopsis;

    const fact = (label: string) =>
      $("dt").filter((_, el) => $(el).text().trim() === label).first().next("dd").text().replace(/\s+/g, " ").trim();
    const status = STATUS_TEXT[fact("Status").toLowerCase()];
    if (status) info.status = status;

    const type = $("span[data-medium]:not([aria-hidden])").first().text().trim();
    if (type) info.type = type;

    const hero = $("section[aria-labelledby=work-title]");
    const chips = (param: string) =>
      hero.find(`a[href^="/browse?${param}="]`).map((_, a) => $(a).text().trim()).get().filter(Boolean);
    const groups: TagGroup[] = [];
    const genres = ld.genre?.length ? ld.genre : chips("genre");
    if (genres.length) groups.push({ label: "Genres", kind: "genre", tags: genres });
    const themes = chips("theme");
    if (themes.length) groups.push({ label: "Themes", kind: "theme", tags: themes });
    const tags = chips("tag");
    if (tags.length) groups.push({ label: "Tags", kind: "other", tags });
    const publishers = names(ld.publisher);
    if (publishers.length) groups.push({ label: "Publisher", kind: "other", tags: publishers });
    if (groups.length) info.tagGroups = groups;

    // Pages rated for adults are gated (see gateCheck), so what is left is safe or suggestive.
    const general = hero.find("span").filter((_, el) => $(el).text().trim() === "General audience").length > 0;
    info.contentRating = general ? "everyone" : "mature";
    info.languages = [this.lang];
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    let { $, url } = await this.titlePage(seriesId);
    const chapters: Chapter[] = [];
    const seen = new Set<string>([url]);
    for (let n = 0; n < MAX_CHAPTER_PAGES; n++) {
      // Chapters not readable in this language stay in the list, without a link (and are skipped).
      $("a[data-unit], details[data-unit]").each((_, el) => {
        chapters.push(...chaptersOf($, $(el), this.lang));
      });
      // The next page of a long list: its `rel=next` link, else the first one not read yet.
      const links = $('nav[aria-label="Chapter pages"] a[href*="cc="]');
      const hrefs = [links.filter("[rel~=next]").first(), links]
        .flatMap((l) => l.map((_, a) => $(a).attr("href") ?? "").get())
        .filter(Boolean)
        .map((h) => absoluteUrl(h, SITE) ?? h);
      const next = hrefs.find((h) => !seen.has(h));
      if (!next) break;
      seen.add(next);
      ({ $, url } = await this.page(next));
    }
    return chapters;
  }

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    if (!slugOf(seriesId) || !/^\d+$/.test(chapterId)) throw new Error(seriesGoneMessage("chapter removed from the source"));
    const { body } = await this.page(`${SITE}/read/${seriesId}/${chapterId}`);
    const bootstrap = flightObject(nextFlight(body), "bootstrap") as { kind?: string } | undefined;
    if (bootstrap?.kind && bootstrap.kind !== "images") {
      throw new Error(`This OniSaga chapter is ${bootstrap.kind}, not images; Comical reads image chapters only`);
    }
    const manifest = flightObject(nextFlight(body), "manifest") as ReaderManifest | undefined;
    if (!manifest) throw new Error("OniSaga changed its reader (no page manifest found); this bridge needs an update");
    const pages = (manifest.pages ?? [])
      .filter((p): p is { ord?: number; url: string } => typeof p.url === "string" && p.url.length > 0)
      .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
    if (pages.length === 0) throw new Error(seriesGoneMessage("chapter removed from the source"));
    return pages.map((p, index) => ({ index, imageUrl: absoluteUrl(p.url.replace(/&amp;/g, "&"), SITE) ?? p.url }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.hostname.replace(/^www\./, "") !== "onisaga.com") return null;
    const [kind, slug, release] = u.pathname.split("/").filter(Boolean);
    const id = slugOf(slug);
    if (!id) return null;
    if (kind === "title") return { seriesId: id };
    if (kind === "read") return release && /^\d+$/.test(release) ? { seriesId: id, chapterId: release } : { seriesId: id };
    if (kind === "manga") {
      // Links from the previous site redirect to the title's new slug.
      const res = await this.request({ url: `${SITE}/manga/${id}`, headers: { "User-Agent": this.ua, Accept: "text/html" } });
      if (res.status >= 400) return null;
      const m = /^\/title\/([\w-]+)/.exec(new URL(res.url || url).pathname);
      return m ? { seriesId: m[1]! } : null;
    }
    return null;
  }
}

/** Throws for a title rated for adults, whose page is only an age gate. */
function gateCheck($: CheerioRoot): void {
  const gate = $("main[data-ui=content-gate]").first();
  if (gate.length === 0) return;
  const heading = gate.find("h1").first().text().trim();
  throw new Error(
    `${heading ? `${heading}: ` : ""}OniSaga shows this only to adults, behind an age statement; this bridge keeps to titles rated safe or suggestive`,
  );
}

/** How a work reads, from its layout (and, as the site does, its origin). */
function readingDirection(layout: string | null | undefined, origin: string | null | undefined): ReadingDirection | undefined {
  if (layout === "vertical_strip") return "vertical";
  if (origin === "manga") return "rtl";
  return undefined;
}

/** A chapter row's versions (one, or one per group), as chapters with a link. */
function chaptersOf($: CheerioRoot, node: ReturnType<CheerioRoot>, lang: string): Chapter[] {
  const summary = node.children("summary").first();
  const row = summary.length ? summary : node;
  const labelSpan = row.children("span").filter((_, s) => $(s).children("[data-read-text]").length > 0).first();
  const label = labelSpan.clone().children().remove().end().text().trim();
  if (!label) return [];
  const title = row.children("span[dir=auto]").first().text().trim() || undefined;
  const { name, number } = chapterName(label, title);
  const versions = node.is("details") ? node.find("li").toArray().map((li) => $(li)) : [node];
  const out: Chapter[] = [];
  for (const version of versions) {
    const link = version.is("a") ? version : version.find('a[href^="/read/"]').first();
    const release = /^\/read\/[\w-]+\/(\d+)/.exec(link.attr("href") ?? "")?.[1];
    if (!release) continue;
    const ch: Chapter = { id: release, name, languageCode: lang };
    if (number !== undefined) ch.number = number;
    const at = Date.parse(version.find("time[datetime]").first().attr("datetime") ?? "");
    if (Number.isFinite(at)) ch.publishedAt = at;
    const group = version.find('a[href^="/group/"]').map((_, a) => $(a).text().trim()).get().filter(Boolean).join(", ");
    if (group) ch.group = group;
    const pages = /^(\d+)\s+pages?$/.exec(version.find("[title$=pages], [title$=page]").first().attr("title") ?? "")?.[1];
    if (pages) ch.pageCount = Number(pages);
    out.push(ch);
  }
  return out;
}

/** The catalog RPC input for these filters, in this language, with safe ratings only. */
export function browseInput(filters: readonly FilterValue[], lang: string): BrowseInput {
  const value = (key: string) => filters.find((f) => f.key === key)?.value;
  const picked = (key: string, allowed: ReadonlyArray<readonly [string, ...unknown[]]>) => {
    const v = value(key);
    return Array.isArray(v) ? v.filter((x) => allowed.some(([a]) => a === x)) : [];
  };
  const input: BrowseInput = { limit: PAGE_SIZE, ratings: [...SAFE_RATINGS], languages: [lang] };

  const ratings = picked("rating", RATINGS);
  if (ratings.length) input.ratings = ratings;
  const origin = picked("type", TYPES);
  if (origin.length) input.origin = origin;
  const form = picked("format", FORMATS);
  if (form.length) input.form = form;
  const status = picked("status", STATUSES);
  if (status.length) input.status = status;
  const demographic = picked("demographic", DEMOGRAPHICS);
  if (demographic.length) input.demographic = demographic;

  const g = value("genres");
  const genre = (xs: unknown) => (Array.isArray(xs) ? xs.filter((x) => GENRES.some(([s]) => s === x)) : []);
  const genres: Terms =
    g && typeof g === "object" && !Array.isArray(g) ? { include: genre(g.include), exclude: genre(g.exclude) } : { include: genre(g), exclude: [] };
  if (genres.include.length || genres.exclude.length) input.genres = genres;

  const terms = (key: string): Terms | undefined => {
    const v = value(key);
    if (typeof v !== "string") return undefined;
    const t: Terms = { include: [], exclude: [] };
    for (const raw of v.split(",")) {
      const name = raw.trim();
      const slug = toSlug(name.replace(/^-/, ""));
      if (!slug) continue;
      (name.startsWith("-") ? t.exclude : t.include).push(slug);
    }
    return t.include.length || t.exclude.length ? t : undefined;
  };
  const themes = terms("themes");
  if (themes) input.themes = themes;
  const tags = terms("tags");
  if (tags) input.tags = tags;

  const year = (key: string) => {
    const n = Number(value(key));
    return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : undefined;
  };
  const from = year("yearFrom");
  const to = year("yearTo");
  if (from !== undefined || to !== undefined) input.year = { ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) };
  return input;
}

/** The Next.js flight data of a page: every `self.__next_f.push([1, "…"])` string, joined. */
export function nextFlight(html: string): string {
  let out = "";
  const re = /self\.__next_f\.push\((\[[\s\S]*?\])\)\s*;?\s*<\/script>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      const chunk = JSON.parse(m[1]!) as unknown[];
      if (chunk[0] === 1 && typeof chunk[1] === "string") out += chunk[1];
    } catch {
      // Not a data chunk.
    }
  }
  return out;
}

/** The first JSON object under `"key":` in flight data, or undefined. */
export function flightObject(flight: string, key: string): unknown {
  const marker = `"${key}":{`;
  for (let at = flight.indexOf(marker); at >= 0; at = flight.indexOf(marker, at + 1)) {
    const start = at + marker.length - 1;
    let depth = 0;
    let inString = false;
    for (let i = start; i < flight.length; i++) {
      const c = flight[i];
      if (inString) {
        if (c === "\\") i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try {
          return JSON.parse(flight.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  return undefined;
}

export default defineBridge((host) => new OniSagaBridge(host));
