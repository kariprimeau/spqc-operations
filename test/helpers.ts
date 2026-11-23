import { readFileSync } from "node:fs";
import { importAccounts } from "../src/import/accounts";
import { importRecurring } from "../src/import/recurring";

export const AT = "2026-11-23T02:00:00.000Z";
export const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
export function loadFixtures() {
  const acc = importAccounts(fixture("accounts.csv"), "accounts.csv", AT);
  const rec = importRecurring(fixture("recurring.csv"), "recurring.csv", AT, acc.rows);
  return { acc, rec };
}
