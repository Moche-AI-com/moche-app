DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audience_tier') THEN
    CREATE TYPE public.audience_tier AS ENUM (
      'system_internal',
      'host_private',
      'staff_ops',
      'guest_instay',
      'guest_prearrival',
      'guest_public'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sensitivity_tier') THEN
    CREATE TYPE public.sensitivity_tier AS ENUM (
      'public_guest',
      'guest_after_verification',
      'stay_scoped_secret',
      'host_only'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'brain_value_source') THEN
    CREATE TYPE public.brain_value_source AS ENUM (
      'host_verified',
      'pms_sync',
      'host_chat',
      'escalation',
      'firecrawl',
      'inferred'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'brain_value_status') THEN
    CREATE TYPE public.brain_value_status AS ENUM ('active', 'superseded', 'retired');
  END IF;
END
$$;
