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
