revoke update (is_admin) on public.profiles from authenticated, anon;

alter type member_role add value if not exists 'property_manager';
alter type member_role add value if not exists 'maintenance';
alter type member_role add value if not exists 'cleaner';
alter type member_role add value if not exists 'viewer';
