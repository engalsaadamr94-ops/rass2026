create table if not exists takeoffs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id) on delete set null,
  quote_id text references quotes(id) on delete set null,
  name text not null default '',
  data jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists takeoffs_owner_idx on takeoffs (owner_id, updated_at desc);
create index if not exists takeoffs_quote_idx on takeoffs (quote_id);
