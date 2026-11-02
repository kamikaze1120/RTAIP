import { describe, expect, it } from "vitest";
import { toStixBundle, type StixObject } from "./stix";
import type { Entity, Edge } from "./types";
import type { Snapshot } from "./useInvestigation";

const ent = (type: Entity["type"], value: string, extra: Partial<Entity> = {}): Entity => ({
  id: `${type}:${value}`,
  type,
  value,
  label: value,
  confidence: 0.8,
  attrs: {},
  provenance: [{ source: "Seed", fetchedAt: "2026-11-02T00:00:00.000Z" }],
  ...extra,
});

const edge = (source: string, type: string, target: string): Edge => ({ id: `${source}|${type}|${target}`, source, target, type, connector: "test", confidence: 0.7 });

const find = (objs: StixObject[], type: string) => objs.filter((o) => o.type === type);

describe("stix export", () => {
  const snap: Snapshot = {
    seeds: ["example.com"],
    entities: [ent("domain", "example.com"), ent("ip", "93.184.216.34"), ent("ip", "2606:2800:220:1:248:1893:25c8:1946"), ent("org", "Example Org"), ent("asn", "AS15133")],
    edges: [edge("domain:example.com", "resolves_to", "ip:93.184.216.34"), edge("domain:example.com", "owned_by", "org:missing")],
    findings: [],
  };
  const now = "2026-11-02T12:00:00.000Z";

  it("wraps objects in a STIX 2.1 bundle", () => {
    const bundle = toStixBundle(snap, now);
    expect(bundle.type).toBe("bundle");
    expect(bundle.id).toMatch(/^bundle--[0-9a-f-]{36}$/);
    expect(bundle.objects.length).toBeGreaterThan(0);
  });

  it("maps entity types to the right STIX observable/domain types", () => {
    const objs = toStixBundle(snap, now).objects;
    expect(find(objs, "domain-name")[0]?.value).toBe("example.com");
    expect(find(objs, "ipv4-addr")[0]?.value).toBe("93.184.216.34");
    expect(find(objs, "ipv6-addr")[0]?.value).toBe("2606:2800:220:1:248:1893:25c8:1946");
    expect(find(objs, "identity")[0]).toMatchObject({ identity_class: "organization", name: "Example Org" });
    expect(find(objs, "autonomous-system")[0]?.number).toBe(15133);
  });

  it("emits relationships only when both endpoints are mapped, with a sanitized type", () => {
    const rels = find(toStixBundle(snap, now).objects, "relationship");
    expect(rels).toHaveLength(1); // the edge to the missing org is dropped
    expect(rels[0]?.relationship_type).toBe("resolves-to");
    const domainId = find(toStixBundle(snap, now).objects, "domain-name")[0]?.id;
    const ipId = find(toStixBundle(snap, now).objects, "ipv4-addr")[0]?.id;
    expect(rels[0]?.source_ref).toBe(domainId);
    expect(rels[0]?.target_ref).toBe(ipId);
  });

  it("produces deterministic ids for the same entity", () => {
    const a = find(toStixBundle(snap, now).objects, "domain-name")[0]?.id;
    const b = find(toStixBundle(snap, "2030-01-01T00:00:00.000Z").objects, "domain-name")[0]?.id;
    expect(a).toBe(b);
    expect(a).toMatch(/^domain-name--[0-9a-f-]{36}$/);
  });
});
