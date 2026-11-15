/** The adapter between the kit's verdicts and Comical's errors. */
import { expect, test } from "bun:test";
import { parseChallenge, parseRateLimited } from "@comical/sdk";
import { standardGuards } from "comical-bridge-kit";
import { guardResponse, verdictMessage } from "../src/core/guarded";

const page = (body: string, extra: Record<string, string> = {}) => ({ url: "https://www.site.test/list?p=2", status: 403, statusText: "", headers: { server: "cloudflare", ...extra }, body });

test("a challenge page is a web check: the page for a GET, the root for anything else, with the request's User-Agent", () => {
  const guards = standardGuards(["site.test"]);
  const get = { url: "https://www.site.test/list?p=2", headers: { "User-Agent": "UA/1" } };
  const post = { url: "https://www.site.test/api", method: "POST" as const, headers: { "user-agent": "UA/2" } };
  const err = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as Error).message;
    }
    return "";
  };
  expect(parseChallenge(err(() => guardResponse(page("<title>Just a moment...</title>", { "cf-mitigated": "challenge" }), guards, get)))).toMatchObject({ url: "https://www.site.test/list?p=2", userAgent: "UA/1" });
  expect(parseChallenge(err(() => guardResponse(page("<title>Just a moment...</title>", { "cf-mitigated": "challenge" }), guards, post)))).toMatchObject({ url: "https://www.site.test/", userAgent: "UA/2" });
});

test("without the response a challenge can only be a back-off; a block is one too", () => {
  expect(parseRateLimited(verdictMessage({ kind: "challenge", vendor: "x", retryMs: 1000, reason: "r" }))?.retryAfterMs).toBe(1000);
  expect(parseRateLimited(verdictMessage({ kind: "blocked", vendor: "x", retryMs: 2000, reason: "r" }))?.retryAfterMs).toBe(2000);
});
