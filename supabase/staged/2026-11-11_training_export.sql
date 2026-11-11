-- STAGED (not applied): lets the PC export King's KAIROS trades as bot-training rows (King/admins only).
-- Same token check as the fix box worker (private.worker_keys name 'fixbox').
create or replace function public.training_export(tok text, since timestamptz default '2000-01-01')
returns table (id uuid, symbol text, dir int, qty int, entry numeric, stop numeric, target numeric, exit numeric,
  t_entry bigint, t_exit bigint, outcome text, r numeric, pnl numeric, tags text[], rules_ok boolean, mistakes text[], session_name text, created_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from private.worker_keys k where k.name='fixbox' and k.hash=encode(extensions.digest(tok,'sha256'),'hex')) then raise exception 'bad token'; end if;
  return query select t.id, t.symbol, t.dir::int, t.qty::int, t.entry, t.stop, t.target, t.exit, t.t_entry::bigint, t.t_exit::bigint, t.outcome, t.r, t.pnl,
      coalesce(t.tags, '{}')::text[], t.rules_ok, coalesce(t.mistakes, '{}')::text[], s.name, t.created_at
    from trades t left join sessions s on s.id = t.session_id
    join auth.users u on u.id = t.user_id join allowlist a on lower(a.email) = lower(u.email) and a.role = 'admin'
    where t.created_at >= since order by t.created_at;
end $$;
revoke all on function public.training_export(text, timestamptz) from public; grant execute on function public.training_export(text, timestamptz) to anon, authenticated;
