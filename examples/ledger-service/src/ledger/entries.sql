-- Ledger entries are append only. Corrections are new, offsetting rows.
-- See .cairn/ANC-0005-ledger-rows-are-append-only.md
INSERT INTO ledger (account_id, amount_minor, currency, kind, occurred_at)
VALUES ($1, $2, $3, $4, $5);
