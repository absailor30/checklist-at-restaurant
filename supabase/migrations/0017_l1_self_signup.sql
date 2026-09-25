-- L1 self-service signup: an L1 manager not yet in the roster can request
-- access (name + shift + their own PIN) instead of L2/L3 pre-creating them.
-- The request stays invisible in the device picker until L2/L3 approves it.
alter table users add column if not exists approved boolean not null default true;
