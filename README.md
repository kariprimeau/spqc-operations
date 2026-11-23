# SPQC Operations

Bookkeeping site for Sanguine Penguin Quant Capital LLC. One operator. Private.

It runs on accounts the owner holds: this repository, a Cloudflare Worker with a D1 database,
Cloudflare Access for sign-in, and nightly backups to OneDrive. No AI platform is involved.
This is bookkeeping software, not tax or accounting advice.

**Setup:** [docs/SETUP.md](docs/SETUP.md)

## What is built

Build step 1 of the rebuild specification (v0.1, Nov 22, 2026):

- **Home**: backup status, accounts, next estimated charges.
- **Accounts**: the five business accounts, last four only, with portal links.
- **Recurring Expenses**: the 11 listed services, with confirmed and unverified totals kept apart.
- **Export CSV** on every list; nightly OneDrive backup; monthly restore test.

Next: step 2, the Inbox with document statuses and CSV import by rules.

## Standing rules the code enforces

- Unknown is never zero. Blank values are stored as NULL and shown as "Not available",
  "Not confirmed" or "Not established".
- Last four characters only for account numbers; longer numbers stop the import.
- No balancing plugs. Nothing is Paid, Overdue or Reconciled without statement evidence.
- Backups run before real data is loaded (the database refuses data until one succeeds).
- Colors and type follow the approved SPQC Black & Gold design; do not restyle.

## Layout

| Path | What |
|---|---|
| `src/index.ts` | Routes, sign-in check, nightly cron |
| `src/auth.ts` | Cloudflare Access token check (fails closed) |
| `src/import/` | CSV import rules for the SharePoint list exports |
| `src/pages/` | Home, Accounts, Recurring Expenses |
| `src/backup.ts`, `src/onedrive.ts` | Backup files and OneDrive upload |
| `migrations/` | D1 schema |
| `scripts/import.ts`, `scripts/restore-test.ts` | Run on the owner's PC |
| `test/` | `npm test` (fixtures are synthetic, not real data) |
