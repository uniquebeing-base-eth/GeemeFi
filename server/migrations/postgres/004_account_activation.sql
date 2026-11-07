ALTER TABLE users
  ADD COLUMN account_status TEXT NOT NULL DEFAULT 'pending_email_verification'
    CHECK (account_status IN (
      'pending_email_verification',
      'email_verified',
      'wallet_provisioning',
      'wallet_provisioning_failed',
      'active'
    ));

UPDATE users
SET account_status = CASE
  WHEN email_verified_at IS NULL THEN 'pending_email_verification'
  WHEN EXISTS (
    SELECT 1 FROM wallet_accounts
    WHERE wallet_accounts.user_id = users.id
      AND wallet_accounts.provisioning_status = 'provisioned'
      AND wallet_accounts.smart_wallet_address IS NOT NULL
  ) THEN 'active'
  ELSE 'email_verified'
END;

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_provisioning_status_check;

ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_provisioning_status_check
    CHECK (provisioning_status IN ('pending', 'provisioning', 'provisioned', 'failed'));
