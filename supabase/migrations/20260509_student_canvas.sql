create table if not exists student_canvas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nodes jsonb not null default '[]',
  edges jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table student_canvas enable row level security;

create policy "Users can manage their own canvas"
  on student_canvas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
