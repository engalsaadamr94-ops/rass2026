-- ZATCA phase-1 style tax invoices and credit notes. Issued documents are immutable (corrections are made with a credit note).
create table if not exists invoices (
  id text primary key,
  no text not null unique,
  kind text not null default 'invoice' check (kind in ('invoice','credit')),
  date date not null,
  cust_id text,
  quote_id text,
  pay_id text,
  ref_id text,
  data jsonb not null,
  subtotal numeric(14,2) not null,
  vat numeric(14,2) not null,
  total numeric(14,2) not null check (total > 0),
  issued_at timestamptz not null default now(),
  created_by uuid references users(id)
);
create index if not exists invoices_cust_idx on invoices (cust_id);
create index if not exists invoices_quote_idx on invoices (quote_id);
create index if not exists invoices_date_idx on invoices (date);
create or replace function invoices_guard() returns trigger as $$
begin
  raise exception 'issued invoices are immutable; issue a credit note instead';
end $$ language plpgsql;
drop trigger if exists invoices_guard_trg on invoices;
create trigger invoices_guard_trg before update or delete on invoices for each row execute function invoices_guard();
