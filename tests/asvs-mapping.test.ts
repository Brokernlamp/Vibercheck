import { describe, expect, it } from "vitest";
import { ASVS_LABEL, ASVS_VERSION, asvsForCwe } from "../src/lib/scan/asvs";

describe("CWE to ASVS references", () => {
  it("uses stable OWASP ASVS 5.0.0 requirement identifiers", () => {
    expect(ASVS_VERSION).toBe("5.0.0");
    expect(ASVS_LABEL).toBe("OWASP ASVS 5.0.0");
    expect(asvsForCwe(["CWE-89"])).toEqual(["V1.2.4"]);
  });

  it("combines, deduplicates, and naturally sorts mapped requirements", () => {
    expect(asvsForCwe(["CWE-918", "CWE-89", "CWE-918"])).toEqual([
      "V1.2.4",
      "V1.3.6",
      "V13.2.5",
    ]);
  });

  it("does not invent references for CWEs absent from the source crosswalk", () => {
    expect(asvsForCwe(["CWE-862", "CWE-UNKNOWN"])).toEqual([]);
  });
});
