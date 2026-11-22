-- KING_DUEL (Nov 22): competitive 1v1. Both players replay the same hidden day/session with the same rules; higher P&L wins.
create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  a uuid not null references auth.users(id) on delete cascade,   -- challenger
  b uuid not null references auth.users(id) on delete cascade,   -- opponent
  a_name text, b_name text,
  sym text not null default 'NQ',
  day date not null,                 -- the hidden day
  start_ts bigint not null,          -- replay start (unix s)
  end_ts bigint not null,            -- replay end (unix s)
  sess text not null default 'ny',   -- ny | nyfull | asia
  status text not null default 'pending' check (status in ('pending','active','done','declined','cancelled')),
  a_pnl numeric, b_pnl numeric, a_n int, b_n int, a_r numeric, b_r numeric,
  a_done boolean not null default false, b_done boolean not null default false,
  winner uuid,
  done_at timestamptz
);
create index if not exists duels_a_idx on public.duels(a);
create index if not exists duels_b_idx on public.duels(b);
alter table public.duels enable row level security;
create policy "duel players read" on public.duels for select using ((select auth.uid()) in (a, b));
create policy "duel create" on public.duels for insert with check (a = (select auth.uid()) and a <> b and is_member());
create policy "duel players update" on public.duels for update using ((select auth.uid()) in (a, b)) with check ((select auth.uid()) in (a, b));
