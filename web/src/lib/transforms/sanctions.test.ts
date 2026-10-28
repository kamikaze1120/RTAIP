import { describe, expect, it } from "vitest";
import { normName, parseSdnNames, screen } from "./sanctions";

describe("sanctions helpers", () => {
  it("normalizes names for comparison", () => {
    expect(normName("Gazprom Neft, PAO")).toBe("GAZPROM NEFT PAO");
    expect(normName("  Rosóboronéxport  ")).toBe("ROSOBORONEXPORT");
  });

  it("parses entity names out of an OFAC SDN CSV", () => {
    const csv = '36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA",-0- ,-0- \n173,"ANGLO-CARIBBEAN CO., LTD.",-0- ,"CUBA",-0- \nbad line\n';
    const names = parseSdnNames(csv);
    expect(names.has("AEROCARIBBEAN AIRLINES")).toBe(true);
    expect(names.has("ANGLO CARIBBEAN CO LTD")).toBe(true);
    expect(names.size).toBe(2);
  });

  it("matches exact and leading-token-run names, not arbitrary substrings", () => {
    const names = new Set(["GAZPROM NEFT", "AEROCARIBBEAN AIRLINES"]);
    expect(screen("GAZPROM NEFT", names)).toBe(true); // exact
    expect(screen("GAZPROM", names)).toBe(true); // leading run
    expect(screen("NEFT", names)).toBe(false); // not a leading run
    expect(screen("ACME", names)).toBe(false);
  });
});
