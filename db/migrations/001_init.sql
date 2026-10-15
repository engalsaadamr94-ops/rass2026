create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  email text,
  full_name text not null,
  role text not null check (role in ('admin','accountant','sales','viewer')),
  active boolean not null default true,
  password_hash text not null,
  must_change boolean not null default false,
  token_version int not null default 0,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_login timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists users_username_uq on users (lower(username));
create unique index if not exists users_email_uq on users (lower(email)) where email is not null and email <> '';

create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  ip text
);
create index if not exists password_resets_user_idx on password_resets (user_id, created_at);

create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

create table if not exists settings (
  id int primary key check (id = 1),
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists items (
  id text primary key,
  data jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id text primary key,
  owner_id uuid references users(id),
  name text not null default '',
  data jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_owner_idx on customers (owner_id);

create table if not exists quotes (
  id text primary key,
  no text not null,
  owner_id uuid references users(id),
  cust_id text,
  status text not null default 'draft',
  rev int not null default 1,
  fam text,
  data jsonb not null,
  approval_state text not null default 'none',
  approval_pct numeric(8,4),
  approval_by uuid references users(id),
  approval_at timestamptz,
  approval_note text,
  share_token text unique,
  share_expires timestamptz,
  decision jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quotes_owner_idx on quotes (owner_id);
create index if not exists quotes_cust_idx on quotes (cust_id);

create table if not exists receipts (
  id text primary key,
  no text not null unique,
  date date not null,
  cust_id text not null,
  quote_id text,
  pay_id text,
  amount numeric(14,2) not null check (amount > 0),
  method text not null,
  ref text not null default '',
  notes text not null default '',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  void boolean not null default false,
  void_reason text,
  void_by uuid references users(id),
  void_at timestamptz
);
create index if not exists receipts_cust_idx on receipts (cust_id);
create index if not exists receipts_quote_idx on receipts (quote_id);
create index if not exists receipts_date_idx on receipts (date);

create or replace function receipts_guard() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'receipts cannot be deleted; void them instead';
  end if;
  if old.void then
    raise exception 'voided receipt is final';
  end if;
  if new.id is distinct from old.id or new.no is distinct from old.no or new.date is distinct from old.date
     or new.cust_id is distinct from old.cust_id or new.quote_id is distinct from old.quote_id
     or new.pay_id is distinct from old.pay_id or new.amount is distinct from old.amount
     or new.method is distinct from old.method or new.ref is distinct from old.ref
     or new.notes is distinct from old.notes or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'receipt fields are immutable';
  end if;
  return new;
end $$ language plpgsql;
drop trigger if exists receipts_guard_trg on receipts;
create trigger receipts_guard_trg before update or delete on receipts for each row execute function receipts_guard();

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  username text,
  action text not null,
  entity text,
  entity_id text,
  summary text,
  detail jsonb,
  ip text
);
create index if not exists audit_at_idx on audit_log (at desc);
create index if not exists audit_entity_idx on audit_log (entity, entity_id);

create or replace function audit_guard() returns trigger as $$
begin
  if tg_op = 'UPDATE' and old.action = new.action and old.id = new.id and old.user_id is not distinct from new.user_id
     and old.entity_id is not distinct from new.entity_id then
    return new; -- allow collapsing repeated autosave entries (timestamp/summary refresh only)
  end if;
  raise exception 'audit log is append-only';
end $$ language plpgsql;
drop trigger if exists audit_guard_trg on audit_log;
create trigger audit_guard_trg before update or delete on audit_log for each row execute function audit_guard();

create table if not exists backups (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null default 'auto',
  size_bytes int not null default 0,
  counts jsonb,
  data bytea not null
);
