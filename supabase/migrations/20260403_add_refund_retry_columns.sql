alter table public.refund_requests
add column if not exists retry_count integer not null default 0;

alter table public.refund_requests
add column if not exists last_error_code text null;

alter table public.refund_requests
add column if not exists last_error_message text null;

alter table public.refund_requests
add column if not exists last_failed_at timestamptz null;
