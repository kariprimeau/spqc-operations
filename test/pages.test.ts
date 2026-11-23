import { describe, expect, it } from "vitest";
import { money, date } from "../src/format";
import { esc } from "../src/html";
import { accountsPage } from "../src/pages/accounts";
import { homePage, restoreTestDue } from "../src/pages/home";
import { recurringPage, totals } from "../src/pages/recurring";
import { loadFixtures } from "./helpers";

const NOW = new Date("2026-11-23T02:00:00Z");

describe("display rules", () => {
  it("unknown is never zero", () => {
    expect(money(null)).toBe("Not available");
    expect(money(0)).toBe("$0.00");
    expect(money(123456)).toBe("$1,234.56");
    expect(date(null)).toBe("Not confirmed");
  });
  it("escapes", () => { expect(esc(`<a href="x">'`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;"); });
});

describe("pages", () => {
  const { acc, rec } = loadFixtures();
  it("recurring totals count only confirmed rows", () => {
    const t = totals(rec.rows);
    expect(t.confirmedMonthlyCents).toBeNull();
    expect(t.confirmedMonthlyCount).toBe(0);
    expect(t.listedMonthlyCents).toBe(6999);
    expect(t.listedMonthlyMissing).toBe(1);
    expect(t.listedAnnualCents).toBe(135900);
  });
  it("recurring page shows unknowns in words and never $0.00", () => {
    const h = recurringPage(rec.rows, NOW);
    expect(h).not.toContain("$0.00");
    expect(h).toContain("Not available");
    expect(h).toContain("Owner-paid · Example Card ••9999");
    expect(h).toContain("Estimated");
    expect(h).toContain("Date has passed; no payment evidence yet");
    expect(h).toContain("Last observed, old finance feed, retrieved Oct 25, 2026");
    expect(h).not.toContain("Overdue");
  });
  it("accounts page shows last four only and no balances yet", () => {
    const h = accountsPage(acc.rows);
    expect(h).toContain("Alpha Bank ••1111");
    expect(h).toContain("Tradier Futures ••096T");
    expect(h).not.toMatch(/Z12345678/);
    expect(h).not.toContain("$0.00");
    expect(h).toContain('href="/accounts.csv"');
  });
  it("home asks for a backup before data", () => {
    const h = homePage({ accounts: [], recurring: [], settings: {}, oneDriveConfigured: true }, NOW);
    expect(h).toContain("Connect OneDrive");
    const h2 = homePage({ accounts: [], recurring: [], settings: { "onedrive.connected_at": "x" }, oneDriveConfigured: true }, NOW);
    expect(h2).toContain("Run first backup");
    const h3 = homePage({ accounts: [], recurring: [], oneDriveConfigured: true, settings: {
      "onedrive.connected_at": "x", "backup.last_ok_at": "2026-11-20T08:00:00Z",
      "backup.last_attempt_at": "2026-11-22T08:00:00Z", "backup.last_error": "OneDrive refused" } }, NOW);
    expect(h3).toContain("Backup failed");
    expect(h3).toContain("Retry backup now");
    expect(restoreTestDue(null, NOW)).toBe(true);
    expect(restoreTestDue("2026-11-01T00:00:00Z", NOW)).toBe(false);
  });
});
