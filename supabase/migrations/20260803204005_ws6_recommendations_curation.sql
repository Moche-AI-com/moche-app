alter table public.recommendations
  add column if not exists tags text[] not null default '{}';

alter table public.recommendations
  add column if not exists price_level smallint;

create index if not exists recommendations_property_approved_hidden_idx
  on public.recommendations (property_id, approved, hidden);
