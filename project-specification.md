# PROJECT SPECIFICATION — PART 1 OF 4

# Secure BYOK AI Chat App with Supabase + Edge Functions

## 0. Purpose of this document

You are being given a precise product and engineering specification.

Your job is to build a secure, production-quality web application that allows users to bring their own AI provider API keys, store them encrypted in Supabase, and use them through Supabase Edge Functions without exposing plaintext API keys to the browser after submission.

You must not guess.
You must not invent extra architecture.
You must not create insecure shortcuts.
You must not produce placeholder logic unless explicitly told to do so.

If something is unclear, stop and ask for clarification.

---

## 1. Product overview

The app is a polished AI chat client where users can connect their own API keys for AI providers such as OpenAI, Anthropic, Google, or OpenAI-compatible providers.

The product must support:

- user authentication
- encrypted storage of user API keys
- cross-device usage without re-entering API keys
- chat conversations
- model selection
- streaming AI responses
- provider connection testing
- usage tracking
- secure backend-mediated AI requests

The application must be designed with strong security and privacy requirements.

The most important rule is:

> User API keys must not be stored in plaintext in the browser, must not be kept in localStorage, and must not be returned to the client after initial submission.

---

## 2. Core product promise

The user should be able to:

1. create an account
2. sign in
3. add an API key once
4. use that API key on any device
5. chat with supported AI models
6. never need to paste the same API key again after login

The app must feel smooth and modern.

The security model must assume that users may log in from multiple browsers and devices.

---

## 3. Recommended architecture

The application must use the following architecture:

### Frontend

- React
- TypeScript
- Vite
- Supabase JS client
- modern component-based UI
- clean local state management
- streaming-capable fetch client

### Backend / cloud layer

- Supabase Auth
- Supabase Postgres
- Supabase Storage is not used in v1 unless attachments are explicitly added in a later spec.
- Supabase Edge Functions

### AI provider calls

All AI provider requests must be made from Supabase Edge Functions, not from the browser.

The browser must never directly call AI providers using stored user API keys.

Instead:

1. the frontend sends a chat request to a Supabase Edge Function
2. the Edge Function authenticates the user
3. the Edge Function fetches the encrypted API key from Postgres
4. the Edge Function decrypts the API key in server memory
5. the Edge Function calls the AI provider
6. the Edge Function streams the AI response back to the frontend
7. the plaintext API key is never returned to the frontend

This is mandatory.

---

## 4. Why this architecture is required

This architecture is chosen because:

- users should not re-enter API keys on every device
- API keys must sync securely with the account
- plaintext keys must not remain in browser storage
- XSS in the frontend should not expose stored API keys
- provider calls can be centralized, validated, and logged safely
- CORS issues with AI providers can be handled server-side
- usage tracking and rate limiting can be enforced server-side

You must preserve all of these properties.

---

## 5. Security model

### 5.1 Absolute security rules

You must follow all of these rules:

1. Do not store API keys in localStorage
2. Do not store API keys in sessionStorage
3. Do not store API keys in IndexedDB
4. Do not store plaintext API keys in browser state after submission
5. Do not return plaintext API keys from any API
6. Do not expose the Supabase service role key to the frontend
7. Do not expose the master encryption key to the frontend
8. Do not log API keys
9. Do not log authorization headers
10. Do not put API keys in URLs
11. Do not use base64 encoding as a substitute for encryption
12. Do not decrypt API keys in the browser unless explicitly specified in a later optional local-mode extension
13. Do not send decrypted API keys to the client under any circumstance
14. The initial API key submission necessarily passes through browser form state at the moment the user types or pastes it. It must be cleared immediately after submission and must never be persisted, logged, or returned afterward.

### 5.2 Encryption model

API keys must be encrypted before being stored in Postgres.

Use real encryption.

Do not use simple encoding.

Recommended encryption approach:

- AES-GCM
- 256-bit key
- random IV per encryption operation
- store ciphertext + IV + auth tag
- store algorithm identifier
- store key version
- use a per-user data encryption key wrapped by a server-side master encryption key

The frontend must never know the master encryption key.

Only Supabase Edge Functions may perform decryption.

### 5.3 Per-user key design

Each user should have their own encrypted data key.

Conceptually:

- a master encryption key exists only in Edge Function secrets
- when a user first needs secret storage, generate a random per-user data key
- encrypt that data key with the master key
- store the wrapped data key in the database
- use that per-user data key to encrypt the user's API keys

This satisfies the requirement that encryption material is different per user while still being managed automatically.

### 5.4 Authentication model

Use Supabase Auth.

The app must support:

- sign up
- sign in
- sign out
- password reset
- session persistence
- protected routes

For v1, session handling should use Supabase Auth in a secure and practical way.

Do not create a custom authentication system unless explicitly instructed.

---

## 6. Functional requirements

### 6.1 Authentication

The app must allow users to:

- create an account
- sign in
- sign out
- recover access via password reset
- remain signed in across sessions where appropriate

All private app pages must require authentication.

### 6.2 Provider API key management

The app must allow users to:

- add an API key for a supported provider
- test the API key
- see whether a provider is connected
- view masked key metadata
- delete a stored API key
- replace an existing API key

The app must not show the full API key after it has been saved.

The UI may show masked metadata only, for example:

- provider name
- status
- created date
- last used date
- key label
- partial masked identifier if safe

The plaintext key must never be fetched again.

### 6.3 Chat

The app must allow users to:

- create conversations
- send messages
- receive streamed assistant responses
- choose a provider and model
- stop generation
- retry failed requests
- view error states
- see connection/status indicators

Chat requests must go through the secure backend Edge Function.

### 6.4 Cross-device behavior

Once a user has added an API key, it must be available when the user signs in on another device.

The user should not need to re-enter the API key.

This is a core requirement.

---

## 7. Non-goals for the first version

Do not build the following unless explicitly instructed later:

- public sharing of chats
- team workspaces
- billing system
- admin dashboard
- plugin architecture
- browser extension
- mobile native app
- desktop app
- local-only offline mode
- client-side decrypted key vault mode
- multi-tenant organization management
- advanced analytics
- social features

Account export and account deletion are not included in v1, but should be planned for a future release.

Focus only on the secure core product.

---

## 8. Product behavior principles

The app must behave in a predictable, secure, polished way.

### 8.1 Empty states

Every major screen must have a proper empty state.

Examples:

- no conversations yet
- no provider connected
- no messages in conversation
- no API keys stored

### 8.2 Loading states

Every async action must have a clear loading state.

Examples:

- signing in
- saving API key
- testing API key
- sending chat message
- streaming response
- loading conversations

### 8.3 Error states

Every failure must show a user-friendly error.

Examples:

- invalid API key
- provider unavailable
- network error
- unauthorized
- rate limited
- model not supported
- decryption failed
- server error

Do not show raw secrets in error messages.

### 8.4 Success states

Important actions must give clear feedback.

Examples:

- API key saved successfully
- provider connected
- message sent
- conversation deleted
- settings saved

---

## 9. High-level user flows

### 9.1 New user flow

1. user lands on the app
2. user signs up
3. user is taken to onboarding or dashboard
4. user adds first provider API key
5. app tests the key
6. app stores encrypted key
7. user starts first chat

### 9.2 Returning user flow

1. user signs in
2. app loads conversations and provider status
3. user selects conversation or creates a new one
4. user sends a message
5. Edge Function uses stored encrypted key to call provider
6. response streams back into chat

### 9.3 New device flow

1. user signs in on another browser/device
2. app loads saved provider connections
3. stored encrypted keys are already available server-side
4. user can chat immediately without re-entering API keys

This last flow is critical.

---

## 10. Trust model

This architecture means the backend is trusted to process API keys.

That is acceptable for this product.

However, the implementation must still minimize trust as much as possible:

- store only encrypted keys
- decrypt only when necessary
- never return keys to the client
- avoid logging sensitive data
- restrict database access
- use strong validation
- use secure auth checks

Do not market the app as fully end-to-end encrypted unless a later spec explicitly adds that.

For now, the correct description is:

> API keys are stored encrypted and used server-side only. They are not returned to the browser.
In v1, the frontend uses a Supabase browser session. If a successful XSS attack occurs, an attacker may still be able to perform authenticated actions such as sending chat requests or deleting provider keys, even if stored API keys cannot be read directly from browser storage. This risk must be reduced through strict CSP, sanitization, dependency auditing, secure session handling, and future consideration of HTTP-only cookie-based session handling.

---

## 11. Technical constraints

You must use:

- Supabase Auth
- Supabase Postgres
- Supabase Edge Functions
- React + TypeScript frontend

You must not:

- build a separate custom Node backend unless explicitly required
- store secrets in frontend environment variables
- call provider APIs directly from the browser using saved keys
- create insecure custom crypto primitives
- rely on plaintext database columns for API keys
- use fake security through obscurity

---

## 12. Code quality rules

You must produce production-quality code.

### Required qualities

- strongly typed
- modular
- readable
- testable
- secure
- maintainable
- free of dead code
- free of unused placeholder stubs unless instructed

### Forbidden

- hardcoded secrets
- fake encryption
- base64-only “encryption”
- TODO logic in critical paths
- silent security failures
- unvalidated user input
- leaked sensitive data in logs
- direct client access to secret tables

---

## 13. Implementation discipline

You must follow this discipline:

1. implement the data model first
2. implement security rules next
3. implement Edge Functions next
4. implement frontend integration last
5. add polished UI states after core functionality works
6. add tests for security-critical paths

Do not skip ahead.
Do not create a UI that depends on nonexistent backend behavior.
Do not assume provider response formats without validation.

---

## 14. Definition of done for the core system

The system is not done until all of the following are true:

- users can sign up and sign in
- users can add an API key once
- API key is encrypted before storage
- API key is never returned to the client
- user can use that key on another device after login
- chat messages are processed through Edge Functions
- AI responses stream correctly
- errors are handled cleanly
- no plaintext key appears in browser storage
- no plaintext key appears in server logs
- database access is properly restricted
- user-supplied provider base URLs are SSRF-safe and validated server-side

---

## 15. What this part establishes

This Part 1 establishes the product direction and non-negotiable architecture:

- Supabase is the account and data layer
- API keys are stored encrypted
- decryption happens only in Edge Functions
- provider calls happen server-side
- users get cross-device key availability without re-entering keys
- the frontend must never receive stored plaintext keys

The next parts will define:

- exact database schema
- exact encryption storage format
- exact RLS strategy
- exact Edge Function contracts
- exact frontend structure and implementation plan

Do not start coding based only on this part unless explicitly told that this is sufficient.

Wait for the remaining specification parts.

END OF PART 1

# PROJECT SPECIFICATION — PART 2 OF 4

# Supabase Database Schema, Encryption Model, RLS Rules, and Secret Handling

This part defines the exact data model, encryption design, Row Level Security strategy, and secret-handling rules for the application.

You must implement this exactly as specified unless explicitly told otherwise.

---

## 1. Core database principles

The database must be designed around these rules:

1. User API keys must never be stored in plaintext.
2. Only encrypted API key material may be stored in Postgres.
3. The frontend must never have direct access to encrypted secret tables.
4. Only trusted Supabase Edge Functions may read or write secret tables.
5. All non-secret user data must be protected with Row Level Security.
6. Every user must only be able to access their own data.
7. No plaintext API key may appear in logs, error messages, URLs, or client state.

---

## 2. Required Supabase environment secrets

The following secrets must exist only in the Supabase Edge Function environment.

They must never be exposed to the frontend.

### Required secrets

```txt
MASTER_ENCRYPTION_KEY
MASTER_ENCRYPTION_KEY_ID
```

### Meaning

#### `MASTER_ENCRYPTION_KEY`

- a base64-encoded 32-byte AES-256 key
- used only by Edge Functions
- used to wrap and unwrap per-user data keys
- must never be sent to the browser
- must never be committed to source control

#### `MASTER_ENCRYPTION_KEY_ID`

- identifies the current master key version
- example value: `v1`
- used for future key rotation
- stored alongside encrypted records so old records can be identified

---

## 3. Encryption model

The app must use envelope encryption.

### 3.1 Master key

- exists only in Edge Function secrets
- used to encrypt per-user data keys
- never touches the client

### 3.2 Per-user data key

- randomly generated per user
- used to encrypt that user’s API keys
- wrapped/encrypted by the master key
- stored only in encrypted form in the database

### 3.3 API key encryption

Each API key must be encrypted with the user’s data key using AES-GCM.

### 3.4 Required algorithm

Use:

```txt
AES-GCM
256-bit key
12-byte random IV
```

The ciphertext output must include the authentication tag.

### 3.5 Storage encoding

Store encrypted binary values as base64-encoded text.

This base64 encoding is only a storage representation.

It is not security.

The actual protection must come from AES-GCM encryption.

---

## 4. Encryption storage format

For the user vault:

```txt
wrapped_data_key = base64(AES-GCM ciphertext of the raw per-user data key)
wrap_iv          = base64(12-byte IV used when wrapping the data key)
```

For each API key:

```txt
encrypted_key = base64(AES-GCM ciphertext of the UTF-8 API key)
iv            = base64(12-byte IV used when encrypting the API key)
```

Do not store authentication tags as separate columns unless the crypto implementation you use explicitly requires it.

If using WebCrypto AES-GCM, the ciphertext output already includes the auth tag.

---

## 5. Required database tables

The following tables are required.

---

## 6. SQL schema

Use the following schema as the source of truth.

```sql
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
-- user_vaults
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
-- api_keys
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

create index api_keys_user_id_idx
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

create index conversations_user_id_idx
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

create index messages_conversation_seq_idx
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

create index usage_events_user_id_idx
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
-- security_events (optional audit logging)
-- ---------------------------------------------------------

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
```

---

## 7. Profile creation trigger

When a new auth user is created, a profile row must be created automatically.

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
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
```

---

## 8. Message ownership helper

Messages must inherit the owner of the conversation.

```sql
create or replace function public.set_message_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select user_id
  into new.user_id
  from public.conversations
  where id = new.conversation_id;

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
```

---

## 9. Row Level Security rules

Enable Row Level Security on every table.

```sql
alter table public.profiles enable row level security;
alter table public.user_vaults enable row level security;
alter table public.provider_connections enable row level security;
alter table public.api_keys enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.usage_events enable row level security;
alter table public.user_settings enable row level security;

alter table public.user_vaults force row level security;
alter table public.api_keys force row level security;
revoke all on public.user_vaults from anon, authenticated;
revoke all on public.api_keys from anon, authenticated;
```

---

## 10. Secret tables must have no client policies

The following tables must not be directly readable or writable by the browser:

- `public.user_vaults`
- `public.api_keys`

Do not create permissive RLS policies for these tables.

Only Supabase Edge Functions using the service role may access them.

This is mandatory.

---

## 11. RLS policies for non-secret tables

### profiles

```sql
create policy "Users can select their own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Users can update their own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);
```

### provider_connections

create policy "Users can select their own provider connections"
on public.provider_connections
for select
using (auth.uid() = user_id);

- All writes to provider_connections must happen only through trusted Edge Functions.

### conversations

```sql
create policy "Users can select their own conversations"
on public.conversations
for select
using (auth.uid() = user_id);

create policy "Users can insert their own conversations"
on public.conversations
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own conversations"
on public.conversations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own conversations"
on public.conversations
for delete
using (auth.uid() = user_id);
```

### messages

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

### usage_events

```sql
create policy "Users can select their own usage events"
on public.usage_events
for select
using (auth.uid() = user_id);


### user_settings

```sql
create policy "Users can select their own settings"
on public.user_settings
for select
using (auth.uid() = user_id);

create policy "Users can insert their own settings"
on public.user_settings
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own settings"
on public.user_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

---

## 12. Edge Function access rules

Only trusted Edge Functions may access secret data.

### Allowed

Edge Functions may:

- read `user_vaults` using the service role
- read `api_keys` using the service role
- insert into `user_vaults`
- insert into `api_keys`
- update `api_keys.status`
- update `api_keys.last_verified_at`
- update `api_keys.last_used_at`
- insert/update provider_connections as part of trusted key-saving or provider-setting flows

### Forbidden

The frontend must never:

- query `user_vaults`
- query `api_keys`
- receive encrypted secret rows directly
- receive plaintext API keys from the backend
- receive master encryption keys
- receive per-user data keys

---

## 13. Secret handling rules for Edge Functions

All Edge Functions must follow these rules:

1. Verify the authenticated user before doing anything else.
2. Never trust a `user_id` supplied in the request body.
3. Use only the authenticated user’s ID from the verified session/token.
4. Fetch only the secret rows belonging to that user.
5. Decrypt only when necessary.
6. Keep plaintext keys in memory only for the shortest possible time.
7. Never return plaintext keys to the client.
8. Never log plaintext keys.
9. Never log request headers containing credentials.
10. Never include secrets in error messages.
11. Redact sensitive fields before logging.
12. Fail closed if authentication or decryption fails.

---

## 14. API key lifecycle

The API key lifecycle must work like this:

### 14.1 Add key

1. user submits API key once in the frontend
2. frontend sends it over HTTPS to a trusted Edge Function
3. Edge Function validates the request
4. Edge Function ensures the user has a vault
5. Edge Function encrypts the API key with the user’s data key
6. Edge Function stores the encrypted key in `api_keys`
7. Edge Function returns only non-secret metadata

### 14.2 Use key

1. user sends a chat request
2. Edge Function verifies authentication
3. Edge Function fetches the encrypted key
4. Edge Function fetches the user vault
5. Edge Function unwraps the user data key using the master key
6. Edge Function decrypts the API key
7. Edge Function calls the AI provider
8. Edge Function streams the response back
9. Edge Function may update usage metadata

### 14.3 Delete key

1. user requests deletion
2. Edge Function verifies ownership
3. Edge Function deletes the encrypted key row
4. no plaintext key is ever recovered or shown

---

## 15. Required validation rules

### Provider IDs

Allowed values:

```txt
openai
anthropic
google
openai-compatible
```

### API key format

- must be a non-empty string
- must be within a reasonable length limit
- must be trimmed before validation
- must not be logged
- must not be stored in plaintext

### Base URL rules

For openai-compatible providers:

- base_url is required
- base_url must be a valid absolute URL
- base_url must use https:// in production
- base_url must not contain embedded credentials
- base_url must not point to localhost, loopback addresses, private IP ranges, link-local addresses, or cloud metadata endpoints
- the hostname must resolve to a public address before any request is made
- redirects must either be disabled or every redirect target must pass the same safety validation
- http:// may be allowed only for localhost/127.0.0.1 if an explicit development flag is enabled

### User input validation

All Edge Function inputs must be validated before processing.

Do not trust client-supplied data.

---

## 16. What the frontend may know about API keys

The frontend may know only non-secret metadata.

Examples of allowed metadata:

- provider name
- provider connection ID
- whether a key exists
- key status
- created date
- last verified date
- last used date
- display label

The frontend must never know:

- plaintext API key
- encrypted API key ciphertext
- per-user data key
- master key
- IVs unless explicitly required for a local-mode extension

If the frontend needs to show that a key exists, it must receive that information from an Edge Function response, not by querying secret tables directly.

---

## 17. Database access summary

Direct browser access allowed:

- profiles: select/update own
- provider_connections: read-only
- conversations: select/insert/update/delete own
- messages: select own, insert user messages only, delete own if enabled
- usage_events: read-only
- user_settings: select/insert/update own

Direct browser access forbidden:

- user_vaults
- api_keys

---

## 18. Backup and recovery implications

Because only encrypted API keys are stored:

- database backups do not contain plaintext API keys
- restoring a database without the master key does not expose API keys
- master key rotation must be handled deliberately
- losing the master key can make encrypted secrets unrecoverable

The master encryption key must therefore be treated as critical infrastructure.

---

## 19. Implementation requirements

You must implement:

1. the full schema above
2. the triggers above
3. RLS exactly as specified
4. no direct client access to secret tables
5. Edge Function-only access to vault and key tables
6. secure validation rules
7. safe error handling
8. no plaintext secret logging

Do not simplify this in a way that weakens security.

Do not create helper shortcuts that expose secret tables to the frontend.

---

## 20. Definition of done for Part 2

This part is complete only when:

- all tables exist
- all triggers exist
- RLS is enabled everywhere
- secret tables have no browser-accessible policies
- non-secret tables have strict owner-only policies
- the encryption model is clearly implementable
- the frontend is blocked from direct secret access
- Edge Functions are established as the only trusted path for secret handling

END OF PART 2

# PROJECT SPECIFICATION — PART 3 OF 4

# Supabase Edge Function Contracts, API Behavior, Streaming Rules, and Error Handling

This part defines the exact backend behavior of the Supabase Edge Functions.

You must implement these functions exactly as specified.

Do not invent additional endpoints unless explicitly instructed.
Do not expose secrets.
Do not return plaintext API keys.
Do not trust client-supplied user IDs.

---

## 1. Edge Function architecture

The backend must be implemented using Supabase Edge Functions.

The required functions are:

```txt
save-api-key
test-api-key
list-provider-keys
delete-api-key
chat
```

These functions are the only allowed path for:

- storing API keys
- testing API keys
- listing secure provider/key metadata
- deleting API keys
- making AI provider requests using stored API keys

The frontend must not perform any of these actions directly against secret tables.

---

## 2. Runtime requirements

Use the Supabase Edge Functions runtime.

### Required environment values

The functions may use:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
MASTER_ENCRYPTION_KEY
MASTER_ENCRYPTION_KEY_ID
FRONTEND_ORIGIN
ALLOW_LOCAL_PROVIDER_URLS
```

Optional development-only flag: `ALLOW_LOCAL_PROVIDER_URLS` defaults to false. If false, localhost/base URLs using http must be rejected.

### Rules

- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to the frontend
- `MASTER_ENCRYPTION_KEY` must never be exposed to the frontend
- all functions must use HTTPS
- all functions must validate input
- all functions must verify the authenticated user
- all functions must fail securely

---

## 3. Authentication rules for every Edge Function

Every Edge Function must authenticate the user before doing anything else.

### Required behavior

1. Read the `Authorization` header.
2. Expect the format:

```txt
Authorization: Bearer <supabase_access_token>
```

1. Verify the token using Supabase Auth.
2. Extract the authenticated user ID from the verified token/session.
3. Use only that user ID.

### Forbidden behavior

Do not trust any of the following as identity:

- `user_id` in request body
- `user_id` in query string
- unverified headers
- client-provided session objects

### Unauthorized response

If authentication fails, return:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Authentication is required."
  }
}
```

HTTP status: `401`

---

## 4. Standard error response format

All non-streaming errors must use this shape:

```json
{
  "error": {
    "code": "error_code_here",
    "message": "Human-readable message",
    "details": {}
  }
}
```

### Required error codes

Use these codes where appropriate:

```txt
unauthorized
forbidden
validation_error
not_found
missing_api_key
invalid_api_key
decryption_failed
provider_error
rate_limited
model_not_supported
internal_error
```

### Error rules

- do not expose secrets
- do not expose upstream provider headers
- do not expose stack traces unless in development
- do not return plaintext API keys
- do not return encrypted key material
- sanitize upstream provider errors before returning them

---

## 5. CORS rules

Each Edge Function must handle CORS safely.

### Requirements

- allow only explicitly configured frontend origins
- FRONTEND_ORIGIN may be a comma-separated list
- if FRONTEND_ORIGIN is missing, reject cross-origin requests
- never use wildcard * in production
- handle OPTIONS preflight requests
- allow headers: Authorization, Content-Type
- allow only methods relevant to the function

### Example allowed origin source

Use:

```txt
FRONTEND_ORIGIN
```

Do not hardcode production URLs in function code unless explicitly instructed.

---

## 6. Shared internal helpers

You must create shared helper modules for Edge Functions.

The shared modules must include:

```txt
auth
supabase admin client
crypto
validation
errors
provider adapters
streaming utilities
redaction utilities
urlSafety
rateLimit
```

urlSafety helper

- validates user-supplied base URLs
- blocks private/internal hosts
- blocks unsafe redirects
- allows localhost only when explicitly enabled for development

rateLimit helper

- enforces per-user limits for sensitive endpoints
- prevents abusive testing/chat/save bursts

requestId helper

- generates a request ID for each request
- attaches it to logs and safe error metadata

### Required helper behavior

#### auth helper

- verifies the Supabase access token
- returns the authenticated user
- rejects invalid tokens

#### supabase admin helper

- creates a service-role Supabase client
- used only inside Edge Functions
- never exposed to frontend

#### crypto helper

- unwraps per-user data keys
- encrypts API keys
- decrypts API keys
- uses AES-GCM
- uses base64 storage encoding as defined in Part 2

#### validation helper

- validates request bodies
- validates provider IDs
- validates URLs
- validates message payloads

#### redaction helper

- removes secrets from logs
- removes authorization headers from logged data
- removes API key strings from error details

---

## 7. Provider adapter requirements

You must implement a provider adapter layer inside Edge Functions.

### Supported providers for v1

```txt
openai
anthropic
google
openai-compatible
```

### Provider adapter interface

Each provider adapter must support at least:

```ts
testConnection(credentials): Promise<TestResult>
streamChat(request): AsyncIterable<NormalizedStreamChunk>
```

### TestResult shape

```ts
type TestResult =
  | { ok: true; message?: string }
  | { ok: false; code: string; message: string };
```

### NormalizedStreamChunk shape

At minimum:

```ts
type NormalizedStreamChunk =
  | { type: "text_delta"; text: string }
  | { type: "usage"; input_tokens?: number; output_tokens?: number }
  | { type: "done" }
  | { type: "error"; code: string; message: string };
```

### Provider rules

- provider-specific request formatting must be handled inside the adapter
- provider-specific streaming formats must be normalized
- API keys must only be used inside the adapter call
- provider adapters must not log secrets
- provider adapters must support abort signals
- For openai-compatible providers, the adapter must call a safe URL guard before making any request. Requests must not be sent to private/internal hosts, and redirects must either be disabled or revalidated using the same safety rules.

---

## 8. Provider connection testing rules

The app must test API keys before storing them when possible.

### Testing goals

Verify that:

- the key format is plausible
- the provider accepts the key
- the key has basic access to required API endpoints

### Testing rules

1. Do not store an API key if testing fails.
2. Do not return the API key in the error response.
3. Do not store keys that cannot be validated unless explicitly configured otherwise.
4. If a provider has a low-cost or no-cost validation endpoint, prefer it.
5. If a provider requires a minimal paid request for validation, document that clearly in code comments and keep the request as small as possible.

### Practical test endpoints

Use provider-appropriate lightweight checks.

Examples:

- OpenAI: list models
- OpenAI-compatible: list models at `{base_url}/models`
- Anthropic: list models if available, otherwise minimal valid API check
- Google: list models or equivalent lightweight API check

Do not hardcode behavior that depends on undocumented endpoints.

If a provider’s testing mechanism is uncertain, implement a clearly isolated provider test module and mark it for review.

---

## 9. Function 1: `save-api-key`

### Purpose

Store a user API key securely.

### Method

```txt
POST
```

### Route

```txt
/functions/v1/save-api-key
```

### Required headers

```txt
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Request body

```json
{
  "provider_id": "openai",
  "api_key": "sk-...",
  "label": "Work key",
  "base_url": null,
  "organization_id": null,
  "project_id": null,
  "default_model_id": null
}
```

### Allowed `provider_id` values

```txt
openai
anthropic
google
openai-compatible
```

### Validation rules

- `provider_id` is required
- `api_key` is required
- `api_key` must be a non-empty string
- `api_key` must be trimmed before processing
- `api_key` must not be logged
- if `provider_id` is `openai-compatible`, `base_url` is required
- `base_url`, if present, must be a valid URL
- `base_url` must use HTTPS in production
- localhost HTTP may be allowed only if explicitly enabled for local development

### Required behavior

1. Authenticate the user.
2. Validate the request body.
3. Test the API key using the appropriate provider adapter.
4. If the test fails, return an error and do not store the key.
5. Upsert the user’s provider_connections row using the service role.
6. Ensure the user has a vault in user_vaults using idempotent, race-safe logic.
7. If no vault exists:
   - generate a new random per-user data key
   - wrap it with the master key
   - store the wrapped key and IV
8. Encrypt the submitted API key using the per-user data key.
9. Insert or replace the existing api_keys row for that provider connection.
10. Use transactional or safely idempotent logic so partial failure does not leave inconsistent state.
11. Return only non-secret metadata.

### Success response

HTTP status: `200`

```json
{
  "success": true,
  "provider_connection": {
    "id": "uuid",
    "provider_id": "openai",
    "display_name": "Work key",
    "enabled": true,
    "base_url": null,
    "organization_id": null,
    "project_id": null,
    "default_model_id": null
  },
  "api_key_metadata": {
    "status": "active",
    "created_at": "2026-01-01T00:00:00.000Z",
    "last_verified_at": "2026-01-01T00:00:00.000Z",
    "last_used_at": null
  }
}
```

### Forbidden response content

Do not return:

- `api_key`
- `encrypted_key`
- `iv`
- `wrapped_data_key`
- `wrap_iv`
- master key
- per-user data key

### Error cases

Return appropriate errors for:

- missing authentication
- invalid input
- unsupported provider
- invalid API key
- provider unreachable
- internal encryption failure

---

## 10. Function 2: `test-api-key`

### Purpose

Test either:

1. a newly submitted API key before saving, or
2. an already stored API key for an existing provider connection

### Method

```txt
POST
```

### Route

```txt
/functions/v1/test-api-key
```

### Request body option A: test a new key

```json
{
  "provider_id": "openai",
  "api_key": "sk-...",
  "base_url": null,
  "organization_id": null,
  "project_id": null
}
```

### Request body option B: test an existing stored key

```json
{
  "provider_connection_id": "uuid"
}
```

### Required behavior

#### Option A

1. Authenticate user.
2. Validate input.
3. Test the submitted key directly.
4. Do not store anything.
5. Return test result.

#### Option B

1. Authenticate user.
2. Validate `provider_connection_id`.
3. Verify the provider connection belongs to the user.
4. Fetch the encrypted API key.
5. Decrypt it inside the Edge Function.
6. Test it with the provider.
7. Return test result.
8. Do not return the key.

### Success response

```json
{
  "success": true,
  "ok": true,
  "message": "API key is valid."
}
```

### Failure response

```json
{
  "success": true,
  "ok": false,
  "code": "invalid_api_key",
  "message": "The provider rejected the API key."
}
```

Use HTTP `200` for completed test results where the test itself ran successfully but the key failed.

Use HTTP error statuses only for request/authentication/validation/internal failures.

---

## 11. Function 3: `list-provider-keys`

### Purpose

Return non-secret provider/key metadata for the signed-in user.

### Method

```txt
GET
```

### Route

```txt
/functions/v1/list-provider-keys
```

### Required headers

```txt
Authorization: Bearer <access_token>
```

### Required behavior

1. Authenticate user.
2. Fetch the user’s provider connections.
3. Fetch related API key metadata using the service role.
4. Return only non-secret fields.

### Success response

```json
{
  "providers": [
    {
      "provider_connection": {
        "id": "uuid",
        "provider_id": "openai",
        "display_name": "Work key",
        "enabled": true,
        "base_url": null,
        "organization_id": null,
        "project_id": null,
        "default_model_id": null
      },
      "api_key_metadata": {
        "exists": true,
        "status": "active",
        "created_at": "2026-01-01T00:00:00.000Z",
        "last_verified_at": "2026-01-01T00:00:00.000Z",
        "last_used_at": "2026-01-02T00:00:00.000Z"
      }
    }
  ]
}
```

### Rules

- never return encrypted key material
- never return ciphertext
- never return IVs
- never return plaintext keys
- if no key exists, return `exists: false`

---

## 12. Function 4: `delete-api-key`

### Purpose

Delete a stored API key.

### Method

```txt
POST
```

### Route

```txt
/functions/v1/delete-api-key
```

### Request body

```json
{
  "provider_connection_id": "uuid"
}
```

### Required behavior

1. Authenticate user.
2. Validate input.
3. Verify the provider connection belongs to the user.
4. Delete the related API key row.
5. Do not delete the provider connection unless explicitly requested by a future spec.
6. Return success.

### Success response

```json
{
  "success": true
}
```

### Error cases

- unauthorized
- not found
- forbidden
- validation error

---

## 13. Function 5: `chat`

### Purpose

Send a chat completion request using a stored encrypted API key.

This is the core AI request endpoint.

### Method

```txt
POST
```

### Route

```txt
/functions/v1/chat
```

### Required headers

```txt
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Optional streaming header

```txt
Accept: text/event-stream
```

### Request body

```json
{
  "conversation_id": "uuid",
  "user_message_id": "uuid",
  "provider_connection_id": "uuid",
  "model": "gpt-4o-mini",
  "params": {
    "temperature": 0.7,
    "max_tokens": 1024,
    "top_p": 1,
    "stop": []
  },
  "stream": true,
  "idempotency_key": "uuid"
}
```

### Field rules

#### Required

- `conversation_id`
- `user_message_id`

#### Optional

- `provider_connection_id`
- `model`
- `params`
- `stream`
- `idempotency_key` (if provided, the chat function should avoid creating duplicate assistant attempts for repeated retries of the same user message)

### Provider resolution rules

Use this order:

1. If `provider_connection_id` is provided, use it.
2. Otherwise, if the conversation has a stored provider, use the user’s matching enabled provider connection.
3. Otherwise, if the user has exactly one enabled provider connection with an active key, use it.
4. Otherwise, return a validation error asking the user to choose a provider.

### Model resolution rules

Use this order:

1. request `model`
2. conversation `model_id`
3. provider connection `default_model_id`

If no model can be resolved, return:

```json
{
  "error": {
    "code": "validation_error",
    "message": "No model was selected."
  }
}
```

### Required behavior

1. Authenticate user.
2. Validate request body.
3. Verify the conversation belongs to the authenticated user.
4. Verify the user message belongs to the conversation and has role `user`.
5. Resolve the provider connection.
6. Verify the provider connection belongs to the user.
6.1 Verify the provider connection is enabled.
6.2 Verify the related API key status is active.
7. Verify an active encrypted API key exists.
8. Fetch the user vault.
9. Unwrap the per-user data key.
10. Decrypt the API key in memory.
11. Load conversation history from the database.
12. Build the provider request.
13. Insert an assistant message row with status `streaming`.
14. Call the provider adapter.

- If the provider returns a clear authentication failure, mark the API key status as invalid and return a safe `invalid_api_key` error.

15. Stream normalized text deltas back to the client.
2. Capture usage if provided by the provider.
3. Finalize the assistant message in the database.
4. Insert a usage event if usage data exists.
5. Update `api_keys.last_used_at`.

---

## 14. Conversation history rules

When building the request for the AI provider:

### Required behavior

- load messages ordered by `seq` ascending
- Exclude assistant messages with status `error` and empty content from provider context.
- include the conversation’s `system_prompt` as the first system message if present
- include the user message that triggered the request
- include prior messages as context
- do not include message rows from other users
- do not include unrelated database data

### Limits for v1

Use safe default limits:

- maximum of 100 messages loaded
- truncate oldest messages if limit is exceeded
- preserve the latest user message
- preserve the system prompt if present

These limits may be refined later.

---

## 15. Streaming response format

When `stream` is true, the response must use Server-Sent Events.

### Response headers

```txt
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### Required SSE events

#### start event

Sent after the assistant message row is created.

```txt
event: start
data: {"assistant_message_id":"uuid"}
```

#### delta event

Sent for each text chunk.

```txt
event: delta
data: {"content":"partial text"}
```

#### usage event

Sent if usage information becomes available.

```txt
event: usage
data: {"input_tokens":123,"output_tokens":456}
```

#### done event

Sent when the provider stream completes successfully.

```txt
event: done
data: {"assistant_message_id":"uuid","status":"complete"}
```

#### error event

Sent if an error occurs during streaming.

```txt
event: error
data: {"code":"provider_error","message":"Safe error message"}
```

### Error phase rules

- If an error occurs before the start event is sent, return a standard JSON error response.
- If an error occurs after the start event is sent, emit an SSE error event and close the stream safely.

### Streaming rules

- normalize provider-specific stream formats into plain text deltas
- do not send raw provider payloads directly to the client unless sanitized and normalized
- do not send secrets in stream metadata
- support abort/cancellation
- if the client disconnects, abort the upstream provider request when possible
- save partial content if any was received
- mark the assistant message appropriately depending on completion state
- If no provider data has been sent for 15 seconds, emit a harmless SSE heartbeat comment to reduce the risk of intermediate timeouts.

### Recommended partial completion behavior

If the stream is interrupted but some content was already received:

- store the received partial content
- mark the message status as `complete`
- add metadata:

```json
{
  "interrupted": true
}
```

If no content was received:

- mark the message status as `error`
- store a safe error message

---

## 16. Non-streaming response format

If `stream` is false, return a JSON response.

### Success response

```json
{
  "success": true,
  "assistant_message_id": "uuid",
  "status": "complete",
  "content": "Full assistant response text",
  "usage": {
    "input_tokens": 123,
    "output_tokens": 456
  }
}
```

### Error response

Use the standard error format.

---

## 17. Chat database updates

The `chat` Edge Function must update the database safely.

### Before provider call

Insert assistant message:

```txt
role = assistant
status = streaming
conversation_id = current conversation
user_id = authenticated user
provider_id = resolved provider
model_id = resolved model
content = ''
```

### After successful completion

Update assistant message:

```txt
status = complete
content = final text
input_tokens = usage.input_tokens if known
output_tokens = usage.output_tokens if known
```

### On error

Update assistant message:

```txt
status = error
error = safe error message
```

### Usage event

If usage data exists, insert into `usage_events`:

```txt
user_id
conversation_id
message_id
provider_id
model_id
input_tokens
output_tokens
cost_estimate = null unless pricing is known
```

Do not invent pricing if pricing data is not available.

---

## 18. Provider call security rules

When calling AI providers:

### Required

- use HTTPS
- send only required headers
- use timeouts
- support aborts
- normalize errors
- redact secrets from logs

### Forbidden

- do not put API keys in URLs unless the provider absolutely requires it
- if a provider requires key material in query params, redact it from logs and errors
- do not store provider responses that contain secrets
- do not return provider response headers to the client unless sanitized
- do not log request bodies containing API keys

---

## 19. Validation limits for chat requests

Apply safe request limits.

### Suggested v1 limits

- maximum request body size: reasonable platform default
- maximum messages in request context: 100
- maximum single message length: 32,000 characters
- maximum `max_tokens` allowed: provider-safe upper bound
- timeout for provider requests: 120 seconds

### Parameter validation

- temperature must be between 0 and 2
- top_p must be between 0 and 1
- max_tokens must be a positive integer and must not exceed a provider-safe upper bound
- stop must be an array of strings with a maximum of 4 items
- each stop string must be 100 characters or fewer

If a limit is exceeded, return:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request exceeds allowed limits."
  }
}
```

---

## 20. Rate limiting and abuse prevention

At minimum, implement defensive guardrails.

### Required

- per-user limits for save-api-key
- per-user limits for test-api-key
- per-user limits for chat

These limits must be enforced using a persistent store, gateway-level protection, or another reliable mechanism. In-memory-only limiting is not sufficient for production.

---

## 21. Logging rules

Each request must generate a unique request ID. The request ID must be included in logs and may be included in safe error details.

### Allowed logs

- request ID
- user ID
- provider ID
- model ID
- conversation ID
- status code
- safe error code
- duration

### Forbidden logs

- API keys
- Authorization headers
- encrypted key ciphertext
- wrapped data keys
- master key
- full request bodies containing secrets
- provider headers containing credentials

All logs must be redacted.

---

## 22. Failure behavior

The system must fail securely.

### If authentication fails

Return `401 unauthorized`.

### If the user does not own the resource

Return `404 not found` or `403 forbidden` without leaking existence of sensitive records.

### If no API key exists

Return:

```json
{
  "error": {
    "code": "missing_api_key",
    "message": "No API key is available for this provider."
  }
}
```

### If decryption fails

Return:

```json
{
  "error": {
    "code": "decryption_failed",
    "message": "The stored key could not be decrypted."
  }
}
```

Do not expose internal crypto details.

### If provider rejects the key

Return:

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "The provider rejected the API key."
  }
}
```

### If provider request fails

Return a safe `provider_error`.

---

## 23. Edge Function file organization

Use a maintainable structure.

Recommended layout:

```txt
supabase/functions/
├── _shared/
│   ├── auth.ts
│   ├── supabaseAdmin.ts
│   ├── crypto.ts
│   ├── errors.ts
│   ├── validation.ts
│   ├── redact.ts
│   ├── streaming.ts
│   └── providers/
│       ├── types.ts
│       ├── openai.ts
│       ├── anthropic.ts
│       ├── google.ts
│       └── openai-compatible.ts
├── save-api-key/
│   └── index.ts
├── test-api-key/
│   └── index.ts
├── list-provider-keys/
│   └── index.ts
├── delete-api-key/
│   └── index.ts
└── chat/
    └── index.ts
```

Do not duplicate shared logic across functions.

---

## 24. Testing requirements for Edge Functions

You must ensure the following can be tested:

### Auth tests

- request without token is rejected
- request with invalid token is rejected
- user cannot access another user’s provider connection
- user cannot chat using another user’s conversation

### Key tests

- saving a key stores only encrypted data
- no plaintext key is returned
- invalid provider key is not stored
- deleting a key removes it
- listing keys returns metadata only

### Chat tests

- chat requires valid conversation ownership
- chat fails cleanly if no API key exists
- chat decrypts only inside Edge Function
- chat streams expected SSE events
- chat stores final assistant message
- chat stores usage if available
- provider errors are normalized and safe

### Security tests

- no secrets appear in logs
- no secrets appear in responses
- no secret table is accessible from frontend
- decryption failures do not leak internal details

---

## 25. Definition of done for Part 3

This part is complete only when:

- all five Edge Functions exist
- authentication is enforced everywhere
- secret tables are accessed only by Edge Functions
- API keys are encrypted before storage
- API keys are decrypted only server-side
- chat streaming works with normalized SSE events
- errors are safe and standardized
- no plaintext key is returned to the client
- provider adapters are isolated and testable
- logging is redacted
- validation is applied to all inputs

END OF PART 3

# PROJECT SPECIFICATION — PART 4 OF 4

# Frontend Application Structure, UI Behavior, State Management, Build Order, and Testing Rules

This is the final part of the specification.

It defines exactly how the frontend application must be built.

You must implement the frontend in a way that fully matches the security model, database model, and Edge Function contracts defined in Parts 1–3.

Do not guess.
Do not introduce insecure alternatives.
Do not query secret tables from the browser.
Do not store API keys in browser storage.
Do not create direct browser calls to AI providers using stored keys.

If anything is unclear, stop and ask.

---

## 1. Frontend stack requirements

Use the following stack:

- React
- TypeScript
- Vite
- React Router
- Supabase JS client
- TanStack Query for server state
- Zustand for lightweight UI state
- CSS Modules for styling
- Zod for runtime validation

Do not use:

- Redux unless explicitly requested
- a heavy UI component library unless explicitly requested
- client-side secret persistence
- direct provider calls using stored API keys

The frontend must be clean, modular, typed, and production-quality.

---

## 2. Frontend environment variables

Only these frontend variables are allowed:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_FUNCTIONS_URL
```

### Rules

- `VITE_SUPABASE_FUNCTIONS_URL` is optional
- if omitted, derive the functions base URL from `VITE_SUPABASE_URL`
- never expose service role keys
- never expose master encryption keys
- never prefix secret values with `VITE_`

Example:

```txt
VITE_SUPABASE_URL=https://example.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_FUNCTIONS_URL=https://example.supabase.co/functions/v1
```

---

## 3. Frontend responsibilities

The frontend is responsible for:

1. authentication UI
2. protected routing
3. conversation management
4. chat UI
5. provider connection UI
6. settings UI
7. usage display
8. calling Edge Functions for secret-related operations
9. calling Edge Functions for chat completion
10. rendering streamed AI responses

The frontend is **not** responsible for:

- decrypting stored API keys
- storing API keys persistently
- calling AI providers directly with stored keys
- accessing `user_vaults`
- accessing `api_keys`

---

## 4. Supabase client usage rules

The frontend may use the Supabase client directly only for non-secret data.

### Allowed direct Supabase usage

- authentication
- profiles
- provider_connections: read-only
- conversations
- messages: select own, insert user messages only, delete own if enabled
- user_settings
- usage_events: read-only

### Forbidden direct Supabase usage

- `user_vaults`
- `api_keys`
- any query intended to retrieve encrypted secret material
- any query using a service role key
- Do not insert/update/delete provider_connections directly.
- Do not insert usage_events directly.
- Do not insert assistant/system/tool messages directly.

### Required client setup

Create a single shared Supabase client.

Use session persistence for normal login usability in v1.

However:

- do not store custom secrets in localStorage
- do not store API keys in sessionStorage
- do not persist sensitive form state
- do not cache decrypted secrets anywhere

The fact that Supabase session data may be stored by the Supabase client does not change the rule that API keys must not be stored client-side.

---

## 5. Edge Function client rules

All secret-related and AI-provider actions must go through Edge Functions.

Create a shared Edge Function client.

### Required helper capabilities

- read the current Supabase session
- attach `Authorization: Bearer <access_token>`
- send JSON requests
- parse JSON errors
- support streaming responses for chat
- throw normalized app errors

### Required modules

```txt
src/shared/api/edgeClient.ts
src/shared/api/providerKeysClient.ts
src/shared/api/chatClient.ts
src/shared/api/sseClient.ts
```

### Forbidden behavior

- do not send API keys anywhere except the `save-api-key` and `test-api-key` Edge Functions
- do not persist submitted API keys after successful submission
- do not store API keys in component state longer than necessary
- do not log API keys to console
- do not include API keys in URLs

---

## 6. Application routes

Use React Router.

### Required routes

```txt
/auth
/chat
/chat/:conversationId
/settings
/settings/providers
/settings/account
/settings/appearance
/usage
*
```

### Route behavior

#### `/auth`

Public route.

Must support:

- sign in
- sign up
- forgot password

If user is already authenticated, redirect to `/chat`.

#### `/chat`

Protected route.

Shows the chat shell.

If no conversation is selected:

- show empty state
- allow starting a new conversation

#### `/chat/:conversationId`

Protected route.

Loads the selected conversation.

#### `/settings/*`

Protected route.

Contains settings sections.

#### `/usage`

Protected route.

Shows local usage history.

#### `*`

Not found route.

---

## 7. Route guards

Implement route protection.

### Required guard logic

1. Check Supabase auth state.
2. If user is not authenticated, redirect to `/auth`.
3. If user is authenticated and route is `/auth`, redirect to `/chat`.
4. Show a loading state while auth state is being resolved.
5. Do not render protected app content until auth is confirmed.

### Recommended structure

```txt
src/app/RouteGuards.tsx
```

Do not render private pages during auth uncertainty.

---

## 8. Required app shell

The authenticated app must have a clean shell layout.

### Required shell areas

- sidebar
- top bar
- main content area

### Sidebar must include

- app logo/name
- new chat button
- conversation list
- search conversations input
- settings link
- usage link
- user menu

### Top bar must include

- current conversation title
- provider/model indicator
- provider connection status
- settings shortcut
- user menu shortcut

### Main content area

Displays:

- chat page
- settings page
- usage page
- not found page

---

## 9. Required folder structure

Use this structure:

```txt
src/
├── app/
│   ├── App.tsx
│   ├── AppProviders.tsx
│   ├── ErrorBoundary.tsx
│   ├── RouteGuards.tsx
│   ├── router.tsx
│   └── main.tsx
│
├── pages/
│   ├── AuthPage/
│   │   ├── AuthPage.tsx
│   │   └── index.ts
│   ├── ChatPage/
│   │   ├── ChatPage.tsx
│   │   └── index.ts
│   ├── NotFoundPage/
│   │   ├── NotFoundPage.tsx
│   │   └── index.ts
│   ├── SettingsPage/
│   │   ├── SettingsPage.tsx
│   │   └── index.ts
│   └── UsagePage/
│       ├── UsagePage.tsx
│       └── index.ts
│
├── widgets/
│   ├── ChatShell/
│   │   ├── ChatShell.tsx
│   │   ├── ChatShell.module.css
│   │   └── index.ts
│   ├── Sidebar/
│   │   ├── ConversationList.tsx
│   │   ├── Sidebar.tsx
│   │   ├── SidebarFooter.tsx
│   │   ├── SidebarHeader.tsx
│   │   └── index.ts
│   └── TopBar/
│       ├── TopBar.tsx
│       ├── TopBarActions.tsx
│       └── index.ts
│
├── features/
│   ├── auth/
│   │   ├── index.ts
│   │   ├── model/
│   │   │   ├── authQueries.ts
│   │   │   └── useAuthRedirect.ts
│   │   └── ui/
│   │       ├── AuthLayout.tsx
│   │       ├── ForgotPasswordForm.tsx
│   │       ├── SignInForm.tsx
│   │       ├── SignUpForm.tsx
│   │       └── UserMenu.tsx
│   │
│   ├── chat/
│   │   ├── index.ts
│   │   ├── lib/
│   │   │   ├── markdown.ts
│   │   │   ├── messageFormatting.ts
│   │   │   └── sseParser.ts
│   │   ├── model/
│   │   │   ├── chatStreamStore.ts
│   │   │   ├── useChatStream.ts
│   │   │   ├── useConversations.ts
│   │   │   └── useMessages.ts
│   │   └── ui/
│   │       ├── CodeBlock.tsx
│   │       ├── Composer.tsx
│   │       ├── DateSeparator.tsx
│   │       ├── MarkdownRenderer.tsx
│   │       ├── MessageActions.tsx
│   │       ├── MessageBubble.tsx
│   │       ├── MessageList.tsx
│   │       ├── ScrollToBottomButton.tsx
│   │       ├── StopGeneratingButton.tsx
│   │       ├── StreamingCursor.tsx
│   │       └── ThinkingIndicator.tsx
│   │
│   ├── conversations/
│   │   ├── index.ts
│   │   ├── model/
│   │   │   └── conversationMutations.ts
│   │   └── ui/
│   │       ├── ConversationItem.tsx
│   │       ├── ConversationSearch.tsx
│   │       └── RenameConversationDialog.tsx
│   │
│   ├── providers/
│   │   ├── index.ts
│   │   ├── model/
│   │   │   ├── providerMutations.ts
│   │   │   └── providerQueries.ts
│   │   └── ui/
│   │       ├── AddProviderDialog.tsx
│   │       ├── ApiKeyInput.tsx
│   │       ├── ConnectionTestBadge.tsx
│   │       ├── ProviderList.tsx
│   │       ├── ProviderRow.tsx
│   │       └── ProviderSetupEmptyState.tsx
│   │
│   ├── settings/
│   │   ├── index.ts
│   │   ├── model/
│   │   │   └── settingsQueries.ts
│   │   └── ui/
│   │       ├── AccountSettings.tsx
│   │       ├── AppearanceSettings.tsx
│   │       ├── ProviderSettings.tsx
│   │       └── SettingsNav.tsx
│   │
│   └── usage/
│       ├── index.ts
│       ├── model/
│       │   └── usageQueries.ts
│       └── ui/
│           ├── UsageTable.tsx
│           └── UsageSummaryCards.tsx
│
├── shared/
│   ├── api/
│   │   ├── chatClient.ts
│   │   ├── edgeClient.ts
│   │   ├── providerKeysClient.ts
│   │   └── sseClient.ts
│   │
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── queries/
│   │   │   ├── conversations.ts
│   │   │   ├── messages.ts
│   │   │   ├── profiles.ts
│   │   │   └── settings.ts
│   │   └── types.ts
│   │
│   ├── ui/
│   │   ├── Button/
│   │   ├── Dialog/
│   │   ├── EmptyState/
│   │   ├── Input/
│   │   ├── Label/
│   │   ├── Menu/
│   │   ├── Select/
│   │   ├── Spinner/
│   │   ├── Textarea/
│   │   ├── Toast/
│   │   └── index.ts
│   │
│   ├── hooks/
│   │   ├── useMediaQuery.ts
│   │   ├── useOnline.ts
│   │   └── useCopyToClipboard.ts
│   │
│   ├── lib/
│   │   ├── date.ts
│   │   ├── errors.ts
│   │   ├── id.ts
│   │   └── validators.ts
│   │
│   ├── styles/
│   │   ├── app.css
│   │   ├── tokens.css
│   │   ├── theme-dark.css
│   │   └── theme-light.css
│   │
│   └── types/
│       ├── chat.ts
│       ├── provider.ts
│       └── settings.ts
│
└── vite-env.d.ts
```

Do not significantly deviate from this structure unless explicitly instructed.

---

## 10. Authentication UI requirements

The auth page must be simple, clean, and functional.

### Required forms

#### Sign in

Fields:

- email
- password

Actions:

- submit
- forgot password link

#### Sign up

Fields:

- email
- password
- confirm password

Actions:

- submit

#### Forgot password

Fields:

- email

Actions:

- send reset email

### UX rules

- show inline validation errors
- show loading state while submitting
- show success/error toasts where appropriate
- redirect to `/chat` after successful sign in
- redirect authenticated users away from `/auth`

### Security rules

- do not log credentials
- do not store passwords in state longer than necessary
- do not put credentials in URLs

---

## 11. Provider connection UI requirements

This is one of the most important parts of the app.

### Required page/dialog behavior

Users must be able to:

- see connected providers
- add a provider key
- test a provider key
- delete a provider key
- see provider key status
- see last verified date
- see last used date

### Required provider list states

#### Empty state

Show a clear message:

- no providers connected yet
- explain that adding a key is required before chatting

#### Loading state

Show skeleton or spinner while fetching provider metadata.

#### Error state

Show friendly error and retry button.

#### Connected state

Show each provider row with:

- provider name
- status badge
- enabled state
- last verified
- last used
- actions menu

### Add Provider Dialog fields

#### Common fields

- provider selector
- API key input
- optional label
- optional default model

#### OpenAI-compatible extra field

- base URL (show a short warning that custom endpoints must be trusted; changing the base URL requires saving and testing the provider connection again)

### API key input rules

- use password-style input
- include show/hide toggle
- do not autocomplete into unrelated fields
- clear the field after successful save
- do not persist the value
- do not store it in any persisted store

### Provider form validation

Use Zod or equivalent validation.

Rules:

- provider is required
- API key is required
- API key must not be empty
- base URL is required for OpenAI-compatible providers
- base URL must be valid
- default model is optional

### Save behavior

When the user saves a provider key:

1. show saving state
2. call `save-api-key` Edge Function
3. do not call provider APIs directly from browser
4. if success:
   - close dialog
   - clear sensitive input
   - refresh provider list
   - show success toast
5. if failure:
   - show safe error message
   - keep dialog open
   - do not expose secret details

### Delete behavior

When deleting a key:

1. require confirmation
2. call `delete-api-key` Edge Function
3. refresh provider list
4. show success toast

### What must never happen

- do not fetch and display stored API keys
- do not show encrypted key material
- do not allow editing a key by prefilling the old key
- do not expose ciphertext or IVs

If a user wants to replace a key, require them to enter the new key.

---

## 12. Chat page requirements

The chat page is the core product surface.

### Required behavior

Users must be able to:

- create a new conversation
- view conversation history
- send messages
- receive streamed responses
- stop generation
- retry failed assistant responses
- rename conversations
- delete conversations
- search conversations

---

## 13. Conversation list behavior

### Sidebar conversation list must support

- newest first ordering
- active conversation highlight
- rename action
- delete action
- empty state

### New conversation behavior

There are two allowed approaches.

Use this one:

1. user clicks “New chat”
2. app creates a local draft conversation state
3. actual database conversation is created when the first user message is sent

This avoids creating many empty conversation rows.

### Conversation title behavior

If the conversation title is still the default, the frontend must update it after the first user message is successfully sent. The title should be truncated to a reasonable length.

---

## 14. Message list behavior

### Required message rendering

Each message must show:

- role distinction
- content
- timestamp
- error state if failed
- streaming indicator if streaming

### User messages

- right-aligned or visually distinct
- plain text rendering
- copy action optional

### Assistant messages

- visually distinct
- markdown rendering enabled
- code blocks supported
- streaming cursor shown while active
- error banner if failed

### Required message actions

At minimum:

- copy message
- retry failed assistant message

Retry means sending a new chat request based on the most recent user message. It creates a new assistant response attempt. It does not mutate the failed assistant message into a new one.

Optional but allowed:

- delete message
- regenerate assistant message

Do not implement editing/branching unless explicitly requested later.

---

## 15. Composer behavior

The composer is the message input area.

### Required elements

- textarea
- send button
- stop button while streaming
- provider/model indicator or selector
- disabled state when no provider is connected

### Composer rules

- Enter sends by default
- Shift+Enter creates a new line
- textarea auto-expands
- input clears after successful send
- send is disabled while streaming
- stop is visible while streaming

### No provider connected behavior

If no active provider key exists:

- disable sending
- show a clear message
- provide a button/link to provider settings

---

## 16. Chat submission flow

This flow is mandatory.

### When user sends a message

1. If no conversation exists yet, create one in Postgres.
2. Insert the user message into `messages`.
3. Optimistically render the user message.
4. Create a temporary assistant message in UI state.
5. Call the `chat` Edge Function.
6. Consume the streamed SSE response.
7. Update the temporary assistant message as deltas arrive.
8. On completion, finalize the assistant message.
9. Invalidate/refetch messages if needed.
10. Handle abort and errors cleanly.
11. While streaming, suppress background message refetches that could duplicate the temporary assistant message.
12. On receiving the start event, map the temporary assistant message to the server-assigned assistant_message_id.
13. On completion, reconcile by message ID before invalidating/refetching.

### Important rule

The frontend must not call OpenAI/Anthropic/Google directly.

All provider calls must go through the `chat` Edge Function.

---

## 17. Streaming client requirements

Do not use browser `EventSource` for chat streaming if it cannot send authorization headers.

Use `fetch` with a readable stream instead.

### Required streaming client behavior

- send `Authorization` header
- send `Accept: text/event-stream`
- parse SSE events safely
- support aborting via `AbortController`
- support incremental text updates
- expose error events cleanly

### Required SSE events to handle

```txt
start
delta
usage
done
error
```

### Required UI state transitions

#### Before response

- user message visible
- assistant placeholder visible
- composer disabled
- stop button visible

#### During response

- assistant text grows incrementally
- streaming cursor visible
- auto-scroll follows new content unless user scrolled up

#### After response

- streaming cursor removed
- composer enabled
- final assistant message persisted/confirmed

#### On error

- show inline assistant error state
- show retry action where appropriate
- re-enable composer

#### On stop

- abort request
- retain partial content if present
- mark message as stopped/interrupted if applicable

---

## 18. SSE parser requirements

Create a robust SSE parser.

It must handle:

- `event:` lines
- `data:` lines
- multi-line data where appropriate
- JSON parsing errors safely
- incomplete chunks
- stream interruption

Do not assume the stream is always perfectly formatted.

If parsing fails, fail gracefully and show a safe error.

---

## 19. Markdown rendering rules

Assistant responses may contain markdown.

### Required support

- paragraphs
- headings
- lists
- code blocks
- inline code
- links
- emphasis

### Security rules

- Use react-markdown with remark-gfm and rehype-sanitize unless explicitly instructed otherwise. Do not introduce unsafe HTML parsing.
- sanitize markdown output
- do not allow raw HTML by default
- do not use unsafe `dangerouslySetInnerHTML` without sanitization
- links must open in new tab with `rel="noopener noreferrer"`
- do not execute scripts from message content

### Code blocks

Code blocks must include:

- language label if available
- copy button
- readable monospace styling

Do not add syntax highlighting if it introduces unsafe behavior or unnecessary dependency risk.

If syntax highlighting is added, it must be safe and well-tested.

---

## 20. Provider/model selection behavior

For v1, keep this simple.

### Provider selection

The app must choose a provider connection for chat.

Priority:

1. explicit provider selected by user
2. conversation default if available
3. only active provider if exactly one exists

If no valid provider exists:

- block sending
- show setup guidance

### Model selection

For v1:

- allow a model selector/input
- use a sensible default per provider if available
- allow the user to override the model string

Do not build a large model catalog system unless explicitly instructed later.

---

## 21. Settings page requirements

Settings must be split into clear sections.

### Required sections

- Providers
- Account
- Appearance

### Provider settings section

Must include:

- provider list
- add provider button
- delete key action
- status badges
- link to add provider dialog

### Account settings section

Must include:

- current email
- sign out button
- basic profile display

Do not build advanced account deletion unless a corresponding Edge Function is specified later.

### Appearance settings section

Must include:

- theme selection:
  - system
  - light
  - dark

Store settings in `user_settings`.

---

## 22. Usage page requirements

The usage page must show local usage history from `usage_events`.

### Required display

- date
- provider
- model
- input tokens
- output tokens
- cost estimate if available

### Required states

- loading
- empty
- error
- data table

Do not invent cost data if none exists.

---

## 23. Global UI states

The app must include a global error boundary with a safe fallback UI.

Every major async surface must handle:

- loading
- empty
- error
- success

---

## 35. Deployment security requirements

The hosting environment must set secure response headers, including:

- Content-Security-Policy
- X-Content-Type-Options: nosniff
- Referrer-Policy
- Permissions-Policy

The CSP should be as strict as practical and should avoid inline scripts where possible.

---

## 34. Final implementation instruction

This applies to:

- auth
- provider list
- conversation list
- message list
- usage list
- settings save operations

Do not create screens that only handle the happy path.

---

## 24. Toast/notification rules

Use a lightweight toast system.

### Required toast cases

- provider key saved
- provider key deleted
- sign out complete
- settings saved
- chat error
- provider error

### Rules

- keep messages user-friendly
- do not show secrets
- do not show raw upstream provider payloads

---

## 25. Accessibility requirements

The app must be reasonably accessible.

### Required basics

- all inputs have labels
- buttons have accessible names
- dialogs trap focus
- dialogs can be dismissed with Escape
- focus is visible
- color contrast is readable
- error messages are associated with forms
- streaming updates do not create excessive screen reader noise

### Recommended

- use polite live regions for important status updates
- avoid auto-focus abuse
- ensure keyboard navigation works in sidebar and menus

Do not ship obviously inaccessible dialogs or menus.

---

## 26. Styling requirements

Use CSS Modules and design tokens.

### Required styling qualities

- clean modern layout
- responsive desktop and mobile behavior
- dark mode support
- light mode support
- readable chat typography
- clear visual hierarchy

### Theming rules

- theme preference stored in `user_settings`
- system theme respected by default
- no flash of incorrect theme where practical

Do not rely on a giant component library for basic styling unless explicitly approved.

---

## 27. State management rules

Use the correct tool for each state type.

### Server state

Use TanStack Query for:

- conversations
- messages
- provider metadata
- settings
- usage

### UI state

Use Zustand or local component state for:

- composer draft
- active streaming state
- temporary assistant message
- dialog open state
- sidebar mobile state

### Forbidden

- do not persist API keys in any store
- do not persist sensitive form values
- do not cache decrypted secrets
- do not store secrets in TanStack Query cache

---

## 28. Data fetching rules

### Conversations

Fetch from Supabase directly.

### Messages

Fetch from Supabase directly.

### Provider/key metadata

Fetch from `list-provider-keys` Edge Function.

### Chat completion

Call `chat` Edge Function.

### Save/test/delete key

Call corresponding Edge Functions.

Do not mix these responsibilities.

---

## 29. Error handling rules

Normalize all errors before showing them to users.

### Required error categories

- authentication error
- validation error
- network error
- provider error
- missing key error
- permission error
- unknown error

### UX rules

- show helpful messages
- offer retry where appropriate
- do not expose technical secrets
- do not expose ciphertext
- do not expose master key errors directly
- do not show raw service-role failures

---

## 30. Security rules for frontend implementation

These rules are mandatory.

1. Do not store API keys in localStorage.
2. Do not store API keys in sessionStorage.
3. Do not store API keys in IndexedDB.
4. Do not persist provider key form values.
5. Do not query secret tables.
6. Do not call AI providers directly with stored keys.
7. Do not log secrets.
8. Do not include secrets in URLs.
9. Do not render raw HTML from assistant output without sanitization.
10. Do not expose Edge Function internal errors directly.

If a feature cannot be implemented without violating these rules, stop and flag the issue.

---

## 31. Testing requirements

You must write tests for critical frontend logic.

### Unit tests required

- SSE parser
- chat stream state transitions
- provider form validation
- auth redirect logic
- error normalization

### Component tests required

- sign in form
- sign up form
- add provider dialog
- composer send/stop states
- message list rendering
- empty provider state

### Integration tests required

- authenticated app renders chat shell
- unauthenticated user is redirected to auth
- no provider connected blocks sending
- chat submission calls Edge Function and renders streamed response
- provider list fetches metadata from Edge Function

### Mocking rules

- mock Supabase queries where appropriate
- mock Edge Function responses
- mock streaming responses
- do not use real API keys in tests
- do not call real providers in tests unless explicitly instructed

---

## 32. Build order

Implement the frontend in this order.

### Phase 1 — Project foundation

- Vite + React + TypeScript setup
- routing
- global styles
- Supabase client setup
- environment validation

### Phase 2 — Authentication

- auth page
- sign in
- sign up
- forgot password
- route guards
- session loading state

### Phase 3 — App shell

- sidebar
- top bar
- settings layout
- protected layout rendering

### Phase 4 — Provider management

- Edge Function client
- provider list query
- add provider dialog
- save key flow
- delete key flow
- provider empty state

### Phase 5 — Conversations

- conversation list
- create conversation on first message
- rename conversation
- delete conversation
- conversation search

### Phase 6 — Chat core

- message list
- composer
- send message flow
- Edge Function chat call
- SSE parsing
- streaming rendering
- stop generation
- error/retry states

### Phase 7 — Polish

- markdown rendering
- code block copy
- toasts
- loading skeletons
- empty states
- dark mode
- responsive layout

### Phase 8 — Settings and usage

- settings sections
- appearance settings
- account section
- usage page

### Phase 9 — Hardening

- validation cleanup
- accessibility pass
- test coverage
- security review
- production build check

---

## 33. Definition of done for frontend

The frontend is complete only when:

- authentication works
- protected routing works
- users can add provider keys through Edge Functions
- provider keys are never persisted in the browser
- users can chat through the Edge Function endpoint
- streamed responses render correctly
- stop generation works
- errors are handled cleanly
- provider setup blocks chat when no key exists
- conversations can be managed
- settings and usage pages work
- no secret tables are queried from the client
- no plaintext keys are stored client-side
- tests cover critical flows

---

## 34. Final implementation instruction

You must now implement the full application using all four parts of this specification.

Do not selectively ignore parts.
Do not replace the secure architecture with a simpler insecure one.
Do not create placeholder-only features for critical security paths.
Do not expose secret data to the browser.
Do not implement direct provider calls from the browser using stored keys.

If any requirement is ambiguous:

- stop
- identify the ambiguity
- ask for clarification

If any requirement conflicts with secure implementation:

- stop
- flag the conflict
- propose a secure alternative

Security rules override convenience.

END OF PART 4
