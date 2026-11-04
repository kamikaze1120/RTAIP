import { describe, expect, it, vi } from "vitest";
import { ANALYST_SYSTEM_PROMPT, buildEvidence, readAnalystConfig, runAnalyst } from "./analyst";
import type { Snapshot } from "./useInvestigation";

const snap: Snapshot = {
  seeds: ["acme.example"],
  entities: [
    {
      id: "d1",
      type: "domain",
      value: "acme.example",
      label: "acme.example",
      confidence: 1,
      attrs: {},
      provenance: [{ source: "RDAP", url: "https://rdap.example/acme", fetchedAt: "2026-11-04T00:00:00Z" }],
    },
    {
      id: "ip1",
      type: "ip",
      value: "203.0.113.5",
      label: "203.0.113.5",
      confidence: 0.9,
      attrs: {},
      provenance: [{ source: "DNS", fetchedAt: "2026-11-04T00:00:00Z" }],
    },
  ],
  edges: [{ id: "e1", source: "d1", target: "ip1", type: "resolves_to", connector: "dns", confidence: 0.9 }],
  findings: [{ id: "f1", severity: "high", title: "Exposed admin panel", detail: "Port 8080 open to the internet", entityId: "ip1" }],
};
const meta = { score: 72, level: "elevated" as const, summary: "Moderate exposure across the footprint." };

describe("readAnalystConfig", () => {
  it("returns null when the API key is missing", () => {
    expect(readAnalystConfig({ LLM_BASE_URL: "https://api.example/v1" })).toBeNull();
  });

  it("returns null when the base URL is missing", () => {
    expect(readAnalystConfig({ LLM_API_KEY: "secret" })).toBeNull();
  });

  it("builds config, strips a trailing slash, and honours LLM_MODEL", () => {
    const c = readAnalystConfig({ LLM_BASE_URL: "https://api.example/v1/", LLM_API_KEY: "secret", LLM_MODEL: "gpt-4o-mini" });
    expect(c).toEqual({ baseUrl: "https://api.example/v1", apiKey: "secret", model: "gpt-4o-mini" });
  });

  it("falls back to a non-empty default model when LLM_MODEL is absent", () => {
    const c = readAnalystConfig({ LLM_BASE_URL: "https://api.example/v1", LLM_API_KEY: "secret" });
    expect(c?.model).toBeTruthy();
    expect(typeof c?.model).toBe("string");
  });
});

describe("buildEvidence", () => {
  const text = buildEvidence(snap, meta);

  it("states the seed, exposure score and system summary", () => {
    expect(text).toContain("acme.example");
    expect(text).toContain("72");
    expect(text).toContain("elevated");
    expect(text).toContain("Moderate exposure across the footprint.");
  });

  it("lists findings with their severity", () => {
    expect(text).toContain("Exposed admin panel");
    expect(text).toContain("Port 8080 open to the internet");
    expect(/high/i.test(text)).toBe(true);
  });

  it("lists entity values", () => {
    expect(text).toContain("203.0.113.5");
  });

  it("builds a numbered Sources list and references it on entities for citation", () => {
    expect(text).toContain("SOURCES:");
    expect(text).toContain("[1]");
    expect(text).toContain("RDAP");
    expect(text).toContain("DNS");
    // every source index used on an entity must appear in the Sources list
    const listed = new Set([...text.matchAll(/^\[(\d+)\]/gm)].map((m) => m[1]));
    expect(listed.size).toBeGreaterThanOrEqual(2);
  });
});

describe("ANALYST_SYSTEM_PROMPT", () => {
  it("encodes the evidence discipline (cite, no invention, public data only)", () => {
    expect(ANALYST_SYSTEM_PROMPT.length).toBeGreaterThan(200);
    expect(/cite/i.test(ANALYST_SYSTEM_PROMPT)).toBe(true);
    expect(/invent/i.test(ANALYST_SYSTEM_PROMPT)).toBe(true);
    expect(/public/i.test(ANALYST_SYSTEM_PROMPT)).toBe(true);
  });
});

describe("runAnalyst", () => {
  const config = { baseUrl: "https://api.example/v1", apiKey: "secret", model: "test-model" };

  it("posts an OpenAI-compatible chat completion and returns the brief", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "INTELLIGENCE BRIEF" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const brief = await runAnalyst(snap, meta, config, { fetch: fetchMock as unknown as typeof fetch });

    expect(brief).toBe("INTELLIGENCE BRIEF");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer secret");
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe("test-model");
    expect(sent.stream).toBe(false);
    expect(sent.messages[0].role).toBe("system");
    expect(sent.messages[0].content).toBe(ANALYST_SYSTEM_PROMPT);
    expect(sent.messages[1].role).toBe("user");
    expect(sent.messages[1].content).toContain("acme.example");
  });

  it("throws a clear error when the provider rejects the request", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    await expect(runAnalyst(snap, meta, config, { fetch: fetchMock as unknown as typeof fetch })).rejects.toThrow(/401/);
  });
});
