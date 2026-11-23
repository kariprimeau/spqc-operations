import { describe, expect, it } from "vitest";
import { importAccounts, shortName } from "../src/import/accounts";
import { parseMoneyCents, parseUsDate, requireLast4, scrubUrl } from "../src/import/common";
import { AT, loadFixtures } from "./helpers";

describe("parsing rules", () => {
  it("blank is null, never zero", () => {
    expect(parseMoneyCents("")).toBeNull();
    expect(parseMoneyCents("  ")).toBeNull();
    expect(parseMoneyCents("$0.00")).toBe(0);
    expect(parseMoneyCents("$1,234.5")).toBe(123450);
    expect(parseMoneyCents("($5.00)")).toBe(-500);
    expect(() => parseMoneyCents("about $5")).toThrow();
  });
  it("reads SharePoint dates", () => {
    expect(parseUsDate("11/8/2026")).toBe("2026-11-08");
    expect(parseUsDate("11/2/2026 12:00 AM")).toBe("2026-11-02");
    expect(parseUsDate("")).toBeNull();
    expect(() => parseUsDate("2026-13-01")).toThrow();
  });
  it("keeps last four only (rule 8)", () => {
    expect(requireLast4("096T", "x")).toBe("096T");
    expect(requireLast4("•••• 7104", "x")).toBe("7104");
    expect(() => requireLast4("627198936", "x")).toThrow(/last four/);
    expect(() => requireLast4("", "x")).toThrow(/blank/);
  });
  it("removes account numbers from links", () => {
    expect(scrubUrl("https://x.example.com/positions#Z12345678")).toEqual({ url: "https://x.example.com/positions", removed: true });
    expect(scrubUrl("https://x.example.com/a?acct=123456789").removed).toBe(true);
    expect(scrubUrl("https://x.example.com/Activity/1/")).toEqual({ url: "https://x.example.com/Activity/1/", removed: false });
    expect(() => scrubUrl("https://x.example.com/acct/123456789/view")).toThrow();
    expect(() => scrubUrl("http://x.example.com/")).toThrow(/https/);
  });
});

describe("accounts import", () => {
  it("loads every row with last four and display names", () => {
    const { acc } = loadFixtures();
    expect(acc.rows.map((a) => a.id)).toEqual(["alpha-bank-1111", "tradier-futures-096t", "beta-broker-2222"]);
    expect(shortName("Tradier Business futures account")).toBe("Tradier Futures");
    const beta = acc.rows[2]!;
    expect(beta.positions_url).toBe("https://broker.example.com/positions");
    expect(acc.warnings.join(" ")).toMatch(/removed an account number/);
    expect(acc.rows[0]!.positions_url).toBeNull(); // "N/A"
    expect(acc.rows[0]!.opened_date).toBe("2026-06-16");
  });
  it("refuses a full account number", () => {
    const csv = "Title,Account Type,Account Number,Opened\nX,Banking,627198936,1/1/2026\n";
    expect(() => importAccounts(csv, "a.csv", AT)).toThrow(/last four/);
  });
});

describe("recurring import", () => {
  it("keeps unknowns unknown and sets status from verification", () => {
    const { rec } = loadFixtures();
    const [design, internet, journal] = rec.rows;
    expect(design!.amount_cents).toBe(6999);
    expect(design!.status).toBe("Needs verification");
    expect(design!.last_observed_charge_text).toBe("10/7/2026 10:00 PM");
    expect(design!.last_observed_charge_date).toBe("2026-10-07");
    expect(internet!.amount_cents).toBeNull();
    expect(internet!.next_due_date).toBeNull();
    expect(internet!.business_use_percent).toBe(50);
    expect(journal!.status).toBe("Not confirmed");
    expect(journal!.amount_cents).toBe(135900);
  });
  it("separates owner-paid cards from business accounts", () => {
    const { rec } = loadFixtures();
    expect(rec.rows[0]!.paid_from_kind).toBe("owner_paid");
    expect(rec.rows[0]!.paid_from_text).toBe("Example Card ••9999");
    expect(rec.rows[0]!.paid_from_account_id).toBeNull();
    expect(rec.rows[2]!.paid_from_kind).toBe("business");
    expect(rec.rows[2]!.paid_from_account_id).toBe("alpha-bank-1111");
    expect(rec.warnings.join(" ")).toMatch(/2 service\(s\) are paid from personal cards/);
    expect(rec.warnings.join(" ")).toMatch(/50% business use/);
  });
});
