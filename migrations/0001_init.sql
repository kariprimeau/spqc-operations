-- SPQC Operations: step 1 schema.
-- Unknown values are stored as NULL, never as 0 or an empty string (rule 3).
-- Money is stored in integer cents.

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE accounts (
  id               TEXT PRIMARY KEY,          -- e.g. 'commerce-8936'
  title            TEXT NOT NULL,             -- as on the SharePoint list
  short_name       TEXT NOT NULL,             -- display name, e.g. 'Tradier Futures'
  account_type     TEXT,                      -- Banking | Brokerage
  last4            TEXT NOT NULL CHECK (length(last4) BETWEEN 1 AND 4),
  opened_date      TEXT,                      -- YYYY-MM-DD
  closed_date      TEXT,
  overview_url     TEXT,
  statement_url    TEXT,
  positions_url    TEXT,
  activity_url     TEXT,
  notes            TEXT,
  source_file      TEXT NOT NULL,
  source_row       INTEGER NOT NULL,
  imported_at      TEXT NOT NULL
);

CREATE TABLE recurring_expenses (
  id                        TEXT PRIMARY KEY,
  title                     TEXT NOT NULL,
  vendor                    TEXT,
  category                  TEXT,
  legal_entity              TEXT,
  initiative                TEXT,
  list_status               TEXT,             -- Active, ... (the list's own Status column)
  billing_frequency         TEXT,             -- Monthly | Annual
  amount_cents              INTEGER,          -- NULL = Not available
  amount_type               TEXT,             -- as exported
  next_due_date             TEXT,             -- forecast; always shown as Estimated
  expected_charge_date      TEXT,
  autopay                   INTEGER,          -- 1, 0 or NULL
  paid_from_text            TEXT,             -- as exported, e.g. 'USAA AmEx • 3789'
  paid_from_account_id      TEXT REFERENCES accounts(id),
  paid_from_kind            TEXT CHECK (paid_from_kind IN ('business','owner_paid')),
  paid_from_last4           TEXT CHECK (paid_from_last4 IS NULL OR length(paid_from_last4) BETWEEN 1 AND 4),
  billing_account_reference TEXT,
  business_use_percent      REAL,             -- NULL = Not confirmed
  reimbursement_needed      INTEGER,
  billing_portal_url        TEXT,
  invoice_download_url      TEXT,
  renewal_date              TEXT,
  cancel_by_date            TEXT,
  last_verified_date        TEXT,
  evidence_url              TEXT,
  notes                     TEXT,
  last_observed_charge_text TEXT,             -- exactly as exported (time included)
  last_observed_charge_date TEXT,             -- date part of the exported value
  source_reference          TEXT,
  verification_text         TEXT,             -- the list's Verification Status, as exported
  status                    TEXT NOT NULL CHECK (status IN ('Upcoming','Needs verification','Overdue','Paid','Not confirmed')),
  source_file               TEXT NOT NULL,
  source_row                INTEGER NOT NULL,
  imported_at               TEXT NOT NULL
);

-- Spec section 10: backups are switched on before any real data is loaded.
-- These triggers refuse account and expense rows until one backup has succeeded.
CREATE TRIGGER accounts_require_backup BEFORE INSERT ON accounts
WHEN (SELECT value FROM settings WHERE key = 'backup.last_ok_at') IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Run a successful OneDrive backup before loading real data (spec section 10).');
END;

CREATE TRIGGER recurring_require_backup BEFORE INSERT ON recurring_expenses
WHEN (SELECT value FROM settings WHERE key = 'backup.last_ok_at') IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Run a successful OneDrive backup before loading real data (spec section 10).');
END;
