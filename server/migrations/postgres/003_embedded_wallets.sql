ALTER TABLE wallet_accounts
  ADD COLUMN smart_wallet_address TEXT,
  ADD COLUMN provisioning_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (provisioning_status IN ('pending', 'provisioning', 'provisioned', 'failed'));

CREATE UNIQUE INDEX wallet_accounts_smart_wallet_address_lower_uidx
  ON wallet_accounts (lower(smart_wallet_address))
  WHERE smart_wallet_address IS NOT NULL;
