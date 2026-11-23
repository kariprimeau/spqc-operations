# Setting up SPQC Operations

Everything runs on accounts you own: this GitHub repository, your Cloudflare account and your
OneDrive. You run each command on your own PC, in PowerShell, from the repository folder.
Nothing here needs an AI platform.

**Order matters.** Backups must work before any real data is loaded (spec section 10). The
database enforces this: it refuses the import until one backup has succeeded.

| Step | What | Time |
|---|---|---|
| 1 | Install and sign in | 5 min |
| 2 | Create the database | 2 min |
| 3 | Deploy and turn on sign-in (Cloudflare Access) | 10 min |
| 4 | OneDrive backups | 15 min |
| 5 | Load Accounts and Recurring Expenses | 2 min |
| 6 | Monthly restore test | 2 min, once a month |

## 1. Install and sign in

1. Install **Node.js 22.13 or later** (LTS) from nodejs.org, and **Git**.
2. Get the code and install it:

   ```powershell
   git clone https://github.com/kariprimeau/spqc-operations.git
   cd spqc-operations
   npm install
   ```

3. Sign in to Cloudflare. A browser window opens; approve it.

   ```powershell
   npx wrangler login
   ```

## 2. Create the database

```powershell
npx wrangler d1 create spqc-operations
```

Copy the `database_id` it prints into `wrangler.toml`, replacing
`REPLACE_WITH_ID_FROM_wrangler_d1_create`. Then create the tables:

```powershell
npm run db:migrate
```

## 3. Deploy and turn on sign-in

1. Set the two secrets the site needs before anything else. Each command asks for the value.

   ```powershell
   npx wrangler secret put ALLOWED_EMAIL     # the one email allowed to sign in
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   npx wrangler secret put TOKEN_KEY         # paste the value the line above printed
   ```

2. Deploy:

   ```powershell
   npm run deploy
   ```

   It prints the site address, `https://spqc-operations.<your-subdomain>.workers.dev`.

3. Turn on Cloudflare Access for it. In the Cloudflare dashboard: **Workers & Pages →
   spqc-operations → Settings → Domains & Routes → workers.dev → Enable Cloudflare Access**.
   Then open **Manage Cloudflare Access** and set the policy to allow only your email.
   (If you later put the site on your own domain, protect that hostname with an Access
   application the same way.)
4. From the Access application, copy the **Application Audience (AUD) tag**, and from
   **Zero Trust → Settings** your **team domain**
   (`https://<team>.cloudflareaccess.com`). Put both in `wrangler.toml`:

   ```toml
   ACCESS_TEAM_DOMAIN = "https://<team>.cloudflareaccess.com"
   ACCESS_AUD = "<the AUD tag>"
   ```

5. Deploy again with `npm run deploy`, open the site and sign in. Home shows
   **Backups: Not set up**. That is expected.

Until both values are set, the site refuses every visitor, you included. It never falls back
to "open".

## 4. OneDrive backups

The site backs itself up every night at 2 AM Central (3 AM during daylight time) into
`_SPQC Backups/<date>` in your OneDrive, as JSON and CSV files plus a `manifest.json` with row
counts and checksums. To change the folder, edit `BACKUP_FOLDER` in `wrangler.toml`.

It needs a small Microsoft app that you own:

1. Go to **entra.microsoft.com → Applications → App registrations → New registration**.
   - Name: `SPQC Operations Backups`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: platform **Web**, value `https://<your site>/onedrive/callback`
2. On the app's **Overview** page, copy the **Application (client) ID** and the
   **Directory (tenant) ID**.
3. **Certificates & secrets → New client secret**, 24 months. Copy the **Value** right away.
   Put a reminder in your calendar for a month before it expires; backups stop when it does,
   and Home shows **Backup failed**.
4. **API permissions → Add a permission → Microsoft Graph → Delegated**: add
   `Files.ReadWrite` and `offline_access`.
5. Save the three values as secrets:

   ```powershell
   npx wrangler secret put MS_TENANT_ID
   npx wrangler secret put MS_CLIENT_ID
   npx wrangler secret put MS_CLIENT_SECRET
   ```

6. Open the site's Home page, press **Connect OneDrive**, and sign in with your Microsoft
   account. Then press **Run first backup**. Check that the folder appears in OneDrive.

About the permission: Microsoft has no delegated permission limited to one folder, so
`Files.ReadWrite` lets the app act on your OneDrive files as you. The site's code only ever
writes inside the backup folder (`src/onedrive.ts`, `src/backup.ts`), never reads or deletes,
and keeps the sign-in encrypted in its database. Old backups are never deleted by the site.

## 5. Load Accounts and Recurring Expenses

Use the two SharePoint list exports. The CSV files stay on your PC; git ignores them.

```powershell
npm run import -- --accounts "C:\path\Accounts.csv" --recurring "C:\path\Recurring Expenses.csv"
```

It prints what it found and writes `import-<date>.sql`. Check the summary, then load it:

```powershell
npx wrangler d1 execute spqc-operations --remote --file import-<date>.sql
```

What the import does, and refuses to do:

- Account numbers are kept as the last four characters only. A longer number stops the
  import. Links that carry a full account number (Fidelity adds one after `#`) are kept
  without that part.
- A blank cell stays unknown and is shown as "Not available" or "Not confirmed". It never
  becomes $0.
- Every recurring expense starts as **Needs verification** (or **Not confirmed** when the
  list has no verification note). Nothing is marked Paid, Upcoming or Overdue until a
  statement line shows it, which arrives in build step 2.
- Cards that are not one of the five business accounts are shown as **Owner-paid**.
- Running it again replaces rows; it never duplicates them.

## 6. Monthly restore test

Once a month, point the test at any backup folder in your synced OneDrive:

```powershell
npm run restore-test -- "C:\Users\...\OneDrive - ...\_SPQC Backups\2026-12-01" --record
```

It checks every file against the manifest, rebuilds the database from scratch on your PC
from the backup alone, and compares every row. `--record` writes the pass date to the site,
and Home shows when the next test is due.

## Updating the site later

```powershell
git pull
npm install
npm run db:migrate
npm run deploy
```

## Working on it locally

Create `.dev.vars` with `DEV_BYPASS_AUTH=1`, then `npm run db:migrate:local` and
`npm run dev`. The bypass works only on `localhost`. Run `npm test` before deploying.
