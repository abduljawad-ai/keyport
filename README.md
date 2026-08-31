# Keyport

A private AI chat client where you bring your own API keys. No subscriptions, no shared pools — just your keys, encrypted and used server-side.

**Live site → [keyport-ai.vercel.app](https://keyport-ai.vercel.app)**

## Why

Most AI chat apps make you either pay a subscription or share a single rate-limited pool. Keyport takes a different route: connect your own provider key once, and chat on any device. Your keys are wrapped with envelope encryption in Supabase and never exposed to the browser after you add them.

Supported providers: OpenAI, Anthropic, Google, OpenRouter, Mistral, Groq, NVIDIA, and other OpenAI-compatible endpoints.

## What's inside

- Sign in with Supabase Auth
- Add an API key once — reuse it across devices
- Chat with streaming responses, markdown, and code blocks
- Pick any model from any connected provider
- Test a key before saving it
- Usage tracking per conversation
- Provider keys encrypted at rest and handled only by Edge Functions server-side

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

## Why the security model matters

The core rule: your provider keys never live in the browser after submission, never sit in localStorage, and never come back to the client. Everything AI-related runs through Supabase Edge Functions, so the plaintext key only exists server-side where it's needed.

---

Built by [Abdul Jawad Gopang](https://github.com/abduljawad-ai).
