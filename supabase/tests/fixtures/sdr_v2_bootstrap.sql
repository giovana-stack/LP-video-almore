create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema extensions;
create extension pgcrypto with schema extensions;

create table public.sdr_bridge_auth_failures (
  bucket_minute timestamptz primary key,
  failures integer not null default 0
);

alter table public.sdr_bridge_auth_failures enable row level security;
revoke all on table public.sdr_bridge_auth_failures from public, anon, authenticated;
grant select, insert, update, delete on table public.sdr_bridge_auth_failures to service_role;

create or replace function public.sdr_bridge_token()
returns text
language sql
security definer
set search_path = ''
as $$
  select 'test-token'::text;
$$;

revoke all on function public.sdr_bridge_token() from public, anon, authenticated;
grant execute on function public.sdr_bridge_token() to service_role;
