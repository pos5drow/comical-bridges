import type { SeriesEntry } from "@comical/sdk";

/** What a series is as an object, and how it reads — the contract's two cover hints. */
export type CoverHints = Pick<SeriesEntry, "coverForm" | "readingDirection">;

/**
 * The cover hints a series' TYPE gives, as the aggregators name it: manga is a printed volume read
 * right to left; manhwa and manhua are webtoons, read down a scroll (most of what these sites carry
 * of either is the vertical format); OEL, original English-language manga, is a volume read left
 * to right. Atsumaru spells manhwa "Manwha". An unknown type says nothing, and the app guesses.
 */
export function hintsForType(type: string | undefined): CoverHints {
  switch (type?.trim().toLowerCase()) {
    case "manga":
      return { coverForm: "volume", readingDirection: "rtl" };
    case "manhwa":
    case "manwha":
    case "manhua":
      return { coverForm: "scroll", readingDirection: "vertical" };
    case "oel":
      return { coverForm: "volume", readingDirection: "ltr" };
    default:
      return {};
  }
}
