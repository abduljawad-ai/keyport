-- ============================================================================
-- Keyport.chat — initial schema
-- Secure BYOK AI chat: encrypted key vault, RLS-hardened data model.
--
-- Security model implemented here:
--   * Secret tables (user_vaults, api_keys):
--       - RLS enabled AND forced
--       - NO policies for anon/authenticated (default deny)
--       - table privileges explicitly revoked from anon/authenticated
--       - only service_role (used by Edge Functions) may access them
--   * provider_connections / usage_events: read-only for the browser
--   * messages: browser may insert only role='user', status='complete'
--     rows into conversations it owns
--   * all other tables: strict owner-only policies
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------
-- profiles
-- ---------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- user_vaults  (SECRET: wrapped per-user data keys)
-- ---------------------------------------------------------

create table if not exists public.user_vaults (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  algorithm text not null default 'A256GCM',
  key_wrapping_algorithm text not null default 'A256GCM',
  wrapped_data_key text not null,
  wrap_iv text not null,
  master_key_id text not null default 'v1',
  vault_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_vaults_set_updated_at
before update on public.user_vaults
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- provider_connections
-- ---------------------------------------------------------

create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null check (
    provider_id in (
      'openai',
      'anthropic',
      'google',
      'openai-compatible'
    )
  ),
  display_name text,
  enabled boolean not null default true,
  base_url text,
  organization_id text,
  project_id text,
  default_model_id text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_id),
  constraint openai_compatible_requires_base_url
    check (
      provider_id <> 'openai-compatible'
      or base_url is not null
    )
);

create trigger provider_connections_set_updated_at
before update on public.provider_connections
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- api_keys  (SECRET: encrypted provider API keys only)
-- ---------------------------------------------------------

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_connection_id uuid not null references public.provider_connections(id) on delete cascade,
  encrypted_key text not null,
  iv text not null,
  algorithm text not null default 'A256GCM',
  master_key_id text not null default 'v1',
  key_version integer not null default 1,
  status text not null default 'active' check (
    status in ('active', 'disabled', 'invalid')
  ),
  last_verified_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_connection_id)
);

create trigger api_keys_set_updated_at
before update on public.api_keys
for each row
execute function public.set_updated_at();

create index if not exists api_keys_user_id_idx
on public.api_keys (user_id);

-- ---------------------------------------------------------
-- conversations
-- ---------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  provider_id text,
  model_id text,
  system_prompt text,
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_id_idx
on public.conversations (user_id, updated_at desc);

create trigger conversations_set_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at();

alter table public.conversations
add constraint conversations_title_length
check (char_length(title) <= 140),
add constraint conversations_system_prompt_length
check (system_prompt is null or char_length(system_prompt) <= 20000);

-- ---------------------------------------------------------
-- messages
-- ---------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (
    role in ('user', 'assistant', 'system', 'tool')
  ),
  content text not null,
  provider_id text,
  model_id text,
  status text not null default 'complete' check (
    status in ('pending', 'streaming', 'complete', 'error')
  ),
  error text,
  input_tokens integer,
  output_tokens integer,
  cost_estimate numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_content_length check (char_length(content) <= 100000)
);

create index if not exists messages_conversation_seq_idx
on public.messages (conversation_id, seq asc);

create trigger messages_set_updated_at
before update on public.messages
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- usage_events
-- ---------------------------------------------------------

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  provider_id text,
  model_id text,
  input_tokens integer,
  output_tokens integer,
  cost_estimate numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_id_idx
on public.usage_events (user_id, created_at desc);

-- ---------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system',
  locale text not null default 'en',
  send_behavior text not null default 'enter-to-send',
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- security_events (optional audit logging, service-role only)
-- ---------------------------------------------------------

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- rate_limit_buckets (persistent rate limiting for Edge Functions)
-- Fixed-window counters keyed by "action:user_id". Written only by
-- service_role through the atomic increment_rate_limit() function.
-- ---------------------------------------------------------

create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  window_start timestamptz not null default now(),
  counter integer not null default 1,
  expires_at timestamptz not null
);

create index if not exists rate_limit_buckets_expires_idx
on public.rate_limit_buckets (expires_at);

-- Atomic fixed-window increment. Returns the new counter value and the
-- window start so callers can compute retry-after values.
create or replace function public.increment_rate_limit(
  p_bucket text,
  p_window_seconds integer
)
returns table (new_counter integer, window_start timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval := make_interval(secs => p_window_seconds);
  v_counter integer;
  v_window_start timestamptz;
begin
  insert into public.rate_limit_buckets (bucket_key, window_start, counter, expires_at)
  values (p_bucket, now(), 1, now() + v_window)
  on conflict (bucket_key) do update
  set
    window_start = case
      when public.rate_limit_buckets.window_start <= now() - v_window
        then now()
        else public.rate_limit_buckets.window_start
      end,
    counter = case
      when public.rate_limit_buckets.window_start <= now() - v_window
        then 1
        else public.rate_limit_buckets.counter + 1
      end,
    expires_at = now() + v_window
  returning public.rate_limit_buckets.counter,
            public.rate_limit_buckets.window_start
  into v_counter, v_window_start;

  return query select v_counter, v_window_start;
end;
$$;

-- The rate limit RPC is callable only by trusted server code.
revoke all on function public.increment_rate_limit(text, integer) from anon, authenticated;
grant execute on function public.increment_rate_limit(text, integer) to service_role;

-- ---------------------------------------------------------
-- Profile + settings bootstrap trigger
-- ---------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- ---------------------------------------------------------
-- Message ownership helper: messages inherit the owner of
-- their conversation regardless of the value supplied by the
-- client. This prevents cross-user message injection.
-- ---------------------------------------------------------

create or replace function public.set_message_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select c.user_id
  into new.user_id
  from public.conversations c
  where c.id = new.conversation_id;

  if new.user_id is null then
    raise exception 'Conversation not found';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_set_user_id on public.messages;

create trigger messages_set_user_id
before insert on public.messages
for each row
execute function public.set_message_user_id();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.user_vaults enable row level security;
alter table public.provider_connections enable row level security;
alter table public.api_keys enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.usage_events enable row level security;
alter table public.user_settings enable row level security;
alter table public.security_events enable row level security;
alter table public.rate_limit_buckets enable row level security;

-- ----------------------------------------------------------------------------
-- Secret tables: FORCE RLS, no client policies, revoke all client privileges.
-- Access is possible only with service_role (BYPASSRLS), which Edge
-- Functions use. No permissive policies are created for these tables.
-- ----------------------------------------------------------------------------

alter table public.user_vaults force row level security;
alter table public.api_keys force row level security;

revoke all on public.user_vaults from anon, authenticated;
revoke all on public.api_keys from anon, authenticated;

-- Audit + rate limit tables are also server-only.
revoke all on public.security_events from anon, authenticated;
revoke all on public.rate_limit_buckets from anon, authenticated;

-- ----------------------------------------------------------------------------
-- profiles: select/update own
-- ----------------------------------------------------------------------------

drop policy if exists "Users can select their own profile" on public.profiles;
create policy "Users can select their own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- provider_connections: READ-ONLY for the browser.
-- All writes happen exclusively through trusted Edge Functions
-- (service role). No insert/update/delete policies are created.
-- ----------------------------------------------------------------------------

drop policy if exists "Users can select their own provider connections" on public.provider_connections;
create policy "Users can select their own provider connections"
on public.provider_connections
for select
using (auth.uid() = user_id);

revoke insert, update, delete on public.provider_connections from anon, authenticated;

-- ----------------------------------------------------------------------------
-- conversations: full owner CRUD
-- ----------------------------------------------------------------------------

drop policy if exists "Users can select their own conversations" on public.conversations;
create policy "Users can select their own conversations"
on public.conversations
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own conversations" on public.conversations;
create policy "Users can insert their own conversations"
on public.conversations
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own conversations" on public.conversations;
create policy "Users can update their own conversations"
on public.conversations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own conversations" on public.conversations;
create policy "Users can delete their own conversations"
on public.conversations
for delete
using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- messages:
--   select messages in own conversations
--   insert ONLY role='user' AND status='complete' into own conversations
--   (assistant/system/tool rows are written by Edge Functions only)
--   delete messages in own conversations
-- ----------------------------------------------------------------------------

drop policy if exists "Users can select messages in their own conversations" on public.messages;
create policy "Users can select messages in their own conversations"
on public.messages
for select
using (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert user messages into their own conversations" on public.messages;
create policy "Users can insert user messages into their own conversations"
on public.messages
for insert
with check (
  role = 'user'
  and status = 'complete'
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete messages in their own conversations" on public.messages;
create policy "Users can delete messages in their own conversations"
on public.messages
for delete
using (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.user_id = auth.uid()
  )
);

-- Browser must never update messages (assistant rows are server-managed).
revoke update on public.messages from anon, authenticated;

-- ----------------------------------------------------------------------------
-- usage_events: READ-ONLY for the browser. Inserts happen only in
-- Edge Functions (service role). No insert policy is created.
-- ----------------------------------------------------------------------------

drop policy if exists "Users can select their own usage events" on public.usage_events;
create policy "Users can select their own usage events"
on public.usage_events
for select
using (auth.uid() = user_id);

revoke insert, update, delete on public.usage_events from anon, authenticated;

-- ----------------------------------------------------------------------------
-- user_settings: select/insert/update own
-- ----------------------------------------------------------------------------

drop policy if exists "Users can select their own settings" on public.user_settings;
create policy "Users can select their own settings"
on public.user_settings
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own settings" on public.user_settings;
create policy "Users can insert their own settings"
on public.user_settings
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own settings" on public.user_settings;
create policy "Users can update their own settings"
on public.user_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Explicit grants for non-secret tables (defense in depth: privileges match
-- the policies above).
-- ----------------------------------------------------------------------------

grant select, update on public.profiles to authenticated;
grant select on public.provider_connections to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant select on public.usage_events to authenticated;
grant select, insert, update on public.user_settings to authenticated;

-- service_role keeps full access (it has BYPASSRLS and default grants on
-- Supabase); asserted here explicitly for clarity.
grant all on public.profiles to service_role;
grant all on public.user_vaults to service_role;
grant all on public.provider_connections to service_role;
grant all on public.api_keys to service_role;
grant all on public.conversations to service_role;
grant all on public.messages to service_role;
grant all on public.usage_events to service_role;
grant all on public.user_settings to service_role;
grant all on public.security_events to service_role;
grant all on public.rate_limit_buckets to service_role;
