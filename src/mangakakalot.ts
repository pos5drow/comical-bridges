/** Mangakakalot — a MangaBox site (see `engines/mangabox.ts`). mangakakalot.gg now redirects to kakamanga.com. */
import { mangaBox } from "./engines/mangabox";
import { bridgeIcon } from "./core/icon";

export default mangaBox({
  id: "pos5drow.mangakakalot",
  name: "Mangakakalot",
  version: "0.1.6",
  mirrors: ["https://www.kakamanga.com", "https://www.mangakakalove.com"],
  otherHosts: ["https://www.mangakakalot.gg"],
  iconUrl: bridgeIcon("mangakakalot"),
});
