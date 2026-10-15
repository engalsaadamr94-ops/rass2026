create table if not exists agreements (
  id text primary key,
  no text not null unique,
  kind text not null default 'custom',
  status text not null default 'draft',
  owner_id uuid references users(id) on delete set null,
  cust_id text,
  quote_id text,
  data jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agreements_owner_idx on agreements (owner_id, updated_at desc);
create index if not exists agreements_cust_idx on agreements (cust_id);
