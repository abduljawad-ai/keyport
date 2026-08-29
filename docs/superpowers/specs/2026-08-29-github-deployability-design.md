# GitHub Deployability Design

- Date: 2026-08-29
- Status: Approved (pending implementation)
- Scope: `/home/jawad/Desktop/keyport` → `github.com/abduljawad-ai/keyport` (private)

## Goal

Make the Keyport project a clean, self-contained GitHub repository that anyone with access can clone, build, test, and deploy — with CI checks on every push to `main`. No secrets are committed at any point.

Decisions locked with the user:

- **Deployment model:** Repo + CI checks only. No auto-deploy pipeline, no lint config introduction, no splitting `supabase/` into a separate repo, no visibility change (stays private).
- **Process:** Follow the brainstorming → writing-plans → implementation pipeline. This doc is the approved spec.

## 1. Git init & ignore rules

- `git init -b main` inside the project.
- Remote: `origin` → `https://github.com/abduljawad-ai/keyport.git` (HTTPS). Push authentication uses the existing git credential helper (`~/.git-credentials`, `abduljawad-ai`, `ghp_` PAT) — never printed or exposed.
- New `.gitignore` with at minimum:
  - `node_modules/`
  - `dist/`
  - `.env`, `.env.*`, with negation `!.env.example`
  - `.vite/`
  - `.playwright-mcp/`
  - `coverage/`
  - `*.log`
  - `.DS_Store`
  - `supabase/.temp/`
- Acceptance check: `git status --porcelain` must show no `.env`, `node_modules`, `dist`, or `.playwright-mcp` entries.

## 2. Repository documentation

- `.env.example` — commit a safe template:
  - `VITE_SUPABASE_URL=<project-url>` placeholder
  - `VITE_SUPABASE_ANON_KEY=<anon-key>` placeholder
  - One-line comments explaining how to obtain both (Supabase → Project Settings → API).
- `README.md` — concise, covering:
  - What it is: secure BYOK AI chat (keys encrypted, used server-side only).
  - Stack: Vite + React 18 + TypeScript, TanStack Query, Zustand, zod, supabase-js; Edge Functions (Deno).
  - Local setup: `npm install` → `cp .env.example .env` (fill values) → `npm run dev`.
  - Scripts table: `dev`, `build`, `preview`, `test`, `typecheck`.
  - Repo layout: `src/` (SPA), `supabase/functions/` (edge functions), `supabase/migrations/`, `scripts/` (catalog sync), `docs/` (spec).
  - Deployment runbook: `npm run build` + `vercel.json` (SPA rewrite + security headers); edge functions via `supabase functions deploy <name>`; `FRONTEND_ORIGIN` env secret note (fail-closed CORS).
  - Link to `project-specification.md` and this design doc.

## 3. CI checks (GitHub Actions)

- New `.github/workflows/ci.yml`, triggered on `push` and `pull_request` to `main`.
- Job: `ubuntu-latest`, Node 20, steps:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` with `node-version: 20`, `cache: npm`
  3. `npm ci`
  4. `npm run typecheck`
  5. `npm test`
  6. `npm run build`
- **No CI secrets.** The build and test suites must pass with no `.env` present. Verified locally before pushing by running build/test with `.env` temporarily unavailable.

## 4. Commit & push

- Initial repository commit (spec + `.gitignore` lands first; the project files land in the following implementation commit or commits).
- Push: `git push -u origin main`.
- Acceptance check: GitHub Actions workflow starts and runs green (typecheck, test, build all pass).

## Out of scope

- Auto-deploy to Vercel/production from GitHub.
- ESLint/Biome/Prettier introduction.
- Repo visibility changes.
- Splitting the frontend and `supabase/` into separate repositories.
- Migrating the local dev servers or Supabase project.

## Security invariants

- `.env` (Supabase URL + anon key) is never committed; only `.env.example` is.
- The GitHub PAT in `~/.git-credentials` is used only via the credential helper and never appears in commands, logs, or files.
- Confirmed by scan: the tree contains no real secrets outside `.env` (only fake `__tests__` fixtures).