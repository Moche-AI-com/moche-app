create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete set null,
  kind text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  embed_tokens integer not null default 0,
  total_tokens integer generated always as (prompt_tokens + completion_tokens + embed_tokens) stored,
  est_cost_usd numeric(12,6) not null default 0,
  cache_hit boolean not null default false,
  latency_ms integer,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_property_created_idx on public.ai_usage (property_id, created_at desc);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_kind_idx on public.ai_usage (kind);

alter table public.ai_usage enable row level security;

-- No policies for anon/authenticated => only the service-role key (which bypasses RLS)
-- can read or write. Guests and hosts never touch this table directly.
comment on table public.ai_usage is 'AI token/cost telemetry. Written fire-and-forget by the service role from server routes. RLS on, no anon/authenticated policies = service-role only.';
