/**
 * MangaFire bridge — https://mangafire.to, through the JSON API its own front end uses:
 *  - lists & search: `/api/titles?keyword&order[…]&languages[]&types[]&genres_in[]&…&page&limit`
 *  - details: `/api/titles/{hid}`; chapters: `/api/titles/{hid}/chapters?language&sort&order&page&limit`
 *  - pages: `/api/chapters/{id}`
 *
 * Every API request carries a `vrf` token the front end computes from the path and its sorted query
 * (three byte-substitution stages with fixed tables, as Keiyoushi's extension does it); without it
 * the API answers 403 "Missing token". A firewall sometimes answers `403 captcha_required`, a
 * picture captcha for a person to solve; the bridge says so rather than trying to solve it.
 *
 * One bridge for every language the site carries, picked in settings. Series ids are the site's
 * `hid`, chapter ids the API's chapter id. Page images need a mangafire.to Referer; covers don't.
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
  type SettingDescriptor,
  type SortOption,
  base64ToBytes,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
} from "@comical/sdk";
import { parseStatus, standardGuards } from "comical-bridge-kit";
import { bytesToBase64 } from "./core/bytes";
import { guardResponse } from "./core/guarded";
import { hintsForType } from "./cover-hints";

const SITE = "https://mangafire.to";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PER_PAGE = 50;
/** The host page images are served from; the only one that needs the Referer. See getChapterPages. */
const PAGE_HOST = "mfcdn2.xyz";

// ── The front end's request token ─────────────────────────────────────────────

let STAGES: [Uint8Array, Uint8Array, number][] | undefined;

/** The three stages (substitution table, key, initial value), decoded on first use. */
function stages(): [Uint8Array, Uint8Array, number][] {
  return (STAGES ??= [
    [base64ToBytes("yINlmUNho8VYJT+ibTIP+9ESiULpVEtMOoD6U6lRE0R/xwXo/Xp9NrUgC4cw/Lmo33vUyjUE40kUoEWIr/fxfNNcq2s79ShQ5NhNrFnJ4hXPwOu/SuXzIbuTQKGFvfm08E9jvCfqAtoDqvQq3dVWPQFmJjgvkISBeXY3BgANR+yVnjGbcxZ47d6kLNfZPIayTq3/YGySb1KuVZodWp/WGNAO5pfMcpaK53Hhs0allBszaMaxuouOwdxbwgxIw6YunSsXjI05Yi0j9j4eHKfSXR8Ifo/Od+8iamRfCXTyvm7NGRGYdcQ0ywcK/u6RXhrbcCm4t2eCtrDgQVecJGkQ+A=="), base64ToBytes("0Ec58JOY3uBzJK9m3zqIOpdlF7UFiax9DmA="), 0x5a],
    [base64ToBytes("IUFltCxD3Oc2cwCgkJffthaOg9cgPUb0LgW6H/VtfcF0kc5F25t+aWj6JH9VOhOaY0rAFdUxlDnl5BLNvwEJvQtP5qcw7vdb/K+chnbwnspSHT8mz5lqwz41TezG0hkO06FTjJZhsyNuFLDpD2ZZxQj/QIRcF90zpmQ7Byu483WsQqUE0C342HL+JXngRB6fRzxRyVTaKu83h7UYTJ0QMt6ixFh6S3F8gqkKwrGTL3jHNBsD45UnifK8+RGtishQV2K3rujLKEkiZxpr2dYcudFW4oFsDKhad3CLBvuyTqsCo4B7mL5IKQ1vXo/MOOvq1I1d8ar9X6Ttu5KF4fZgiA=="), base64ToBytes("AAdjb1iPY8CiDmq9H34tKTBF8a3oDQ=="), 0x35],
    [base64ToBytes("NQHlu1/wVO5EmkwQymF810qqY2xG1k2obcas4Z9mCsPEIFl9pRIjFxbJ7ybMHbBckT5Ton85E0FOeHezbh/mjlEYpmpnlXOS8dgrqeq2KfxImTh1YK9y0PeMNhzA1OQzSY9brYOJq/l2QnE/hwOeZIhPixVSKIUlDb5vLcH6RWKxkIEMuP0bDwIqQ71AJJaEaMJL7A6YtyIwoRT+L5v4aZzodN/0+3nOGsfblFjgxSfPzVDjNFeNl5P26+kEC/8AHgdrpAbt3hHz3HrRN1Y6e+JHgF7ncFWnoF0y3THL1S71WgWGCa6KtSzTCCG58n68nTyj2T3Sshk7utqCtMi/ZQ=="), base64ToBytes("DELOJgPsVaCcblDtTGMdHzM="), 0xba],
  ]);
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/** The token for an API path with its sorted query (`/titles?languages[0]=en&page=1`). */
export function vrf(signed: string): string {
  let data = utf8(signed);
  for (const [table, key, iv] of stages()) {
    const out = new Uint8Array(data.length);
    let prev = iv;
    for (let i = 0; i < data.length; i++) {
      prev = table[(data[i]! ^ key[i % key.length]! ^ prev) & 0xff]!;
      out[i] = prev;
    }
    data = out;
  }
  return bytesToBase64(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The API URL for `path` and `params`, sorted by key and signed the way the front end does it. */
export function apiUrl(path: string, params: [string, string][] = []): string {
  const sorted = params.map((p, i) => [p, i] as const).sort((a, b) => (a[0][0] < b[0][0] ? -1 : a[0][0] > b[0][0] ? 1 : a[1] - b[1])).map(([p]) => p);
  // `[]` keys are numbered in the signed form: `genres_in[0]=1&genres_in[1]=5`.
  let last = "";
  let index = 0;
  const signed = sorted
    .map(([k, v]) => {
      let key = k;
      if (k.endsWith("[]")) {
        if (last !== k) index = 0;
        last = k;
        key = `${k.slice(0, -2)}[${index++}]`;
      }
      return `${key}=${v}`;
    })
    .join("&");
  const q = new URLSearchParams(sorted.map(([k, v]) => [k, v]));
  q.append("vrf", vrf(path + (sorted.length ? `?${signed}` : "")));
  return `${SITE}/api${path}?${q}`;
}

// ── Data ──────────────────────────────────────────────────────────────────────

/** Setting value → [label, the API's language code]. */
const LANGUAGES: Record<string, [string, string]> = {
  en: ["English", "en"],
  es: ["Español", "es"],
  "es-419": ["Español (Latinoamérica)", "es-la"],
  fr: ["Français", "fr"],
  ja: ["日本語", "ja"],
  pt: ["Português", "pt"],
  "pt-BR": ["Português (Brasil)", "pt-br"],
};

const SORTS: ReadonlyArray<SortOption> = [
  { key: "relevance", label: "Best match" },
  { key: "chapter_updated_at", label: "Latest update" },
  { key: "created_at", label: "Recently added" },
  { key: "title", label: "Title" },
  { key: "year", label: "Year" },
  { key: "score", label: "Highest rated" },
  { key: "views_7d", label: "Most viewed (7 days)" },
  { key: "views_30d", label: "Most viewed (30 days)" },
  { key: "views_total", label: "Most viewed (all time)" },
  { key: "follows_total", label: "Most followed" },
];

const LISTS: ReadonlyArray<SeriesList & { order: string }> = [
  { id: "popular", name: "Most viewed", layout: "grid", featured: true, order: "views_30d" },
  { id: "latest", name: "Latest updates", layout: "grid", featured: true, order: "chapter_updated_at" },
  { id: "new", name: "Recently added", layout: "grid", order: "created_at" },
  { id: "top", name: "Highest rated", layout: "grid", order: "score" },
];

const GENRES: ReadonlyArray<[string, string]> = [
  ["1", "Action"], ["268929", "Adult"], ["78", "Adventure"], ["3", "Avant Garde"], ["4", "Boys Love"], ["5", "Comedy"],
  ["268921", "Crime"], ["77", "Demons"], ["6", "Drama"], ["7", "Ecchi"], ["79", "Fantasy"], ["9", "Girls Love"],
  ["10", "Gourmet"], ["11", "Harem"], ["268930", "Hentai"], ["268922", "Historical"], ["530", "Horror"], ["13", "Isekai"],
  ["531", "Iyashikei"], ["15", "Josei"], ["532", "Kids"], ["539", "Magic"], ["268923", "Magical Girls"],
  ["533", "Mahou Shoujo"], ["534", "Martial Arts"], ["268931", "Mature"], ["19", "Mecha"], ["268924", "Medical"],
  ["535", "Military"], ["21", "Music"], ["22", "Mystery"], ["23", "Parody"], ["268925", "Philosophical"],
  ["536", "Psychological"], ["25", "Reverse Harem"], ["26", "Romance"], ["73", "School"], ["28", "Sci-Fi"],
  ["537", "Seinen"], ["30", "Shoujo"], ["31", "Shounen"], ["538", "Slice of Life"], ["268932", "Smut"], ["33", "Space"],
  ["34", "Sports"], ["75", "Super Power"], ["268926", "Superhero"], ["76", "Supernatural"], ["37", "Suspense"],
  ["38", "Thriller"], ["268927", "Tragedy"], ["39", "Vampire"], ["268928", "Wuxia"],
];

const THEMES: ReadonlyArray<[string, string]> = [
  ["268933", "Aliens"], ["268934", "Animals"], ["268935", "Cooking"], ["268936", "Crossdressing"], ["268937", "Delinquents"],
  ["268938", "Demons"], ["268939", "Genderswap"], ["268940", "Ghosts"], ["268941", "Gyaru"], ["268942", "Harem"],
  ["268945", "Mafia"], ["268946", "Magic"], ["268947", "Martial Arts"], ["268948", "Military"], ["268949", "Monster Girls"],
  ["268950", "Monsters"], ["268951", "Music"], ["268952", "Ninja"], ["268953", "Office Workers"], ["268954", "Police"],
  ["268955", "Post-Apocalyptic"], ["268956", "Reincarnation"], ["268957", "Reverse Harem"], ["268958", "Samurai"],
  ["268959", "School Life"], ["268961", "Supernatural"], ["268962", "Survival"], ["268963", "Time Travel"],
  ["268964", "Traditional Games"], ["268965", "Vampires"], ["268966", "Video Games"], ["268967", "Villainess"],
  ["268968", "Virtual Reality"], ["268969", "Zombies"],
];

const RATINGS: Record<string, ContentRating> = { safe: "everyone", suggestive: "mature", erotica: "adult", pornographic: "adult" };

interface Poster {
  small?: string;
  medium?: string;
  large?: string;
}

interface TitleDto {
  hid: string;
  slug?: string;
  title: string;
  type?: string;
  status?: string;
  contentRating?: string;
  poster?: Poster;
  latestChapter?: number | null;
  synopsisHtml?: string | null;
  altTitles?: string[];
  genres?: { title: string }[];
  themes?: { title: string }[];
  demographics?: { title: string }[];
  authors?: { title: string }[];
  artists?: { title: string }[];
}

interface ChapterDto {
  id: number;
  number: number;
  name?: string | null;
  type?: string | null;
  createdAt?: number | null;
}

interface Paged<T> {
  items: T[];
  meta?: { hasNext?: boolean; lastPage?: number };
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

/** The synopsis HTML as plain text, line breaks kept. */
const plain = (html: string) =>
  decode(html.replace(/<br\s*\/?>\r?\n?/gi, "\n").replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

class MangaFireBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.mangafire",
    name: "MangaFire",
    version: "0.1.0",
    contractVersion: "2.1.0",
    languages: ["en", "es", "es-419", "fr", "ja", "pt", "pt-BR"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "sort", "settings", "content-rating"],
    iconUrl: `${SITE}/favicon.ico`,
    rateLimit: { maxConcurrent: 2, minIntervalMs: 500 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    images: { hosts: [PAGE_HOST], headers: { Referer: `${SITE}/` } },
    linkHosts: ["mangafire.to"],
  };

  private readonly guards = standardGuards(["mangafire.to", PAGE_HOST]);

  getSettings(): SettingDescriptor[] {
    return [
      {
        type: "enum",
        key: "language",
        label: "Language",
        options: Object.entries(LANGUAGES).map(([value, [label]]) => ({ value, label })),
        default: "en",
      },
    ];
  }

  private get lang(): string {
    const v = this.settings["language"];
    return ((typeof v === "string" && LANGUAGES[v]) || LANGUAGES["en"]!)[1];
  }

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards);
  }

  private async api<T>(path: string, params: [string, string][] = []): Promise<T> {
    const res = await this.request({ url: apiUrl(path, params), headers: { "User-Agent": UA, Accept: "application/json", Referer: `${SITE}/` } });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status === 403) {
      let body: { error?: string; message?: string } = {};
      try {
        body = JSON.parse(res.body);
      } catch {
        // not the API's JSON
      }
      if (body.error === "captcha_required") {
        throw new Error("MangaFire wants a captcha solved before more requests: open mangafire.to in a browser, or try again later");
      }
      throw new Error(`MangaFire refused the request (${body.message ?? body.error ?? "HTTP 403"}); this bridge may need an update`);
    }
    if (res.status >= 400) throw new Error(`MangaFire answered HTTP ${res.status} for ${path}`);
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`MangaFire sent something that isn't JSON for ${path}`);
    }
  }

  private entry(t: TitleDto): SeriesEntry {
    const e: SeriesEntry = { id: t.hid, title: t.title.trim(), ...hintsForType(t.type) };
    const cover = t.poster?.large ?? t.poster?.medium ?? t.poster?.small;
    if (cover) e.thumbnailUrl = cover;
    const rating = t.contentRating ? RATINGS[t.contentRating] : undefined;
    if (rating) e.contentRating = rating;
    if (typeof t.latestChapter === "number") e.subtitle = `Ch. ${t.latestChapter}`;
    return e;
  }

  // ── Lists & search ──────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ order: _, ...l }) => l);
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    return this.titles([[`order[${list.order}]`, "desc"]], req.cursor);
  }

  async getFilters(): Promise<Filter[]> {
    const opts = (pairs: ReadonlyArray<[string, string]>) => pairs.map(([value, label]) => ({ value, label }));
    return [
      { type: "multiselect", key: "types", label: "Type", options: opts([["manga", "Manga"], ["manhwa", "Manhwa"], ["manhua", "Manhua"], ["other", "Other"]]) },
      { type: "multiselect", key: "genres", label: "Genres", options: opts(GENRES), excludable: true },
      { type: "multiselect", key: "themes", label: "Themes", options: opts(THEMES) },
      {
        type: "multiselect",
        key: "statuses",
        label: "Status",
        options: opts([["releasing", "Releasing"], ["finished", "Finished"], ["on_hiatus", "On hiatus"], ["discontinued", "Discontinued"], ["not_yet_released", "Not yet released"]]),
      },
      {
        type: "multiselect",
        key: "ratings",
        label: "Content rating",
        options: opts([["safe", "Safe"], ["suggestive", "Suggestive"], ["erotica", "Erotica"], ["pornographic", "Pornographic"]]),
      },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const params: [string, string][] = [];
    const text = req.text.trim();
    if (text) params.push(["keyword", text]);
    const many = (key: string, values: unknown) => {
      if (Array.isArray(values)) for (const v of values) if (typeof v === "string" && v) params.push([key, v]);
    };
    for (const f of req.filters ?? []) {
      if (f.key === "types") many("types[]", f.value);
      else if (f.key === "themes") many("theme_ids[]", f.value);
      else if (f.key === "statuses") many("statuses[]", f.value);
      else if (f.key === "ratings") many("content_rating[]", f.value);
      else if (f.key === "genres" && f.value && typeof f.value === "object") {
        const v = Array.isArray(f.value) ? { include: f.value as string[] } : (f.value as { include?: string[]; exclude?: string[] });
        many("genres_in[]", v.include);
        many("genres_ex[]", v.exclude);
      }
    }
    const sort = req.sort?.key ?? (text ? "relevance" : "views_30d");
    const dir = req.sort ? (req.sort.ascending ? "asc" : "desc") : sort === "title" ? "asc" : "desc";
    params.push([`order[${sort}]`, dir]);
    return this.titles(params, req.cursor);
  }

  private async titles(params: [string, string][], cursor: string | undefined): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(cursor);
    const res = await this.api<Paged<TitleDto>>("/titles", [...params, ["languages[]", this.lang], ["page", String(page)], ["limit", String(PER_PAGE)]]);
    return { items: res.items.map((t) => this.entry(t)), nextCursor: nextPageCursor(page, !!res.meta?.hasNext) };
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  private checkId(id: string): void {
    if (!/^[a-z0-9]+$/i.test(id)) throw new Error(seriesGoneMessage());
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    this.checkId(seriesId);
    const t = (await this.api<{ data: TitleDto }>(`/titles/${seriesId}`)).data;
    const info: SeriesInfo = { ...this.entry(t), id: seriesId, shareUrl: `${SITE}/title/${t.hid}${t.slug ? `-${t.slug}` : ""}` };
    delete info.subtitle;
    if (t.synopsisHtml?.trim()) info.description = plain(t.synopsisHtml);
    const alts = (t.altTitles ?? []).map((a) => a.trim()).filter((a) => a && a !== info.title);
    if (alts.length) info.altTitles = [...new Set(alts)];
    const names = (xs?: { title: string }[]) => (xs ?? []).map((x) => x.title.trim()).filter(Boolean);
    const authors = names(t.authors);
    const artists = names(t.artists);
    if (authors.length) {
      info.authors = authors.map((name) => ({ name }));
      info.author = authors.join(", ");
    }
    if (artists.length) {
      info.artists = artists.map((name) => ({ name }));
      info.artist = artists.join(", ");
    }
    const groups = [
      { label: "Genres", kind: "genre" as const, tags: names(t.genres) },
      { label: "Themes", kind: "theme" as const, tags: names(t.themes) },
      { label: "Demographic", kind: "demographic" as const, tags: names(t.demographics) },
    ].filter((g) => g.tags.length);
    if (groups.length) info.tagGroups = groups;
    const status = parseStatus(
      t.status === "releasing" ? "ongoing" : t.status === "finished" ? "completed" : t.status === "on_hiatus" ? "hiatus" : t.status === "discontinued" ? "cancelled" : t.status,
    );
    if (status !== "unknown") info.status = status;
    if (t.type) info.type = t.type[0]!.toUpperCase() + t.type.slice(1);
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    this.checkId(seriesId);
    const page = (n: number) =>
      this.api<Paged<ChapterDto>>(`/titles/${seriesId}/chapters`, [
        ["language", this.lang],
        ["sort", "number"],
        ["order", "desc"],
        ["page", String(n)],
        ["limit", "200"],
      ]);
    const first = await page(1);
    const items = [...first.items];
    const last = Math.min(first.meta?.lastPage ?? 1, 50);
    for (let n = 2; n <= last; n++) items.push(...(await page(n)).items);
    const seen = new Set<number>();
    return items
      .filter((c) => !seen.has(c.id) && !!seen.add(c.id))
      .map((c) => {
        const n = String(c.number).replace(/\.0$/, "");
        const name = c.name?.trim();
        const ch: Chapter = { id: String(c.id), name: name ? (/\b(?:ch(?:apter)?|ep(?:isode)?)\.?\s*\d/i.test(name) ? name : `Ch. ${n} - ${name}`) : `Ch. ${n}` };
        if (Number.isFinite(c.number)) ch.number = c.number;
        if (c.type) ch.group = c.type[0]!.toUpperCase() + c.type.slice(1);
        if (c.createdAt) ch.publishedAt = c.createdAt * 1000;
        return ch;
      });
  }

  override async getChapterPages(_seriesId: string, chapterId: string): Promise<Page[]> {
    if (!/^\d+$/.test(chapterId)) throw new Error(seriesGoneMessage("chapter removed from the source"));
    const res = await this.api<{ data: { pages?: { url: string }[] } }>(`/chapters/${chapterId}`);
    return (res.data.pages ?? []).map((p, index) => {
      const host = /^https?:\/\/([^/?#]+)/.exec(p.url)?.[1] ?? "";
      // A page anywhere else would load without its Referer and fail; say so, and the audit sees it.
      if (host !== PAGE_HOST && !host.endsWith(`.${PAGE_HOST}`)) {
        throw new Error(`MangaFire now serves pages from ${host || "an unknown host"}; this bridge needs an update`);
      }
      return { index, imageUrl: p.url };
    });
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  /** `/title/{hid}-{slug}` (and anything under it). */
  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const m = /^https?:\/\/(?:www\.)?mangafire\.to\/title\/([a-z0-9]+)(?:[-/?#]|$)/i.exec(url);
    return m ? { seriesId: m[1]! } : null;
  }
}

export default defineBridge((host) => new MangaFireBridge(host));
