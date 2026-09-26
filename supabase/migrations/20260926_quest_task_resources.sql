-- Optional resources for a Quest task: a few real links the student can ask for.
--
-- NULL means "never searched". An empty array means "searched, found nothing
-- solid", which is remembered so a student cannot retry that task for free.
-- Otherwise an array of {title, url, note}. Found once per task and kept, so
-- reopening a task never searches again.
--
-- Writes still go through the backend only; students can read their own rows
-- (the existing quest_tasks policy) and have no write policy.
ALTER TABLE public.quest_tasks
  ADD COLUMN IF NOT EXISTS resources JSONB,
  ADD COLUMN IF NOT EXISTS resources_at TIMESTAMPTZ;

ALTER TABLE public.quest_tasks DROP CONSTRAINT IF EXISTS quest_tasks_resources_is_array;
ALTER TABLE public.quest_tasks
  ADD CONSTRAINT quest_tasks_resources_is_array
  CHECK (resources IS NULL OR (jsonb_typeof(resources) = 'array' AND jsonb_array_length(resources) <= 3));

-- Defense in depth: the backend only saves https links the search returned,
-- and the page only renders https ones, but a stored javascript: or data: URL
-- would be one future writer away. The database refuses them too.
ALTER TABLE public.quest_tasks DROP CONSTRAINT IF EXISTS quest_tasks_resources_https_only;
ALTER TABLE public.quest_tasks
  ADD CONSTRAINT quest_tasks_resources_https_only
  CHECK (resources IS NULL
         OR NOT jsonb_path_exists(resources, '$[*] ? (!(@.url starts with "https://"))'));
