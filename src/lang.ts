/**
 * Map a language name (any case, e.g. "English", "japanese") to a short uppercase abbreviation for a
 * card badge ("EN", "JP"). Keeps card chips terse — a few characters instead of a full language name.
 * Falls back to the first two letters uppercased for languages not in the table, so an unknown
 * language still renders a compact chip rather than its full name.
 */
const LANGUAGE_ABBREVIATIONS: Record<string, string> = {
  english: "EN",
  japanese: "JP",
  chinese: "CN",
  korean: "KR",
  spanish: "ES",
  french: "FR",
  german: "DE",
  russian: "RU",
  portuguese: "PT",
  italian: "IT",
  dutch: "NL",
  polish: "PL",
  vietnamese: "VN",
  thai: "TH",
  indonesian: "ID",
  tagalog: "TL",
  arabic: "AR",
  hungarian: "HU",
  czech: "CS",
  turkish: "TR",
  ukrainian: "UA",
};

export function abbreviateLanguage(name: string): string {
  const key = name.trim().toLowerCase();
  return LANGUAGE_ABBREVIATIONS[key] ?? key.slice(0, 2).toUpperCase();
}
