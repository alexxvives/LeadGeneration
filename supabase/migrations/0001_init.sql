-- Lodestar — Phase 0 schema (Supabase / Postgres)
--
-- Mirrors the JSON store's shapes 1:1 (src/lib/types.ts) so swapping getDb() to
-- Supabase is invisible to the UI/service layer. Columns are snake_case; the
-- row<->model mapping lives in src/lib/db/supabase-store.ts.
--
-- Deliberately Phase-0 scoped: NO workspace_id, NO auth, NO row-level security
-- yet. Those arrive in Phase 1 (Auth + workspaces + RLS) — see
-- docs/commercialization.md and docs/decisions/0003-supabase-auth-and-db.md.
-- Until then the server talks to these tables with the service-role key, which
-- bypasses RLS, matching the single-tenant JSON store this replaces.
--
-- Apply via the Supabase SQL editor or `supabase db push`.

create table if not exists public.runs (
  id           text primary key,
  niche        text not null,
  location     text,
  offer_notes  text,
  status       text not null,
  mode         text not null,
  provider     text not null,
  lead_count   integer not null default 0,
  error        text,
  created_at   timestamptz not null,
  completed_at timestamptz
);

create table if not exists public.leads (
  id           text primary key,
  run_id       text not null references public.runs(id) on delete cascade,
  company      text not null,
  website      text,
  emails       text[] not null default '{}',
  phones       text[] not null default '{}',
  contact_name text,
  location     text,
  about_blurb  text,
  tags         text[] not null default '{}',
  fit_score    integer not null default 0,
  fit_reasons  text[] not null default '{}',
  source_url   text not null,
  status       text not null,
  created_at   timestamptz not null
);

create table if not exists public.outreach (
  id         text primary key,
  -- One outreach per lead (types.ts: "each Lead has at most one Outreach").
  -- The unique constraint makes getOutreachByLead() a safe single-row lookup.
  lead_id    text not null unique references public.leads(id) on delete cascade,
  run_id     text not null references public.runs(id) on delete cascade,
  to_email   text,
  subject    text not null,
  body       text not null,
  status     text not null,
  sent_at    timestamptz,
  error      text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

-- Read-path indexes matching the repository's access patterns.
create index if not exists runs_created_at_idx on public.runs (created_at desc);
create index if not exists leads_run_id_idx on public.leads (run_id);
create index if not exists leads_fit_score_idx on public.leads (fit_score desc);
create index if not exists outreach_lead_id_idx on public.outreach (lead_id);
create index if not exists outreach_run_id_idx on public.outreach (run_id);
