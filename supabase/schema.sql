create table if not exists public.music_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorites jsonb not null default '[]'::jsonb,
  playlists jsonb not null default '[]'::jsonb,
  play_mode text not null default 'repeat-all'
    check (play_mode in ('repeat-all', 'shuffle', 'repeat-one')),
  updated_at timestamptz not null default now()
);

alter table public.music_libraries enable row level security;

create policy "Users can read their own music library"
on public.music_libraries for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own music library"
on public.music_libraries for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own music library"
on public.music_libraries for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own music library"
on public.music_libraries for delete
to authenticated
using ((select auth.uid()) = user_id);
