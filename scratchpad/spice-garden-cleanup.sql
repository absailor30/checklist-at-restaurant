-- Run this once in Supabase Dashboard → SQL Editor (project: checklist-at-restaurant).
-- Cleans up Spice Garden to the new hierarchy: 3 L1 (one per shift) per
-- outlet, one brand-wide L2, one brand-wide L3. Already done before this:
-- roles renamed 'Shift Manager' -> 'L2 Manager', 'Owner' -> 'L3 Owner'.

-- 1. Remove the General Manager (Nikhil) — new hierarchy has no separate GM
--    tier; Lakshmi (L3 Owner) is the single brand-wide L3.
delete from users where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9' and email = 'nikhil@spicegarden.demo';
delete from roles where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9' and name = 'General Manager';

-- 2. Consolidate L2 to one brand-wide manager (keep Rahul; assign him to all
--    3 outlets; remove Priya and Farah as separate per-outlet L2s).
insert into user_outlets (user_id, outlet_id)
select '4f97724f-08aa-4588-a729-6ff468fa8767', o.id
from outlets o where o.org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9'
on conflict do nothing;

delete from users where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9'
  and email in ('priya@spicegarden.demo', 'farah@spicegarden.demo');

-- 3. Remove every old department-level (level 1) user and role — Kitchen,
--    Front Office, Service, Bar & Beverage, Housekeeping, Stores &
--    Purchasing, Back Office, Customer Support, Sales & Marketing,
--    IT & Systems, Maintenance & Safety, People & HR.
delete from users where role_id in (
  select id from roles where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9' and level = 1
);
delete from roles where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9' and level = 1;

-- 4. Create the L1 Manager role and exactly 3 L1 users per outlet, one per
--    shift, named after real employees where we have one to spare.
insert into roles (id, org_id, name, level, can_review, can_unlock, can_manage)
values (gen_random_uuid(), '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9', 'L1 Manager', 1, false, false, false);

do $$
declare
  v_l1_role uuid;
  v_outlet record;
  v_names text[] := array['Arjun Reddy','Kavya Menon','Imran Shaikh'];
begin
  select id into v_l1_role from roles
    where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9' and name = 'L1 Manager';

  for v_outlet in select id, name from outlets where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9' loop
    insert into users (id, org_id, role_id, name, shift, pin_hash, pin_set_at)
    values
      (gen_random_uuid(), '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9', v_l1_role,
        'L1 Manager — Morning (' || v_outlet.name || ')', 'morning', null, null),
      (gen_random_uuid(), '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9', v_l1_role,
        'L1 Manager — Afternoon (' || v_outlet.name || ')', 'afternoon', null, null),
      (gen_random_uuid(), '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9', v_l1_role,
        'L1 Manager — Evening (' || v_outlet.name || ')', 'evening', null, null);

    insert into user_outlets (user_id, outlet_id)
    select u.id, v_outlet.id from users u
    where u.org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9'
      and u.role_id = v_l1_role
      and u.name like '%(' || v_outlet.name || ')';
  end loop;
end $$;

-- 5. Reporting chain: L1 -> L2 -> L3 only.
delete from reporting_chain where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9';
insert into reporting_chain (id, org_id, role_id, reports_to_role_id, escalation_after_minutes)
select gen_random_uuid(), '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9',
  (select id from roles where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9' and name = 'L1 Manager'),
  (select id from roles where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9' and name = 'L2 Manager'),
  60
union all
select gen_random_uuid(), '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9',
  (select id from roles where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9' and name = 'L2 Manager'),
  (select id from roles where org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9' and name = 'L3 Owner'),
  60;

-- Verify: should show exactly 3 L1 + 1 L2 + 1 L3 per outlet (L2/L3 repeat
-- across all 3 outlets since they're brand-wide).
select o.name as outlet, u.name, u.shift, r.name as role, r.level
from outlets o
join user_outlets uo on uo.outlet_id = o.id
join users u on u.id = uo.user_id
join roles r on r.id = u.role_id
where o.org_id = '8e8d3be8-0ebf-4ed9-be7a-82a27e932fa9'
order by o.name, r.level, u.shift;
