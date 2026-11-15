/** Mangakakalot — a MangaBox site (see `engines/mangabox.ts`). mangakakalot.gg now redirects to kakamanga.com. */
import { mangaBox } from "./engines/mangabox";

export default mangaBox({
  id: "pos5drow.mangakakalot",
  name: "Mangakakalot",
  version: "0.1.4",
  mirrors: ["https://www.kakamanga.com", "https://www.mangakakalove.com"],
  otherHosts: ["https://www.mangakakalot.gg"],
  iconUrl: "https://www.kakamanga.com/favicon.ico",
});
