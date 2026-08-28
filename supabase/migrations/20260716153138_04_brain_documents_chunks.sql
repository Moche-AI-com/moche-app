-- Brain items: structured knowledge entries
create table brain_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  category brain_category not null,
  title text not null,
  body text,
  visibility brain_visibility not null default 'guest',
  source_type source_type not null default 'manual_entry',
  status processing_status not null default 'ready',
  ingestion_error text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on brain_items(property_id);
create index on brain_items(property_id, category);
create index on brain_items(property_id, visibility);

-- Documents (uploaded files)
create table documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  brain_item_id uuid references brain_items(id) on delete set null,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  visibility brain_visibility not null default 'guest',
  status processing_status not null default 'pending',
  error_detail text,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on documents(property_id);

-- Document chunks with embeddings (property-scoped)
create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  brain_item_id uuid references brain_items(id) on delete cascade,
  category brain_category not null default 'documents',
  visibility brain_visibility not null default 'guest',
  chunk_index int not null default 0,
  content text not null,
  token_count int,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index on document_chunks(property_id);
create index on document_chunks(property_id, visibility);
create index on document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Ingestion jobs (async processing)
create table ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  kind ingestion_kind not null,
  document_id uuid references documents(id) on delete cascade,
  source_url text,
  status processing_status not null default 'pending',
  attempts int not null default 0,
  last_error text,
  result jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ingestion_jobs(property_id);
create index on ingestion_jobs(status);

-- Recommendations (local picks)
create table recommendations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,
  category text,
  description text,
  address text,
  url text,
  distance_note text,
  visibility brain_visibility not null default 'guest',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on recommendations(property_id);
