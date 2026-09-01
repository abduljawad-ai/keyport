-- ============================================================================
-- Keyport.chat — signup domain allowlist
--
-- Security: server-side enforcement via a BEFORE INSERT trigger on auth.users.
-- This runs inside Postgres during the signup flow and cannot be bypassed
-- from the browser.
--
-- Behavior:
--   * If signup_allowlist has NO rows → open signup (any email allowed)
--   * If signup_allowlist HAS rows → only emails whose domain matches a row
--     are allowed. Others get: "Signup is restricted to approved email
--     domains."
--
-- To add a domain:   INSERT INTO public.signup_allowlist (domain) VALUES ('example.com');
-- To remove a domain: DELETE FROM public.signup_allowlist WHERE domain = 'example.com';
-- To open signup:    TRUNCATE public.signup_allowlist;
-- ============================================================================

-- ---------------------------------------------------------
-- signup_allowlist table (service-role only, no client access)
-- ---------------------------------------------------------

create table if not exists public.signup_allowlist (
  domain text primary key,
  created_at timestamptz not null default now()
);

alter table public.signup_allowlist enable row level security;

-- No client policies → default deny for anon/authenticated.
revoke all on public.signup_allowlist from anon, authenticated;
grant all on public.signup_allowlist to service_role;

-- ---------------------------------------------------------
-- Seed: restrict signups to @gmail.com
-- ---------------------------------------------------------

insert into public.signup_allowlist (domain)
values ('gmail.com')
on conflict (domain) do nothing;

-- ---------------------------------------------------------
-- Trigger function: enforce domain allowlist at signup time
-- ---------------------------------------------------------

create or replace function public.enforce_signup_domain_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(new.email));
  v_domain text;
  v_allowed boolean;
begin
  -- Extract domain after the last @
  v_domain := substring(v_email from '[^@]+$');

  -- If the allowlist is empty, allow everyone (open mode).
  if not exists (select 1 from public.signup_allowlist limit 1) then
    return new;
  end if;

  -- Check if the domain is in the allowlist.
  select exists (
    select 1 from public.signup_allowlist
    where domain = v_domain
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Signup is restricted to approved email domains.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------
-- Wire the trigger onto auth.users
-- ---------------------------------------------------------

drop trigger if exists enforce_signup_domain_allowlist on auth.users;

create trigger enforce_signup_domain_allowlist
before insert on auth.users
for each row
execute function public.enforce_signup_domain_allowlist();
