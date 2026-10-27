import { describe, expect, it } from "vitest";
import { decodeXml, normalizeKev, parseRss } from "./feeds";
import { kpScale, normalizeSpaceWeather } from "./spaceweather";
import { validOmm } from "./satellites";

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Strike near Kharkiv &amp; Sumy]]></title><link>https://example.com/a</link><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>No link</title></item>
<item><title>Unsafe</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

describe("feeds", () => {
  it("parses RSS, decodes entities, rejects unsafe links and tags zones", () => {
    const items = parseRss(RSS, "Test");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Strike near Kharkiv & Sumy");
    expect(items[0]?.zones).toEqual(["ukraine"]);
    expect(items[0]?.time).toBe("2026-10-26T10:00:00.000Z");
  });
  it("decodes xml", () => {
    expect(decodeXml("&lt;b&gt;Hi&lt;/b&gt; &#39;x&#39;")).toBe("Hi 'x'");
  });
  it("turns the CISA catalog into newest first cyber items", () => {
    const items = normalizeKev({ vulnerabilities: [{ cveID: "CVE-1", vendorProject: "A", product: "B", vulnerabilityName: "n", dateAdded: "2026-01-01" }, { cveID: "CVE-2", vendorProject: "C", product: "D", vulnerabilityName: "n", dateAdded: "2026-02-01", knownRansomwareCampaignUse: "Known" }] });
    expect(items[0]?.id).toBe("kev:CVE-2");
    expect(items[0]?.title).toContain("ransomware");
    expect(items[0]?.url).toBe("https://nvd.nist.gov/vuln/detail/CVE-2");
  });
});

describe("space weather", () => {
  it("reads the latest Kp and labels the storm scale", () => {
    const out = normalizeSpaceWeather([{ time_tag: "2026-10-27T06:00:00", Kp: 2 }, { time_tag: "2026-10-27T09:00:00", Kp: 5.33 }], [{ product_id: "A", issue_datetime: "2026-10-27 11:38:11.233", message: "Space Weather Message Code: ALTEF3\r\nCONTINUED ALERT: Electron flux exceeded\r\nmore" }]);
    expect(out.kp).toBe(5.33);
    expect(out.scale).toBe("G1 minor storm");
    expect(out.alerts[0]?.text).toContain("CONTINUED ALERT");
    expect(kpScale(null)).toBe("unknown");
  });
});

describe("satellites", () => {
  it("keeps only complete element sets", () => {
    const good = { OBJECT_NAME: "ISS", EPOCH: "2026-10-27T00:00:00", MEAN_MOTION: 15.5, ECCENTRICITY: 0.0001, INCLINATION: 51.6, RA_OF_ASC_NODE: 1, ARG_OF_PERICENTER: 2, MEAN_ANOMALY: 3, NORAD_CAT_ID: 25544, BSTAR: 0.0001 };
    expect(validOmm([good, { OBJECT_NAME: "broken" }, null])).toHaveLength(1);
    expect(validOmm({})).toHaveLength(0);
  });
});
