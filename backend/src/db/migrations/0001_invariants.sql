-- ---------------------------------------------------------------------------
-- Taskeno financial invariants.
--
-- These constraints live in the database on purpose. Application code can be
-- refactored, a migration script can be replayed, a rogue query can be written
-- in a hurry — but an unbalanced ledger or a mutated history row must be
-- impossible at the storage layer.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION taskeno_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: rows cannot be updated or deleted', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Every journal must balance: the sum of debits equals the sum of credits.
-- A constraint trigger deferred to commit time means a multi-line journal is
-- validated once the whole financial event has been written.
CREATE OR REPLACE FUNCTION taskeno_assert_journal_balanced() RETURNS trigger AS $$
DECLARE
  target_journal uuid;
  debit_total numeric(20, 0);
  credit_total numeric(20, 0);
BEGIN
  target_journal := COALESCE(NEW.journal_id, OLD.journal_id);

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE direction = 'debit'), 0),
    COALESCE(SUM(amount) FILTER (WHERE direction = 'credit'), 0)
  INTO debit_total, credit_total
  FROM ledger_entries
  WHERE journal_id = target_journal;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION 'Ledger journal % is unbalanced (debit=%, credit=%)', target_journal, debit_total, credit_total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION taskeno_assert_journal_balanced();
--> statement-breakpoint

-- History is immutable: corrections happen through compensating journals.
CREATE TRIGGER journals_append_only
  BEFORE UPDATE OR DELETE ON journals
  FOR EACH ROW EXECUTE FUNCTION taskeno_block_mutation();
--> statement-breakpoint

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION taskeno_block_mutation();
--> statement-breakpoint

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION taskeno_block_mutation();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Value constraints
-- ---------------------------------------------------------------------------

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_amount_positive CHECK (amount > 0);
--> statement-breakpoint

-- The recorded running balance must match the direction of the entry, so a
-- mis-signed posting can never be committed.
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_balance_consistent CHECK (
    (direction = 'debit' AND balance_after = balance_before - amount)
    OR (direction = 'credit' AND balance_after = balance_before + amount)
  );
--> statement-breakpoint

-- User wallets can never go negative. Platform wallets (gateway clearing,
-- escrow) are allowed to, because money is in flight between them.
ALTER TABLE wallets
  ADD CONSTRAINT wallets_user_balance_nonnegative CHECK (owner_type <> 'user' OR balance >= 0);
--> statement-breakpoint

ALTER TABLE wallets
  ADD CONSTRAINT wallets_owner_shape CHECK (
    (owner_type = 'user' AND owner_id IS NOT NULL AND code IS NULL)
    OR (owner_type = 'platform' AND owner_id IS NULL AND code IS NOT NULL)
  );
--> statement-breakpoint

ALTER TABLE services
  ADD CONSTRAINT services_price_positive CHECK (price > 0);
--> statement-breakpoint

ALTER TABLE services
  ADD CONSTRAINT services_delivery_days_positive CHECK (delivery_days > 0);
--> statement-breakpoint

ALTER TABLE order_items
  ADD CONSTRAINT order_items_price_positive CHECK (price_snapshot > 0 AND total >= 0);
--> statement-breakpoint

ALTER TABLE orders
  ADD CONSTRAINT orders_amounts_nonnegative CHECK (subtotal >= 0 AND commission_amount >= 0 AND total >= 0);
--> statement-breakpoint

ALTER TABLE orders
  ADD CONSTRAINT orders_commission_not_above_total CHECK (commission_amount <= total);
--> statement-breakpoint

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
--> statement-breakpoint

ALTER TABLE reviews
  ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5);
--> statement-breakpoint

ALTER TABLE commission_rules
  ADD CONSTRAINT commission_rules_bps_range CHECK (percent_bps BETWEEN 0 AND 10000);
--> statement-breakpoint

-- A percent rule must carry a rate, a fixed rule must carry an amount.
ALTER TABLE commission_rules
  ADD CONSTRAINT commission_rules_calc_shape CHECK (
    (calc_type = 'percent' AND percent_bps > 0)
    OR (calc_type = 'fixed' AND fixed_amount > 0)
    OR (calc_type = 'percent_plus_fixed' AND (percent_bps > 0 OR fixed_amount > 0))
  );
--> statement-breakpoint

ALTER TABLE commission_rules
  ADD CONSTRAINT commission_rules_bounds_ordered CHECK (
    min_commission IS NULL OR max_commission IS NULL OR min_commission <= max_commission
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Search (Phase 3)
--
-- Persian text has no built-in stemmer, so we index with the `simple`
-- configuration over an expression. This keeps search working with zero extra
-- infrastructure while remaining swappable for a dedicated engine later.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS services_search_idx
  ON services USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS categories_active_idx ON categories (is_active, sort_order);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION taskeno_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION taskeno_touch_updated_at();
--> statement-breakpoint

CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION taskeno_touch_updated_at();
--> statement-breakpoint

CREATE TRIGGER services_touch_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION taskeno_touch_updated_at();
--> statement-breakpoint

CREATE TRIGGER orders_touch_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION taskeno_touch_updated_at();
--> statement-breakpoint

CREATE TRIGGER wallets_touch_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION taskeno_touch_updated_at();
--> statement-breakpoint

CREATE TRIGGER payments_touch_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION taskeno_touch_updated_at();
--> statement-breakpoint

CREATE TRIGGER reviews_touch_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION taskeno_touch_updated_at();
--> statement-breakpoint

CREATE TRIGGER commission_rules_touch_updated_at BEFORE UPDATE ON commission_rules FOR EACH ROW EXECUTE FUNCTION taskeno_touch_updated_at();
--> statement-breakpoint

CREATE TRIGGER categories_touch_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION taskeno_touch_updated_at();
