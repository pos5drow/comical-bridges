/**
 * MangaBox — the shared backend behind Mangakakalot, Manganato and Mangabat (Keiyoushi's
 * `lib-multisrc/mangabox`). The three are one catalogue on one CDN (`*.2xstorage.com`) behind
 * different domains and skins, so a site is just its name, id and domains.
 *
 * Endpoints (all on the site's current domain):
 *  - lists:    `/manga-list/{hot|latest|new}-manga?page=N`                       (HTML)
 *  - search:   `/search/story/{normalised_query}?page=N`                          (HTML)
 *  - browse:   `/genre/{genre}?filter={sort×status id}&page=N`                    (HTML)
 *  - details:  `/manga/{slug}`                                                    (HTML)
 *  - chapters: `/api/manga/{slug}/chapters?limit=-1`                              (JSON)
 *  - pages:    `/manga/{slug}/{chapterSlug}` → inline `cdns` + `chapterImages`     (HTML + script)
 *
 * Ids are slugs (`martial-peak`, `chapter-3862`), never URLs, so they survive the domain moves this
 * family is prone to. Images need a Referer from one of the site's domains.
 *
 * Search sits behind Cloudflare bot scoring and is sometimes challenged where browsing isn't; that
 * surfaces as a back-off (rate-limited) error rather than an empty result.
 */
import {
  BridgeBase,
  type BridgeFactory,
  type BridgeInfo,
  type Chapter,
  type Credit,
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
  type TagGroup,
  type CheerioRoot,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
} from "@comical/sdk";
import { type Guard, parseAbsoluteDate, parseStatus, pickMirror, siteHost, standardGuards } from "comical-bridge-kit";
import { hintsForType } from "../cover-hints";
import { guardResponse } from "../core/guarded";

/** What distinguishes one MangaBox site from another. */
export interface MangaBoxSite {
  id: string;
  name: string;
  version: string;
  /** The site's domains as `https://www.host` origins; the first is the default. */
  mirrors: readonly string[];
  /** Other domains the site links or redirects to (an old name that still serves chapters). */
  otherHosts?: readonly string[];
  iconUrl?: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
/** Every MangaBox site serves covers and pages from this CDN family. */
const CDN_HOSTS = ["2xstorage.com"];

/** Sort × status → the site's single `filter` id on `/genre/...` browse pages. */
const FILTER_IDS: Record<string, Record<string, string>> = {
  newest: { all: "1", completed: "2", ongoing: "3" },
  latest: { all: "4", completed: "5", ongoing: "6" },
  topview: { all: "7", completed: "8", ongoing: "9" },
};

const SORTS: ReadonlyArray<SortOption> = [
  // The site sorts one way only, so direction means nothing here.
  { key: "topview", label: "Most read", directionless: true },
  { key: "latest", label: "Latest updates", directionless: true },
  { key: "newest", label: "Newest", directionless: true },
];

interface ListDef extends SeriesList {
  path: string;
}

const LISTS: ReadonlyArray<ListDef> = [
  { id: "hot", name: "Hot", layout: "grid", featured: true, path: "manga-list/hot-manga" },
  { id: "latest", name: "Latest updates", layout: "grid", featured: true, path: "manga-list/latest-manga" },
  { id: "new", name: "New", layout: "grid", path: "manga-list/new-manga" },
];

/** Genre slug → label (from Keiyoushi's MangaBox filters; the site's own menu is script-built). */
const GENRES: ReadonlyArray<[string, string]> = [
  ["4-koma", "4-Koma"],
  ["action", "Action"],
  ["adaptation", "Adaptation"],
  ["adult", "Adult"],
  ["adventure", "Adventure"],
  ["age-gap", "Age gap"],
  ["ai-art", "Ai art"],
  ["aliens", "Aliens"],
  ["animals", "Animals"],
  ["anthology", "Anthology"],
  ["artbook", "Artbook"],
  ["avant-garde", "Avant garde"],
  ["award-winning", "Award winning"],
  ["beasts", "Beasts"],
  ["boys-love", "Boys love"],
  ["blackmail", "Blackmail"],
  ["bloody", "Bloody"],
  ["bodyswap", "Bodyswap"],
  ["brocon-siscon", "Brocon/Siscon"],
  ["cars", "Cars"],
  ["cartoon", "Cartoon"],
  ["cheating-infidelity", "Cheating infidelity"],
  ["childhood-friends", "Childhood friends"],
  ["college-life", "College life"],
  ["comedy", "Comedy"],
  ["comic", "Comic"],
  ["contest-winning", "Contest winning"],
  ["cooking", "Cooking"],
  ["creators", "Creators"],
  ["crime", "Crime"],
  ["crossdressing", "Crossdressing"],
  ["cultivation", "Cultivation"],
  ["death-game", "Death game"],
  ["degeneratemc", "Degeneratemc"],
  ["delinquents", "Delinquents"],
  ["dementia", "Dementia"],
  ["demons", "Demons"],
  ["doujinshi", "Doujinshi"],
  ["drama", "Drama"],
  ["ecchi", "Ecchi"],
  ["employee", "Employee"],
  ["erotica", "Erotica"],
  ["fan-colored", "Fan colored"],
  ["fantasy", "Fantasy"],
  ["female-protagonists", "Female protagonists"],
  ["fetish", "Fetish"],
  ["full-color", "Full color"],
  ["game", "Game"],
  ["gender-bender", "Gender bender"],
  ["genderswap", "Genderswap"],
  ["ghosts", "Ghosts"],
  ["girls-love", "Girls love"],
  ["gore", "Gore"],
  ["gourmet", "Gourmet"],
  ["graphic-novel", "Graphic novel"],
  ["gyaru", "Gyaru"],
  ["harem", "Harem"],
  ["heartwarming", "Heartwarming"],
  ["hentai", "Hentai"],
  ["historical", "Historical"],
  ["horror", "Horror"],
  ["imageset", "Imageset"],
  ["incest", "Incest"],
  ["informative", "Informative"],
  ["isekai", "Isekai"],
  ["iyashikei", "Iyashikei"],
  ["josei", "Josei"],
  ["kids", "Kids"],
  ["korean", "Korean"],
  ["liexing", "Liexing"],
  ["loli", "Loli"],
  ["long-strip", "Long strip"],
  ["mafia", "Mafia"],
  ["magic", "Magic"],
  ["magical-girls", "Magical girls"],
  ["mahou-shoujo", "Mahou shoujo"],
  ["male-protagonists", "Male protagonists"],
  ["manga", "Manga"],
  ["mangatoon", "Mangatoon"],
  ["manhua", "Manhua"],
  ["manhwa", "Manhwa"],
  ["martial-arts", "Martial arts"],
  ["master-servant", "Master servant"],
  ["mature", "Mature"],
  ["mecha", "Mecha"],
  ["medical", "Medical"],
  ["military", "Military"],
  ["monsters", "Monsters"],
  ["monster-girls", "Monster girls"],
  ["murim", "Murim"],
  ["music", "Music"],
  ["mystery", "Mystery"],
  ["netorare", "Netorare"],
  ["netori", "Netori"],
  ["ninja", "Ninja"],
  ["non-human", "Non human"],
  ["office", "Office"],
  ["office-workers", "Office workers"],
  ["official-colored", "Official colored"],
  ["old-people", "Old people"],
  ["omegaverse", "Omegaverse"],
  ["one-shot", "One shot"],
  ["others", "Others"],
  ["overpowered", "Overpowered"],
  ["parody", "Parody"],
  ["philosophical", "Philosophical"],
  ["ping-ping-jun", "Ping ping jun"],
  ["police", "Police"],
  ["pornographic", "Pornographic"],
  ["post-apocalyptic", "Post apocalyptic"],
  ["psychological", "Psychological"],
  ["reincarnation", "Reincarnation"],
  ["revenge", "Revenge"],
  ["reverse", "Reverse"],
  ["reverse-harem", "Reverse harem"],
  ["romance", "Romance"],
  ["royal-family", "Royal family"],
  ["royalty", "Royalty"],
  ["samurai", "Samurai"],
  ["school", "School"],
  ["school-life", "School life"],
  ["sci-fi", "Sci fi"],
  ["science-fiction", "Science fiction"],
  ["seinen", "Seinen"],
  ["self-published", "Self published"],
  ["sexual-violence", "Sexual violence"],
  ["shota", "Shota"],
  ["shoujo", "Shoujo"],
  ["shoujo-ai", "Shoujo ai"],
  ["shounen", "Shounen"],
  ["shounen-ai", "Shounen ai"],
  ["showbiz", "Showbiz"],
  ["slice-of-life", "Slice of life"],
  ["smut", "Smut"],
  ["sm-bdsm", "Sm bdsm"],
  ["soft-yaoi", "Soft yaoi"],
  ["space", "Space"],
  ["sports", "Sports"],
  ["spy", "Spy"],
  ["step-family", "Step family"],
  ["super-power", "Super power"],
  ["superhero", "Superhero"],
  ["supernatural", "Supernatural"],
  ["survival", "Survival"],
  ["suspense", "Suspense"],
  ["system", "System"],
  ["teacher-student", "Teacher student"],
  ["thriller", "Thriller"],
  ["time-travel", "Time travel"],
  ["traditional-games", "Traditional games"],
  ["tragedy", "Tragedy"],
  ["vampires", "Vampires"],
  ["video-games", "Video games"],
  ["villainess", "Villainess"],
  ["violence", "Violence"],
  ["virtual-reality", "Virtual reality"],
  ["web-comic", "Web comic"],
  ["webtoons", "Webtoons"],
  ["western", "Western"],
  ["wuxia", "Wuxia"],
  ["xianxia", "Xianxia"],
  ["yaoi", "Yaoi"],
  ["yuri", "Yuri"],
  ["zombies", "Zombies"],];

/** The genres that name a series' format, used for its cover hints. */
const TYPE_GENRES = ["manhwa", "manhua", "manga"];

/** The site's own search-slug rule (its `change_alias` JS): accents folded, punctuation → `_`. */
export function normaliseQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
    .replace(/[èéẹẻẽêềếệểễ]/g, "e")
    .replace(/[ìíịỉĩ]/g, "i")
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
    .replace(/[ùúụủũưừứựửữ]/g, "u")
    .replace(/[ỳýỵỷỹ]/g, "y")
    .replace(/đ/g, "d")
    .replace(/[!@%^*()+=<>?/,.:;'\s"&#[\]~\-$_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** `/manga/{slug}[/{chapter}]` from a site URL or path. */
function slugsFromUrl(href: string | undefined): { series?: string; chapter?: string } {
  const m = href?.match(/\/manga\/([^/?#]+)(?:\/([^/?#]+))?/);
  return m ? { series: m[1]!, ...(m[2] ? { chapter: m[2] } : {}) } : {};
}

interface ChapterDto {
  chapter_name?: string | null;
  chapter_slug?: string | null;
  chapter_num?: number | null;
  updated_at?: string | null;
}

interface ChaptersResponse {
  success?: boolean;
  data?: { chapters?: ChapterDto[] | null } | null;
}

/** A JS array literal of strings out of an inline script (`var cdns = ["https:\/\/…"]`). */
function scriptArray(script: string, name: string): string[] {
  const m = new RegExp(`\\b${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(script);
  if (!m) return [];
  try {
    return (JSON.parse(`[${m[1]}]`) as unknown[]).filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export class MangaBoxBridge extends BridgeBase {
  /** The platform User-Agent when the host gives a browser one (the web check's web view sends it too), else a fixed desktop Chrome one. */
  private get ua(): string {
    const host = this.userAgent;
    return host && host.startsWith("Mozilla/5.0") ? host : UA;
  }

  readonly info: BridgeInfo;
  private readonly knownHosts: string[];

  constructor(
    host: ConstructorParameters<typeof BridgeBase>[0],
    protected readonly site: MangaBoxSite,
  ) {
    super(host);
    const hosts = [...site.mirrors, ...(site.otherHosts ?? [])].map((u) => siteHost(u) ?? u);
    this.knownHosts = [...hosts, ...CDN_HOSTS];
    this.info = {
      id: site.id,
      name: site.name,
      version: site.version,
      contractVersion: "2.1.0",
      languages: ["en"],
      nsfw: false,
      capabilities: ["lists", "search", "filters", "sort", "settings"],
      ...(site.iconUrl ? { iconUrl: site.iconUrl } : {}),
      ratings: true,
      cardSubtitles: true,
      rateLimit: { maxConcurrent: 2, minIntervalMs: 500 },
      assetRateLimit: { maxConcurrent: 3, minIntervalMs: 200 },
      images: {
        hosts: [...CDN_HOSTS, ...hosts],
        headers: { Referer: `${site.mirrors[0]}/` },
      },
      linkHosts: hosts,
    };
  }

  // ── Plumbing ────────────────────────────────────────────────────────────────

  /** The domain to talk to: the user's choice (a listed mirror or a custom origin), else the default. */
  protected get base(): string {
    const custom = this.settings["customDomain"];
    const chosen = typeof custom === "string" && custom.trim() ? custom : this.settings["domain"];
    return pickMirror(this.site.mirrors, typeof chosen === "string" ? chosen : undefined);
  }

  /** The guards for the current domain: a custom one the user typed is home too, not a "move". */
  private guards(): Guard[] {
    const current = siteHost(this.base);
    return standardGuards(current ? [...this.knownHosts, current] : this.knownHosts);
  }

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards(), req);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "User-Agent": this.ua,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: `${this.base}/`,
      ...extra,
    };
  }

  private async page(url: string): Promise<CheerioRoot> {
    return this.parse(await this.fetchText(url, this.headers()));
  }

  getSettings(): SettingDescriptor[] {
    return [
      {
        type: "enum",
        key: "domain",
        label: "Domain",
        description: "Which of the site's domains to use. Switch if one stops loading.",
        options: this.site.mirrors.map((m) => ({ value: m, label: siteHost(m) ?? m })),
        default: this.site.mirrors[0]!,
      },
      {
        type: "string",
        key: "customDomain",
        label: "Custom domain",
        description: "If the site moved somewhere not listed above, its new address (https://…). Overrides Domain.",
      },
    ];
  }

  // ── Listings ────────────────────────────────────────────────────────────────

  /** Cards on list, browse and search pages: the grid layout and the search layout alike. */
  private parseCards($: CheerioRoot, page: number): PagedResults<SeriesEntry> {
    const items: SeriesEntry[] = [];
    const seen = new Set<string>();
    $("div.list-comic-item-wrap, div.list-truyen-item-wrap, .panel_story_list .story_item").each((_, el) => {
      const $el = $(el);
      const link = $el.find("h3 a").first();
      const id = slugsFromUrl(link.attr("href")).series;
      if (!id || seen.has(id)) return;
      seen.add(id);
      const entry: SeriesEntry = { id, title: link.text().trim() || id };
      const img = $el.find("img").first();
      const src = img.attr("data-src") || img.attr("src");
      if (src && /^https?:/.test(src)) entry.thumbnailUrl = src;
      const latest = $el.find("a.list-story-item-wrap-chapter, em.story_chapter a").first().text().trim();
      if (latest) entry.subtitle = latest;
      items.push(entry);
    });
    // Every pager (list, browse, search) links the next page by its number.
    const next = `page=${page + 1}`;
    const hasNext = $(".group_page a[href], .group-page a[href]")
      .toArray()
      .some((a) => ($(a).attr("href") ?? "").includes(next));
    return { items, nextCursor: nextPageCursor(page, hasNext) };
  }

  async getLists(): Promise<SeriesList[]> {
    return LISTS.map(({ path: _p, ...list }) => list);
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const list = LISTS.find((l) => l.id === listId);
    if (!list) throw new Error(`unknown list: ${listId}`);
    const page = pageFromCursor(req.cursor);
    return this.parseCards(await this.page(`${this.base}/${list.path}?page=${page}`), page);
  }

  async getFilters(): Promise<Filter[]> {
    return [
      {
        type: "select",
        key: "genre",
        label: "Genre (ignored with a text search)",
        // No "All" option: an unset filter already means all.
        options: GENRES.map(([value, label]) => ({ value, label })),
      },
      {
        type: "select",
        key: "status",
        label: "Status (ignored with a text search)",
        options: [
          { value: "ongoing", label: "Ongoing" },
          { value: "completed", label: "Completed" },
        ],
      },
    ];
  }

  async getSortOptions(): Promise<SortOption[]> {
    return [...SORTS];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(req.cursor);
    const text = normaliseQuery(req.text ?? "");
    if (text) {
      return this.parseCards(await this.page(`${this.base}/search/story/${encodeURIComponent(text)}?page=${page}`), page);
    }
    // No text: browse a genre, sorted, narrowed by status — the site packs sort × status into one id.
    let genre = "all";
    let status = "all";
    for (const f of req.filters ?? []) {
      if (f.key === "genre" && typeof f.value === "string" && f.value) genre = f.value;
      if (f.key === "status" && typeof f.value === "string" && f.value) status = f.value;
    }
    const sort = req.sort?.key && FILTER_IDS[req.sort.key] ? req.sort.key : "topview";
    const filter = FILTER_IDS[sort]![status] ?? FILTER_IDS[sort]!["all"]!;
    const url = `${this.base}/genre/${encodeURIComponent(genre)}?filter=${filter}&page=${page}`;
    return this.parseCards(await this.page(url), page);
  }

  // ── Details ─────────────────────────────────────────────────────────────────

  /** The series page, or a series-gone error (the site answers an unknown slug with a 404). */
  private async seriesPage(slug: string): Promise<CheerioRoot> {
    const res = await this.request({ url: `${this.base}/manga/${encodeURIComponent(slug)}`, headers: this.headers() });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`${this.site.name} answered HTTP ${res.status} for ${res.url}`);
    return this.parse(res.body);
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const $ = await this.seriesPage(seriesId);
    const top = $("div.manga-info-top").first();
    if (!top.length) {
      // The family answers a dead domain with a "REDIRECT :" stub instead of a page.
      if ($("body").text().trim().startsWith("REDIRECT :")) throw new Error(`${this.site.name} has moved — pick another domain in settings`);
      throw new Error(`${this.site.name}: no series details on the page for ${seriesId}`);
    }

    const info: SeriesInfo = {
      id: seriesId,
      title: top.find("h1").first().text().trim() || seriesId,
      shareUrl: `${this.base}/manga/${seriesId}`,
    };
    const cover = $("div.manga-info-pic img").first().attr("src");
    if (cover && /^https?:/.test(cover)) info.thumbnailUrl = cover;

    // Rows are `<li>Label : value</li>`; the author row also links each name on some skins.
    const rows = top.find("ul.manga-info-text > li");
    const row = (label: string) =>
      rows.filter((_, li) => new RegExp(`^\\s*${label}\\b`, "i").test($(li).text())).first();

    const authorRow = row("Author");
    const linked = authorRow.find("a").toArray().map((a) => $(a).text().trim()).filter(Boolean);
    const names = linked.length
      ? linked
      : authorRow.text().replace(/^[^:]*:/, "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (names.length) {
      const authors: Credit[] = names.map((name) => ({ name }));
      info.authors = authors;
      info.author = names.join(", ");
    }

    const status = parseStatus(row("Status").text().replace(/^[^:]*:/, ""));
    if (status !== "unknown") info.status = status;

    const genres = top.find("li.genres a").toArray().map((a) => $(a).text().trim()).filter(Boolean);
    if (genres.length) {
      const tagGroups: TagGroup[] = [{ label: "Genres", kind: "genre", tags: genres }];
      info.tagGroups = tagGroups;
      const type = genres.map((g) => g.toLowerCase()).find((g) => TYPE_GENRES.includes(g));
      if (type) {
        info.type = type[0]!.toUpperCase() + type.slice(1);
        Object.assign(info, hintsForType(type));
      }
    }

    const alt = top.find("h2.story-alternative").first().text().replace(/^[^:]*:/, "").trim();
    if (alt) info.altTitles = alt.split(/\s*[;,]\s*/).filter(Boolean);

    // The summary box opens with an "<title> summary:" heading; the text is the box's own text.
    const box = $("#contentBox").first().clone();
    box.find("h2, p, script, style").remove();
    const description = box.text().replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    if (description) info.description = description;

    // "manganato.gg rate : 4.30 / 5 - 37 votes"
    const rate = /rate\s*:\s*([\d.]+)\s*\/\s*(\d+)\s*-\s*([\d,]+)\s*votes?/i.exec($("#rate_row_cmd").text());
    if (rate) {
      const score = Number(rate[1]) / Number(rate[2]);
      const votes = Number(rate[3]!.replace(/,/g, ""));
      if (Number.isFinite(score) && score >= 0 && score <= 1) {
        info.rating = Number.isFinite(votes) ? { score, votes } : { score };
      }
    }

    return info;
  }

  // ── Chapters ────────────────────────────────────────────────────────────────

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const url = `${this.base}/api/manga/${encodeURIComponent(seriesId)}/chapters?limit=-1`;
    const res = await this.request({
      url,
      headers: this.headers({ Accept: "application/json", Referer: `${this.base}/manga/${seriesId}`, "X-Requested-With": "XMLHttpRequest" }),
    });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    let body: ChaptersResponse;
    try {
      body = JSON.parse(res.body) as ChaptersResponse;
    } catch {
      throw new Error(`${this.site.name}: the chapter list wasn't JSON (HTTP ${res.status})`);
    }
    const dtos = body.data?.chapters ?? [];
    // An unknown slug answers success with no chapters; ask its page whether the series exists.
    if (dtos.length === 0) await this.seriesPage(seriesId);
    const chapters: Chapter[] = [];
    for (const c of dtos) {
      if (!c.chapter_slug) continue;
      const ch: Chapter = { id: c.chapter_slug, name: c.chapter_name?.trim() || c.chapter_slug };
      if (typeof c.chapter_num === "number" && Number.isFinite(c.chapter_num)) ch.number = c.chapter_num;
      const at = c.updated_at ? parseAbsoluteDate(c.updated_at) : undefined;
      if (at !== undefined) ch.publishedAt = at;
      chapters.push(ch);
    }
    return chapters;
  }

  // ── Pages ───────────────────────────────────────────────────────────────────

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    const url = `${this.base}/manga/${encodeURIComponent(seriesId)}/${encodeURIComponent(chapterId)}`;
    const res = await this.request({ url, headers: this.headers() });
    if (res.status === 404) throw new Error(seriesGoneMessage("chapter removed from the source"));
    const $ = this.parse(res.body);
    const script = $("script")
      .toArray()
      .map((s) => $(s).html() ?? "")
      .find((s) => /\bchapterImages\s*=/.test(s));
    let urls: string[] = [];
    if (script) {
      const cdn = [...scriptArray(script, "cdns"), ...scriptArray(script, "backupImage")][0]?.replace(/\/+$/, "");
      const paths = scriptArray(script, "chapterImages");
      if (cdn) urls = paths.map((p) => `${cdn}/${p.replace(/^\/+/, "")}`);
    }
    if (urls.length === 0) {
      urls = $("div.container-chapter-reader > img")
        .toArray()
        .map((img) => $(img).attr("src") ?? "")
        .filter((src) => /^https?:/.test(src));
    }
    return urls.map((imageUrl, index) => ({ index, imageUrl }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const { series, chapter } = slugsFromUrl(url);
    if (!series) return null;
    return chapter ? { seriesId: series, chapterId: chapter } : { seriesId: series };
  }
}

/** A bridge factory for one MangaBox site. */
export function mangaBox(site: MangaBoxSite): BridgeFactory {
  return defineBridge((host) => new MangaBoxBridge(host, site));
}
