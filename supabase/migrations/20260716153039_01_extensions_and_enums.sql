-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";

-- Enums
create type user_role as enum ('host_owner','co_host','admin');
create type property_status as enum ('draft','live','paused','archived');
create type member_role as enum ('owner','co_host');
create type brain_category as enum ('core','appliances','house_rules','checkin_checkout','local_recommendations','emergency','documents','product_urls','host_qa','internal_notes');
create type brain_visibility as enum ('guest','internal');
create type source_type as enum ('manual_entry','document','url','host_qa','clone');
create type processing_status as enum ('pending','processing','ready','failed','stale');
create type ingestion_kind as enum ('document','url');
create type stay_status as enum ('upcoming','active','completed','revoked');
create type access_status as enum ('pending','verified','expired','revoked');
create type conversation_role as enum ('guest','assistant','host','system');
create type intent_type as enum ('information','wifi','checkin','checkout','parking','appliance','house_rules','local','maintenance','cleaning','safety','emergency','other');
create type feedback_value as enum ('helpful','not_helpful');
create type escalation_status as enum ('open','answered','resolved','dismissed');
create type service_type as enum ('information','maintenance','cleaning','safety','emergency','other');
create type service_status as enum ('new','acknowledged','in_progress','waiting_on_guest','resolved','closed');
create type urgency_level as enum ('low','medium','high','critical');
create type subscription_status as enum ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused');
create type notification_kind as enum ('escalation','maintenance','ingestion_failure','billing','review_nudge','system');
create type consent_kind as enum ('terms','privacy','marketing','guest_comms');
