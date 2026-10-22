/**
 * The live settings form (`loadSettings` / `runSettingAction`, contract 2.1): atsumaru groups its
 * settings and offers a "Test login" that signs in with the saved credentials.
 */
import { describe, expect, test } from "bun:test";
import type { HostCapabilities, HttpRequest, SettingValue } from "@comical/contract";
import atsumaru from "../src/bridge.ts";

type Answer = { status?: number; body: string };

function host(settings: Record<string, SettingValue>, respond: (req: HttpRequest) => Answer = () => ({ body: "{}" })) {
  const requests: HttpRequest[] = [];
  const caps: HostCapabilities = {
    network: {
      request: async (req) => {
        requests.push(req);
        const { status = 200, body } = respond(req);
        return { url: req.url, status, statusText: status >= 400 ? "Unauthorized" : "OK", headers: {}, body };
      },
    },
    storage: {
      get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [],
      secure: { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [] },
    },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings,
  };
  return { caps, requests };
}

const CREDS = { username: "reader", password: "pw" };

describe("atsumaru settings form", () => {
  test("groups every declared setting and adds the login check", async () => {
    const form = await atsumaru(host({}).caps).loadSettings!();
    expect(form.sections.map((s) => [s.title, s.items.map((i) => i.key)])).toEqual([
      ["Content", ["adult"]],
      ["Account", ["username", "password", "test-login"]],
    ]);
  });

  test("Test login signs in with the saved credentials", async () => {
    const { caps, requests } = host(CREDS, () => ({ body: JSON.stringify({ status: "success" }) }));
    expect(await atsumaru(caps).runSettingAction!("test-login")).toEqual({ ok: true, message: "Signed in as reader" });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.body).toBe("username=reader&password=pw");
  });

  test("rejected credentials are an answer, with the site's reason", async () => {
    const { caps } = host(CREDS, () => ({ status: 401, body: JSON.stringify({ error: "Invalid credentials" }) }));
    expect(await atsumaru(caps).runSettingAction!("test-login")).toEqual({ ok: false, message: "Invalid credentials" });
  });

  test("asks for credentials before sending anything", async () => {
    const { caps, requests } = host({ username: "reader" });
    expect((await atsumaru(caps).runSettingAction!("test-login")).ok).toBe(false);
    expect(requests).toEqual([]);
  });

  test("favorites still fail loudly on bad credentials", async () => {
    const { caps } = host(CREDS, (req) =>
      req.url.endsWith("/login") ? { status: 401, body: JSON.stringify({ error: "Invalid credentials" }) } : { status: 401, body: "" },
    );
    await expect(atsumaru(caps).getFavorites!()).rejects.toThrow("atsu.moe login failed: Invalid credentials");
  });

  test("an unknown action throws", async () => {
    await expect(atsumaru(host(CREDS).caps).runSettingAction!("nope")).rejects.toThrow("nope");
  });
});
