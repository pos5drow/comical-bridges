/**
 * Manganato — a MangaBox site (see `engines/mangabox.ts`). natomanga.com now redirects to
 * manganami.com; manganato.gg is the domain that answers without a challenge.
 */
import { mangaBox } from "./engines/mangabox";

export default mangaBox({
  id: "pos5drow.manganato",
  name: "Manganato",
  version: "0.1.3",
  mirrors: ["https://www.manganato.gg", "https://www.natomanga.com", "https://www.nelomanga.net", "https://www.manganami.com"],
  iconUrl: "https://www.manganato.gg/favicon.ico",
});
