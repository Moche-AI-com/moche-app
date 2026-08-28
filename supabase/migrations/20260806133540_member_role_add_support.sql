-- Adds the 'support' member role used by the new User management invite flow.
-- Applied as its own migration unit: PostgreSQL cannot USE a newly-added enum
-- value in the same transaction that adds it.
alter type member_role add value if not exists 'support';
