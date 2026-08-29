-- ============================================================================
-- 0002: server-assigned ownership defaults for browser-inserted rows
--
-- The browser client inserts conversations and user messages WITHOUT sending
-- user_id (the secure pattern: ownership is assigned server-side, never
-- trusted from the client). Those columns were `not null` with no default, so
--   - conversations INSERT failed RLS `with check (auth.uid() = user_id)`
--     (user_id was NULL -> check false -> 403 Forbidden)
--   - messages INSERT would fail the NOT NULL constraint (400)
--
-- Fix: default user_id to auth.uid() so the row is owned by the requester.
-- auth.uid() is NULL outside PostgREST (psql / service role), so every
-- service-side write path (Edge Functions) still sends user_id explicitly.
-- ============================================================================

alter table public.conversations
  alter column user_id set default auth.uid();

alter table public.messages
  alter column user_id set default auth.uid();

-- Defense in depth: the messages INSERT policy previously validated only the
-- conversation owner and role/status, not the message's own user_id. Tighten
-- it so a crafted request can never write a message row owned by someone
-- else (server default makes the field correct for legitimate inserts).
drop policy if exists "Users can insert user messages into their own conversations" on public.messages;
create policy "Users can insert user messages into their own conversations"
on public.messages
for insert
with check (
  user_id = auth.uid()
  and role = 'user'
  and status = 'complete'
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.user_id = auth.uid()
  )
);