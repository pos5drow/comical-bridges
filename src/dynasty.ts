/**
 * Dynasty Scans bridge — https://dynasty-scans.com (yuri), read through its JSON views:
 *  - latest: `/chapters/added.json?page` (1-based), each chapter tagged with its series
 *  - a series, anthology, doujin or issue: `/{directory}/{permalink}.json` — tags, cover, description,
 *    and `taggings`: chapters, interleaved with `{header: "Volume 2"}` rows
 *  - a chapter: `/chapters/{permalink}.json` (pages)
 *  - search: `/search?q&classes[]&page` (HTML)
 *
 * A series id is `{directory}/{permalink}`. A chapter that belongs to nothing (a oneshot) is its own
 * series, `chapters/{permalink}`, with one chapter.
 */
import {
  BridgeBase,
  type BridgeInfo,
  type Chapter,
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
  type TagGroup,
  defineBridge,
  nextPageCursor,
  pageFromCursor,
  seriesGoneMessage,
} from "@comical/sdk";
import { chapterNumber, parseAbsoluteDate, parseStatus, standardGuards } from "comical-bridge-kit";
import { guardResponse } from "./core/guarded";

const SITE = "https://dynasty-scans.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Tag type → the directory its page lives under. */
const CONTAINERS: Record<string, string> = { Series: "series", Anthology: "anthologies", Doujin: "doujins", Issue: "issues" };
const DIRECTORIES = new Set([...Object.values(CONTAINERS), "chapters"]);

interface TagDto {
  type: string;
  name: string;
  permalink: string;
}

interface TaggingDto {
  header?: string;
  title?: string;
  permalink?: string;
  released_on?: string;
  tags?: TagDto[];
}

interface ContainerDto {
  name: string;
  type?: string;
  permalink: string;
  cover?: string | null;
  description?: string | null;
  aliases?: string[] | null;
  tags?: TagDto[] | null;
  taggings?: TaggingDto[] | null;
}

interface ChapterJsonDto {
  title: string;
  long_title?: string;
  permalink: string;
  tags?: TagDto[];
  pages: { name?: string; url: string }[];
  released_on?: string;
}

const LISTS: ReadonlyArray<SeriesList> = [{ id: "latest", name: "Latest chapters", layout: "grid", featured: true }];

function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const absolute = (path: string) => (path.startsWith("http") ? path : `${SITE}${path.startsWith("/") ? "" : "/"}${path}`);

class DynastyBridge extends BridgeBase {
  readonly info: BridgeInfo = {
    id: "pos5drow.dynasty",
    name: "Dynasty Scans",
    version: "0.1.2",
    contractVersion: "2.1.0",
    languages: ["en"],
    nsfw: false,
    capabilities: ["lists", "search", "filters"],
    iconUrl: `${SITE}/favicon.ico`,
    rateLimit: { maxConcurrent: 2, minIntervalMs: 500 },
    assetRateLimit: { maxConcurrent: 4, minIntervalMs: 100 },
    linkHosts: ["dynasty-scans.com"],
  };

  private readonly guards = standardGuards(["dynasty-scans.com"]);

  protected override async request(req: Parameters<BridgeBase["request"]>[0]): Promise<HttpResponse> {
    return guardResponse(await super.request(req), this.guards, req);
  }

  private async json<T>(path: string): Promise<T> {
    const res = await this.request({ url: `${SITE}${path}`, headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status === 404) throw new Error(seriesGoneMessage());
    if (res.status >= 400) throw new Error(`Dynasty answered HTTP ${res.status} for ${path}`);
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new Error(`Dynasty sent something that isn't JSON for ${path}`);
    }
  }

  /** The series a chapter belongs to: its first container tag, else the chapter itself. */
  private ownerOf(permalink: string, title: string, tags: TagDto[] | undefined): SeriesEntry {
    const owner = (tags ?? []).find((t) => CONTAINERS[t.type]);
    return owner
      ? { id: `${CONTAINERS[owner.type]}/${owner.permalink}`, title: owner.name }
      : { id: `chapters/${permalink}`, title };
  }

  private parts(seriesId: string): { dir: string; permalink: string } {
    const i = seriesId.indexOf("/");
    const dir = seriesId.slice(0, i);
    if (i < 1 || !DIRECTORIES.has(dir)) throw new Error(seriesGoneMessage());
    return { dir, permalink: seriesId.slice(i + 1) };
  }

  // ── Browse & search ─────────────────────────────────────────────────────────

  async getLists(): Promise<SeriesList[]> {
    return [...LISTS];
  }

  async getListItems(listId: string, req: ListRequest = {}): Promise<PagedResults<SeriesEntry>> {
    if (listId !== "latest") throw new Error(`unknown list: ${listId}`);
    const page = pageFromCursor(req.cursor);
    const res = await this.json<{ chapters: (ChapterJsonDto & { series?: string })[]; current_page: number; total_pages: number }>(`/chapters/added.json?page=${page}`);
    const seen = new Set<string>();
    const items: SeriesEntry[] = [];
    for (const c of res.chapters) {
      const e = this.ownerOf(c.permalink, c.title, c.tags);
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      e.subtitle = c.title;
      items.push(e);
    }
    return { items, nextCursor: nextPageCursor(page, res.current_page < res.total_pages) };
  }

  async getFilters(): Promise<Filter[]> {
    return [
      {
        type: "multiselect",
        key: "classes",
        label: "Kind",
        options: [["Series", "Series"], ["Anthology", "Anthologies"], ["Doujin", "Doujins"], ["Issue", "Issues"], ["Chapter", "Chapters"]].map(([value, label]) => ({ value: value!, label: label! })),
      },
    ];
  }

  async getSearchResults(req: SearchRequest): Promise<PagedResults<SeriesEntry>> {
    const page = pageFromCursor(req.cursor);
    const q = new URLSearchParams({ q: req.text.trim() });
    const classes = req.filters?.find((f) => f.key === "classes")?.value;
    for (const c of Array.isArray(classes) && classes.length ? classes : ["Series", "Anthology", "Doujin", "Issue"]) q.append("classes[]", c);
    q.set("page", String(page));
    const res = await this.request({ url: `${SITE}/search?${q}`, headers: { "User-Agent": UA, Accept: "text/html" } });
    if (res.status >= 400) throw new Error(`Dynasty answered HTTP ${res.status} for a search`);
    const $ = this.parse(res.body);
    const items: SeriesEntry[] = [];
    $("dl.chapter-list dd a.name").each((_, a) => {
      const m = /^\/([a-z]+)\/([^/?#]+)/.exec($(a).attr("href") ?? "");
      if (!m || !DIRECTORIES.has(m[1]!)) return;
      items.push({ id: `${m[1]}/${m[2]}`, title: $(a).text().trim() });
    });
    const hasNext = $(".pagination a[rel=next], .pagination li.next a").length > 0;
    return { items, nextCursor: nextPageCursor(page, hasNext) };
  }

  // ── Details, chapters, pages ────────────────────────────────────────────────

  async getSeriesDetails(seriesId: string): Promise<SeriesInfo> {
    const { dir, permalink } = this.parts(seriesId);
    if (dir === "chapters") {
      const c = await this.json<ChapterJsonDto>(`/chapters/${encodeURIComponent(permalink)}.json`);
      return { id: seriesId, title: c.long_title || c.title, shareUrl: `${SITE}/chapters/${permalink}`, ...this.tagInfo(c.tags ?? []) };
    }
    const s = await this.json<ContainerDto>(`/${dir}/${encodeURIComponent(permalink)}.json`);
    const info: SeriesInfo = { id: seriesId, title: s.name.trim(), shareUrl: `${SITE}/${dir}/${permalink}`, ...this.tagInfo(s.tags ?? []) };
    if (s.cover) info.thumbnailUrl = absolute(s.cover);
    if (s.description) {
      const d = plainText(s.description);
      if (d) info.description = d;
    }
    if (s.aliases?.length) info.altTitles = s.aliases.filter((a) => a.trim());
    if (s.type && s.type !== "Series") info.type = s.type;
    return info;
  }

  /** Authors, status and genres out of a tag list. */
  private tagInfo(tags: TagDto[]): Partial<SeriesInfo> {
    const out: Partial<SeriesInfo> = {};
    const authors = tags.filter((t) => t.type === "Author").map((t) => t.name);
    if (authors.length) {
      out.authors = authors.map((name) => ({ name, id: name }));
      out.author = authors.join(", ");
    }
    const status = tags.find((t) => t.type === "Status");
    if (status) {
      const st = parseStatus(status.name);
      if (st !== "unknown") out.status = st;
    }
    const general = tags.filter((t) => t.type === "General").map((t) => t.name);
    if (general.length) {
      const tagGroups: TagGroup[] = [{ label: "Tags", kind: "genre", tags: general }];
      out.tagGroups = tagGroups;
    }
    return out;
  }

  override async getChapters(seriesId: string): Promise<Chapter[]> {
    const { dir, permalink } = this.parts(seriesId);
    if (dir === "chapters") {
      const c = await this.json<ChapterJsonDto>(`/chapters/${encodeURIComponent(permalink)}.json`);
      return [this.chapter({ title: c.title, permalink: c.permalink, ...(c.released_on ? { released_on: c.released_on } : {}), ...(c.tags ? { tags: c.tags } : {}) }, undefined)];
    }
    const s = await this.json<ContainerDto>(`/${dir}/${encodeURIComponent(permalink)}.json`);
    const chapters: Chapter[] = [];
    let volume: number | undefined;
    for (const t of s.taggings ?? []) {
      if (t.header !== undefined) {
        const v = /(\d+(?:\.\d+)?)/.exec(t.header)?.[1];
        volume = v ? Number(v) : undefined;
        continue;
      }
      if (t.permalink) chapters.push(this.chapter(t, volume));
    }
    // Taggings run oldest first; newest first reads better and is what the other bridges return.
    return chapters.reverse();
  }

  private chapter(t: TaggingDto, volume: number | undefined): Chapter {
    const ch: Chapter = { id: t.permalink!, name: (t.title ?? t.permalink!).trim() };
    const n = chapterNumber(ch.name);
    if (n !== undefined) ch.number = n;
    if (volume !== undefined) ch.volume = volume;
    const at = t.released_on ? parseAbsoluteDate(t.released_on) : undefined;
    if (at !== undefined) ch.publishedAt = at;
    const groups = (t.tags ?? []).filter((x) => x.type === "Scanlator").map((x) => x.name);
    if (groups.length) ch.group = groups.join(", ");
    return ch;
  }

  override async getChapterPages(_seriesId: string, chapterId: string): Promise<Page[]> {
    const c = await this.json<ChapterJsonDto>(`/chapters/${encodeURIComponent(chapterId)}.json`);
    return c.pages.map((p, index) => ({ index, imageUrl: absolute(p.url) }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async resolveUrl(url: string): Promise<LinkTarget | null> {
    const m = /^https?:\/\/(?:www\.)?dynasty-scans\.com\/([a-z]+)\/([^/?#]+)/.exec(url);
    if (!m || !DIRECTORIES.has(m[1]!)) return null;
    if (m[1] !== "chapters") return { seriesId: `${m[1]}/${m[2]}` };
    const c = await this.json<ChapterJsonDto>(`/chapters/${encodeURIComponent(m[2]!)}.json`);
    return { seriesId: this.ownerOf(c.permalink, c.title, c.tags).id, chapterId: c.permalink };
  }
}

export default defineBridge((host) => new DynastyBridge(host));
