-- variation orders, interim payment certificates, cheque register, supplier RFQs, attachments, quote view tracking
create table if not exists pdocs (
  id text primary key,
  kind text not null check (kind in ('vo','ipc','chq','rfq')),
  no text not null unique,
  quote_id text,
  cust_id text,
  status text not null default 'draft',
  owner_id uuid references users(id) on delete set null,
  data jsonb not null,
  amount numeric(14,2) not null default 0,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pdocs_kind_idx on pdocs (kind, updated_at desc);
create index if not exists pdocs_quote_idx on pdocs (quote_id);

create table if not exists attachments (
  id text primary key,
  ref_kind text not null check (ref_kind in ('item')),
  ref_id text not null,
  doc_type text not null default 'datasheet',
  name text not null,
  mime text not null,
  size int not null,
  data bytea not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_ref_idx on attachments (ref_kind, ref_id);

alter table quotes add column if not exists view_count int not null default 0;
alter table quotes add column if not exists first_view timestamptz;
alter table quotes add column if not exists last_view timestamptz;

create table if not exists doc_counters (kind text primary key, n int not null default 0);
