alter table quotes add column if not exists sent_at timestamptz;
update quotes set sent_at = coalesce(sent_at, updated_at) where status in ('sent','won','lost') and sent_at is null;
