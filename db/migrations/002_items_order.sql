alter table items add column if not exists seq bigserial;
create index if not exists items_seq_idx on items (seq);
