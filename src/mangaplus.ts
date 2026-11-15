/**
 * MANGA Plus bridge — https://mangaplus.shueisha.co.jp, Shueisha's official reader, through the web
 * app's protobuf API (`jumpg-webapi.tokyo-cdn.com/api`, binary only, read with `core/protobuf`):
 *  - lists: `title_list/rankingV2?type={hottest|trending|completed}`, and latest updates from
 *    `web/web_homeV4`
 *  - search: the full catalogue (`title_list/allV2`) filtered by title or author; with a status or
 *    genre filter, `title_list/all_v3?type=…` (which carries genres) instead
 *  - details + chapters: `title_detailV3`; pages: `manga_viewer_v3`
 *
 * One bridge for every language the site publishes in, picked in settings; titles in other
 * languages are left out. Series ids are title ids, chapter ids chapter ids. Only the chapters the
 * site currently lets anyone read are listed (the first few and the latest few, typically).
 *
 * Page images need the chapter's view token as a `Plus-Vw-Token` header and are XOR'd with a key
 * per page. The token rides in the image URL's fragment (`#vw=…`) and `interceptImageRequest`
 * moves it into the header; the key rides in `Page.process.context` and `decodePageImage` hands
 * the host an `xor` transform. Covers need neither and load directly.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type Filter,
  type HttpResponse,
  type ImageRequest,
  type LinkTarget,
  type ListRequest,
  type Page,
  type PageByteTransform,
  type PageImageDecodeRequest,
  type PagedResults,
  type SearchRequest,
  type SeriesEntry,
  type SeriesInfo,
  type SeriesList,
  type SettingDescriptor,
  base64ToBytes,
  defineBridge,
  seriesGoneMessage,
} from "@comical/sdk";
import { standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";
import { ProtoMessage } from "./core/protobuf";

const SITE = "https://mangaplus.shueisha.co.jp";
const API = "https://jumpg-webapi.tokyo-cdn.com/api";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Setting value → [label, the API's language name, its language number]. */
const LANGUAGES: Record<string, [string, string, number]> = {
  en: ["English", "eng", 0],
  es: ["Español", "esp", 1],
  fr: ["Français", "fra", 2],
  id: ["Bahasa Indonesia", "ind", 3],
  "pt-BR": ["Português (Brasil)", "ptb", 4],
  ru: ["Русский", "rus", 5],
  th: ["ไทย", "tha", 6],
  de: ["Deutsch", "deu", 7],
  vi: ["Tiếng Việt", "vie", 9],
};

const RANKINGS: ReadonlyArray<[string, string]> = [
  ["hottest", "Hottest"],
  ["trending", "Trending"],
  ["completed", "Completed"],
];

/** `all_v3` types; the first is the default view when only a genre is picked. */
const TYPES: ReadonlyArray<[string, string]> = [
  ["serializing", "Serializing"],
  ["completed", "Completed"],
  ["one-shot", "One-shot"],
];

const GENRES: ReadonlyArray<[string, string]> = [
  ["battle-action", "Battle / Action"], ["comedy", "Comedy"], ["sport", "Sport / Club Activities"],
  ["mystery-thriller", "Mystery / Thriller"], ["romance", "Romance"], ["horror-supernatural", "Horror / Supernatural"],
  ["spin-off", "Spin-off"], ["sci-fi-fantasy", "Sci-Fi / Fantasy"], ["romantic-comedy", "Romantic Comedy"],
  ["drama", "Drama"], ["food", "Food"], ["history-period", "History / Period"], ["gangsta", "Gangsta"],
  ["one-shot", "One-shot"], ["manga-award", "Manga Award"],
];

const HEX = /^(?:[0-9a-f]{2})+$/i;

/**
 * The host pages are served from, the only one intercepted so covers stay direct. A page anywhere
 * else would load without its token and fail, so `getChapterPages` refuses it with a clear error
 * (which the nightly audit's page check catches) rather than handing out pages that can't load.
 */
const PAGE_HOST = "jumpg-assets3.tokyo-cdn.com";

/** Hex → base64, for an XOR key (the transform takes its key as base64). */
function hexToBase64(hex: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    out += chars[a >> 2]! + chars[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? "=" : chars[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? "=" : chars[c & 63]!;
  }
  return out;
}

/** A title as the API sends it (`Title`): 1 id, 2 name, 3 author, 4 portrait, 7 language. */
interface TitleRow {
  id: number;
  name: string;
  author?: string;
  cover?: string;
  language: number;
}

const titleRow = (m: ProtoMessage): TitleRow => {
  const t: TitleRow = { id: m.int(1), name: m.str(2) ?? "", language: m.int(7) };
  const author = m.str(3);
  if (author) t.author = author;
  const cover = m.str(4);
  if (cover) t.cover = cover;
  return t;
};

class MangaPlusBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.mangaplus",
    name: "MANGA Plus",
    version: "0.1.2",
    contractVersion: "2.1.0",
    languages: ["en", "es", "fr", "id", "pt-BR", "ru", "th", "de", "vi"],
    nsfw: false,
    capabilities: ["lists", "search", "filters", "settings"],
    iconUrl: `${SITE}/favicon.ico`,
    rateLimit: { maxConcurrent: 1, minIntervalMs: 1000 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    // Covers (`jumpg-assets`) load directly; pages (`jumpg-assets3`) go through the interceptor for
    // their token. See PAGE_HOST.
    images: { hosts: ["tokyo-cdn.com"], intercept: [PAGE_HOST], process: { bytes: true } },
    linkHosts: ["mangaplus.shueisha.co.jp"],
    coverForm: "volume",
    readingDirection: "rtl",
  };

  private readonly guards = standardGuards(["shueisha.co.jp", "tokyo-cdn.com"]);
  /** The web app sends a random per-session token; any value works. */
  private readonly session = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

  getSettings(): SettingDescriptor[] {
    return [
      {
        type: "enum",
        key: "language",
        label: "Language",
        options: Object.entries(LANGUAGES).map(([value, [label]]) => ({ value, label })),
        default: "en",
      },
      {
        type: "enum",
        key: "quality",
        label: "Image quality",
        options: [
          { value: "super_high", label: "Super high" },
          { value: "high", label: "High" },
          { value: "low", label: "Low" },
        ],
        default: "super_high",
      },
      { type: "boolean", key: "split", label: "Split double pages", default: true },
    ];
  }

  private get lang(): [string, number] {
    const v = this.settings["language"];
    const l = (typeof v === "string" && LANGUAGES[v]) || LANGUAGES["en"]!;
    return [l[1], l[2]];
  }

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  /** One API call: the response's `success` message, or the site's own error text. */
  private async api(path: string, gone?: string): Promise<ProtoMessage> {
    const res = await this.request({
      url: `${API}${path}`,
      headers: { "User-Agent": UA, "SESSION-TOKEN": this.session, Origin: SITE, Referer: `${SITE}/` },
      responseType: "base64",
    });
    if (res.status >= 400) throw new Error(`MANGA Plus answered HTTP ${res.status} for ${path.split("?")[0]}`);
    const body = new ProtoMessage(base64ToBytes(res.body));
    const success = body.msg(1);
    if (success) return success;
    const error = body.msg(2);
    const popup = (this.lang[1] === 1 && error?.msg(3)) || error?.msg(2);
    if (popup?.str(1) === "Not Found" && gone !== undefined) throw new Error(seriesGoneMessage(gone || undefined));
    throw new Error(`MANGA Plus: ${popup?.str(2) || popup?.str(1) || "the site sent an error"}`);
  }

  /** Titles in the chosen language, once each, as entries. */
  private entries(titles: TitleRow[]): SeriesEntry[] {
    const [, code] = this.lang;
    const seen = new Set<number>();
    const out: SeriesEntry[] = [];
    for (const t of titles) {
      if (!t.id || t.language !== code || seen.has(t.id)) continue;
      seen.add(t.id);
      const e: SeriesEntry = { id: String(t.id), title: t.name };
      if (t.cover) e.thumbnailUrl = t.cover;
      if (t.author) e.subtitle = t.author.replace(/ \/ /g, ", ");
      out.push(e);
    }
    return out;
  }

  // ── Lists & search ──────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return [
      { id: "latest", name: "Updates", layout: "grid", featured: true },
      ...RANKINGS.map(([id, name], i) => ({ id, name, layout: "grid" as const, featured: i === 0 })),
    ];
  }

  async getListItems(listId: string, _req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    const [name] = this.lang;
    if (listId === "latest") {
      const home = (await this.api(`/web/web_homeV4?lang=${name}&clang=${name}`)).msg(38);
      const updated = [...(home?.msgs(2).flatMap((g) => g.msgs(2)) ?? []), ...(home?.msg(7)?.msgs(2) ?? [])];
      updated.sort((a, b) => b.int(6) - a.int(6));
      const titles = updated.flatMap((u) => u.msgs(3)).map((l) => l.msg(1)).filter((t): t is ProtoMessage => !!t).map(titleRow);
      return { items: this.entries(titles) };
    }
    if (!RANKINGS.some(([id]) => id === listId)) throw new Error(`unknown list: ${listId}`);
    const ranking = (await this.api(`/title_list/rankingV2?lang=${name}&type=${listId}&clang=${name}`)).msg(37);
    return { items: this.entries((ranking?.msgs(3) ?? []).flatMap((r) => r.msgs(2)).map(titleRow)) };
  }

  async getFilters(): Promise<Filter[]> {
    return [
      { type: "select", key: "type", label: "Status", options: TYPES.map(([value, label]) => ({ value, label })) },
      { type: "select", key: "genre", label: "Genre", options: GENRES.map(([value, label]) => ({ value, label })) },
    ];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const pick = (key: string) => {
      const v = req.filters?.find((f) => f.key === key)?.value;
      return typeof v === "string" && v ? v : undefined;
    };
    const type = pick("type");
    const genre = pick("genre");
    const [name] = this.lang;
    let titles: TitleRow[];
    if (!type && !genre) {
      // allV2 is every title in every language; all_v3 only one type at a time.
      const all = (await this.api("/title_list/allV2")).msg(25);
      titles = (all?.msgs(1) ?? []).flatMap((g) => g.msgs(2)).map(titleRow);
    } else {
      const v3 = (await this.api(`/title_list/all_v3?type=${type ?? TYPES[0]![0]}&lang=${name}&clang=${name}`)).msg(35);
      titles = (v3?.msgs(3) ?? [])
        .filter((e) => !genre || e.msgs(3).some((g) => g.str(2) === genre))
        .map((e) => e.msg(2))
        .filter((t): t is ProtoMessage => !!t)
        .map(titleRow);
    }
    const q = req.text.trim().toLowerCase();
    const hits = q ? titles.filter((t) => t.name.toLowerCase().includes(q) || (t.author ?? "").toLowerCase().includes(q)) : titles;
    return { items: this.entries(hits) };
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  private async detail(seriesId: string): Promise<ProtoMessage> {
    if (!/^\d+$/.test(seriesId)) throw new Error(seriesGoneMessage());
    const [name, code] = this.lang;
    const view = (await this.api(`/title_detailV3?title_id=${seriesId}&clang=${name}`, "")).msg(8);
    const title = view?.msg(1);
    if (!view || !title) throw new Error(seriesGoneMessage());
    if (title.int(7) !== code) throw new Error("MANGA Plus: this title isn't published in the language picked in settings");
    return view;
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const view = await this.detail(seriesId);
    const t = titleRow(view.msg(1)!);
    const info: SeriesInfo = { id: seriesId, title: t.name, shareUrl: `${SITE}/titles/${seriesId}` };
    if (t.cover) info.thumbnailUrl = t.cover;
    if (t.author) {
      const names = t.author.split(/\s*\/\s*/).filter(Boolean);
      info.authors = names.map((n) => ({ name: n }));
      info.author = names.join(", ");
    }
    const overview = view.str(3)?.trim();
    const period = view.str(7)?.trim();
    const description = [overview, period].filter(Boolean).join("\n\n");
    if (description) info.description = description;
    const genres = view.msgs(31).map((g) => ({ name: g.str(1)?.trim() ?? "", slug: g.str(2) ?? "" }));
    const tags = genres.map((g) => g.name).filter(Boolean);
    if (tags.length) info.tagGroups = [{ label: "Genres", kind: "genre", tags }];
    const notice = view.str(8) ?? "";
    if (genres.some((g) => g.slug === "one-shot") || /completado|completed?|completo/i.test(notice) || /latest 0 chapters/i.test(period ?? "")) {
      info.status = "completed";
    } else if (/on a hiatus/i.test(notice)) info.status = "hiatus";
    else info.status = "ongoing";
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const view = await this.detail(seriesId);
    const rows = view.msgs(28).flatMap((g) => [...g.msgs(2), ...g.msgs(4)]);
    const out: Chapter[] = [];
    const seen = new Set<number>();
    for (const c of rows) {
      // A chapter no one can read anymore comes without its subtitle.
      const subtitle = c.str(4);
      const id = c.int(2);
      if (subtitle === undefined || !id || seen.has(id)) continue;
      seen.add(id);
      const label = c.str(3) ?? "";
      const ch: Chapter = { id: String(id), name: subtitle.trim() || label };
      const n = Number(label.replace(/^#/, ""));
      if (label.startsWith("#") && Number.isFinite(n)) ch.number = n;
      const start = c.int(6);
      if (start) ch.publishedAt = start * 1000;
      out.push(ch);
    }
    return out.reverse();
  }

  private viewerPath(chapterId: string): string {
    const [name] = this.lang;
    const quality = ["super_high", "high", "low"].includes(this.settings["quality"] as string) ? (this.settings["quality"] as string) : "super_high";
    const split = this.settings["split"] === false ? "no" : "yes";
    return `/manga_viewer_v3?chapter_id=${chapterId}&split=${split}&img_quality=${quality}&clang=${name}`;
  }

  override async getChapterPages(_seriesId: string, chapterId: string): Promise<Page[]> {
    if (!/^\d+$/.test(chapterId)) throw new Error(seriesGoneMessage("chapter removed from the source"));
    const viewer = (await this.api(this.viewerPath(chapterId), "chapter no longer readable on MANGA Plus")).msg(10);
    const token = viewer?.str(19) ?? "";
    const pages: Page[] = [];
    for (const p of viewer?.msgs(1) ?? []) {
      // Other entries are banners and the last-page card.
      const mp = p.msg(1);
      const url = mp?.str(1);
      if (!url) continue;
      if (!/^https:\/\/([^/]+)/.exec(url)?.[1]?.endsWith(PAGE_HOST)) {
        throw new Error(`MANGA Plus now serves pages from ${/^https?:\/\/([^/?#]+)/.exec(url)?.[1] ?? "an unknown host"}; this bridge needs an update`);
      }
      const page: Page = { index: pages.length, imageUrl: token ? `${url}#vw=${token}` : url };
      const key = mp!.str(5);
      if (key && HEX.test(key)) page.process = { context: { xor: key } };
      pages.push(page);
    }
    return pages;
  }

  /** The view token from the URL's fragment, as the header the CDN wants. */
  async interceptImageRequest(url: string): Promise<ImageRequest> {
    const hash = url.indexOf("#");
    if (hash < 0) return { url };
    const token = /(?:^|&)vw=([^&]+)/.exec(url.slice(hash + 1))?.[1];
    return token ? { url: url.slice(0, hash), headers: { "Plus-Vw-Token": token } } : { url: url.slice(0, hash) };
  }

  async decodePageImage(req: PageImageDecodeRequest): Promise<PageByteTransform[] | null> {
    const key = req.context?.["xor"];
    return key && HEX.test(key) ? [{ kind: "xor", key: hexToBase64(key) }] : null;
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (!/(^|\.)mangaplus\.shueisha\.co\.jp$/.test(u.hostname)) return null;
    const seg = u.pathname.split("/").filter(Boolean);
    if (seg[0] === "titles" && /^\d+$/.test(seg[1] ?? "")) return { seriesId: seg[1]! };
    if (seg.at(-1) === "sns_share" && /^\d+$/.test(u.searchParams.get("title_id") ?? "")) return { seriesId: u.searchParams.get("title_id")! };
    if (seg[0] === "viewer" && /^\d+$/.test(seg[1] ?? "")) {
      const viewer = (await this.api(this.viewerPath(seg[1]!), "chapter no longer readable on MANGA Plus")).msg(10);
      const titleId = viewer?.int(9);
      return titleId ? { seriesId: String(titleId), chapterId: seg[1]! } : null;
    }
    return null;
  }
}

export default defineBridge((host) => new MangaPlusBridge(host));
