-- Moche AI — database schema snapshot
-- Project ref: sqpdzhannyskdiyuarhp (moche-ai-app, us-east-1, PostgreSQL 17.6.1.147)
-- Repo SHA at capture: 254ca609d2876feb9b7f4d87003f22909247301a
-- Last applied migration: 20260806191135_host_reply_ai_training_flag
--
-- PROVENANCE / LIMITATIONS — read before relying on this file
-- This is a catalog-derived snapshot reconstructed from pg_catalog via the
-- Supabase Management connector. It is NOT the output of `supabase db dump
-- --schema-only` / `pg_dump`. Direct Postgres access (port 5432) is not
-- reachable from the build environment and no database password is held by
-- the agent, so a true pg_dump could not be produced.
--
-- Consequences:
--   * Statement ordering is grouped by object class, not dependency-sorted.
--     This file is a REVIEW ARTIFACT. Do not assume it replays cleanly.
--   * Ownership, comments, storage parameters, publications, and row-level
--     data are omitted.
--   * Objects in auth/storage/realtime/vault/graphql/extensions schemas are
--     Supabase-managed and excluded. Scope is public + private.
--
-- Replace this file with a real `supabase db dump --schema-only` once a
-- database password or pooler credential is available in CI.
--
-- Scope: schemas public (41 tables), private (0 tables, functions only)

-- ============================================================
-- SECTION 1 — EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================================================
-- SECTION 2 — ENUM TYPES (24)
-- ============================================================

CREATE TYPE public.access_status AS ENUM ('pending', 'verified', 'expired', 'revoked');
CREATE TYPE public.brain_category AS ENUM ('core', 'appliances', 'house_rules', 'checkin_checkout', 'local_recommendations', 'emergency', 'documents', 'product_urls', 'host_qa', 'internal_notes', 'transportation');
CREATE TYPE public.brain_visibility AS ENUM ('guest', 'internal');
CREATE TYPE public.consent_kind AS ENUM ('terms', 'privacy', 'marketing', 'guest_comms');
CREATE TYPE public.conversation_role AS ENUM ('guest', 'assistant', 'host', 'system');
CREATE TYPE public.escalation_status AS ENUM ('open', 'answered', 'resolved', 'dismissed');
CREATE TYPE public.extras_order_status AS ENUM ('requested', 'confirmed', 'fulfilled', 'declined', 'cancelled');
CREATE TYPE public.feedback_value AS ENUM ('helpful', 'not_helpful');
CREATE TYPE public.host_preference AS ENUM ('loved', 'neutral', 'disliked');
CREATE TYPE public.ingestion_kind AS ENUM ('document', 'url');
CREATE TYPE public.intent_type AS ENUM ('information', 'wifi', 'checkin', 'checkout', 'parking', 'appliance', 'house_rules', 'local', 'maintenance', 'cleaning', 'safety', 'emergency', 'other');
CREATE TYPE public.lifecycle_state AS ENUM ('active', 'archived');
CREATE TYPE public.member_role AS ENUM ('owner', 'co_host', 'property_manager', 'maintenance', 'cleaner', 'viewer', 'support');
CREATE TYPE public.notification_kind AS ENUM ('escalation', 'maintenance', 'ingestion_failure', 'billing', 'review_nudge', 'system');
CREATE TYPE public.processing_status AS ENUM ('pending', 'processing', 'ready', 'failed', 'stale');
CREATE TYPE public.property_status AS ENUM ('draft', 'live', 'paused', 'archived');
CREATE TYPE public.proposed_update_status AS ENUM ('pending', 'approved', 'modified', 'denied');
CREATE TYPE public.service_status AS ENUM ('new', 'acknowledged', 'in_progress', 'waiting_on_guest', 'resolved', 'closed');
CREATE TYPE public.service_type AS ENUM ('information', 'maintenance', 'cleaning', 'safety', 'emergency', 'other');
CREATE TYPE public.source_type AS ENUM ('manual_entry', 'document', 'url', 'host_qa', 'clone');
CREATE TYPE public.stay_status AS ENUM ('upcoming', 'active', 'completed', 'revoked');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused');
CREATE TYPE public.urgency_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.user_role AS ENUM ('host_owner', 'co_host', 'admin');

-- ============================================================
-- SECTION 3 — TABLES (41)
-- ============================================================

CREATE TABLE public.ai_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    kind text NOT NULL,
    model text NOT NULL,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    embed_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT ((prompt_tokens + completion_tokens) + embed_tokens),
    est_cost_usd numeric(12,6) DEFAULT 0 NOT NULL,
    cache_hit boolean DEFAULT false NOT NULL,
    latency_ms integer,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.answer_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    question_norm text NOT NULL,
    answer text NOT NULL,
    confidence numeric DEFAULT 0 NOT NULL,
    brain_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_account_id uuid,
    property_id uuid,
    actor_profile_id uuid,
    actor_type text DEFAULT 'host'::text NOT NULL,
    action text NOT NULL,
    target_type text,
    target_id text,
    metadata jsonb,
    ip_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.brain_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    category brain_category NOT NULL,
    title text NOT NULL,
    body text,
    visibility brain_visibility DEFAULT 'guest'::brain_visibility NOT NULL,
    source_type source_type DEFAULT 'manual_entry'::source_type NOT NULL,
    status processing_status DEFAULT 'ready'::processing_status NOT NULL,
    ingestion_error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

CREATE TABLE public.consent_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid,
    stay_id uuid,
    kind consent_kind NOT NULL,
    granted boolean NOT NULL,
    ip_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    stay_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text
);

CREATE TABLE public.document_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    document_id uuid,
    brain_item_id uuid,
    category brain_category DEFAULT 'documents'::brain_category NOT NULL,
    visibility brain_visibility DEFAULT 'guest'::brain_visibility NOT NULL,
    chunk_index integer DEFAULT 0 NOT NULL,
    content text NOT NULL,
    token_count integer,
    embedding vector(1536),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    brain_item_id uuid,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    visibility brain_visibility DEFAULT 'guest'::brain_visibility NOT NULL,
    status processing_status DEFAULT 'pending'::processing_status NOT NULL,
    error_detail text,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

CREATE TABLE public.escalations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    stay_id uuid,
    conversation_id uuid,
    question text NOT NULL,
    status escalation_status DEFAULT 'open'::escalation_status NOT NULL,
    host_response text,
    responded_by uuid,
    responded_at timestamp with time zone,
    converted_brain_item_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.extras_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    stay_id uuid,
    conversation_id uuid,
    escalation_id uuid,
    extra_id uuid,
    item_title text NOT NULL,
    item_price_text text,
    quantity integer DEFAULT 1 NOT NULL,
    guest_note text,
    host_note text,
    status extras_order_status DEFAULT 'requested'::extras_order_status NOT NULL,
    lifecycle_status lifecycle_state DEFAULT
CASE
    WHEN (status = ANY (ARRAY['fulfilled'::extras_order_status, 'declined'::extras_order_status, 'cancelled'::extras_order_status])) THEN 'archived'::lifecycle_state
    ELSE 'active'::lifecycle_state
END,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    item_variant text
);

CREATE TABLE public.guest_access_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    stay_id uuid,
    token_hash text NOT NULL,
    kind text NOT NULL,
    expires_at timestamp with time zone,
    consumed_at timestamp with time zone,
    max_redemptions integer DEFAULT 1 NOT NULL,
    redemption_count integer DEFAULT 0 NOT NULL,
    require_otp boolean DEFAULT false NOT NULL,
    created_by uuid,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    code_hash text,
    code_expires_at timestamp with time zone,
    code_revoked_at timestamp with time zone,
    code_first_used_at timestamp with time zone,
    code_attempt_count integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.guest_access_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stay_id uuid NOT NULL,
    property_id uuid NOT NULL,
    session_token_hash text NOT NULL,
    status access_status DEFAULT 'pending'::access_status NOT NULL,
    verified_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    ip_hash text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    guest_contact text,
    guest_contact_type text,
    notification_consent boolean DEFAULT false NOT NULL,
    notification_consent_at timestamp with time zone
);

CREATE TABLE public.guest_extras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    price_text text,
    cta_label text DEFAULT 'Request'::text,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category text,
    is_favorite boolean DEFAULT false NOT NULL,
    max_quantity integer,
    kind text DEFAULT 'quantity'::text NOT NULL,
    option_label text,
    options text[] DEFAULT '{}'::text[] NOT NULL,
    unit_label text,
    details text
);

CREATE TABLE public.guest_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    display_name text,
    contact_hash text NOT NULL,
    contact_type text DEFAULT 'phone'::text NOT NULL,
    contact_last4 text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.guest_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    stay_id uuid,
    contact_hash text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    consumed_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.host_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    owner_id uuid NOT NULL,
    stripe_customer_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

CREATE TABLE public.host_otp_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    purpose text DEFAULT 'login'::text NOT NULL,
    code_hash text NOT NULL,
    phone_last4 text,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ingestion_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    kind ingestion_kind NOT NULL,
    document_id uuid,
    source_url text,
    status processing_status DEFAULT 'pending'::processing_status NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    result jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_acceptances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    host_account_id uuid,
    document_slug text NOT NULL,
    document_version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    ip inet,
    user_agent text,
    context text DEFAULT 'signup'::text NOT NULL
);

CREATE TABLE public.legal_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    version text NOT NULL,
    effective_date date NOT NULL,
    sha256 text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.member_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_account_id uuid NOT NULL,
    email text NOT NULL,
    role member_role NOT NULL,
    can_edit_brain boolean DEFAULT false NOT NULL,
    can_reply_guests boolean DEFAULT false NOT NULL,
    can_receive_escalations boolean DEFAULT false NOT NULL,
    can_resolve_maintenance boolean DEFAULT false NOT NULL,
    can_view_analytics boolean DEFAULT false NOT NULL,
    property_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    invited_by uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    accepted_profile_id uuid,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.message_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    property_id uuid NOT NULL,
    value feedback_value NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    property_id uuid NOT NULL,
    role conversation_role NOT NULL,
    content text NOT NULL,
    intent intent_type,
    sources jsonb,
    model text,
    confidence numeric,
    latency_ms integer,
    author_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_training_excluded boolean DEFAULT false NOT NULL
);

CREATE TABLE public.nearby_places (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    place_id text,
    category text NOT NULL,
    name text,
    rating numeric,
    review_count integer,
    photo_ref text,
    lat numeric,
    lng numeric,
    price_level integer,
    host_starred boolean DEFAULT false NOT NULL,
    host_notes text,
    hidden boolean DEFAULT false NOT NULL,
    distance_m integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    refreshed_at timestamp with time zone DEFAULT now() NOT NULL,
    address text,
    url text,
    phone text,
    source text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    reviewed_at timestamp with time zone
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_account_id uuid NOT NULL,
    property_id uuid,
    recipient_profile_id uuid,
    kind notification_kind NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.organization_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_account_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    role user_role DEFAULT 'co_host'::user_role NOT NULL,
    invited_email text,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    rating integer,
    comment text,
    property_id uuid,
    host_account_id uuid,
    guest_session_id uuid,
    page text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    phone text,
    is_admin boolean DEFAULT false NOT NULL,
    mfa_ready boolean DEFAULT false NOT NULL,
    terms_accepted_at timestamp with time zone,
    privacy_accepted_at timestamp with time zone,
    deletion_requested_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    phone_verified_at timestamp with time zone,
    sms_opt_in boolean DEFAULT false NOT NULL,
    sms_opt_in_at timestamp with time zone,
    two_factor_enabled boolean DEFAULT false NOT NULL
);

CREATE TABLE public.properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_account_id uuid NOT NULL,
    display_name text NOT NULL,
    slug text NOT NULL,
    status property_status DEFAULT 'draft'::property_status NOT NULL,
    timezone text DEFAULT 'America/New_York'::text NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL,
    address_line1 text,
    address_line2 text,
    city text,
    region text,
    postal_code text,
    country text,
    cover_image_url text,
    logo_url text,
    brand_primary text DEFAULT '#33E6D4'::text,
    brand_accent text DEFAULT '#FF8A5C'::text,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    lat numeric,
    lng numeric,
    archived_at timestamp with time zone,
    purged_at timestamp with time zone
);

CREATE TABLE public.property_brain_versions (
    property_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.property_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    label text NOT NULL,
    contact_type text DEFAULT 'host'::text NOT NULL,
    name text,
    phone text,
    email text,
    is_emergency boolean DEFAULT false NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.property_knowledge_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    node_type text NOT NULL,
    title text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    content text NOT NULL,
    embedding vector(1536),
    source_brain_item_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.property_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    role member_role DEFAULT 'co_host'::member_role NOT NULL,
    can_receive_escalations boolean DEFAULT true NOT NULL,
    can_reply_guests boolean DEFAULT true NOT NULL,
    can_resolve_maintenance boolean DEFAULT true NOT NULL,
    can_edit_brain boolean DEFAULT false NOT NULL,
    can_view_analytics boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.property_settings (
    property_id uuid NOT NULL,
    concierge_tone text DEFAULT 'friendly'::text NOT NULL,
    ai_temperature numeric DEFAULT 0.2 NOT NULL,
    confidence_threshold numeric DEFAULT 0.55 NOT NULL,
    grace_period_hours integer DEFAULT 12 NOT NULL,
    modules jsonb DEFAULT '{"wifi": true, "local": true, "checkin": true, "parking": true, "checkout": true, "cleaning": true, "emergency": true, "appliances": true, "house_rules": true, "maintenance": true}'::jsonb NOT NULL,
    review_nudge_enabled boolean DEFAULT false NOT NULL,
    review_nudge_auto boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    concierge_name text DEFAULT 'Moche Concierge'::text NOT NULL,
    system_prompt_override text,
    response_length text DEFAULT 'balanced'::text NOT NULL,
    restricted_topics text,
    language text DEFAULT 'auto'::text NOT NULL,
    is_premium_override boolean DEFAULT false NOT NULL,
    review_url text,
    legacy_tone_note text,
    legacy_tone_ack_at timestamp with time zone,
    restricted_topic_keys jsonb DEFAULT '["pricing", "refunds", "legal_advice", "neighbor_disputes"]'::jsonb NOT NULL,
    host_language text DEFAULT 'en'::text NOT NULL
);

CREATE TABLE public.proposed_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    host_account_id uuid NOT NULL,
    status proposed_update_status DEFAULT 'pending'::proposed_update_status NOT NULL,
    field_path text NOT NULL,
    label text NOT NULL,
    proposed_value jsonb NOT NULL,
    original_value jsonb,
    applied_value jsonb,
    source_type text NOT NULL,
    source_ref text,
    confidence numeric(4,3),
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    resolution_note text,
    applied_at timestamp with time zone,
    apply_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    name text NOT NULL,
    category text,
    description text,
    address text,
    url text,
    distance_note text,
    visibility brain_visibility DEFAULT 'guest'::brain_visibility NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    ai_source_rating numeric,
    host_preference host_preference DEFAULT 'neutral'::host_preference NOT NULL,
    host_note text,
    priority_weight integer DEFAULT 0 NOT NULL,
    ai_source text,
    hidden boolean DEFAULT false NOT NULL,
    lat numeric,
    lng numeric,
    approved boolean DEFAULT true NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    price_level smallint
);

CREATE TABLE public.service_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    stay_id uuid,
    conversation_id uuid,
    service_type service_type DEFAULT 'maintenance'::service_type NOT NULL,
    urgency urgency_level DEFAULT 'medium'::urgency_level NOT NULL,
    description text NOT NULL,
    status service_status DEFAULT 'new'::service_status NOT NULL,
    assigned_contact_id uuid,
    resolution_notes text,
    timeline jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    safety_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    location_note text,
    likely_causes jsonb DEFAULT '[]'::jsonb NOT NULL,
    suggested_parts jsonb DEFAULT '[]'::jsonb NOT NULL,
    access_instructions text,
    guest_availability text,
    media_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    summary text,
    interview_transcript jsonb DEFAULT '[]'::jsonb NOT NULL,
    interview_status text DEFAULT 'in_progress'::text NOT NULL,
    lifecycle_status lifecycle_state DEFAULT
CASE
    WHEN (status = ANY (ARRAY['resolved'::service_status, 'closed'::service_status])) THEN 'archived'::lifecycle_state
    ELSE 'active'::lifecycle_state
END,
    archived_at timestamp with time zone
);

CREATE TABLE public.stays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    guest_identity_id uuid,
    guest_display_name text NOT NULL,
    contact_hash text NOT NULL,
    contact_type text DEFAULT 'phone'::text NOT NULL,
    contact_last4 text,
    check_in timestamp with time zone NOT NULL,
    check_out timestamp with time zone NOT NULL,
    guest_count integer DEFAULT 1 NOT NULL,
    booking_reference text,
    host_notes text,
    status stay_status DEFAULT 'upcoming'::stay_status NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    lifecycle_status lifecycle_state DEFAULT
CASE
    WHEN (status = ANY (ARRAY['completed'::stay_status, 'revoked'::stay_status])) THEN 'archived'::lifecycle_state
    ELSE 'active'::lifecycle_state
END,
    archived_at timestamp with time zone,
    guest_language text
);

CREATE TABLE public.stripe_events (
    id text NOT NULL,
    type text NOT NULL,
    payload jsonb,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_account_id uuid NOT NULL,
    stripe_subscription_id text,
    stripe_customer_id text,
    stripe_price_id text,
    plan text,
    status subscription_status DEFAULT 'incomplete'::subscription_status NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    trial_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    trial_property_limit integer DEFAULT 5 NOT NULL,
    is_read_only boolean DEFAULT false NOT NULL
);

-- ============================================================
-- SECTION 4 — CONSTRAINTS
-- ============================================================

ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE public.answer_cache ADD CONSTRAINT answer_cache_pkey PRIMARY KEY (id);
ALTER TABLE public.answer_cache ADD CONSTRAINT answer_cache_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_host_account_id_fkey FOREIGN KEY (host_account_id) REFERENCES host_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE public.brain_items ADD CONSTRAINT brain_items_pkey PRIMARY KEY (id);
ALTER TABLE public.brain_items ADD CONSTRAINT brain_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.brain_items ADD CONSTRAINT brain_items_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_pkey PRIMARY KEY (id);
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.conversations ADD CONSTRAINT conversations_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE;
ALTER TABLE public.document_chunks ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);
ALTER TABLE public.document_chunks ADD CONSTRAINT document_chunks_brain_item_id_fkey FOREIGN KEY (brain_item_id) REFERENCES brain_items(id) ON DELETE CASCADE;
ALTER TABLE public.document_chunks ADD CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE public.document_chunks ADD CONSTRAINT document_chunks_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
ALTER TABLE public.documents ADD CONSTRAINT documents_brain_item_id_fkey FOREIGN KEY (brain_item_id) REFERENCES brain_items(id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD CONSTRAINT documents_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.escalations ADD CONSTRAINT escalations_pkey PRIMARY KEY (id);
ALTER TABLE public.escalations ADD CONSTRAINT escalations_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
ALTER TABLE public.escalations ADD CONSTRAINT escalations_converted_brain_item_id_fkey FOREIGN KEY (converted_brain_item_id) REFERENCES brain_items(id) ON DELETE SET NULL;
ALTER TABLE public.escalations ADD CONSTRAINT escalations_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.escalations ADD CONSTRAINT escalations_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.escalations ADD CONSTRAINT escalations_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE;
ALTER TABLE public.extras_orders ADD CONSTRAINT extras_orders_pkey PRIMARY KEY (id);
ALTER TABLE public.extras_orders ADD CONSTRAINT extras_orders_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
ALTER TABLE public.extras_orders ADD CONSTRAINT extras_orders_escalation_id_fkey FOREIGN KEY (escalation_id) REFERENCES escalations(id) ON DELETE SET NULL;
ALTER TABLE public.extras_orders ADD CONSTRAINT extras_orders_extra_id_fkey FOREIGN KEY (extra_id) REFERENCES guest_extras(id) ON DELETE SET NULL;
ALTER TABLE public.extras_orders ADD CONSTRAINT extras_orders_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.extras_orders ADD CONSTRAINT extras_orders_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE SET NULL;
ALTER TABLE public.extras_orders ADD CONSTRAINT extras_orders_guest_note_check CHECK (((guest_note IS NULL) OR (length(guest_note) <= 1000)));
ALTER TABLE public.extras_orders ADD CONSTRAINT extras_orders_host_note_check CHECK (((host_note IS NULL) OR (length(host_note) <= 1000)));
ALTER TABLE public.extras_orders ADD CONSTRAINT extras_orders_item_price_text_check CHECK (((item_price_text IS NULL) OR (length(item_price_text) <= 80)));
ALTER TABLE public.extras_orders ADD CONSTRAINT extras_orders_item_title_check CHECK (((length(btrim(item_title)) >= 1) AND (length(btrim(item_title)) <= 200)));
ALTER TABLE public.extras_orders ADD CONSTRAINT extras_orders_quantity_check CHECK (((quantity >= 1) AND (quantity <= 20)));
ALTER TABLE public.guest_access_links ADD CONSTRAINT guest_access_links_token_hash_key UNIQUE (token_hash);
ALTER TABLE public.guest_access_links ADD CONSTRAINT guest_access_links_pkey PRIMARY KEY (id);
ALTER TABLE public.guest_access_links ADD CONSTRAINT guest_access_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.guest_access_links ADD CONSTRAINT guest_access_links_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.guest_access_links ADD CONSTRAINT guest_access_links_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE;
ALTER TABLE public.guest_access_links ADD CONSTRAINT guest_access_links_code_kind_check CHECK (((kind = 'stay'::text) OR (code_hash IS NULL)));
ALTER TABLE public.guest_access_links ADD CONSTRAINT guest_access_links_kind_check CHECK ((kind = ANY (ARRAY['stay'::text, 'property'::text])));
ALTER TABLE public.guest_access_sessions ADD CONSTRAINT guest_access_sessions_session_token_hash_key UNIQUE (session_token_hash);
ALTER TABLE public.guest_access_sessions ADD CONSTRAINT guest_access_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.guest_access_sessions ADD CONSTRAINT guest_access_sessions_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.guest_access_sessions ADD CONSTRAINT guest_access_sessions_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE;
ALTER TABLE public.guest_extras ADD CONSTRAINT guest_extras_pkey PRIMARY KEY (id);
ALTER TABLE public.guest_extras ADD CONSTRAINT guest_extras_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.guest_extras ADD CONSTRAINT guest_extras_category_check CHECK (((category IS NULL) OR (category = ANY (ARRAY['arrival'::text, 'comfort'::text, 'food'::text, 'experiences'::text, 'transport'::text, 'more'::text]))));
ALTER TABLE public.guest_extras ADD CONSTRAINT guest_extras_kind_check CHECK ((kind = ANY (ARRAY['quantity'::text, 'package'::text])));
ALTER TABLE public.guest_extras ADD CONSTRAINT guest_extras_max_quantity_check CHECK (((max_quantity IS NULL) OR ((max_quantity >= 1) AND (max_quantity <= 10))));
ALTER TABLE public.guest_identities ADD CONSTRAINT guest_identities_pkey PRIMARY KEY (id);
ALTER TABLE public.guest_identities ADD CONSTRAINT guest_identities_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.guest_verifications ADD CONSTRAINT guest_verifications_pkey PRIMARY KEY (id);
ALTER TABLE public.guest_verifications ADD CONSTRAINT guest_verifications_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.guest_verifications ADD CONSTRAINT guest_verifications_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE;
ALTER TABLE public.host_accounts ADD CONSTRAINT host_accounts_stripe_customer_id_key UNIQUE (stripe_customer_id);
ALTER TABLE public.host_accounts ADD CONSTRAINT host_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.host_accounts ADD CONSTRAINT host_accounts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.host_otp_challenges ADD CONSTRAINT host_otp_challenges_pkey PRIMARY KEY (id);
ALTER TABLE public.host_otp_challenges ADD CONSTRAINT host_otp_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.ingestion_jobs ADD CONSTRAINT ingestion_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.ingestion_jobs ADD CONSTRAINT ingestion_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.ingestion_jobs ADD CONSTRAINT ingestion_jobs_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE public.ingestion_jobs ADD CONSTRAINT ingestion_jobs_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_pkey PRIMARY KEY (id);
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_host_account_id_fkey FOREIGN KEY (host_account_id) REFERENCES host_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.legal_documents ADD CONSTRAINT legal_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.member_invites ADD CONSTRAINT member_invites_token_hash_key UNIQUE (token_hash);
ALTER TABLE public.member_invites ADD CONSTRAINT member_invites_pkey PRIMARY KEY (id);
ALTER TABLE public.member_invites ADD CONSTRAINT member_invites_accepted_profile_id_fkey FOREIGN KEY (accepted_profile_id) REFERENCES profiles(id);
ALTER TABLE public.member_invites ADD CONSTRAINT member_invites_host_account_id_fkey FOREIGN KEY (host_account_id) REFERENCES host_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.member_invites ADD CONSTRAINT member_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES profiles(id);
ALTER TABLE public.member_invites ADD CONSTRAINT member_invites_check CHECK ((expires_at > created_at));
ALTER TABLE public.member_invites ADD CONSTRAINT member_invites_email_check CHECK ((email = lower(email)));
ALTER TABLE public.message_feedback ADD CONSTRAINT message_feedback_message_id_key UNIQUE (message_id);
ALTER TABLE public.message_feedback ADD CONSTRAINT message_feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.message_feedback ADD CONSTRAINT message_feedback_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;
ALTER TABLE public.message_feedback ADD CONSTRAINT message_feedback_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE public.messages ADD CONSTRAINT messages_author_profile_id_fkey FOREIGN KEY (author_profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.nearby_places ADD CONSTRAINT nearby_places_pkey PRIMARY KEY (id);
ALTER TABLE public.nearby_places ADD CONSTRAINT nearby_places_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_host_account_id_fkey FOREIGN KEY (host_account_id) REFERENCES host_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_recipient_profile_id_fkey FOREIGN KEY (recipient_profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_host_account_id_profile_id_key UNIQUE (host_account_id, profile_id);
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_host_account_id_fkey FOREIGN KEY (host_account_id) REFERENCES host_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.product_feedback ADD CONSTRAINT product_feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.product_feedback ADD CONSTRAINT product_feedback_guest_session_id_fkey FOREIGN KEY (guest_session_id) REFERENCES guest_access_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.product_feedback ADD CONSTRAINT product_feedback_host_account_id_fkey FOREIGN KEY (host_account_id) REFERENCES host_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.product_feedback ADD CONSTRAINT product_feedback_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE public.product_feedback ADD CONSTRAINT product_feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE public.product_feedback ADD CONSTRAINT product_feedback_source_check CHECK ((source = ANY (ARRAY['guest'::text, 'host'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.properties ADD CONSTRAINT properties_slug_key UNIQUE (slug);
ALTER TABLE public.properties ADD CONSTRAINT properties_pkey PRIMARY KEY (id);
ALTER TABLE public.properties ADD CONSTRAINT properties_host_account_id_fkey FOREIGN KEY (host_account_id) REFERENCES host_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.property_brain_versions ADD CONSTRAINT property_brain_versions_pkey PRIMARY KEY (property_id);
ALTER TABLE public.property_brain_versions ADD CONSTRAINT property_brain_versions_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.property_contacts ADD CONSTRAINT property_contacts_pkey PRIMARY KEY (id);
ALTER TABLE public.property_contacts ADD CONSTRAINT property_contacts_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.property_knowledge_nodes ADD CONSTRAINT property_knowledge_nodes_pkey PRIMARY KEY (id);
ALTER TABLE public.property_knowledge_nodes ADD CONSTRAINT property_knowledge_nodes_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.property_knowledge_nodes ADD CONSTRAINT property_knowledge_nodes_source_brain_item_id_fkey FOREIGN KEY (source_brain_item_id) REFERENCES brain_items(id) ON DELETE SET NULL;
ALTER TABLE public.property_members ADD CONSTRAINT property_members_property_id_profile_id_key UNIQUE (property_id, profile_id);
ALTER TABLE public.property_members ADD CONSTRAINT property_members_pkey PRIMARY KEY (id);
ALTER TABLE public.property_members ADD CONSTRAINT property_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.property_members ADD CONSTRAINT property_members_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.property_settings ADD CONSTRAINT property_settings_pkey PRIMARY KEY (property_id);
ALTER TABLE public.property_settings ADD CONSTRAINT property_settings_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.property_settings ADD CONSTRAINT property_settings_concierge_tone_preset_chk CHECK (((concierge_tone IS NULL) OR (concierge_tone = ANY (ARRAY['friendly'::text, 'professional'::text, 'luxury_concierge'::text, 'casual'::text, 'family_friendly'::text]))));
ALTER TABLE public.property_settings ADD CONSTRAINT property_settings_response_length_chk CHECK ((response_length = ANY (ARRAY['concise'::text, 'balanced'::text, 'detailed'::text])));
ALTER TABLE public.property_settings ADD CONSTRAINT property_settings_restricted_topic_keys_is_array_chk CHECK ((jsonb_typeof(restricted_topic_keys) = 'array'::text));
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_pkey PRIMARY KEY (id);
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_host_account_id_fkey FOREIGN KEY (host_account_id) REFERENCES host_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_apply_error_check CHECK (((apply_error IS NULL) OR (length(apply_error) <= 500)));
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))));
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_field_path_check CHECK (((field_path ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'::text) AND (length(field_path) <= 120)));
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_label_check CHECK (((length(btrim(label)) >= 1) AND (length(btrim(label)) <= 160)));
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_modified_has_value CHECK (((status <> 'modified'::proposed_update_status) OR (applied_value IS NOT NULL)));
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_resolution_note_check CHECK (((resolution_note IS NULL) OR (length(resolution_note) <= 1000)));
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_review_consistency CHECK ((((status = 'pending'::proposed_update_status) AND (reviewed_at IS NULL)) OR ((status <> 'pending'::proposed_update_status) AND (reviewed_at IS NOT NULL))));
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_source_ref_check CHECK (((source_ref IS NULL) OR (length(source_ref) <= 2000)));
ALTER TABLE public.proposed_updates ADD CONSTRAINT proposed_updates_source_type_check CHECK ((source_type = ANY (ARRAY['listing_url'::text, 'document'::text, 'text_paste'::text, 'tone_migration'::text, 'nearby_refresh'::text, 'ai_suggestion'::text])));
ALTER TABLE public.recommendations ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);
ALTER TABLE public.recommendations ADD CONSTRAINT recommendations_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_assigned_contact_id_fkey FOREIGN KEY (assigned_contact_id) REFERENCES property_contacts(id) ON DELETE SET NULL;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_stay_id_fkey FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_interview_status_check CHECK ((interview_status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'safety_escalated'::text])));
ALTER TABLE public.stays ADD CONSTRAINT stays_pkey PRIMARY KEY (id);
ALTER TABLE public.stays ADD CONSTRAINT stays_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.stays ADD CONSTRAINT stays_guest_identity_id_fkey FOREIGN KEY (guest_identity_id) REFERENCES guest_identities(id) ON DELETE SET NULL;
ALTER TABLE public.stays ADD CONSTRAINT stays_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE public.stripe_events ADD CONSTRAINT stripe_events_pkey PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_host_account_id_key UNIQUE (host_account_id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_host_account_id_fkey FOREIGN KEY (host_account_id) REFERENCES host_accounts(id) ON DELETE CASCADE;

-- ============================================================
-- SECTION 5 — INDEXES
-- ============================================================

CREATE INDEX ai_usage_created_idx ON public.ai_usage USING btree (created_at DESC);
CREATE INDEX ai_usage_kind_idx ON public.ai_usage USING btree (kind);
CREATE INDEX ai_usage_property_created_idx ON public.ai_usage USING btree (property_id, created_at DESC);
CREATE UNIQUE INDEX answer_cache_property_question_uidx ON public.answer_cache USING btree (property_id, question_norm);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at);
CREATE INDEX audit_logs_host_account_id_idx ON public.audit_logs USING btree (host_account_id);
CREATE INDEX audit_logs_property_id_idx ON public.audit_logs USING btree (property_id);
CREATE INDEX brain_items_property_id_category_idx ON public.brain_items USING btree (property_id, category);
CREATE INDEX brain_items_property_id_idx ON public.brain_items USING btree (property_id);
CREATE INDEX brain_items_property_id_visibility_idx ON public.brain_items USING btree (property_id, visibility);
CREATE INDEX consent_records_profile_id_idx ON public.consent_records USING btree (profile_id);
CREATE INDEX conversations_property_created_idx ON public.conversations USING btree (property_id, created_at DESC);
CREATE INDEX conversations_property_id_idx ON public.conversations USING btree (property_id);
CREATE INDEX conversations_stay_id_idx ON public.conversations USING btree (stay_id);
CREATE INDEX document_chunks_embedding_idx ON public.document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');
CREATE INDEX document_chunks_property_id_idx ON public.document_chunks USING btree (property_id);
CREATE INDEX document_chunks_property_id_visibility_idx ON public.document_chunks USING btree (property_id, visibility);
CREATE INDEX documents_property_id_idx ON public.documents USING btree (property_id);
CREATE INDEX escalations_property_id_idx ON public.escalations USING btree (property_id);
CREATE INDEX escalations_status_idx ON public.escalations USING btree (status);
CREATE INDEX extras_orders_extra_idx ON public.extras_orders USING btree (extra_id) WHERE (extra_id IS NOT NULL);
CREATE INDEX extras_orders_property_lifecycle_created_idx ON public.extras_orders USING btree (property_id, lifecycle_status, created_at DESC);
CREATE INDEX extras_orders_stay_idx ON public.extras_orders USING btree (stay_id) WHERE (stay_id IS NOT NULL);
CREATE INDEX guest_access_links_property_idx ON public.guest_access_links USING btree (property_id, created_at DESC);
CREATE INDEX guest_access_links_stay_idx ON public.guest_access_links USING btree (stay_id);
CREATE UNIQUE INDEX guest_access_links_token_hash_uidx ON public.guest_access_links USING btree (token_hash);
CREATE INDEX guest_access_sessions_property_id_idx ON public.guest_access_sessions USING btree (property_id);
CREATE INDEX guest_access_sessions_stay_id_idx ON public.guest_access_sessions USING btree (stay_id);
CREATE INDEX guest_extras_property_display_idx ON public.guest_extras USING btree (property_id, is_favorite DESC, category, title) WHERE active;
CREATE INDEX guest_extras_property_idx ON public.guest_extras USING btree (property_id);
CREATE INDEX guest_extras_property_sort_idx ON public.guest_extras USING btree (property_id, sort_order);
CREATE INDEX guest_identities_contact_hash_idx ON public.guest_identities USING btree (contact_hash);
CREATE INDEX guest_identities_property_id_idx ON public.guest_identities USING btree (property_id);
CREATE INDEX guest_verifications_expires_at_idx ON public.guest_verifications USING btree (expires_at);
CREATE INDEX guest_verifications_property_id_contact_hash_idx ON public.guest_verifications USING btree (property_id, contact_hash);
CREATE INDEX host_accounts_owner_id_idx ON public.host_accounts USING btree (owner_id);
CREATE INDEX host_otp_challenges_user_purpose_idx ON public.host_otp_challenges USING btree (user_id, purpose, created_at DESC);
CREATE INDEX ingestion_jobs_property_id_idx ON public.ingestion_jobs USING btree (property_id);
CREATE INDEX ingestion_jobs_status_idx ON public.ingestion_jobs USING btree (status);
CREATE INDEX legal_acceptances_host_account_idx ON public.legal_acceptances USING btree (host_account_id);
CREATE INDEX legal_acceptances_user_slug_idx ON public.legal_acceptances USING btree (user_id, document_slug);
CREATE INDEX legal_documents_slug_effective_idx ON public.legal_documents USING btree (slug, effective_date DESC);
CREATE UNIQUE INDEX legal_documents_slug_version_uidx ON public.legal_documents USING btree (slug, version);
CREATE INDEX member_invites_account_created_idx ON public.member_invites USING btree (host_account_id, created_at DESC);
CREATE UNIQUE INDEX member_invites_one_live_email_per_account_idx ON public.member_invites USING btree (host_account_id, lower(email)) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));
CREATE INDEX member_invites_token_hash_idx ON public.member_invites USING btree (token_hash);
CREATE INDEX messages_ai_training_excluded_idx ON public.messages USING btree (property_id) WHERE (ai_training_excluded = true);
CREATE INDEX messages_conversation_id_idx ON public.messages USING btree (conversation_id);
CREATE INDEX messages_property_id_idx ON public.messages USING btree (property_id);
CREATE INDEX nearby_places_property_category_idx ON public.nearby_places USING btree (property_id, category);
CREATE INDEX nearby_places_property_distance_idx ON public.nearby_places USING btree (property_id, distance_m);
CREATE INDEX nearby_places_property_idx ON public.nearby_places USING btree (property_id);
CREATE UNIQUE INDEX nearby_places_property_place_uidx ON public.nearby_places USING btree (property_id, place_id);
CREATE INDEX nearby_places_property_reviewed_idx ON public.nearby_places USING btree (property_id, reviewed_at);
CREATE INDEX notifications_host_account_id_idx ON public.notifications USING btree (host_account_id);
CREATE INDEX notifications_recipient_profile_id_idx ON public.notifications USING btree (recipient_profile_id);
CREATE INDEX organization_members_host_account_id_idx ON public.organization_members USING btree (host_account_id);
CREATE INDEX organization_members_profile_id_idx ON public.organization_members USING btree (profile_id);
CREATE INDEX product_feedback_property_idx ON public.product_feedback USING btree (property_id);
CREATE INDEX product_feedback_source_idx ON public.product_feedback USING btree (source, created_at DESC);
CREATE INDEX properties_archived_idx ON public.properties USING btree (host_account_id, archived_at DESC) WHERE ((status = 'archived'::property_status) AND (deleted_at IS NULL));
CREATE INDEX properties_host_account_id_idx ON public.properties USING btree (host_account_id);
CREATE INDEX properties_status_idx ON public.properties USING btree (status);
CREATE INDEX property_contacts_property_id_idx ON public.property_contacts USING btree (property_id);
CREATE INDEX property_knowledge_nodes_embedding_idx ON public.property_knowledge_nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');
CREATE INDEX property_knowledge_nodes_property_idx ON public.property_knowledge_nodes USING btree (property_id);
CREATE UNIQUE INDEX property_knowledge_nodes_ptt_uidx ON public.property_knowledge_nodes USING btree (property_id, node_type, title);
CREATE INDEX property_members_profile_id_idx ON public.property_members USING btree (profile_id);
CREATE INDEX property_members_property_id_idx ON public.property_members USING btree (property_id);
CREATE INDEX proposed_updates_account_pending_idx ON public.proposed_updates USING btree (host_account_id, created_at) WHERE (status = 'pending'::proposed_update_status);
CREATE INDEX proposed_updates_property_status_created_idx ON public.proposed_updates USING btree (property_id, status, created_at);
CREATE INDEX idx_recommendations_property_live ON public.recommendations USING btree (property_id) WHERE ((deleted_at IS NULL) AND (hidden = false) AND (approved = true));
CREATE INDEX recommendations_property_approved_hidden_idx ON public.recommendations USING btree (property_id, approved, hidden);
CREATE INDEX recommendations_property_id_idx ON public.recommendations USING btree (property_id);
CREATE INDEX service_requests_property_id_idx ON public.service_requests USING btree (property_id);
CREATE INDEX service_requests_property_lifecycle_created_idx ON public.service_requests USING btree (property_id, lifecycle_status, created_at DESC);
CREATE INDEX service_requests_status_idx ON public.service_requests USING btree (status);
CREATE INDEX service_requests_urgency_idx ON public.service_requests USING btree (urgency);
CREATE INDEX stays_contact_hash_idx ON public.stays USING btree (contact_hash);
CREATE INDEX stays_property_id_idx ON public.stays USING btree (property_id);
CREATE INDEX stays_property_lifecycle_created_idx ON public.stays USING btree (property_id, lifecycle_status, created_at DESC);
CREATE INDEX stays_status_idx ON public.stays USING btree (status);
CREATE INDEX subscriptions_host_account_id_idx ON public.subscriptions USING btree (host_account_id);
CREATE INDEX subscriptions_trialing_trial_end_idx ON public.subscriptions USING btree (trial_end) WHERE (status = 'trialing'::subscription_status);

-- ============================================================
-- SECTION 6 — ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extras_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_access_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_access_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nearby_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_brain_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_knowledge_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposed_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 7 — POLICIES
-- ============================================================

CREATE POLICY ai_usage_select ON public.ai_usage AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY answer_cache_select ON public.answer_cache AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY audit_select ON public.audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((is_account_member(host_account_id) OR is_admin()));
CREATE POLICY brain_select ON public.brain_items AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY brain_write ON public.brain_items AS PERMISSIVE FOR ALL TO authenticated USING (can_edit_property(property_id)) WITH CHECK (can_edit_property(property_id));
CREATE POLICY consent_select ON public.consent_records AS PERMISSIVE FOR SELECT TO authenticated USING (((profile_id = auth.uid()) OR is_admin()));
CREATE POLICY conv_select ON public.conversations AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY chunks_select ON public.document_chunks AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY docs_select ON public.documents AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY docs_write ON public.documents AS PERMISSIVE FOR ALL TO authenticated USING (can_edit_property(property_id)) WITH CHECK (can_edit_property(property_id));
CREATE POLICY esc_select ON public.escalations AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY esc_update ON public.escalations AS PERMISSIVE FOR UPDATE TO authenticated USING (can_access_property(property_id)) WITH CHECK (can_access_property(property_id));
CREATE POLICY extras_orders_select_members ON public.extras_orders AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY extras_orders_update_editors ON public.extras_orders AS PERMISSIVE FOR UPDATE TO authenticated USING (can_edit_property(property_id)) WITH CHECK (can_edit_property(property_id));
CREATE POLICY guest_access_links_select ON public.guest_access_links AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY guest_access_sessions_select ON public.guest_access_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY guest_extras_delete_editors ON public.guest_extras AS PERMISSIVE FOR DELETE TO authenticated USING (can_edit_property(property_id));
CREATE POLICY guest_extras_insert_editors ON public.guest_extras AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_edit_property(property_id));
CREATE POLICY guest_extras_select_members ON public.guest_extras AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY guest_extras_update_editors ON public.guest_extras AS PERMISSIVE FOR UPDATE TO authenticated USING (can_edit_property(property_id)) WITH CHECK (can_edit_property(property_id));
CREATE POLICY guestid_select ON public.guest_identities AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY guest_verifications_select ON public.guest_verifications AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY accounts_member_select ON public.host_accounts AS PERMISSIVE FOR SELECT TO authenticated USING ((is_account_member(id) OR is_admin()));
CREATE POLICY accounts_owner_update ON public.host_accounts AS PERMISSIVE FOR UPDATE TO authenticated USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY jobs_select ON public.ingestion_jobs AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY jobs_write ON public.ingestion_jobs AS PERMISSIVE FOR ALL TO authenticated USING (can_edit_property(property_id)) WITH CHECK (can_edit_property(property_id));
CREATE POLICY legal_acceptances_insert_own ON public.legal_acceptances AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY legal_acceptances_select_own ON public.legal_acceptances AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY legal_documents_select_all ON public.legal_documents AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY member_invites_owner_insert ON public.member_invites AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT is_account_owner(member_invites.host_account_id) AS is_account_owner));
CREATE POLICY member_invites_owner_select ON public.member_invites AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT is_account_owner(member_invites.host_account_id) AS is_account_owner));
CREATE POLICY member_invites_owner_update ON public.member_invites AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT is_account_owner(member_invites.host_account_id) AS is_account_owner)) WITH CHECK (( SELECT is_account_owner(member_invites.host_account_id) AS is_account_owner));
CREATE POLICY feedback_select ON public.message_feedback AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY msg_host_insert ON public.messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_access_property(property_id) AND (role = 'host'::conversation_role)));
CREATE POLICY msg_select ON public.messages AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY nearby_places_delete_editors ON public.nearby_places AS PERMISSIVE FOR DELETE TO authenticated USING (can_edit_property(property_id));
CREATE POLICY nearby_places_insert_editors ON public.nearby_places AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_edit_property(property_id));
CREATE POLICY nearby_places_select_members ON public.nearby_places AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY nearby_places_update_editors ON public.nearby_places AS PERMISSIVE FOR UPDATE TO authenticated USING (can_edit_property(property_id)) WITH CHECK (can_edit_property(property_id));
CREATE POLICY notif_select ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING (((recipient_profile_id = auth.uid()) OR is_account_member(host_account_id)));
CREATE POLICY notif_update ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING (((recipient_profile_id = auth.uid()) OR is_account_member(host_account_id))) WITH CHECK (((recipient_profile_id = auth.uid()) OR is_account_member(host_account_id)));
CREATE POLICY orgmembers_owner_write ON public.organization_members AS PERMISSIVE FOR ALL TO authenticated USING (is_account_owner(host_account_id)) WITH CHECK (is_account_owner(host_account_id));
CREATE POLICY orgmembers_select ON public.organization_members AS PERMISSIVE FOR SELECT TO authenticated USING ((is_account_member(host_account_id) OR is_admin()));
CREATE POLICY product_feedback_insert_host ON public.product_feedback AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((source = 'host'::text) AND (host_account_id IN ( SELECT ha.id
   FROM host_accounts ha
  WHERE (ha.owner_id = auth.uid())))));
CREATE POLICY profiles_self_select ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((id = auth.uid()) OR is_admin()));
CREATE POLICY profiles_self_update ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
CREATE POLICY properties_delete ON public.properties AS PERMISSIVE FOR DELETE TO authenticated USING (is_account_owner(host_account_id));
CREATE POLICY properties_insert ON public.properties AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_account_owner(host_account_id));
CREATE POLICY properties_select ON public.properties AS PERMISSIVE FOR SELECT TO authenticated USING ((is_account_member(host_account_id) OR can_access_property(id) OR is_admin()));
CREATE POLICY properties_update ON public.properties AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_account_owner(host_account_id) OR can_edit_property(id))) WITH CHECK ((is_account_owner(host_account_id) OR can_edit_property(id)));
CREATE POLICY property_brain_versions_select ON public.property_brain_versions AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY propcontacts_select ON public.property_contacts AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY propcontacts_write ON public.property_contacts AS PERMISSIVE FOR ALL TO authenticated USING (can_edit_property(property_id)) WITH CHECK (can_edit_property(property_id));
CREATE POLICY property_knowledge_nodes_select_members ON public.property_knowledge_nodes AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY propmembers_select ON public.property_members AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY propmembers_write ON public.property_members AS PERMISSIVE FOR ALL TO authenticated USING (is_account_owner(private.property_account(property_id))) WITH CHECK (is_account_owner(private.property_account(property_id)));
CREATE POLICY propsettings_select ON public.property_settings AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY propsettings_write ON public.property_settings AS PERMISSIVE FOR ALL TO authenticated USING (can_edit_property(property_id)) WITH CHECK (can_edit_property(property_id));
CREATE POLICY proposed_updates_select_members ON public.proposed_updates AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY proposed_updates_update_editors ON public.proposed_updates AS PERMISSIVE FOR UPDATE TO authenticated USING (can_edit_property(property_id)) WITH CHECK (can_edit_property(property_id));
CREATE POLICY recs_select ON public.recommendations AS PERMISSIVE FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY recs_write ON public.recommendations AS PERMISSIVE FOR ALL TO authenticated USING (can_edit_property(property_id)) WITH CHECK (can_edit_property(property_id));
CREATE POLICY svc_select ON public.service_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY svc_update ON public.service_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (can_access_property(property_id)) WITH CHECK (can_access_property(property_id));
CREATE POLICY stays_select ON public.stays AS PERMISSIVE FOR SELECT TO authenticated USING ((can_access_property(property_id) OR is_admin()));
CREATE POLICY stays_write ON public.stays AS PERMISSIVE FOR ALL TO authenticated USING (can_access_property(property_id)) WITH CHECK (can_access_property(property_id));
CREATE POLICY stripe_events_no_access ON public.stripe_events AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY subs_select ON public.subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING ((is_account_owner(host_account_id) OR is_admin()));

-- ============================================================
-- SECTION 8 — FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION private.property_account(prop uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select host_account_id from public.properties where id = prop;
$function$

CREATE OR REPLACE FUNCTION public.account_conversation_usage(p_host_account_id uuid, p_since timestamp with time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count bigint;
begin
  if current_setting('role', true) is distinct from 'service_role'
     and not public.is_account_member(p_host_account_id) then
    raise exception 'not a member of this account' using errcode = '42501';
  end if;

  select count(*) into v_count
  from public.conversations c
  join public.properties p on p.id = c.property_id
  where p.host_account_id = p_host_account_id
    and c.created_at >= p_since;

  return coalesce(v_count, 0);
end;
$function$

CREATE OR REPLACE FUNCTION public.bump_brain_version(p_property_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v integer;
begin
  insert into public.property_brain_versions (property_id, version, updated_at)
  values (p_property_id, 2, now())
  on conflict (property_id)
  do update set version = public.property_brain_versions.version + 1,
                updated_at = now()
  returning version into v;
  return v;
end;
$function$

CREATE OR REPLACE FUNCTION public.can_access_property(prop uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(
    select 1 from properties p
    join host_accounts a on a.id = p.host_account_id
    where p.id = prop and a.owner_id = auth.uid()
  ) or exists(
    select 1 from property_members pm where pm.property_id = prop and pm.profile_id = auth.uid()
  );
$function$

CREATE OR REPLACE FUNCTION public.can_edit_property(prop uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(
    select 1 from properties p join host_accounts a on a.id = p.host_account_id
    where p.id = prop and a.owner_id = auth.uid()
  ) or exists(
    select 1 from property_members pm where pm.property_id = prop and pm.profile_id = auth.uid() and pm.can_edit_brain = true
  );
$function$

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare new_account uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));

  insert into public.host_accounts (name, owner_id)
  values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)) || '''s account', new.id)
  returning id into new_account;

  insert into public.organization_members (host_account_id, profile_id, role, accepted_at)
  values (new_account, new.id, 'host_owner', now());
  return new;
end;$function$

CREATE OR REPLACE FUNCTION public.is_account_member(acc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from organization_members m where m.host_account_id = acc and m.profile_id = auth.uid());
$function$

CREATE OR REPLACE FUNCTION public.is_account_owner(acc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from host_accounts a where a.id = acc and a.owner_id = auth.uid());
$function$

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from profiles where id = auth.uid() and is_admin = true);
$function$

CREATE OR REPLACE FUNCTION public.match_property_chunks(p_property_id uuid, p_query_embedding vector, p_match_count integer DEFAULT 6, p_guest_only boolean DEFAULT true)
 RETURNS TABLE(id uuid, brain_item_id uuid, document_id uuid, category brain_category, content text, similarity double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin')
     and not public.can_access_property(p_property_id) then
    raise exception 'not authorized for property %', p_property_id
      using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.brain_item_id,
    c.document_id,
    c.category,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.document_chunks c
  where c.property_id = p_property_id
    and c.embedding is not null
    and (not p_guest_only or c.visibility = 'guest')
  order by c.embedding <=> p_query_embedding
  limit greatest(coalesce(p_match_count, 6), 1);
end;
$function$

CREATE OR REPLACE FUNCTION public.match_property_knowledge(p_property_id uuid, p_query_embedding vector, p_node_types text[] DEFAULT NULL::text[], p_match_count integer DEFAULT 4)
 RETURNS TABLE(id uuid, property_id uuid, node_type text, title text, data jsonb, content text, similarity double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin')
     and not public.can_access_property(p_property_id) then
    raise exception 'not authorized for property %', p_property_id
      using errcode = '42501';
  end if;

  return query
  select
    n.id,
    n.property_id,
    n.node_type,
    n.title,
    n.data,
    n.content,
    1 - (n.embedding <=> p_query_embedding) as similarity
  from public.property_knowledge_nodes n
  where n.property_id = p_property_id
    and n.embedding is not null
    and (p_node_types is null or n.node_type = any (p_node_types))
  order by n.embedding <=> p_query_embedding
  limit greatest(coalesce(p_match_count, 4), 1);
end;
$function$

CREATE OR REPLACE FUNCTION public.prevent_is_admin_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_admin is distinct from old.is_admin then
    if coalesce(auth.role(), '') is distinct from 'service_role' then
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.revoke_expired_member_invite_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update public.member_invites
  set revoked_at = now()
  where host_account_id = new.host_account_id
    and lower(email) = lower(new.email)
    and accepted_at is null
    and revoked_at is null
    and expires_at <= now();
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end;$function$

CREATE OR REPLACE FUNCTION public.tg_extras_order_archived_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status in ('fulfilled', 'declined', 'cancelled') then
    if old.status is null or old.status not in ('fulfilled', 'declined', 'cancelled') then
      new.archived_at := now();
    end if;
  else
    new.archived_at := null;
  end if;
  return new;
end $function$

CREATE OR REPLACE FUNCTION public.tg_extras_order_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$

CREATE OR REPLACE FUNCTION public.tg_proposed_update_review_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  if new.status <> 'pending' and (old.status is null or old.status = 'pending') then
    new.reviewed_at := coalesce(new.reviewed_at, now());
  elsif new.status = 'pending' then
    new.reviewed_at := null;
  end if;
  return new;
end $function$

CREATE OR REPLACE FUNCTION public.tg_service_request_archived_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status in ('resolved','closed') then
    if old.status is null or old.status not in ('resolved','closed') then
      new.archived_at := now();
    end if;
  else
    new.archived_at := null;
  end if;
  return new;
end $function$

CREATE OR REPLACE FUNCTION public.tg_stay_archived_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status in ('completed','revoked') then
    if old.status is null or old.status not in ('completed','revoked') then
      new.archived_at := now();
    end if;
  else
    new.archived_at := null;
  end if;
  return new;
end $function$


-- ============================================================
-- SECTION 9 — TRIGGERS
-- ============================================================

CREATE TRIGGER trg_updated_brain_items BEFORE UPDATE ON public.brain_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_updated_conversations BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_updated_documents BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_updated_escalations BEFORE UPDATE ON public.escalations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER extras_orders_archived_at BEFORE INSERT OR UPDATE OF status ON public.extras_orders FOR EACH ROW EXECUTE FUNCTION tg_extras_order_archived_at();
CREATE TRIGGER extras_orders_touch_updated_at BEFORE UPDATE ON public.extras_orders FOR EACH ROW EXECUTE FUNCTION tg_extras_order_touch_updated_at();
CREATE TRIGGER trg_updated_host_accounts BEFORE UPDATE ON public.host_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_updated_ingestion_jobs BEFORE UPDATE ON public.ingestion_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_revoke_expired_member_invite_before_insert BEFORE INSERT ON public.member_invites FOR EACH ROW EXECUTE FUNCTION revoke_expired_member_invite_before_insert();
CREATE TRIGGER trg_prevent_is_admin_self_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_is_admin_self_update();
CREATE TRIGGER trg_updated_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_updated_properties BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_updated_property_settings BEFORE UPDATE ON public.property_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER proposed_updates_review_stamp BEFORE INSERT OR UPDATE ON public.proposed_updates FOR EACH ROW EXECUTE FUNCTION tg_proposed_update_review_stamp();
CREATE TRIGGER service_requests_archived_at BEFORE INSERT OR UPDATE OF status ON public.service_requests FOR EACH ROW EXECUTE FUNCTION tg_service_request_archived_at();
CREATE TRIGGER trg_updated_service_requests BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER stays_archived_at BEFORE INSERT OR UPDATE OF status ON public.stays FOR EACH ROW EXECUTE FUNCTION tg_stay_archived_at();
CREATE TRIGGER trg_updated_stays BEFORE UPDATE ON public.stays FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_updated_subscriptions BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SECTION 10 — GRANTS
-- ============================================================

GRANT EXECUTE ON FUNCTION private.property_account(prop uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.property_account(prop uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_conversation_usage(p_host_account_id uuid, p_since timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_conversation_usage(p_host_account_id uuid, p_since timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_brain_version(p_property_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_property(prop uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_property(prop uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_property(prop uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_property(prop uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_account_member(acc uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_member(acc uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_account_owner(acc uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_owner(acc uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.match_property_chunks(p_property_id uuid, p_query_embedding vector, p_match_count integer, p_guest_only boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_property_knowledge(p_property_id uuid, p_query_embedding vector, p_node_types text[], p_match_count integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_is_admin_self_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_expired_member_invite_before_insert() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_extras_order_archived_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_extras_order_touch_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_proposed_update_review_stamp() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_service_request_archived_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_stay_archived_at() TO service_role;
GRANT DELETE ON TABLE public.ai_usage TO anon;
GRANT INSERT ON TABLE public.ai_usage TO anon;
GRANT MAINTAIN ON TABLE public.ai_usage TO anon;
GRANT REFERENCES ON TABLE public.ai_usage TO anon;
GRANT SELECT ON TABLE public.ai_usage TO anon;
GRANT TRIGGER ON TABLE public.ai_usage TO anon;
GRANT TRUNCATE ON TABLE public.ai_usage TO anon;
GRANT UPDATE ON TABLE public.ai_usage TO anon;
GRANT DELETE ON TABLE public.ai_usage TO authenticated;
GRANT INSERT ON TABLE public.ai_usage TO authenticated;
GRANT MAINTAIN ON TABLE public.ai_usage TO authenticated;
GRANT REFERENCES ON TABLE public.ai_usage TO authenticated;
GRANT SELECT ON TABLE public.ai_usage TO authenticated;
GRANT TRIGGER ON TABLE public.ai_usage TO authenticated;
GRANT TRUNCATE ON TABLE public.ai_usage TO authenticated;
GRANT UPDATE ON TABLE public.ai_usage TO authenticated;
GRANT DELETE ON TABLE public.ai_usage TO service_role;
GRANT INSERT ON TABLE public.ai_usage TO service_role;
GRANT MAINTAIN ON TABLE public.ai_usage TO service_role;
GRANT REFERENCES ON TABLE public.ai_usage TO service_role;
GRANT SELECT ON TABLE public.ai_usage TO service_role;
GRANT TRIGGER ON TABLE public.ai_usage TO service_role;
GRANT TRUNCATE ON TABLE public.ai_usage TO service_role;
GRANT UPDATE ON TABLE public.ai_usage TO service_role;
GRANT DELETE ON TABLE public.answer_cache TO anon;
GRANT INSERT ON TABLE public.answer_cache TO anon;
GRANT MAINTAIN ON TABLE public.answer_cache TO anon;
GRANT REFERENCES ON TABLE public.answer_cache TO anon;
GRANT SELECT ON TABLE public.answer_cache TO anon;
GRANT TRIGGER ON TABLE public.answer_cache TO anon;
GRANT TRUNCATE ON TABLE public.answer_cache TO anon;
GRANT UPDATE ON TABLE public.answer_cache TO anon;
GRANT DELETE ON TABLE public.answer_cache TO authenticated;
GRANT INSERT ON TABLE public.answer_cache TO authenticated;
GRANT MAINTAIN ON TABLE public.answer_cache TO authenticated;
GRANT REFERENCES ON TABLE public.answer_cache TO authenticated;
GRANT SELECT ON TABLE public.answer_cache TO authenticated;
GRANT TRIGGER ON TABLE public.answer_cache TO authenticated;
GRANT TRUNCATE ON TABLE public.answer_cache TO authenticated;
GRANT UPDATE ON TABLE public.answer_cache TO authenticated;
GRANT DELETE ON TABLE public.answer_cache TO service_role;
GRANT INSERT ON TABLE public.answer_cache TO service_role;
GRANT MAINTAIN ON TABLE public.answer_cache TO service_role;
GRANT REFERENCES ON TABLE public.answer_cache TO service_role;
GRANT SELECT ON TABLE public.answer_cache TO service_role;
GRANT TRIGGER ON TABLE public.answer_cache TO service_role;
GRANT TRUNCATE ON TABLE public.answer_cache TO service_role;
GRANT UPDATE ON TABLE public.answer_cache TO service_role;
GRANT DELETE ON TABLE public.app_settings TO service_role;
GRANT INSERT ON TABLE public.app_settings TO service_role;
GRANT MAINTAIN ON TABLE public.app_settings TO service_role;
GRANT REFERENCES ON TABLE public.app_settings TO service_role;
GRANT SELECT ON TABLE public.app_settings TO service_role;
GRANT TRIGGER ON TABLE public.app_settings TO service_role;
GRANT TRUNCATE ON TABLE public.app_settings TO service_role;
GRANT UPDATE ON TABLE public.app_settings TO service_role;
GRANT DELETE ON TABLE public.audit_logs TO anon;
GRANT INSERT ON TABLE public.audit_logs TO anon;
GRANT MAINTAIN ON TABLE public.audit_logs TO anon;
GRANT REFERENCES ON TABLE public.audit_logs TO anon;
GRANT SELECT ON TABLE public.audit_logs TO anon;
GRANT TRIGGER ON TABLE public.audit_logs TO anon;
GRANT TRUNCATE ON TABLE public.audit_logs TO anon;
GRANT UPDATE ON TABLE public.audit_logs TO anon;
GRANT DELETE ON TABLE public.audit_logs TO authenticated;
GRANT INSERT ON TABLE public.audit_logs TO authenticated;
GRANT MAINTAIN ON TABLE public.audit_logs TO authenticated;
GRANT REFERENCES ON TABLE public.audit_logs TO authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT TRIGGER ON TABLE public.audit_logs TO authenticated;
GRANT TRUNCATE ON TABLE public.audit_logs TO authenticated;
GRANT UPDATE ON TABLE public.audit_logs TO authenticated;
GRANT DELETE ON TABLE public.audit_logs TO service_role;
GRANT INSERT ON TABLE public.audit_logs TO service_role;
GRANT MAINTAIN ON TABLE public.audit_logs TO service_role;
GRANT REFERENCES ON TABLE public.audit_logs TO service_role;
GRANT SELECT ON TABLE public.audit_logs TO service_role;
GRANT TRIGGER ON TABLE public.audit_logs TO service_role;
GRANT TRUNCATE ON TABLE public.audit_logs TO service_role;
GRANT UPDATE ON TABLE public.audit_logs TO service_role;
GRANT DELETE ON TABLE public.brain_items TO anon;
GRANT INSERT ON TABLE public.brain_items TO anon;
GRANT MAINTAIN ON TABLE public.brain_items TO anon;
GRANT REFERENCES ON TABLE public.brain_items TO anon;
GRANT SELECT ON TABLE public.brain_items TO anon;
GRANT TRIGGER ON TABLE public.brain_items TO anon;
GRANT TRUNCATE ON TABLE public.brain_items TO anon;
GRANT UPDATE ON TABLE public.brain_items TO anon;
GRANT DELETE ON TABLE public.brain_items TO authenticated;
GRANT INSERT ON TABLE public.brain_items TO authenticated;
GRANT MAINTAIN ON TABLE public.brain_items TO authenticated;
GRANT REFERENCES ON TABLE public.brain_items TO authenticated;
GRANT SELECT ON TABLE public.brain_items TO authenticated;
GRANT TRIGGER ON TABLE public.brain_items TO authenticated;
GRANT TRUNCATE ON TABLE public.brain_items TO authenticated;
GRANT UPDATE ON TABLE public.brain_items TO authenticated;
GRANT DELETE ON TABLE public.brain_items TO service_role;
GRANT INSERT ON TABLE public.brain_items TO service_role;
GRANT MAINTAIN ON TABLE public.brain_items TO service_role;
GRANT REFERENCES ON TABLE public.brain_items TO service_role;
GRANT SELECT ON TABLE public.brain_items TO service_role;
GRANT TRIGGER ON TABLE public.brain_items TO service_role;
GRANT TRUNCATE ON TABLE public.brain_items TO service_role;
GRANT UPDATE ON TABLE public.brain_items TO service_role;
GRANT DELETE ON TABLE public.consent_records TO anon;
GRANT INSERT ON TABLE public.consent_records TO anon;
GRANT MAINTAIN ON TABLE public.consent_records TO anon;
GRANT REFERENCES ON TABLE public.consent_records TO anon;
GRANT SELECT ON TABLE public.consent_records TO anon;
GRANT TRIGGER ON TABLE public.consent_records TO anon;
GRANT TRUNCATE ON TABLE public.consent_records TO anon;
GRANT UPDATE ON TABLE public.consent_records TO anon;
GRANT DELETE ON TABLE public.consent_records TO authenticated;
GRANT INSERT ON TABLE public.consent_records TO authenticated;
GRANT MAINTAIN ON TABLE public.consent_records TO authenticated;
GRANT REFERENCES ON TABLE public.consent_records TO authenticated;
GRANT SELECT ON TABLE public.consent_records TO authenticated;
GRANT TRIGGER ON TABLE public.consent_records TO authenticated;
GRANT TRUNCATE ON TABLE public.consent_records TO authenticated;
GRANT UPDATE ON TABLE public.consent_records TO authenticated;
GRANT DELETE ON TABLE public.consent_records TO service_role;
GRANT INSERT ON TABLE public.consent_records TO service_role;
GRANT MAINTAIN ON TABLE public.consent_records TO service_role;
GRANT REFERENCES ON TABLE public.consent_records TO service_role;
GRANT SELECT ON TABLE public.consent_records TO service_role;
GRANT TRIGGER ON TABLE public.consent_records TO service_role;
GRANT TRUNCATE ON TABLE public.consent_records TO service_role;
GRANT UPDATE ON TABLE public.consent_records TO service_role;
GRANT DELETE ON TABLE public.conversations TO anon;
GRANT INSERT ON TABLE public.conversations TO anon;
GRANT MAINTAIN ON TABLE public.conversations TO anon;
GRANT REFERENCES ON TABLE public.conversations TO anon;
GRANT SELECT ON TABLE public.conversations TO anon;
GRANT TRIGGER ON TABLE public.conversations TO anon;
GRANT TRUNCATE ON TABLE public.conversations TO anon;
GRANT UPDATE ON TABLE public.conversations TO anon;
GRANT DELETE ON TABLE public.conversations TO authenticated;
GRANT INSERT ON TABLE public.conversations TO authenticated;
GRANT MAINTAIN ON TABLE public.conversations TO authenticated;
GRANT REFERENCES ON TABLE public.conversations TO authenticated;
GRANT SELECT ON TABLE public.conversations TO authenticated;
GRANT TRIGGER ON TABLE public.conversations TO authenticated;
GRANT TRUNCATE ON TABLE public.conversations TO authenticated;
GRANT UPDATE ON TABLE public.conversations TO authenticated;
GRANT DELETE ON TABLE public.conversations TO service_role;
GRANT INSERT ON TABLE public.conversations TO service_role;
GRANT MAINTAIN ON TABLE public.conversations TO service_role;
GRANT REFERENCES ON TABLE public.conversations TO service_role;
GRANT SELECT ON TABLE public.conversations TO service_role;
GRANT TRIGGER ON TABLE public.conversations TO service_role;
GRANT TRUNCATE ON TABLE public.conversations TO service_role;
GRANT UPDATE ON TABLE public.conversations TO service_role;
GRANT DELETE ON TABLE public.document_chunks TO anon;
GRANT INSERT ON TABLE public.document_chunks TO anon;
GRANT MAINTAIN ON TABLE public.document_chunks TO anon;
GRANT REFERENCES ON TABLE public.document_chunks TO anon;
GRANT SELECT ON TABLE public.document_chunks TO anon;
GRANT TRIGGER ON TABLE public.document_chunks TO anon;
GRANT TRUNCATE ON TABLE public.document_chunks TO anon;
GRANT UPDATE ON TABLE public.document_chunks TO anon;
GRANT DELETE ON TABLE public.document_chunks TO authenticated;
GRANT INSERT ON TABLE public.document_chunks TO authenticated;
GRANT MAINTAIN ON TABLE public.document_chunks TO authenticated;
GRANT REFERENCES ON TABLE public.document_chunks TO authenticated;
GRANT SELECT ON TABLE public.document_chunks TO authenticated;
GRANT TRIGGER ON TABLE public.document_chunks TO authenticated;
GRANT TRUNCATE ON TABLE public.document_chunks TO authenticated;
GRANT UPDATE ON TABLE public.document_chunks TO authenticated;
GRANT DELETE ON TABLE public.document_chunks TO service_role;
GRANT INSERT ON TABLE public.document_chunks TO service_role;
GRANT MAINTAIN ON TABLE public.document_chunks TO service_role;
GRANT REFERENCES ON TABLE public.document_chunks TO service_role;
GRANT SELECT ON TABLE public.document_chunks TO service_role;
GRANT TRIGGER ON TABLE public.document_chunks TO service_role;
GRANT TRUNCATE ON TABLE public.document_chunks TO service_role;
GRANT UPDATE ON TABLE public.document_chunks TO service_role;
GRANT DELETE ON TABLE public.documents TO anon;
GRANT INSERT ON TABLE public.documents TO anon;
GRANT MAINTAIN ON TABLE public.documents TO anon;
GRANT REFERENCES ON TABLE public.documents TO anon;
GRANT SELECT ON TABLE public.documents TO anon;
GRANT TRIGGER ON TABLE public.documents TO anon;
GRANT TRUNCATE ON TABLE public.documents TO anon;
GRANT UPDATE ON TABLE public.documents TO anon;
GRANT DELETE ON TABLE public.documents TO authenticated;
GRANT INSERT ON TABLE public.documents TO authenticated;
GRANT MAINTAIN ON TABLE public.documents TO authenticated;
GRANT REFERENCES ON TABLE public.documents TO authenticated;
GRANT SELECT ON TABLE public.documents TO authenticated;
GRANT TRIGGER ON TABLE public.documents TO authenticated;
GRANT TRUNCATE ON TABLE public.documents TO authenticated;
GRANT UPDATE ON TABLE public.documents TO authenticated;
GRANT DELETE ON TABLE public.documents TO service_role;
GRANT INSERT ON TABLE public.documents TO service_role;
GRANT MAINTAIN ON TABLE public.documents TO service_role;
GRANT REFERENCES ON TABLE public.documents TO service_role;
GRANT SELECT ON TABLE public.documents TO service_role;
GRANT TRIGGER ON TABLE public.documents TO service_role;
GRANT TRUNCATE ON TABLE public.documents TO service_role;
GRANT UPDATE ON TABLE public.documents TO service_role;
GRANT DELETE ON TABLE public.escalations TO anon;
GRANT INSERT ON TABLE public.escalations TO anon;
GRANT MAINTAIN ON TABLE public.escalations TO anon;
GRANT REFERENCES ON TABLE public.escalations TO anon;
GRANT SELECT ON TABLE public.escalations TO anon;
GRANT TRIGGER ON TABLE public.escalations TO anon;
GRANT TRUNCATE ON TABLE public.escalations TO anon;
GRANT UPDATE ON TABLE public.escalations TO anon;
GRANT DELETE ON TABLE public.escalations TO authenticated;
GRANT INSERT ON TABLE public.escalations TO authenticated;
GRANT MAINTAIN ON TABLE public.escalations TO authenticated;
GRANT REFERENCES ON TABLE public.escalations TO authenticated;
GRANT SELECT ON TABLE public.escalations TO authenticated;
GRANT TRIGGER ON TABLE public.escalations TO authenticated;
GRANT TRUNCATE ON TABLE public.escalations TO authenticated;
GRANT UPDATE ON TABLE public.escalations TO authenticated;
GRANT DELETE ON TABLE public.escalations TO service_role;
GRANT INSERT ON TABLE public.escalations TO service_role;
GRANT MAINTAIN ON TABLE public.escalations TO service_role;
GRANT REFERENCES ON TABLE public.escalations TO service_role;
GRANT SELECT ON TABLE public.escalations TO service_role;
GRANT TRIGGER ON TABLE public.escalations TO service_role;
GRANT TRUNCATE ON TABLE public.escalations TO service_role;
GRANT UPDATE ON TABLE public.escalations TO service_role;
GRANT DELETE ON TABLE public.extras_orders TO anon;
GRANT INSERT ON TABLE public.extras_orders TO anon;
GRANT MAINTAIN ON TABLE public.extras_orders TO anon;
GRANT REFERENCES ON TABLE public.extras_orders TO anon;
GRANT SELECT ON TABLE public.extras_orders TO anon;
GRANT TRIGGER ON TABLE public.extras_orders TO anon;
GRANT TRUNCATE ON TABLE public.extras_orders TO anon;
GRANT UPDATE ON TABLE public.extras_orders TO anon;
GRANT DELETE ON TABLE public.extras_orders TO authenticated;
GRANT INSERT ON TABLE public.extras_orders TO authenticated;
GRANT MAINTAIN ON TABLE public.extras_orders TO authenticated;
GRANT REFERENCES ON TABLE public.extras_orders TO authenticated;
GRANT SELECT ON TABLE public.extras_orders TO authenticated;
GRANT TRIGGER ON TABLE public.extras_orders TO authenticated;
GRANT TRUNCATE ON TABLE public.extras_orders TO authenticated;
GRANT UPDATE ON TABLE public.extras_orders TO authenticated;
GRANT DELETE ON TABLE public.extras_orders TO service_role;
GRANT INSERT ON TABLE public.extras_orders TO service_role;
GRANT MAINTAIN ON TABLE public.extras_orders TO service_role;
GRANT REFERENCES ON TABLE public.extras_orders TO service_role;
GRANT SELECT ON TABLE public.extras_orders TO service_role;
GRANT TRIGGER ON TABLE public.extras_orders TO service_role;
GRANT TRUNCATE ON TABLE public.extras_orders TO service_role;
GRANT UPDATE ON TABLE public.extras_orders TO service_role;
GRANT DELETE ON TABLE public.guest_access_links TO anon;
GRANT INSERT ON TABLE public.guest_access_links TO anon;
GRANT MAINTAIN ON TABLE public.guest_access_links TO anon;
GRANT REFERENCES ON TABLE public.guest_access_links TO anon;
GRANT SELECT ON TABLE public.guest_access_links TO anon;
GRANT TRIGGER ON TABLE public.guest_access_links TO anon;
GRANT TRUNCATE ON TABLE public.guest_access_links TO anon;
GRANT UPDATE ON TABLE public.guest_access_links TO anon;
GRANT DELETE ON TABLE public.guest_access_links TO authenticated;
GRANT INSERT ON TABLE public.guest_access_links TO authenticated;
GRANT MAINTAIN ON TABLE public.guest_access_links TO authenticated;
GRANT REFERENCES ON TABLE public.guest_access_links TO authenticated;
GRANT SELECT ON TABLE public.guest_access_links TO authenticated;
GRANT TRIGGER ON TABLE public.guest_access_links TO authenticated;
GRANT TRUNCATE ON TABLE public.guest_access_links TO authenticated;
GRANT UPDATE ON TABLE public.guest_access_links TO authenticated;
GRANT DELETE ON TABLE public.guest_access_links TO service_role;
GRANT INSERT ON TABLE public.guest_access_links TO service_role;
GRANT MAINTAIN ON TABLE public.guest_access_links TO service_role;
GRANT REFERENCES ON TABLE public.guest_access_links TO service_role;
GRANT SELECT ON TABLE public.guest_access_links TO service_role;
GRANT TRIGGER ON TABLE public.guest_access_links TO service_role;
GRANT TRUNCATE ON TABLE public.guest_access_links TO service_role;
GRANT UPDATE ON TABLE public.guest_access_links TO service_role;
GRANT DELETE ON TABLE public.guest_access_sessions TO anon;
GRANT INSERT ON TABLE public.guest_access_sessions TO anon;
GRANT MAINTAIN ON TABLE public.guest_access_sessions TO anon;
GRANT REFERENCES ON TABLE public.guest_access_sessions TO anon;
GRANT SELECT ON TABLE public.guest_access_sessions TO anon;
GRANT TRIGGER ON TABLE public.guest_access_sessions TO anon;
GRANT TRUNCATE ON TABLE public.guest_access_sessions TO anon;
GRANT UPDATE ON TABLE public.guest_access_sessions TO anon;
GRANT DELETE ON TABLE public.guest_access_sessions TO authenticated;
GRANT INSERT ON TABLE public.guest_access_sessions TO authenticated;
GRANT MAINTAIN ON TABLE public.guest_access_sessions TO authenticated;
GRANT REFERENCES ON TABLE public.guest_access_sessions TO authenticated;
GRANT SELECT ON TABLE public.guest_access_sessions TO authenticated;
GRANT TRIGGER ON TABLE public.guest_access_sessions TO authenticated;
GRANT TRUNCATE ON TABLE public.guest_access_sessions TO authenticated;
GRANT UPDATE ON TABLE public.guest_access_sessions TO authenticated;
GRANT DELETE ON TABLE public.guest_access_sessions TO service_role;
GRANT INSERT ON TABLE public.guest_access_sessions TO service_role;
GRANT MAINTAIN ON TABLE public.guest_access_sessions TO service_role;
GRANT REFERENCES ON TABLE public.guest_access_sessions TO service_role;
GRANT SELECT ON TABLE public.guest_access_sessions TO service_role;
GRANT TRIGGER ON TABLE public.guest_access_sessions TO service_role;
GRANT TRUNCATE ON TABLE public.guest_access_sessions TO service_role;
GRANT UPDATE ON TABLE public.guest_access_sessions TO service_role;
GRANT DELETE ON TABLE public.guest_extras TO anon;
GRANT INSERT ON TABLE public.guest_extras TO anon;
GRANT MAINTAIN ON TABLE public.guest_extras TO anon;
GRANT REFERENCES ON TABLE public.guest_extras TO anon;
GRANT SELECT ON TABLE public.guest_extras TO anon;
GRANT TRIGGER ON TABLE public.guest_extras TO anon;
GRANT TRUNCATE ON TABLE public.guest_extras TO anon;
GRANT UPDATE ON TABLE public.guest_extras TO anon;
GRANT DELETE ON TABLE public.guest_extras TO authenticated;
GRANT INSERT ON TABLE public.guest_extras TO authenticated;
GRANT MAINTAIN ON TABLE public.guest_extras TO authenticated;
GRANT REFERENCES ON TABLE public.guest_extras TO authenticated;
GRANT SELECT ON TABLE public.guest_extras TO authenticated;
GRANT TRIGGER ON TABLE public.guest_extras TO authenticated;
GRANT TRUNCATE ON TABLE public.guest_extras TO authenticated;
GRANT UPDATE ON TABLE public.guest_extras TO authenticated;
GRANT DELETE ON TABLE public.guest_extras TO service_role;
GRANT INSERT ON TABLE public.guest_extras TO service_role;
GRANT MAINTAIN ON TABLE public.guest_extras TO service_role;
GRANT REFERENCES ON TABLE public.guest_extras TO service_role;
GRANT SELECT ON TABLE public.guest_extras TO service_role;
GRANT TRIGGER ON TABLE public.guest_extras TO service_role;
GRANT TRUNCATE ON TABLE public.guest_extras TO service_role;
GRANT UPDATE ON TABLE public.guest_extras TO service_role;
GRANT DELETE ON TABLE public.guest_identities TO anon;
GRANT INSERT ON TABLE public.guest_identities TO anon;
GRANT MAINTAIN ON TABLE public.guest_identities TO anon;
GRANT REFERENCES ON TABLE public.guest_identities TO anon;
GRANT SELECT ON TABLE public.guest_identities TO anon;
GRANT TRIGGER ON TABLE public.guest_identities TO anon;
GRANT TRUNCATE ON TABLE public.guest_identities TO anon;
GRANT UPDATE ON TABLE public.guest_identities TO anon;
GRANT DELETE ON TABLE public.guest_identities TO authenticated;
GRANT INSERT ON TABLE public.guest_identities TO authenticated;
GRANT MAINTAIN ON TABLE public.guest_identities TO authenticated;
GRANT REFERENCES ON TABLE public.guest_identities TO authenticated;
GRANT SELECT ON TABLE public.guest_identities TO authenticated;
GRANT TRIGGER ON TABLE public.guest_identities TO authenticated;
GRANT TRUNCATE ON TABLE public.guest_identities TO authenticated;
GRANT UPDATE ON TABLE public.guest_identities TO authenticated;
GRANT DELETE ON TABLE public.guest_identities TO service_role;
GRANT INSERT ON TABLE public.guest_identities TO service_role;
GRANT MAINTAIN ON TABLE public.guest_identities TO service_role;
GRANT REFERENCES ON TABLE public.guest_identities TO service_role;
GRANT SELECT ON TABLE public.guest_identities TO service_role;
GRANT TRIGGER ON TABLE public.guest_identities TO service_role;
GRANT TRUNCATE ON TABLE public.guest_identities TO service_role;
GRANT UPDATE ON TABLE public.guest_identities TO service_role;
GRANT DELETE ON TABLE public.guest_verifications TO anon;
GRANT INSERT ON TABLE public.guest_verifications TO anon;
GRANT MAINTAIN ON TABLE public.guest_verifications TO anon;
GRANT REFERENCES ON TABLE public.guest_verifications TO anon;
GRANT SELECT ON TABLE public.guest_verifications TO anon;
GRANT TRIGGER ON TABLE public.guest_verifications TO anon;
GRANT TRUNCATE ON TABLE public.guest_verifications TO anon;
GRANT UPDATE ON TABLE public.guest_verifications TO anon;
GRANT DELETE ON TABLE public.guest_verifications TO authenticated;
GRANT INSERT ON TABLE public.guest_verifications TO authenticated;
GRANT MAINTAIN ON TABLE public.guest_verifications TO authenticated;
GRANT REFERENCES ON TABLE public.guest_verifications TO authenticated;
GRANT SELECT ON TABLE public.guest_verifications TO authenticated;
GRANT TRIGGER ON TABLE public.guest_verifications TO authenticated;
GRANT TRUNCATE ON TABLE public.guest_verifications TO authenticated;
GRANT UPDATE ON TABLE public.guest_verifications TO authenticated;
GRANT DELETE ON TABLE public.guest_verifications TO service_role;
GRANT INSERT ON TABLE public.guest_verifications TO service_role;
GRANT MAINTAIN ON TABLE public.guest_verifications TO service_role;
GRANT REFERENCES ON TABLE public.guest_verifications TO service_role;
GRANT SELECT ON TABLE public.guest_verifications TO service_role;
GRANT TRIGGER ON TABLE public.guest_verifications TO service_role;
GRANT TRUNCATE ON TABLE public.guest_verifications TO service_role;
GRANT UPDATE ON TABLE public.guest_verifications TO service_role;
GRANT DELETE ON TABLE public.host_accounts TO anon;
GRANT INSERT ON TABLE public.host_accounts TO anon;
GRANT MAINTAIN ON TABLE public.host_accounts TO anon;
GRANT REFERENCES ON TABLE public.host_accounts TO anon;
GRANT SELECT ON TABLE public.host_accounts TO anon;
GRANT TRIGGER ON TABLE public.host_accounts TO anon;
GRANT TRUNCATE ON TABLE public.host_accounts TO anon;
GRANT UPDATE ON TABLE public.host_accounts TO anon;
GRANT DELETE ON TABLE public.host_accounts TO authenticated;
GRANT INSERT ON TABLE public.host_accounts TO authenticated;
GRANT MAINTAIN ON TABLE public.host_accounts TO authenticated;
GRANT REFERENCES ON TABLE public.host_accounts TO authenticated;
GRANT SELECT ON TABLE public.host_accounts TO authenticated;
GRANT TRIGGER ON TABLE public.host_accounts TO authenticated;
GRANT TRUNCATE ON TABLE public.host_accounts TO authenticated;
GRANT UPDATE ON TABLE public.host_accounts TO authenticated;
GRANT DELETE ON TABLE public.host_accounts TO service_role;
GRANT INSERT ON TABLE public.host_accounts TO service_role;
GRANT MAINTAIN ON TABLE public.host_accounts TO service_role;
GRANT REFERENCES ON TABLE public.host_accounts TO service_role;
GRANT SELECT ON TABLE public.host_accounts TO service_role;
GRANT TRIGGER ON TABLE public.host_accounts TO service_role;
GRANT TRUNCATE ON TABLE public.host_accounts TO service_role;
GRANT UPDATE ON TABLE public.host_accounts TO service_role;
GRANT DELETE ON TABLE public.host_otp_challenges TO service_role;
GRANT INSERT ON TABLE public.host_otp_challenges TO service_role;
GRANT MAINTAIN ON TABLE public.host_otp_challenges TO service_role;
GRANT REFERENCES ON TABLE public.host_otp_challenges TO service_role;
GRANT SELECT ON TABLE public.host_otp_challenges TO service_role;
GRANT TRIGGER ON TABLE public.host_otp_challenges TO service_role;
GRANT TRUNCATE ON TABLE public.host_otp_challenges TO service_role;
GRANT UPDATE ON TABLE public.host_otp_challenges TO service_role;
GRANT DELETE ON TABLE public.ingestion_jobs TO anon;
GRANT INSERT ON TABLE public.ingestion_jobs TO anon;
GRANT MAINTAIN ON TABLE public.ingestion_jobs TO anon;
GRANT REFERENCES ON TABLE public.ingestion_jobs TO anon;
GRANT SELECT ON TABLE public.ingestion_jobs TO anon;
GRANT TRIGGER ON TABLE public.ingestion_jobs TO anon;
GRANT TRUNCATE ON TABLE public.ingestion_jobs TO anon;
GRANT UPDATE ON TABLE public.ingestion_jobs TO anon;
GRANT DELETE ON TABLE public.ingestion_jobs TO authenticated;
GRANT INSERT ON TABLE public.ingestion_jobs TO authenticated;
GRANT MAINTAIN ON TABLE public.ingestion_jobs TO authenticated;
GRANT REFERENCES ON TABLE public.ingestion_jobs TO authenticated;
GRANT SELECT ON TABLE public.ingestion_jobs TO authenticated;
GRANT TRIGGER ON TABLE public.ingestion_jobs TO authenticated;
GRANT TRUNCATE ON TABLE public.ingestion_jobs TO authenticated;
GRANT UPDATE ON TABLE public.ingestion_jobs TO authenticated;
GRANT DELETE ON TABLE public.ingestion_jobs TO service_role;
GRANT INSERT ON TABLE public.ingestion_jobs TO service_role;
GRANT MAINTAIN ON TABLE public.ingestion_jobs TO service_role;
GRANT REFERENCES ON TABLE public.ingestion_jobs TO service_role;
GRANT SELECT ON TABLE public.ingestion_jobs TO service_role;
GRANT TRIGGER ON TABLE public.ingestion_jobs TO service_role;
GRANT TRUNCATE ON TABLE public.ingestion_jobs TO service_role;
GRANT UPDATE ON TABLE public.ingestion_jobs TO service_role;
GRANT DELETE ON TABLE public.legal_acceptances TO anon;
GRANT INSERT ON TABLE public.legal_acceptances TO anon;
GRANT MAINTAIN ON TABLE public.legal_acceptances TO anon;
GRANT REFERENCES ON TABLE public.legal_acceptances TO anon;
GRANT SELECT ON TABLE public.legal_acceptances TO anon;
GRANT TRIGGER ON TABLE public.legal_acceptances TO anon;
GRANT TRUNCATE ON TABLE public.legal_acceptances TO anon;
GRANT UPDATE ON TABLE public.legal_acceptances TO anon;
GRANT DELETE ON TABLE public.legal_acceptances TO authenticated;
GRANT INSERT ON TABLE public.legal_acceptances TO authenticated;
GRANT MAINTAIN ON TABLE public.legal_acceptances TO authenticated;
GRANT REFERENCES ON TABLE public.legal_acceptances TO authenticated;
GRANT SELECT ON TABLE public.legal_acceptances TO authenticated;
GRANT TRIGGER ON TABLE public.legal_acceptances TO authenticated;
GRANT TRUNCATE ON TABLE public.legal_acceptances TO authenticated;
GRANT UPDATE ON TABLE public.legal_acceptances TO authenticated;
GRANT DELETE ON TABLE public.legal_acceptances TO service_role;
GRANT INSERT ON TABLE public.legal_acceptances TO service_role;
GRANT MAINTAIN ON TABLE public.legal_acceptances TO service_role;
GRANT REFERENCES ON TABLE public.legal_acceptances TO service_role;
GRANT SELECT ON TABLE public.legal_acceptances TO service_role;
GRANT TRIGGER ON TABLE public.legal_acceptances TO service_role;
GRANT TRUNCATE ON TABLE public.legal_acceptances TO service_role;
GRANT UPDATE ON TABLE public.legal_acceptances TO service_role;
GRANT DELETE ON TABLE public.legal_documents TO anon;
GRANT INSERT ON TABLE public.legal_documents TO anon;
GRANT MAINTAIN ON TABLE public.legal_documents TO anon;
GRANT REFERENCES ON TABLE public.legal_documents TO anon;
GRANT SELECT ON TABLE public.legal_documents TO anon;
GRANT TRIGGER ON TABLE public.legal_documents TO anon;
GRANT TRUNCATE ON TABLE public.legal_documents TO anon;
GRANT UPDATE ON TABLE public.legal_documents TO anon;
GRANT DELETE ON TABLE public.legal_documents TO authenticated;
GRANT INSERT ON TABLE public.legal_documents TO authenticated;
GRANT MAINTAIN ON TABLE public.legal_documents TO authenticated;
GRANT REFERENCES ON TABLE public.legal_documents TO authenticated;
GRANT SELECT ON TABLE public.legal_documents TO authenticated;
GRANT TRIGGER ON TABLE public.legal_documents TO authenticated;
GRANT TRUNCATE ON TABLE public.legal_documents TO authenticated;
GRANT UPDATE ON TABLE public.legal_documents TO authenticated;
GRANT DELETE ON TABLE public.legal_documents TO service_role;
GRANT INSERT ON TABLE public.legal_documents TO service_role;
GRANT MAINTAIN ON TABLE public.legal_documents TO service_role;
GRANT REFERENCES ON TABLE public.legal_documents TO service_role;
GRANT SELECT ON TABLE public.legal_documents TO service_role;
GRANT TRIGGER ON TABLE public.legal_documents TO service_role;
GRANT TRUNCATE ON TABLE public.legal_documents TO service_role;
GRANT UPDATE ON TABLE public.legal_documents TO service_role;
GRANT INSERT ON TABLE public.member_invites TO authenticated;
GRANT SELECT ON TABLE public.member_invites TO authenticated;
GRANT UPDATE ON TABLE public.member_invites TO authenticated;
GRANT DELETE ON TABLE public.member_invites TO service_role;
GRANT INSERT ON TABLE public.member_invites TO service_role;
GRANT MAINTAIN ON TABLE public.member_invites TO service_role;
GRANT REFERENCES ON TABLE public.member_invites TO service_role;
GRANT SELECT ON TABLE public.member_invites TO service_role;
GRANT TRIGGER ON TABLE public.member_invites TO service_role;
GRANT TRUNCATE ON TABLE public.member_invites TO service_role;
GRANT UPDATE ON TABLE public.member_invites TO service_role;
GRANT DELETE ON TABLE public.message_feedback TO anon;
GRANT INSERT ON TABLE public.message_feedback TO anon;
GRANT MAINTAIN ON TABLE public.message_feedback TO anon;
GRANT REFERENCES ON TABLE public.message_feedback TO anon;
GRANT SELECT ON TABLE public.message_feedback TO anon;
GRANT TRIGGER ON TABLE public.message_feedback TO anon;
GRANT TRUNCATE ON TABLE public.message_feedback TO anon;
GRANT UPDATE ON TABLE public.message_feedback TO anon;
GRANT DELETE ON TABLE public.message_feedback TO authenticated;
GRANT INSERT ON TABLE public.message_feedback TO authenticated;
GRANT MAINTAIN ON TABLE public.message_feedback TO authenticated;
GRANT REFERENCES ON TABLE public.message_feedback TO authenticated;
GRANT SELECT ON TABLE public.message_feedback TO authenticated;
GRANT TRIGGER ON TABLE public.message_feedback TO authenticated;
GRANT TRUNCATE ON TABLE public.message_feedback TO authenticated;
GRANT UPDATE ON TABLE public.message_feedback TO authenticated;
GRANT DELETE ON TABLE public.message_feedback TO service_role;
GRANT INSERT ON TABLE public.message_feedback TO service_role;
GRANT MAINTAIN ON TABLE public.message_feedback TO service_role;
GRANT REFERENCES ON TABLE public.message_feedback TO service_role;
GRANT SELECT ON TABLE public.message_feedback TO service_role;
GRANT TRIGGER ON TABLE public.message_feedback TO service_role;
GRANT TRUNCATE ON TABLE public.message_feedback TO service_role;
GRANT UPDATE ON TABLE public.message_feedback TO service_role;
GRANT DELETE ON TABLE public.messages TO anon;
GRANT INSERT ON TABLE public.messages TO anon;
GRANT MAINTAIN ON TABLE public.messages TO anon;
GRANT REFERENCES ON TABLE public.messages TO anon;
GRANT SELECT ON TABLE public.messages TO anon;
GRANT TRIGGER ON TABLE public.messages TO anon;
GRANT TRUNCATE ON TABLE public.messages TO anon;
GRANT UPDATE ON TABLE public.messages TO anon;
GRANT DELETE ON TABLE public.messages TO authenticated;
GRANT INSERT ON TABLE public.messages TO authenticated;
GRANT MAINTAIN ON TABLE public.messages TO authenticated;
GRANT REFERENCES ON TABLE public.messages TO authenticated;
GRANT SELECT ON TABLE public.messages TO authenticated;
GRANT TRIGGER ON TABLE public.messages TO authenticated;
GRANT TRUNCATE ON TABLE public.messages TO authenticated;
GRANT UPDATE ON TABLE public.messages TO authenticated;
GRANT DELETE ON TABLE public.messages TO service_role;
GRANT INSERT ON TABLE public.messages TO service_role;
GRANT MAINTAIN ON TABLE public.messages TO service_role;
GRANT REFERENCES ON TABLE public.messages TO service_role;
GRANT SELECT ON TABLE public.messages TO service_role;
GRANT TRIGGER ON TABLE public.messages TO service_role;
GRANT TRUNCATE ON TABLE public.messages TO service_role;
GRANT UPDATE ON TABLE public.messages TO service_role;
GRANT DELETE ON TABLE public.nearby_places TO anon;
GRANT INSERT ON TABLE public.nearby_places TO anon;
GRANT MAINTAIN ON TABLE public.nearby_places TO anon;
GRANT REFERENCES ON TABLE public.nearby_places TO anon;
GRANT SELECT ON TABLE public.nearby_places TO anon;
GRANT TRIGGER ON TABLE public.nearby_places TO anon;
GRANT TRUNCATE ON TABLE public.nearby_places TO anon;
GRANT UPDATE ON TABLE public.nearby_places TO anon;
GRANT DELETE ON TABLE public.nearby_places TO authenticated;
GRANT INSERT ON TABLE public.nearby_places TO authenticated;
GRANT MAINTAIN ON TABLE public.nearby_places TO authenticated;
GRANT REFERENCES ON TABLE public.nearby_places TO authenticated;
GRANT SELECT ON TABLE public.nearby_places TO authenticated;
GRANT TRIGGER ON TABLE public.nearby_places TO authenticated;
GRANT TRUNCATE ON TABLE public.nearby_places TO authenticated;
GRANT UPDATE ON TABLE public.nearby_places TO authenticated;
GRANT DELETE ON TABLE public.nearby_places TO service_role;
GRANT INSERT ON TABLE public.nearby_places TO service_role;
GRANT MAINTAIN ON TABLE public.nearby_places TO service_role;
GRANT REFERENCES ON TABLE public.nearby_places TO service_role;
GRANT SELECT ON TABLE public.nearby_places TO service_role;
GRANT TRIGGER ON TABLE public.nearby_places TO service_role;
GRANT TRUNCATE ON TABLE public.nearby_places TO service_role;
GRANT UPDATE ON TABLE public.nearby_places TO service_role;
GRANT DELETE ON TABLE public.notifications TO anon;
GRANT INSERT ON TABLE public.notifications TO anon;
GRANT MAINTAIN ON TABLE public.notifications TO anon;
GRANT REFERENCES ON TABLE public.notifications TO anon;
GRANT SELECT ON TABLE public.notifications TO anon;
GRANT TRIGGER ON TABLE public.notifications TO anon;
GRANT TRUNCATE ON TABLE public.notifications TO anon;
GRANT UPDATE ON TABLE public.notifications TO anon;
GRANT DELETE ON TABLE public.notifications TO authenticated;
GRANT INSERT ON TABLE public.notifications TO authenticated;
GRANT MAINTAIN ON TABLE public.notifications TO authenticated;
GRANT REFERENCES ON TABLE public.notifications TO authenticated;
GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT TRIGGER ON TABLE public.notifications TO authenticated;
GRANT TRUNCATE ON TABLE public.notifications TO authenticated;
GRANT UPDATE ON TABLE public.notifications TO authenticated;
GRANT DELETE ON TABLE public.notifications TO service_role;
GRANT INSERT ON TABLE public.notifications TO service_role;
GRANT MAINTAIN ON TABLE public.notifications TO service_role;
GRANT REFERENCES ON TABLE public.notifications TO service_role;
GRANT SELECT ON TABLE public.notifications TO service_role;
GRANT TRIGGER ON TABLE public.notifications TO service_role;
GRANT TRUNCATE ON TABLE public.notifications TO service_role;
GRANT UPDATE ON TABLE public.notifications TO service_role;
GRANT DELETE ON TABLE public.organization_members TO anon;
GRANT INSERT ON TABLE public.organization_members TO anon;
GRANT MAINTAIN ON TABLE public.organization_members TO anon;
GRANT REFERENCES ON TABLE public.organization_members TO anon;
GRANT SELECT ON TABLE public.organization_members TO anon;
GRANT TRIGGER ON TABLE public.organization_members TO anon;
GRANT TRUNCATE ON TABLE public.organization_members TO anon;
GRANT UPDATE ON TABLE public.organization_members TO anon;
GRANT DELETE ON TABLE public.organization_members TO authenticated;
GRANT INSERT ON TABLE public.organization_members TO authenticated;
GRANT MAINTAIN ON TABLE public.organization_members TO authenticated;
GRANT REFERENCES ON TABLE public.organization_members TO authenticated;
GRANT SELECT ON TABLE public.organization_members TO authenticated;
GRANT TRIGGER ON TABLE public.organization_members TO authenticated;
GRANT TRUNCATE ON TABLE public.organization_members TO authenticated;
GRANT UPDATE ON TABLE public.organization_members TO authenticated;
GRANT DELETE ON TABLE public.organization_members TO service_role;
GRANT INSERT ON TABLE public.organization_members TO service_role;
GRANT MAINTAIN ON TABLE public.organization_members TO service_role;
GRANT REFERENCES ON TABLE public.organization_members TO service_role;
GRANT SELECT ON TABLE public.organization_members TO service_role;
GRANT TRIGGER ON TABLE public.organization_members TO service_role;
GRANT TRUNCATE ON TABLE public.organization_members TO service_role;
GRANT UPDATE ON TABLE public.organization_members TO service_role;
GRANT DELETE ON TABLE public.product_feedback TO anon;
GRANT INSERT ON TABLE public.product_feedback TO anon;
GRANT MAINTAIN ON TABLE public.product_feedback TO anon;
GRANT REFERENCES ON TABLE public.product_feedback TO anon;
GRANT SELECT ON TABLE public.product_feedback TO anon;
GRANT TRIGGER ON TABLE public.product_feedback TO anon;
GRANT TRUNCATE ON TABLE public.product_feedback TO anon;
GRANT UPDATE ON TABLE public.product_feedback TO anon;
GRANT DELETE ON TABLE public.product_feedback TO authenticated;
GRANT INSERT ON TABLE public.product_feedback TO authenticated;
GRANT MAINTAIN ON TABLE public.product_feedback TO authenticated;
GRANT REFERENCES ON TABLE public.product_feedback TO authenticated;
GRANT SELECT ON TABLE public.product_feedback TO authenticated;
GRANT TRIGGER ON TABLE public.product_feedback TO authenticated;
GRANT TRUNCATE ON TABLE public.product_feedback TO authenticated;
GRANT UPDATE ON TABLE public.product_feedback TO authenticated;
GRANT DELETE ON TABLE public.product_feedback TO service_role;
GRANT INSERT ON TABLE public.product_feedback TO service_role;
GRANT MAINTAIN ON TABLE public.product_feedback TO service_role;
GRANT REFERENCES ON TABLE public.product_feedback TO service_role;
GRANT SELECT ON TABLE public.product_feedback TO service_role;
GRANT TRIGGER ON TABLE public.product_feedback TO service_role;
GRANT TRUNCATE ON TABLE public.product_feedback TO service_role;
GRANT UPDATE ON TABLE public.product_feedback TO service_role;
GRANT DELETE ON TABLE public.profiles TO anon;
GRANT INSERT ON TABLE public.profiles TO anon;
GRANT MAINTAIN ON TABLE public.profiles TO anon;
GRANT REFERENCES ON TABLE public.profiles TO anon;
GRANT SELECT ON TABLE public.profiles TO anon;
GRANT TRIGGER ON TABLE public.profiles TO anon;
GRANT TRUNCATE ON TABLE public.profiles TO anon;
GRANT UPDATE ON TABLE public.profiles TO anon;
GRANT DELETE ON TABLE public.profiles TO authenticated;
GRANT INSERT ON TABLE public.profiles TO authenticated;
GRANT MAINTAIN ON TABLE public.profiles TO authenticated;
GRANT REFERENCES ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT TRIGGER ON TABLE public.profiles TO authenticated;
GRANT TRUNCATE ON TABLE public.profiles TO authenticated;
GRANT UPDATE ON TABLE public.profiles TO authenticated;
GRANT DELETE ON TABLE public.profiles TO service_role;
GRANT INSERT ON TABLE public.profiles TO service_role;
GRANT MAINTAIN ON TABLE public.profiles TO service_role;
GRANT REFERENCES ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.profiles TO service_role;
GRANT TRIGGER ON TABLE public.profiles TO service_role;
GRANT TRUNCATE ON TABLE public.profiles TO service_role;
GRANT UPDATE ON TABLE public.profiles TO service_role;
GRANT DELETE ON TABLE public.properties TO anon;
GRANT INSERT ON TABLE public.properties TO anon;
GRANT MAINTAIN ON TABLE public.properties TO anon;
GRANT REFERENCES ON TABLE public.properties TO anon;
GRANT SELECT ON TABLE public.properties TO anon;
GRANT TRIGGER ON TABLE public.properties TO anon;
GRANT TRUNCATE ON TABLE public.properties TO anon;
GRANT UPDATE ON TABLE public.properties TO anon;
GRANT DELETE ON TABLE public.properties TO authenticated;
GRANT INSERT ON TABLE public.properties TO authenticated;
GRANT MAINTAIN ON TABLE public.properties TO authenticated;
GRANT REFERENCES ON TABLE public.properties TO authenticated;
GRANT SELECT ON TABLE public.properties TO authenticated;
GRANT TRIGGER ON TABLE public.properties TO authenticated;
GRANT TRUNCATE ON TABLE public.properties TO authenticated;
GRANT UPDATE ON TABLE public.properties TO authenticated;
GRANT DELETE ON TABLE public.properties TO service_role;
GRANT INSERT ON TABLE public.properties TO service_role;
GRANT MAINTAIN ON TABLE public.properties TO service_role;
GRANT REFERENCES ON TABLE public.properties TO service_role;
GRANT SELECT ON TABLE public.properties TO service_role;
GRANT TRIGGER ON TABLE public.properties TO service_role;
GRANT TRUNCATE ON TABLE public.properties TO service_role;
GRANT UPDATE ON TABLE public.properties TO service_role;
GRANT DELETE ON TABLE public.property_brain_versions TO anon;
GRANT INSERT ON TABLE public.property_brain_versions TO anon;
GRANT MAINTAIN ON TABLE public.property_brain_versions TO anon;
GRANT REFERENCES ON TABLE public.property_brain_versions TO anon;
GRANT SELECT ON TABLE public.property_brain_versions TO anon;
GRANT TRIGGER ON TABLE public.property_brain_versions TO anon;
GRANT TRUNCATE ON TABLE public.property_brain_versions TO anon;
GRANT UPDATE ON TABLE public.property_brain_versions TO anon;
GRANT DELETE ON TABLE public.property_brain_versions TO authenticated;
GRANT INSERT ON TABLE public.property_brain_versions TO authenticated;
GRANT MAINTAIN ON TABLE public.property_brain_versions TO authenticated;
GRANT REFERENCES ON TABLE public.property_brain_versions TO authenticated;
GRANT SELECT ON TABLE public.property_brain_versions TO authenticated;
GRANT TRIGGER ON TABLE public.property_brain_versions TO authenticated;
GRANT TRUNCATE ON TABLE public.property_brain_versions TO authenticated;
GRANT UPDATE ON TABLE public.property_brain_versions TO authenticated;
GRANT DELETE ON TABLE public.property_brain_versions TO service_role;
GRANT INSERT ON TABLE public.property_brain_versions TO service_role;
GRANT MAINTAIN ON TABLE public.property_brain_versions TO service_role;
GRANT REFERENCES ON TABLE public.property_brain_versions TO service_role;
GRANT SELECT ON TABLE public.property_brain_versions TO service_role;
GRANT TRIGGER ON TABLE public.property_brain_versions TO service_role;
GRANT TRUNCATE ON TABLE public.property_brain_versions TO service_role;
GRANT UPDATE ON TABLE public.property_brain_versions TO service_role;
GRANT DELETE ON TABLE public.property_contacts TO anon;
GRANT INSERT ON TABLE public.property_contacts TO anon;
GRANT MAINTAIN ON TABLE public.property_contacts TO anon;
GRANT REFERENCES ON TABLE public.property_contacts TO anon;
GRANT SELECT ON TABLE public.property_contacts TO anon;
GRANT TRIGGER ON TABLE public.property_contacts TO anon;
GRANT TRUNCATE ON TABLE public.property_contacts TO anon;
GRANT UPDATE ON TABLE public.property_contacts TO anon;
GRANT DELETE ON TABLE public.property_contacts TO authenticated;
GRANT INSERT ON TABLE public.property_contacts TO authenticated;
GRANT MAINTAIN ON TABLE public.property_contacts TO authenticated;
GRANT REFERENCES ON TABLE public.property_contacts TO authenticated;
GRANT SELECT ON TABLE public.property_contacts TO authenticated;
GRANT TRIGGER ON TABLE public.property_contacts TO authenticated;
GRANT TRUNCATE ON TABLE public.property_contacts TO authenticated;
GRANT UPDATE ON TABLE public.property_contacts TO authenticated;
GRANT DELETE ON TABLE public.property_contacts TO service_role;
GRANT INSERT ON TABLE public.property_contacts TO service_role;
GRANT MAINTAIN ON TABLE public.property_contacts TO service_role;
GRANT REFERENCES ON TABLE public.property_contacts TO service_role;
GRANT SELECT ON TABLE public.property_contacts TO service_role;
GRANT TRIGGER ON TABLE public.property_contacts TO service_role;
GRANT TRUNCATE ON TABLE public.property_contacts TO service_role;
GRANT UPDATE ON TABLE public.property_contacts TO service_role;
GRANT DELETE ON TABLE public.property_knowledge_nodes TO anon;
GRANT INSERT ON TABLE public.property_knowledge_nodes TO anon;
GRANT MAINTAIN ON TABLE public.property_knowledge_nodes TO anon;
GRANT REFERENCES ON TABLE public.property_knowledge_nodes TO anon;
GRANT SELECT ON TABLE public.property_knowledge_nodes TO anon;
GRANT TRIGGER ON TABLE public.property_knowledge_nodes TO anon;
GRANT TRUNCATE ON TABLE public.property_knowledge_nodes TO anon;
GRANT UPDATE ON TABLE public.property_knowledge_nodes TO anon;
GRANT DELETE ON TABLE public.property_knowledge_nodes TO authenticated;
GRANT INSERT ON TABLE public.property_knowledge_nodes TO authenticated;
GRANT MAINTAIN ON TABLE public.property_knowledge_nodes TO authenticated;
GRANT REFERENCES ON TABLE public.property_knowledge_nodes TO authenticated;
GRANT SELECT ON TABLE public.property_knowledge_nodes TO authenticated;
GRANT TRIGGER ON TABLE public.property_knowledge_nodes TO authenticated;
GRANT TRUNCATE ON TABLE public.property_knowledge_nodes TO authenticated;
GRANT UPDATE ON TABLE public.property_knowledge_nodes TO authenticated;
GRANT DELETE ON TABLE public.property_knowledge_nodes TO service_role;
GRANT INSERT ON TABLE public.property_knowledge_nodes TO service_role;
GRANT MAINTAIN ON TABLE public.property_knowledge_nodes TO service_role;
GRANT REFERENCES ON TABLE public.property_knowledge_nodes TO service_role;
GRANT SELECT ON TABLE public.property_knowledge_nodes TO service_role;
GRANT TRIGGER ON TABLE public.property_knowledge_nodes TO service_role;
GRANT TRUNCATE ON TABLE public.property_knowledge_nodes TO service_role;
GRANT UPDATE ON TABLE public.property_knowledge_nodes TO service_role;
GRANT DELETE ON TABLE public.property_members TO anon;
GRANT INSERT ON TABLE public.property_members TO anon;
GRANT MAINTAIN ON TABLE public.property_members TO anon;
GRANT REFERENCES ON TABLE public.property_members TO anon;
GRANT SELECT ON TABLE public.property_members TO anon;
GRANT TRIGGER ON TABLE public.property_members TO anon;
GRANT TRUNCATE ON TABLE public.property_members TO anon;
GRANT UPDATE ON TABLE public.property_members TO anon;
GRANT DELETE ON TABLE public.property_members TO authenticated;
GRANT INSERT ON TABLE public.property_members TO authenticated;
GRANT MAINTAIN ON TABLE public.property_members TO authenticated;
GRANT REFERENCES ON TABLE public.property_members TO authenticated;
GRANT SELECT ON TABLE public.property_members TO authenticated;
GRANT TRIGGER ON TABLE public.property_members TO authenticated;
GRANT TRUNCATE ON TABLE public.property_members TO authenticated;
GRANT UPDATE ON TABLE public.property_members TO authenticated;
GRANT DELETE ON TABLE public.property_members TO service_role;
GRANT INSERT ON TABLE public.property_members TO service_role;
GRANT MAINTAIN ON TABLE public.property_members TO service_role;
GRANT REFERENCES ON TABLE public.property_members TO service_role;
GRANT SELECT ON TABLE public.property_members TO service_role;
GRANT TRIGGER ON TABLE public.property_members TO service_role;
GRANT TRUNCATE ON TABLE public.property_members TO service_role;
GRANT UPDATE ON TABLE public.property_members TO service_role;
GRANT DELETE ON TABLE public.property_settings TO anon;
GRANT INSERT ON TABLE public.property_settings TO anon;
GRANT MAINTAIN ON TABLE public.property_settings TO anon;
GRANT REFERENCES ON TABLE public.property_settings TO anon;
GRANT SELECT ON TABLE public.property_settings TO anon;
GRANT TRIGGER ON TABLE public.property_settings TO anon;
GRANT TRUNCATE ON TABLE public.property_settings TO anon;
GRANT UPDATE ON TABLE public.property_settings TO anon;
GRANT DELETE ON TABLE public.property_settings TO authenticated;
GRANT INSERT ON TABLE public.property_settings TO authenticated;
GRANT MAINTAIN ON TABLE public.property_settings TO authenticated;
GRANT REFERENCES ON TABLE public.property_settings TO authenticated;
GRANT SELECT ON TABLE public.property_settings TO authenticated;
GRANT TRIGGER ON TABLE public.property_settings TO authenticated;
GRANT TRUNCATE ON TABLE public.property_settings TO authenticated;
GRANT UPDATE ON TABLE public.property_settings TO authenticated;
GRANT DELETE ON TABLE public.property_settings TO service_role;
GRANT INSERT ON TABLE public.property_settings TO service_role;
GRANT MAINTAIN ON TABLE public.property_settings TO service_role;
GRANT REFERENCES ON TABLE public.property_settings TO service_role;
GRANT SELECT ON TABLE public.property_settings TO service_role;
GRANT TRIGGER ON TABLE public.property_settings TO service_role;
GRANT TRUNCATE ON TABLE public.property_settings TO service_role;
GRANT UPDATE ON TABLE public.property_settings TO service_role;
GRANT DELETE ON TABLE public.proposed_updates TO anon;
GRANT INSERT ON TABLE public.proposed_updates TO anon;
GRANT MAINTAIN ON TABLE public.proposed_updates TO anon;
GRANT REFERENCES ON TABLE public.proposed_updates TO anon;
GRANT SELECT ON TABLE public.proposed_updates TO anon;
GRANT TRIGGER ON TABLE public.proposed_updates TO anon;
GRANT TRUNCATE ON TABLE public.proposed_updates TO anon;
GRANT UPDATE ON TABLE public.proposed_updates TO anon;
GRANT DELETE ON TABLE public.proposed_updates TO authenticated;
GRANT INSERT ON TABLE public.proposed_updates TO authenticated;
GRANT MAINTAIN ON TABLE public.proposed_updates TO authenticated;
GRANT REFERENCES ON TABLE public.proposed_updates TO authenticated;
GRANT SELECT ON TABLE public.proposed_updates TO authenticated;
GRANT TRIGGER ON TABLE public.proposed_updates TO authenticated;
GRANT TRUNCATE ON TABLE public.proposed_updates TO authenticated;
GRANT UPDATE ON TABLE public.proposed_updates TO authenticated;
GRANT DELETE ON TABLE public.proposed_updates TO service_role;
GRANT INSERT ON TABLE public.proposed_updates TO service_role;
GRANT MAINTAIN ON TABLE public.proposed_updates TO service_role;
GRANT REFERENCES ON TABLE public.proposed_updates TO service_role;
GRANT SELECT ON TABLE public.proposed_updates TO service_role;
GRANT TRIGGER ON TABLE public.proposed_updates TO service_role;
GRANT TRUNCATE ON TABLE public.proposed_updates TO service_role;
GRANT UPDATE ON TABLE public.proposed_updates TO service_role;
GRANT DELETE ON TABLE public.recommendations TO anon;
GRANT INSERT ON TABLE public.recommendations TO anon;
GRANT MAINTAIN ON TABLE public.recommendations TO anon;
GRANT REFERENCES ON TABLE public.recommendations TO anon;
GRANT SELECT ON TABLE public.recommendations TO anon;
GRANT TRIGGER ON TABLE public.recommendations TO anon;
GRANT TRUNCATE ON TABLE public.recommendations TO anon;
GRANT UPDATE ON TABLE public.recommendations TO anon;
GRANT DELETE ON TABLE public.recommendations TO authenticated;
GRANT INSERT ON TABLE public.recommendations TO authenticated;
GRANT MAINTAIN ON TABLE public.recommendations TO authenticated;
GRANT REFERENCES ON TABLE public.recommendations TO authenticated;
GRANT SELECT ON TABLE public.recommendations TO authenticated;
GRANT TRIGGER ON TABLE public.recommendations TO authenticated;
GRANT TRUNCATE ON TABLE public.recommendations TO authenticated;
GRANT UPDATE ON TABLE public.recommendations TO authenticated;
GRANT DELETE ON TABLE public.recommendations TO service_role;
GRANT INSERT ON TABLE public.recommendations TO service_role;
GRANT MAINTAIN ON TABLE public.recommendations TO service_role;
GRANT REFERENCES ON TABLE public.recommendations TO service_role;
GRANT SELECT ON TABLE public.recommendations TO service_role;
GRANT TRIGGER ON TABLE public.recommendations TO service_role;
GRANT TRUNCATE ON TABLE public.recommendations TO service_role;
GRANT UPDATE ON TABLE public.recommendations TO service_role;
GRANT DELETE ON TABLE public.service_requests TO anon;
GRANT INSERT ON TABLE public.service_requests TO anon;
GRANT MAINTAIN ON TABLE public.service_requests TO anon;
GRANT REFERENCES ON TABLE public.service_requests TO anon;
GRANT SELECT ON TABLE public.service_requests TO anon;
GRANT TRIGGER ON TABLE public.service_requests TO anon;
GRANT TRUNCATE ON TABLE public.service_requests TO anon;
GRANT UPDATE ON TABLE public.service_requests TO anon;
GRANT DELETE ON TABLE public.service_requests TO authenticated;
GRANT INSERT ON TABLE public.service_requests TO authenticated;
GRANT MAINTAIN ON TABLE public.service_requests TO authenticated;
GRANT REFERENCES ON TABLE public.service_requests TO authenticated;
GRANT SELECT ON TABLE public.service_requests TO authenticated;
GRANT TRIGGER ON TABLE public.service_requests TO authenticated;
GRANT TRUNCATE ON TABLE public.service_requests TO authenticated;
GRANT UPDATE ON TABLE public.service_requests TO authenticated;
GRANT DELETE ON TABLE public.service_requests TO service_role;
GRANT INSERT ON TABLE public.service_requests TO service_role;
GRANT MAINTAIN ON TABLE public.service_requests TO service_role;
GRANT REFERENCES ON TABLE public.service_requests TO service_role;
GRANT SELECT ON TABLE public.service_requests TO service_role;
GRANT TRIGGER ON TABLE public.service_requests TO service_role;
GRANT TRUNCATE ON TABLE public.service_requests TO service_role;
GRANT UPDATE ON TABLE public.service_requests TO service_role;
GRANT DELETE ON TABLE public.stays TO anon;
GRANT INSERT ON TABLE public.stays TO anon;
GRANT MAINTAIN ON TABLE public.stays TO anon;
GRANT REFERENCES ON TABLE public.stays TO anon;
GRANT SELECT ON TABLE public.stays TO anon;
GRANT TRIGGER ON TABLE public.stays TO anon;
GRANT TRUNCATE ON TABLE public.stays TO anon;
GRANT UPDATE ON TABLE public.stays TO anon;
GRANT DELETE ON TABLE public.stays TO authenticated;
GRANT INSERT ON TABLE public.stays TO authenticated;
GRANT MAINTAIN ON TABLE public.stays TO authenticated;
GRANT REFERENCES ON TABLE public.stays TO authenticated;
GRANT SELECT ON TABLE public.stays TO authenticated;
GRANT TRIGGER ON TABLE public.stays TO authenticated;
GRANT TRUNCATE ON TABLE public.stays TO authenticated;
GRANT UPDATE ON TABLE public.stays TO authenticated;
GRANT DELETE ON TABLE public.stays TO service_role;
GRANT INSERT ON TABLE public.stays TO service_role;
GRANT MAINTAIN ON TABLE public.stays TO service_role;
GRANT REFERENCES ON TABLE public.stays TO service_role;
GRANT SELECT ON TABLE public.stays TO service_role;
GRANT TRIGGER ON TABLE public.stays TO service_role;
GRANT TRUNCATE ON TABLE public.stays TO service_role;
GRANT UPDATE ON TABLE public.stays TO service_role;
GRANT DELETE ON TABLE public.stripe_events TO anon;
GRANT INSERT ON TABLE public.stripe_events TO anon;
GRANT MAINTAIN ON TABLE public.stripe_events TO anon;
GRANT REFERENCES ON TABLE public.stripe_events TO anon;
GRANT SELECT ON TABLE public.stripe_events TO anon;
GRANT TRIGGER ON TABLE public.stripe_events TO anon;
GRANT TRUNCATE ON TABLE public.stripe_events TO anon;
GRANT UPDATE ON TABLE public.stripe_events TO anon;
GRANT DELETE ON TABLE public.stripe_events TO authenticated;
GRANT INSERT ON TABLE public.stripe_events TO authenticated;
GRANT MAINTAIN ON TABLE public.stripe_events TO authenticated;
GRANT REFERENCES ON TABLE public.stripe_events TO authenticated;
GRANT SELECT ON TABLE public.stripe_events TO authenticated;
GRANT TRIGGER ON TABLE public.stripe_events TO authenticated;
GRANT TRUNCATE ON TABLE public.stripe_events TO authenticated;
GRANT UPDATE ON TABLE public.stripe_events TO authenticated;
GRANT DELETE ON TABLE public.stripe_events TO service_role;
GRANT INSERT ON TABLE public.stripe_events TO service_role;
GRANT MAINTAIN ON TABLE public.stripe_events TO service_role;
GRANT REFERENCES ON TABLE public.stripe_events TO service_role;
GRANT SELECT ON TABLE public.stripe_events TO service_role;
GRANT TRIGGER ON TABLE public.stripe_events TO service_role;
GRANT TRUNCATE ON TABLE public.stripe_events TO service_role;
GRANT UPDATE ON TABLE public.stripe_events TO service_role;
GRANT DELETE ON TABLE public.subscriptions TO anon;
GRANT INSERT ON TABLE public.subscriptions TO anon;
GRANT MAINTAIN ON TABLE public.subscriptions TO anon;
GRANT REFERENCES ON TABLE public.subscriptions TO anon;
GRANT SELECT ON TABLE public.subscriptions TO anon;
GRANT TRIGGER ON TABLE public.subscriptions TO anon;
GRANT TRUNCATE ON TABLE public.subscriptions TO anon;
GRANT UPDATE ON TABLE public.subscriptions TO anon;
GRANT DELETE ON TABLE public.subscriptions TO authenticated;
GRANT INSERT ON TABLE public.subscriptions TO authenticated;
GRANT MAINTAIN ON TABLE public.subscriptions TO authenticated;
GRANT REFERENCES ON TABLE public.subscriptions TO authenticated;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;
GRANT TRIGGER ON TABLE public.subscriptions TO authenticated;
GRANT TRUNCATE ON TABLE public.subscriptions TO authenticated;
GRANT UPDATE ON TABLE public.subscriptions TO authenticated;
GRANT DELETE ON TABLE public.subscriptions TO service_role;
GRANT INSERT ON TABLE public.subscriptions TO service_role;
GRANT MAINTAIN ON TABLE public.subscriptions TO service_role;
GRANT REFERENCES ON TABLE public.subscriptions TO service_role;
GRANT SELECT ON TABLE public.subscriptions TO service_role;
GRANT TRIGGER ON TABLE public.subscriptions TO service_role;
GRANT TRUNCATE ON TABLE public.subscriptions TO service_role;
GRANT UPDATE ON TABLE public.subscriptions TO service_role;
