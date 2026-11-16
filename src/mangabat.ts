/** Mangabat — a MangaBox site (see `engines/mangabox.ts`). */
import { mangaBox } from "./engines/mangabox";
import { bridgeIcon } from "./core/icon";

export default mangaBox({
  id: "pos5drow.mangabat",
  name: "Mangabat",
  version: "0.1.6",
  mirrors: ["https://www.mangabats.com"],
  iconUrl: bridgeIcon("mangabat"),
});
