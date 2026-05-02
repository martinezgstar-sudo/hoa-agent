-- ============================================================
-- Migration: 20260502_pending_data
-- Creates pending approval tables for community data and fees.
-- Also adds research-oriented columns to communities table.
-- ============================================================

-- ── 1. Additional columns on communities (add if not present) ──────────────

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS monthly_fee_max      numeric,
  ADD COLUMN IF NOT EXISTS monthly_fee_median   numeric,
  ADD COLUMN IF NOT EXISTS website_url          text,          -- HOA official website
  ADD COLUMN IF NOT EXISTS registered_agent     text,          -- from Sunbiz
  ADD COLUMN IF NOT EXISTS street_address       text,          -- principal address
  ADD COLUMN IF NOT EXISTS zip_code             text,
  ADD COLUMN IF NOT EXISTS entity_status        text,          -- ACTIVE / INACTIVE
  ADD COLUMN IF NOT EXISTS state_entity_number  text,          -- e.g. N03000002013
  ADD COLUMN IF NOT EXISTS incorporation_date   date,
  ADD COLUMN IF NOT EXISTS str_restriction      text,          -- short-term rental policy
  ADD COLUMN IF NOT EXISTS vehicle_restriction  text;          -- vehicle restrictions

-- ── 2. pending_community_data ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_community_data (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    uuid        REFERENCES communities(id) ON DELETE CASCADE,
  field_name      text        NOT NULL,   -- column name on communities table
  proposed_value  text        NOT NULL,
  source_url      text,
  source_type     text,                   -- zillow | realtor | mls | sunbiz | pbcpao |
                                          -- duckduckgo | forum | reddit | yelp | news | other
  confidence      numeric     CHECK (confidence >= 0.0 AND confidence <= 1.0),
  auto_approvable boolean     NOT NULL DEFAULT false,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','rejected')),
  reviewed_at     timestamptz,
  reviewed_by     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcd_community_id ON pending_community_data(community_id);
CREATE INDEX IF NOT EXISTS idx_pcd_status        ON pending_community_data(status);
CREATE INDEX IF NOT EXISTS idx_pcd_field         ON pending_community_data(field_name);
CREATE INDEX IF NOT EXISTS idx_pcd_auto_approvable ON pending_community_data(auto_approvable)
  WHERE status = 'pending';

-- ── 3. pending_fee_observations ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_fee_observations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id        uuid        REFERENCES communities(id) ON DELETE CASCADE,
  fee_amount          numeric     NOT NULL,         -- exact number from source
  fee_rounded_min     numeric,                      -- floor to nearest $25
  fee_rounded_max     numeric,                      -- ceil to nearest $25
  fee_rounded_median  numeric,                      -- midpoint of min/max
  source_url          text,
  source_type         text,                         -- zillow | realtor | mls | forum | other
  listing_date        date,
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','approved','rejected')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pfo_community_id ON pending_fee_observations(community_id);
CREATE INDEX IF NOT EXISTS idx_pfo_status        ON pending_fee_observations(status);

-- ── 4. Row Level Security ─────────────────────────────────────────────────

ALTER TABLE pending_community_data  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_fee_observations ENABLE ROW LEVEL SECURITY;

-- Public: no access
CREATE POLICY "no_public_pcd"  ON pending_community_data  FOR ALL TO anon  USING (false);
CREATE POLICY "no_public_pfo"  ON pending_fee_observations FOR ALL TO anon  USING (false);

-- Authenticated (service role bypasses RLS by default in Supabase)
-- Authenticated users with valid session can read (admin API uses service role)
CREATE POLICY "service_role_pcd_all" ON pending_community_data
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_role_pfo_all" ON pending_fee_observations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 5. Helper view — pending counts per community ─────────────────────────

CREATE OR REPLACE VIEW pending_data_summary AS
SELECT
  c.id,
  c.canonical_name,
  c.city,
  COUNT(pcd.id) FILTER (WHERE pcd.status = 'pending')              AS pending_data_count,
  COUNT(pcd.id) FILTER (WHERE pcd.auto_approvable AND pcd.status = 'pending') AS auto_approvable_count,
  COUNT(pfo.id) FILTER (WHERE pfo.status = 'pending')              AS pending_fee_count
FROM communities c
LEFT JOIN pending_community_data  pcd ON pcd.community_id = c.id
LEFT JOIN pending_fee_observations pfo ON pfo.community_id = c.id
GROUP BY c.id, c.canonical_name, c.city;
