/**
 * Cubari bridge — https://cubari.moe, a reader that proxies galleries hosted elsewhere (Imgur, Reddit,
 * Imgchest, Catbox, GitHub gists, MangaDex…) through one API:
 *  - series: `/read/api/{source}/series/{slug}/` — chapters keyed by number, each with groups whose
 *    value is either the page list itself or a link to `/read/api/{source}/chapter/{id}/`
 *
 * There is no catalogue: a series is found by searching for its link (or `source/slug`), or by
 * opening a link. Series ids are `{source}/{slug}`; chapter ids `{chapter}/{group}`.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
  type HttpResponse,
  type LinkTarget,
  type Page,
  type PagedResults,
  type SearchRequest,
  type SeriesEntry,
  type SeriesInfo,
  defineBridge,
  seriesGoneMessage,
} from "@comical/sdk";
import { parseStatus, standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";
import { bridgeIcon } from "./core/icon";

const SITE = "https://cubari.moe";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

type PageSrc = string | { src: string };

interface ChapterDto {
  volume?: string | number | null;
  title?: string | null;
  groups: Record<string, PageSrc[] | string>;
  release_date?: Record<string, number> | null;
}

interface SeriesDto {
  title: string;
  artist?: string | null;
  author?: string | null;
  description?: string | null;
  cover?: string | null;
  coverUrl?: string | null;
  groups?: Record<string, string>;
  chapters: Record<string, ChapterDto>;
}

const NO_VOLUME = new Set(["", "null", "uncategorized"]);
const src = (p: PageSrc) => (typeof p === "string" ? p : p.src);

/** Base64 without padding, of an ASCII string (a gist path), for the `gist` source's slug. */
function base64Ascii(text: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < text.length; i += 3) {
    const [a, b, c] = [text.charCodeAt(i), text.charCodeAt(i + 1), text.charCodeAt(i + 2)];
    out += chars[a >> 2]! + chars[((a & 3) << 4) | ((b || 0) >> 4)]!;
    if (i + 1 < text.length) out += chars[((b & 15) << 2) | ((c || 0) >> 6)]!;
    if (i + 2 < text.length) out += chars[c & 63]!;
  }
  return out;
}

/** The `{source, slug}` a pasted link (or `source/slug`) names, or undefined. */
export function cubariRef(input: string): { source: string; slug: string } | undefined {
  const text = input.trim().replace(/^cubari:/, "");
  const plain = /^([a-z]+)\/([^/\s]+)$/i.exec(text);
  if (plain) return { source: plain[1]!.toLowerCase(), slug: plain[2]! };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  const seg = url.pathname.split("/").filter(Boolean);
  if (host.endsWith("imgur.com") && seg.length >= 2 && (seg[0] === "a" || seg[0] === "gallery")) return { source: "imgur", slug: seg[1]! };
  if (host.endsWith("reddit.com") && seg.length >= 2 && seg[0] === "gallery") return { source: "reddit", slug: seg[1]! };
  if (host === "imgchest.com" && seg.length >= 2 && seg[0] === "p") return { source: "imgchest", slug: seg[1]! };
  if (host.endsWith("catbox.moe") && seg.length >= 2 && seg[0] === "c") return { source: "catbox", slug: seg[1]! };
  if (host.endsWith("cubari.moe") && seg.length >= 3 && seg[0] === "read") return { source: seg[1]!, slug: seg[2]! };
  if (host.endsWith(".githubusercontent.com")) return { source: "gist", slug: base64Ascii(`${host.split(".")[0]}${url.pathname}`) };
  return undefined;
}

class CubariBridge extends BridgeBase {
  /**
   * The platform User-Agent when the host gives a browser one (what its web check's web view sends),
   * else a fixed desktop Chrome one. A challenge answered in a web view with a borrowed User-Agent
   * never clears, so a bridge behind Cloudflare sends the platform's.
   */
  private get ua(): string {
    const host = this.userAgent;
    return host && host.startsWith("Mozilla/5.0") ? host : UA;
  }

  readonly info: BridgeInfo = {
    id: "pos5drow.cubari",
    name: "Cubari",
    version: "0.1.3",
    contractVersion: "2.1.0",
    languages: ["en"],
    nsfw: false,
    capabilities: ["search"],
    iconUrl: bridgeIcon("cubari"),
    rateLimit: { maxConcurrent: 2, minIntervalMs: 300 },
    linkHosts: ["cubari.moe", "imgur.com", "imgchest.com", "catbox.moe", "githubusercontent.com"],
  };

  private readonly guards = standardGuards(["cubari.moe"]);

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.request({ url: path.startsWith("http") ? path : `${SITE}${path}`, headers: { "User-Agent": this.ua, Accept: "application/json" } });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`Cubari answered HTTP ${res.status} for ${path}`);
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`Cubari sent something that isn't JSON for ${path}`);
    }
  }

  private series(seriesId: string): Promise<SeriesDto> {
    const i = seriesId.indexOf("/");
    if (i < 1) throw new Error(seriesGoneMessage());
    return this.get<SeriesDto>(`/read/api/${encodeURIComponent(seriesId.slice(0, i))}/series/${encodeURIComponent(seriesId.slice(i + 1))}/`);
  }

  private entry(seriesId: string, s: SeriesDto): SeriesEntry {
    const e: SeriesEntry = { id: seriesId, title: s.title.trim() };
    const cover = s.coverUrl ?? s.cover;
    if (cover) e.thumbnailUrl = cover;
    return e;
  }

  /** A link or `source/slug` finds its series; anything else finds nothing (there is no catalogue). */
  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const ref = cubariRef(req.text);
    if (!ref) return { items: [] };
    const id = `${ref.source}/${ref.slug}`;
    return { items: [this.entry(id, await this.series(id))] };
  }

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const s = await this.series(seriesId);
    const info: SeriesInfo = { ...this.entry(seriesId, s), shareUrl: `${SITE}/read/${seriesId}/` };
    // Gists put "Status: …" and "Tags: …" lines in the description.
    const desc = s.description ?? "";
    const status = /^Status: *(.+)$/m.exec(desc)?.[1];
    const tags = desc.includes("Tags: ") ? desc.slice(desc.indexOf("Tags: ") + 6).split(/\s*,\s*/).map((t) => t.trim()).filter(Boolean) : [];
    const body = desc.split("Tags: ")[0]!.replace(/^Status: *.+$\n*/m, "").trim();
    if (body) info.description = body;
    if (status) {
      const st = parseStatus(status);
      if (st !== "unknown") info.status = st;
    }
    if (tags.length) info.tagGroups = [{ label: "Tags", kind: "genre", tags }];
    if (s.author?.trim()) {
      info.author = s.author.trim();
      info.authors = [{ name: s.author.trim() }];
    }
    if (s.artist?.trim()) {
      info.artist = s.artist.trim();
      info.artists = [{ name: s.artist.trim() }];
    }
    return info;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const s = await this.series(seriesId);
    const out: Chapter[] = [];
    for (const [num, c] of Object.entries(s.chapters)) {
      const volume = c.volume === null || c.volume === undefined || NO_VOLUME.has(String(c.volume).toLowerCase()) ? undefined : String(c.volume);
      for (const group of Object.keys(c.groups)) {
        const name = `${volume ? `Vol.${volume} ` : ""}Ch.${num}${c.title?.trim() ? ` - ${c.title.trim()}` : ""}`;
        const ch: Chapter = { id: `${num}/${group}`, name };
        const n = Number(num);
        if (Number.isFinite(n)) ch.number = n;
        const v = Number(volume);
        if (volume && Number.isFinite(v)) ch.volume = v;
        const groupName = s.groups?.[group]?.trim();
        if (groupName) ch.group = groupName;
        const released = c.release_date?.[group];
        if (typeof released === "number") ch.publishedAt = Math.round(released * 1000);
        out.push(ch);
      }
    }
    return out.sort((a, b) => (b.number ?? -1) - (a.number ?? -1));
  }

  override async getChapterPages(seriesId: string, chapterId: string): Promise<Page[]> {
    const slash = chapterId.lastIndexOf("/");
    const [num, group] = [chapterId.slice(0, slash), chapterId.slice(slash + 1)];
    const entry = (await this.series(seriesId)).chapters[num]?.groups[group];
    if (entry === undefined) throw new Error(seriesGoneMessage("chapter removed from the source"));
    const pages = typeof entry === "string" ? await this.get<PageSrc[]>(entry) : entry;
    return pages.map(src).filter((u) => /^https?:/.test(u)).map((imageUrl, index) => ({ index, imageUrl }));
  }

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const ref = cubariRef(url);
    return ref ? { seriesId: `${ref.source}/${ref.slug}` } : null;
  }
}

export default defineBridge((host) => new CubariBridge(host));
