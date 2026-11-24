alter table public.admin_product_import_jobs
  add column if not exists snapshot_id text;

alter table public.admin_product_import_jobs
  drop constraint if exists admin_product_import_jobs_status_check;

alter table public.admin_product_import_jobs
  add constraint admin_product_import_jobs_status_check
  check (status in ('queued','processing','finalizing','completed','failed'));

create index if not exists admin_product_import_jobs_snapshot_idx
  on public.admin_product_import_jobs(snapshot_id)
  where snapshot_id is not null;