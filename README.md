# Keyport

A private AI chat client that works with your own API keys. No subscriptions, no shared pools — just your keys, encrypted and used server-side.

**Live site → [keyport-ai.vercel.app](https://keyport-ai.vercel.app)**

## What it does

Keyport is for people who already pay for AI access and want a clean chat interface without handing another company their keys or a subscription.

Sign in, connect a provider key once, and it's available on every device. From there it's a normal AI chat: streaming responses, markdown, code blocks, model picker, and usage tracking. Your keys stay encrypted in Supabase and are only ever used by the server — never sent to your browser.

Works with OpenAI, Anthropic, Google, OpenRouter, Mistral, Groq, NVIDIA, and any OpenAI-compatible endpoint.

## Tech

- **Frontend:** React 18, Vite, TypeScript, React Router, TanStack Query
- **Backend:** Supabase (Auth, Postgres, Edge Functions in Deno)
- **Encryption:** envelope encryption — a master key wraps per-user data keys

## Run it locally

```bash
npm install
npm run dev
```

Point the app at your own Supabase project by setting `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The Edge Functions need their secrets configured (`MASTER_ENCRYPTION_KEY`, `MASTER_ENCRYPTION_KEY_ID`, `FRONTEND_ORIGIN`).

## Security

The one rule that holds everything together: provider keys never live in the browser after you submit them, never sit in localStorage, and never come back to the client. Any request that touches an AI provider goes through a Supabase Edge Function, so the plaintext key exists only server-side.

---

Built by [Abdul Jawad Gopang](https://github.com/abduljawad-ai).
