import { normalizeDomain } from "../validate";
import type { Transform } from "./types";

/**
 * Emails are only used to reach the domain they belong to. RTAIP does not look up
 * people, mailbox owners or breach records for an address.
 */
export const emailTransform: Transform = {
  id: "email",
  label: "Email domain",
  accepts: ["email"],
  budget: 1,
  async run(entity, ctx) {
    const domainPart = entity.value.split("@")[1] ?? "";
    const domain = normalizeDomain(domainPart);
    if (!domain) throw new Error("email has no valid domain");
    const prov = { source: "Derived from email address", fetchedAt: new Date().toISOString() };
    const d = ctx.graph.entity("domain", domain, { confidence: 1, provenance: prov });
    ctx.graph.edge(entity, "at_domain", d, "email", 1);
  },
};
