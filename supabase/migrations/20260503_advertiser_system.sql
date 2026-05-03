-- 20260503_advertiser_system.sql
-- Creates the four tables that back the advertiser system:
--   advertisers           — admin-managed campaigns (e.g. MorningStar)
--   ad_analytics          — public-write impression/click tracking
--   advertiser_profiles   — self-serve account profile, FK to auth.users
--   advertiser_ads        — ad creatives owned by advertiser_profiles
--   ad_generation_sessions — Claude AI ad-gen audit log
--
-- RLS:
--   ad_analytics:        anon INSERT only (public tracking)
--   advertiser_profiles: user reads/updates own row only
--   advertiser_ads:      user manages ads owned by their profile only

-- ── 1. advertisers (admin-managed) ──────────────────────────────────────────
create table if not exists advertisers (
  id uuid default gen_random_uuid() primary key,
  company_name text not null,
  tagline text,
  website_url text,
  phone text,
  logo_url text,
  ad_copy text,
  cta_text text,
  cta_url text,
  target_cities text[] default '{}',
  target_counties text[] default '{}',
  category text,
  plan text default 'starter',
  status text default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_advertisers_status on advertisers(status);
create index if not exists idx_advertisers_target_cities on advertisers using gin(target_cities);

-- ── 2. ad_analytics (public-write tracking) ─────────────────────────────────
create table if not exists ad_analytics (
  id uuid default gen_random_uuid() primary key,
  advertiser_id uuid references advertisers(id) on delete cascade,
  event_type text not null,         -- 'impression' | 'click'
  community_slug text,
  city text,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists idx_ad_analytics_advertiser on ad_analytics(advertiser_id);
create index if not exists idx_ad_analytics_created on ad_analytics(created_at desc);

alter table ad_analytics enable row level security;

drop policy if exists "anon_insert_analytics" on ad_analytics;
create policy "anon_insert_analytics" on ad_analytics
  for insert to anon
  with check (true);

drop policy if exists "service_role_full" on ad_analytics;
create policy "service_role_full" on ad_analytics
  for all to service_role
  using (true) with check (true);

-- ── 3. advertiser_profiles (self-serve auth users) ──────────────────────────
create table if not exists advertiser_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_name text,
  website_url text,
  phone text,
  email text,
  logo_url text,
  category text,
  plan text,
  plan_status text default 'pending',  -- pending | active | past_due | canceled
  stripe_customer_id text,
  stripe_subscription_id text,
  target_cities text[] default '{}',
  max_ads integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table advertiser_profiles enable row level security;

drop policy if exists "users_read_own_profile" on advertiser_profiles;
create policy "users_read_own_profile" on advertiser_profiles
  for select using (auth.uid() = id);

drop policy if exists "users_update_own_profile" on advertiser_profiles;
create policy "users_update_own_profile" on advertiser_profiles
  for update using (auth.uid() = id);

drop policy if exists "users_insert_own_profile" on advertiser_profiles;
create policy "users_insert_own_profile" on advertiser_profiles
  for insert with check (auth.uid() = id);

-- ── 4. advertiser_ads (creatives) ───────────────────────────────────────────
create table if not exists advertiser_ads (
  id uuid default gen_random_uuid() primary key,
  advertiser_id uuid references advertiser_profiles(id) on delete cascade,
  ad_name text,
  company_name text,
  tagline text,
  ad_copy text,
  cta_text text,
  cta_url text,
  image_url text,
  status text default 'draft',           -- draft | active | paused
  is_rotating boolean default false,
  rotation_order integer default 1,
  generated_by text default 'manual',     -- manual | claude
  source_url text,
  created_at timestamptz default now()
);

create index if not exists idx_advertiser_ads_advertiser on advertiser_ads(advertiser_id);

alter table advertiser_ads enable row level security;

drop policy if exists "users_manage_own_ads" on advertiser_ads;
create policy "users_manage_own_ads" on advertiser_ads
  for all using (
    advertiser_id in (
      select id from advertiser_profiles where id = auth.uid()
    )
  );

-- ── 5. ad_generation_sessions (Claude ad-gen audit) ─────────────────────────
create table if not exists ad_generation_sessions (
  id uuid default gen_random_uuid() primary key,
  advertiser_id uuid references advertiser_profiles(id) on delete cascade,
  website_url text,
  generated_options jsonb,
  selected_ad_id uuid,
  feedback text,
  created_at timestamptz default now()
);

create index if not exists idx_adgen_sessions_advertiser on ad_generation_sessions(advertiser_id);

alter table ad_generation_sessions enable row level security;

drop policy if exists "users_manage_own_sessions" on ad_generation_sessions;
create policy "users_manage_own_sessions" on ad_generation_sessions
  for all using (
    advertiser_id in (
      select id from advertiser_profiles where id = auth.uid()
    )
  );

-- ── 6. Seed MorningStar (admin-owned, target-county PBC) ────────────────────
insert into advertisers (
  company_name, tagline, website_url, phone,
  ad_copy, cta_text, cta_url,
  target_cities, target_counties,
  category, plan, status
) values (
  'MorningStar Commercial & Residential Services',
  'Professional cleaning for HOA communities',
  'https://morningstarpb.com',
  '561-567-4114',
  'Move-in cleans, recurring service, and commercial spaces. Trusted by Palm Beach County HOAs.',
  'Get a Free Quote',
  'https://morningstarpb.com',
  array[
    'West Palm Beach','Jupiter','Palm Beach Gardens',
    'Lake Worth','Boynton Beach','Delray Beach',
    'Riviera Beach','North Palm Beach',
    'Royal Palm Beach','Wellington'
  ],
  array['Palm Beach'],
  'cleaning',
  'county',
  'active'
)
on conflict do nothing;
