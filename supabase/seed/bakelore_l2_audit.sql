-- Bakelore L2 audit (FSSAI Food Safety Inspection Checklist for Restaurants): 27 questions.
do $$ declare v_org uuid; begin
  select id into v_org from organisations where name = 'Bakelore (TEST)';
  if v_org is null then raise exception 'org not found'; end if;
  insert into line_check_questions (id, level, sort_order, kind, prompt, expected, photo_required, reason_on_no, notes, org_id, section) values
  ('bkl2-01', 'L2', 1, 'yes_no', 'FSSAI license / registration valid and displayed prominently?', 'yes', false, false, 'Schedule 4: FSSAI license must be displayed at premises at all times', v_org, 'Licensing and Documentation'),
  ('bkl2-02', 'L2', 2, 'yes_no', 'License category matches business turnover and operations?', 'yes', false, false, 'Turnover <12L = Registration; 12L-20Cr = State License; >20Cr = Central License', v_org, 'Licensing and Documentation'),
  ('bkl2-03', 'L2', 3, 'yes_no', 'Food Safety Management Plan (FSMP) documented and implemented?', 'yes', false, false, null, v_org, 'Licensing and Documentation'),
  ('bkl2-04', 'L2', 4, 'yes_no', 'Product recall / withdrawal procedure documented?', 'yes', false, false, null, v_org, 'Licensing and Documentation'),
  ('bkl2-05', 'L2', 5, 'yes_no', 'Walls, floors, and ceilings smooth, impervious, and washable?', 'yes', false, false, 'FSSAI Schedule 4 Cl. 2.1: surfaces must be non-absorbent and easy to clean', v_org, 'Premises and Layout'),
  ('bkl2-06', 'L2', 6, 'yes_no', 'Adequate ventilation to prevent condensation and odours?', 'yes', false, false, null, v_org, 'Premises and Layout'),
  ('bkl2-07', 'L2', 7, 'yes_no', 'Adequate lighting in food preparation and storage areas?', 'yes', false, false, null, v_org, 'Premises and Layout'),
  ('bkl2-08', 'L2', 8, 'yes_no', 'Premises pest-proofed (mesh on windows, door seals)?', 'yes', false, false, null, v_org, 'Premises and Layout'),
  ('bkl2-09', 'L2', 9, 'yes_no', 'No evidence of pest activity (rodents, cockroaches, flies)?', 'yes', false, false, null, v_org, 'Premises and Layout'),
  ('bkl2-10', 'L2', 10, 'yes_no', 'Refrigerator temperature at or below 5°C?', 'yes', false, false, 'Cold chain must maintain 5°C or below for perishables per FSSAI', v_org, 'Food Storage and Temperature Control'),
  ('bkl2-11', 'L2', 11, 'yes_no', 'Freezer temperature at or below -18°C?', 'yes', false, false, null, v_org, 'Food Storage and Temperature Control'),
  ('bkl2-12', 'L2', 12, 'yes_no', 'Hot food held at or above 63°C?', 'yes', false, false, null, v_org, 'Food Storage and Temperature Control'),
  ('bkl2-13', 'L2', 13, 'yes_no', 'All packaged foods labelled with date of packing and expiry?', 'yes', false, false, null, v_org, 'Food Storage and Temperature Control'),
  ('bkl2-14', 'L2', 14, 'yes_no', 'FIFO (First In First Out) rotation followed?', 'yes', false, false, null, v_org, 'Food Storage and Temperature Control'),
  ('bkl2-15', 'L2', 15, 'yes_no', 'Food handlers washing hands correctly at critical points?', 'yes', false, false, 'Schedule 4 Cl. 6.1: wash hands before handling food, after toilet, after handling waste', v_org, 'Personal Hygiene of Food Handlers'),
  ('bkl2-16', 'L2', 16, 'yes_no', 'Policy to exclude sick food handlers implemented?', 'yes', false, false, null, v_org, 'Personal Hygiene of Food Handlers'),
  ('bkl2-17', 'L2', 17, 'yes_no', 'Clean uniforms / aprons and head covering worn?', 'yes', false, false, null, v_org, 'Personal Hygiene of Food Handlers'),
  ('bkl2-18', 'L2', 18, 'yes_no', 'No jewellery or watches worn during food preparation?', 'yes', false, false, null, v_org, 'Personal Hygiene of Food Handlers'),
  ('bkl2-19', 'L2', 19, 'yes_no', 'Nails trimmed, clean, and no nail polish?', 'yes', false, false, null, v_org, 'Personal Hygiene of Food Handlers'),
  ('bkl2-20', 'L2', 20, 'yes_no', 'Food contact surfaces cleaned and sanitised before each use?', 'yes', false, false, null, v_org, 'Cleaning and Sanitation'),
  ('bkl2-21', 'L2', 21, 'yes_no', 'Written cleaning schedule maintained and followed?', 'yes', false, false, null, v_org, 'Cleaning and Sanitation'),
  ('bkl2-22', 'L2', 22, 'yes_no', 'Potable water used for food preparation and cleaning?', 'yes', false, false, 'FSSAI: water must meet IS 10500:2012 standards for potable water', v_org, 'Cleaning and Sanitation'),
  ('bkl2-23', 'L2', 23, 'yes_no', 'Solid and liquid waste disposed of hygienically?', 'yes', false, false, null, v_org, 'Cleaning and Sanitation'),
  ('bkl2-24', 'L2', 24, 'yes_no', 'Pest control log maintained by licensed pest control operator?', 'yes', false, false, null, v_org, 'Cleaning and Sanitation'),
  ('bkl2-25', 'L2', 25, 'yes_no', 'At least one person per shift trained in food safety / FOSTAC?', 'yes', false, false, 'FSSAI mandates FOSTAC (Food Safety Training and Certification) for FBOs', v_org, 'Food Safety Training and Records'),
  ('bkl2-26', 'L2', 26, 'yes_no', 'Training certificates of food handlers available?', 'yes', false, false, null, v_org, 'Food Safety Training and Records'),
  ('bkl2-27', 'L2', 27, 'yes_no', 'Temperature monitoring logs maintained?', 'yes', false, false, null, v_org, 'Food Safety Training and Records')
  on conflict (id) do update set sort_order=excluded.sort_order, prompt=excluded.prompt, notes=excluded.notes, section=excluded.section;
  update organisations set line_check_config = coalesce(line_check_config,'{}'::jsonb) || '{"l2OwnBank": true}'::jsonb where id = v_org;
end $$;
