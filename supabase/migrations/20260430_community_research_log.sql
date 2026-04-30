create table if not exists community_research_log (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade,
  researched_at timestamptz not null default now(),
  fields_updated text[] default '{}',
  sources_checked text[] default '{}',
  notes text
);

create index if not exists idx_research_log_community_id on community_research_log(community_id);
create index if not exists idx_research_log_researched_at on community_research_log(researched_at);
