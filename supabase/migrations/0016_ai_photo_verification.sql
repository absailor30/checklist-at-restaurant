-- AI photo verification: a Groq vision model checks a captured photo
-- plausibly matches the question it's evidence for. Informational only —
-- never blocks the L1/L2/L3 flow, just flags a mismatch for review.
alter table line_check_answers add column if not exists ai_verified boolean;
alter table line_check_answers add column if not exists ai_note text;
alter table line_check_manager_answers add column if not exists ai_verified boolean;
alter table line_check_manager_answers add column if not exists ai_note text;
