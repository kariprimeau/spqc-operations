import { describe, expect, it } from "vitest";
import { csvObjects, parseCsv, toCsv } from "../src/csv";

describe("csv", () => {
  it("reads BOM, quotes, embedded commas, quotes and newlines", () => {
    const rows = parseCsv('﻿"a","b"\r\n"x, y","say ""hi""\nthere"\r\n\r\n');
    expect(rows).toEqual([["a", "b"], ["x, y", 'say "hi"\nthere']]);
  });
  it("names missing columns", () => {
    expect(() => csvObjects("A,B\n1,2\n", ["A", "C"])).toThrow(/missing column\(s\): C/);
  });
  it("round-trips and guards spreadsheet formulas", () => {
    const out = toCsv(["a", "b"], [["=SUM(A1)", "-12.50"], [null, 'q"q']]);
    expect(out).toBe('a,b\r\n\'=SUM(A1),-12.50\r\n,"q""q"\r\n');
  });
});
