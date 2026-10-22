-- Adding a custom question is for the CEO/Owner (and Admin) only, enforced in the database too,
-- so a manager cannot bypass the app by calling the database API directly.
alter policy "Users can add questions to their own org" on line_check_questions
  with check (org_id = current_org_id() and current_user_can('manage'));
