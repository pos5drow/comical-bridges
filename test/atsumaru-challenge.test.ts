/**
 * atsu.moe sits behind Cloudflare, which answers datacenter IPs (the nightly audit's runners) with a
 * 403 HTML challenge. Search and the Typesense-backed lists parsed that page as JSON and failed with
 * an opaque "SyntaxError: JSON Parse error: Unrecognized token '<'" — a hard failure, where a
 * challenge is a hold to wait out. These lock in that a challenge is a rate-limited error and that
 * any other non-JSON search answer names its status + URL.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, HttpResponse } from "@comical/contract";
import { parseRateLimited } from "@comical/sdk";
import factory from "../src/bridge.ts";

function host(respond: (req: HttpRequest) => Partial<HttpResponse>): HostCapabilities {
  return {
    network: {
      request: async (req: HttpRequest): Promise<HttpResponse> => ({
        url: req.url,
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        ...respond(req),
      }),
    },
    storage: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: {},
  };
}

const CHALLENGE = { status: 403, headers: { "CF-Mitigated": "challenge" }, body: "<!DOCTYPE html><title>Just a moment...</title>" };

describe("atsumaru Cloudflare challenge", () => {
  test("a challenged search is a rate-limited error", async () => {
    const err = (await factory(host(() => CHALLENGE)).getSearchResults({ text: "spy" }).catch((e: unknown) => e)) as Error;
    expect(parseRateLimited(err.message)?.retryAfterMs).toBe(5 * 60 * 1000);
  });

  test("a challenged Typesense list is a rate-limited error", async () => {
    const err = (await factory(host(() => CHALLENGE)).getListItems("trending").catch((e: unknown) => e)) as Error;
    expect(parseRateLimited(err.message)?.retryAfterMs).toBe(5 * 60 * 1000);
  });

  test("an unchallenged 403 on search names the status + URL, not a JSON parse error", async () => {
    const bridge = factory(host(() => ({ status: 403, body: "<html>Forbidden</html>" })));
    await expect(bridge.getSearchResults({ text: "spy" })).rejects.toThrow(/HTTP 403 .*\/collections\/manga\/documents\/search/);
  });

  test("a 200 HTML search answer names the URL", async () => {
    const bridge = factory(host(() => ({ body: "<html>maintenance</html>" })));
    await expect(bridge.getSearchResults({ text: "spy" })).rejects.toThrow(/non-JSON .*\/collections\/manga\/documents\/search/);
  });
});
