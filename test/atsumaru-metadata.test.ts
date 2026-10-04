/**
 * The descriptive extras on the Atsumaru detail payload: other names → `altTitles`, the 0–10
 * `avgRating` → the contract's 0–1 `rating`, and the print-only facts (release year, views) →
 * `infoCells`. Also the bridge-level `ratings` declaration that lets a client show a rating at all.
 *
 * Instantiates the bridge with a mock host answering the single detail endpoint with canned JSON.
 */
import { describe, expect, test } from "bun:test";
import { type HostCapabilities, type HttpRequest, type HttpResponse, seriesInfoSchema } from "@comical/contract";
import factory from "../src/bridge.ts";

function detailHost(mangaPage: Record<string, unknown>): HostCapabilities {
  return {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => {
        const body = req.url.includes("/api/manga/page") ? JSON.stringify({ mangaPage }) : "{}";
        return { url: req.url, status: 200, statusText: "OK", headers: {}, body };
      },
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
}

const details = (mangaPage: Record<string, unknown>) =>
  factory(detailHost({ title: "Subject Series", ...mangaPage })).getSeriesDetails("series-1");

describe("Atsumaru alternate titles", () => {
  test("lists englishTitle then otherNames", async () => {
    const info = await details({ englishTitle: "Subject", otherNames: ["Sujet", "主題"] });
    expect(info.altTitles).toEqual(["Subject", "Sujet", "主題"]);
  });

  test("drops the title itself in any casing, repeats, and blanks", async () => {
    const info = await details({
      title: "SUBJECT SERIES",
      englishTitle: "Subject Series",
      otherNames: ["subject series", "Sujet", " Sujet ", "", "  ", "主題"],
    });
    expect(info.altTitles).toEqual(["Sujet", "主題"]);
  });

  test("omits the field when there is nothing but the title", async () => {
    expect((await details({ englishTitle: null, otherNames: ["Subject Series"] })).altTitles).toBeUndefined();
    expect((await details({})).altTitles).toBeUndefined();
  });

  test("ignores malformed shapes", async () => {
    expect((await details({ otherNames: "Sujet" })).altTitles).toBeUndefined();
    expect((await details({ otherNames: [3, null, { name: "x" }, "Sujet"] })).altTitles).toEqual(["Sujet"]);
  });
});

describe("Atsumaru rating", () => {
  test("declares ratings on the bridge", () => {
    expect(factory(detailHost({})).info.ratings).toBe(true);
  });

  test("normalizes the 0–10 average to 0–1", async () => {
    const info = await details({ avgRating: 7.958166666666671 });
    expect(info.rating?.score).toBeCloseTo(0.7958, 4);
  });

  test("does not report the written-review count as the rating's sample size", async () => {
    expect((await details({ avgRating: 8, reviewCount: 1 })).rating).toEqual({ score: 0.8 });
  });

  test("omits the rating for an unrated series", async () => {
    for (const avgRating of [null, undefined, 0, "8.1", Number.NaN]) {
      expect((await details({ avgRating })).rating).toBeUndefined();
    }
  });

  test("clamps an out-of-scale average instead of failing validation", async () => {
    expect((await details({ avgRating: 10.4 })).rating).toEqual({ score: 1 });
  });
});

describe("Atsumaru info cells", () => {
  test("reads the release year in UTC", async () => {
    // Midnight UTC on 1 Jan 2023 — still 2022 on a clock west of Greenwich.
    const info = await details({ released: 1672531200000 });
    expect(info.infoCells).toEqual([{ label: "Year", value: "2023" }]);
  });

  test("passes the site's abbreviated view count through, after the year", async () => {
    const info = await details({ released: 1672531200000, views: "716.5K" });
    expect(info.infoCells).toEqual([
      { label: "Year", value: "2023" },
      { label: "Views", value: "716.5K" },
    ]);
  });

  test("accepts a numeric view count", async () => {
    expect((await details({ views: 1234 })).infoCells).toEqual([{ label: "Views", value: "1234" }]);
  });

  test("omits cells it has no value for", async () => {
    for (const page of [{}, { released: null, views: "" }, { released: "2023", views: 0 }, { released: -1e15 }]) {
      expect((await details(page)).infoCells).toBeUndefined();
    }
  });

  test("keeps an over-long value inside the contract's cell limit", async () => {
    const info = await details({ views: "9".repeat(200) });
    expect(info.infoCells?.[0]?.value).toHaveLength(80);
  });
});

test("a fully populated detail validates against the contract", async () => {
  const info = await details({
    englishTitle: "Subject",
    otherNames: ["Sujet"],
    avgRating: 7.9,
    released: 1672531200000,
    views: "716.5K",
  });
  expect(() => seriesInfoSchema.parse(info)).not.toThrow();
});
