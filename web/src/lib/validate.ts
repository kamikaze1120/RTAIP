import type { SeedType } from "./types";

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}$/;
const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home", ".corp", ".onion", ".test", ".invalid", ".example"];

export function normalizeDomain(input: string): string | null {
  let raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  raw = raw.split(/[/?#]/)[0] ?? "";
  raw = raw.replace(/:\d+$/, "").replace(/\.$/, "");
  if (!raw || raw.includes("@") || raw.includes(" ")) return null;
  let host = raw;
  try {
    host = new URL(`http://${raw}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  if (isIPv4(host) || host.includes(":")) return null;
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return null;
  return DOMAIN_RE.test(host) ? host : null;
}

export function isIPv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && String(Number(p)) === p);
}

export function isIPv6(value: string): boolean {
  if (!value.includes(":") || value.length > 45) return false;
  if (!/^[0-9a-f:.]+$/i.test(value)) return false;
  try {
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

export function isPublicIp(value: string): boolean {
  if (isIPv4(value)) {
    const [a, b] = value.split(".").map(Number) as [number, number];
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false; // multicast and reserved
    return true;
  }
  if (isIPv6(value)) {
    const v = value.toLowerCase();
    if (v === "::" || v === "::1") return false;
    if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return false;
    if (v.startsWith("fc") || v.startsWith("fd")) return false;
    if (v.startsWith("ff")) return false;
    if (v.startsWith("::ffff:")) return isPublicIp(v.slice(7));
    return true;
  }
  return false;
}

export function normalizeEmail(input: string): string | null {
  const v = (input ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(v)) return null;
  const domain = normalizeDomain(v.split("@")[1] ?? "");
  if (!domain) return null;
  return `${v.split("@")[0]}@${domain}`;
}

/** An organization or company name: free text that is not a domain, IP or email. */
export function normalizeOrg(input: string): string | null {
  const v = (input ?? "").replace(/\s+/g, " ").trim();
  if (v.length < 2 || v.length > 120) return null;
  if (!/[a-z]/i.test(v)) return null; // must contain a letter
  if (v.includes("@")) return null;
  if (normalizeDomain(v)) return null; // a bare domain is a domain, not an org
  if (isIPv4(v) || isIPv6(v)) return null;
  return v;
}

export function guessSeedType(value: string): SeedType | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (v.includes("@")) return normalizeEmail(v) ? "email" : null;
  if (isIPv4(v) || isIPv6(v)) return "ip";
  if (normalizeDomain(v)) return "domain";
  return normalizeOrg(v) ? "org" : null;
}

export interface ParsedSeed {
  type: SeedType;
  value: string;
}

export function parseSeed(type: string | undefined, value: string): { ok: true; seed: ParsedSeed } | { ok: false; error: string } {
  const t = (type && type !== "auto" ? type : guessSeedType(value)) as SeedType | null;
  if (!t) return { ok: false, error: "Enter a domain, an IP address or an email address." };
  if (t === "domain") {
    const d = normalizeDomain(value);
    return d ? { ok: true, seed: { type: "domain", value: d } } : { ok: false, error: "That does not look like a public domain name." };
  }
  if (t === "ip") {
    const ip = value.trim().toLowerCase();
    if (!isIPv4(ip) && !isIPv6(ip)) return { ok: false, error: "That does not look like an IP address." };
    if (!isPublicIp(ip)) return { ok: false, error: "Private, local and reserved IP addresses are not investigated." };
    return { ok: true, seed: { type: "ip", value: ip } };
  }
  if (t === "org") {
    const o = normalizeOrg(value);
    return o ? { ok: true, seed: { type: "org", value: o } } : { ok: false, error: "Enter a company or organization name." };
  }
  const e = normalizeEmail(value);
  return e ? { ok: true, seed: { type: "email", value: e } } : { ok: false, error: "That does not look like an email address." };
}
