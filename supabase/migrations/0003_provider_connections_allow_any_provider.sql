-- Provider catalog expansion: allow ANY provider_id in provider_connections.
--
-- The pre-catalog schema hardcoded the four provider ids known at the time
-- ('openai', 'anthropic', 'google', 'openai-compatible'). The Edge Function
-- layer (validation.ts, backed by the providers registry) is the
-- authoritative gate for provider ids, so a hardcoded DB list rejects valid
-- saves (e.g. 'xai', 'groq', 'openrouter') with a CHECK violation even
-- though the function accepted them. The base_url rule for the custom
-- (openai-compatible) provider is unchanged.

alter table public.provider_connections
  drop constraint if exists provider_connections_provider_id_check;

alter table public.provider_connections
  add constraint provider_connections_provider_id_not_empty
  check (provider_id <> '');