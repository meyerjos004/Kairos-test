-- KAIROS: usernames + name effects (Nov 12 walkthrough). Safe to run twice. Run with the other staged files at push time.
-- profiles.username: 3-16 lowercase letters / numbers / _, unique (case-insensitive). Members set their own (existing "own profile update" policy).
-- profiles.name_fx: an effect King picks by hand (null = automatic from keywords, 'none' = off). Only an admin can change it.

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists name_fx text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,16}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_name_fx_values') then
    alter table public.profiles add constraint profiles_name_fx_values check (name_fx is null or name_fx in ('none','fart','poop','juicy','goat','king','sigma','moon','degen','money'));
  end if;
end $$;

create unique index if not exists profiles_username_lower on public.profiles (lower(username)) where username is not null;

-- non-admins can't change name_fx (their update keeps the old value); admins can
create or replace function public.profiles_guard_name_fx() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name_fx is distinct from old.name_fx and not public.is_admin() then
    new.name_fx := old.name_fx;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_name_fx on public.profiles;
create trigger profiles_guard_name_fx before update on public.profiles for each row execute function public.profiles_guard_name_fx();

-- inserts can't set name_fx either (a new profile starts on automatic)
create or replace function public.profiles_guard_name_fx_ins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name_fx is not null and not public.is_admin() then new.name_fx := null; end if;
  return new;
end $$;

drop trigger if exists profiles_guard_name_fx_ins on public.profiles;
create trigger profiles_guard_name_fx_ins before insert on public.profiles for each row execute function public.profiles_guard_name_fx_ins();

-- admins can update any profile's name_fx from the Admin page
drop policy if exists "admin updates profiles" on public.profiles;
create policy "admin updates profiles" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
