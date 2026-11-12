-- KING_FRIENDNAMES (Nov 12, staged, NOT applied): friends' welcome intro shows their real first name.
-- Without this a new profile is named from the email handle (e.g. "harriben"), so the gate would say "Harriben, you're in."
alter table public.allowlist add column if not exists name text;
update public.allowlist set name = 'Ben'  where email = 'harriben007@gmail.com';
update public.allowlist set name = 'Will' where email = 'williamkarlen06@gmail.com';
update public.allowlist set name = 'Ryan' where email = 'rbrogunier@gmail.com';
update public.allowlist set name = 'King' where email = 'meyerjos004@gmail.com';

create or replace function public.profile_name_from_allowlist() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  select a.name into n from public.allowlist a join auth.users u on lower(u.email) = lower(a.email) where u.id = new.user_id;
  if n is not null and n <> '' then new.name := n; end if;
  return new;
end $$;
drop trigger if exists profiles_name_from_allowlist on public.profiles;
create trigger profiles_name_from_allowlist before insert on public.profiles for each row execute function public.profile_name_from_allowlist();
-- Existing profiles that still carry an email handle get fixed too:
update public.profiles p set name = a.name from public.allowlist a join auth.users u on lower(u.email) = lower(a.email)
 where u.id = p.user_id and a.name is not null and p.name is distinct from a.name and p.name ~ '^[a-z0-9._]+$';
-- Reviewed Nov 12 01:55 MT against live schema (read-only): safe to run twice (add column if not exists, plain updates,
-- create or replace + drop/create trigger). profiles.user_id defaults to auth.uid(), which Postgres fills before BEFORE INSERT
-- triggers, so the lookup works for the app's insert({ name }) call. Trigger runs as definer, so the allowlist SELECT policy
-- (own row only) doesn't block it. Only fires on new profile rows; the catch-up update only touches lowercase handles, so
-- King's existing profile name "Josh" is left alone (his allowlist name 'King' only matters for a brand-new profile).
-- Today: Will has signed in but has no profile yet (gets "Will" on next sign-in); Ben and Ryan haven't signed in.
