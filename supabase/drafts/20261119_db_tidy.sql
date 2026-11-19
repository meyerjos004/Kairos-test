-- KING_DBTIDY (DRAFT, not applied): Supabase advisor cleanups for the TEST project. Apply only after King says yes.
-- 1) RLS: evaluate auth.uid()/is_member() once per query instead of once per row
alter policy "own prefs"    on public.prefs    using ((user_id = (select auth.uid())) and (select public.is_member())) with check ((user_id = (select auth.uid())) and (select public.is_member()));
alter policy "own sessions" on public.sessions using ((user_id = (select auth.uid())) and (select public.is_member())) with check ((user_id = (select auth.uid())) and (select public.is_member()));
alter policy "own trades"   on public.trades   using ((user_id = (select auth.uid())) and (select public.is_member())) with check ((user_id = (select auth.uid())) and (select public.is_member()));
alter policy "members see own allowlist row" on public.allowlist using ((lower(email) = lower(((select auth.jwt()) ->> 'email'))) or (select public.is_admin()));
-- 2) trigger-only functions: nobody needs to call these over the API
revoke execute on function public.bot_requeue() from anon, authenticated, public;
revoke execute on function public.profiles_guard_name_fx() from anon, authenticated, public;
revoke execute on function public.profiles_guard_name_fx_ins() from anon, authenticated, public;
-- 3) fixed search path on HELIOS helpers
alter function orbit.norm set search_path = orbit, public;
alter function orbit.h set search_path = orbit, public;
-- 4) duplicate index
drop index if exists public.messages_room_idx;
-- (leaked-password protection is a dashboard toggle: Auth > Providers > Email)
