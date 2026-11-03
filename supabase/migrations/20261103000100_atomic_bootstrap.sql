-- Bootstrap and seed in one transaction. Serialize first visits by account so concurrent
-- tabs cannot both observe no memberships and create duplicate organisations.
create function public.bootstrap_demo_workspace(p_payload jsonb, p_preferred_org uuid default null)
returns table (org_id uuid, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_created boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  select w.org_id, w.created into v_org, v_created
  from public.ensure_workspace(p_preferred_org => p_preferred_org) w;
  if v_created then
    perform public.seed_demo_workspace(v_org, p_payload);
  end if;
  return query select v_org, v_created;
end;
$$;
revoke all on function public.bootstrap_demo_workspace(jsonb, uuid) from public, anon;
grant execute on function public.bootstrap_demo_workspace(jsonb, uuid) to authenticated;
