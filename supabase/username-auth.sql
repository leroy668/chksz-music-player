create extension if not exists pgcrypto;

create table if not exists public.music_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.music_sessions (
  token_hash text primary key,
  account_id uuid not null references public.music_accounts(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now()
);

alter table public.music_accounts enable row level security;
alter table public.music_sessions enable row level security;

create table if not exists public.music_username_libraries (
  account_id uuid primary key references public.music_accounts(id) on delete cascade,
  favorites jsonb not null default '[]'::jsonb,
  playlists jsonb not null default '[]'::jsonb,
  play_mode text not null default 'repeat-all'
    check (play_mode in ('repeat-all', 'shuffle', 'repeat-one')),
  updated_at timestamptz not null default now()
);

alter table public.music_username_libraries enable row level security;

create or replace function public.music_register(p_username text, p_password text)
returns table(token text, username text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_account_id uuid;
  v_token text := encode(gen_random_bytes(32), 'hex');
begin
  if v_username !~ '^[a-z0-9_]{3,30}$' then raise exception '登录名只能使用 3-30 位字母、数字或下划线'; end if;
  if length(p_password) < 8 or length(p_password) > 72 then raise exception '密码长度应为 8-72 位'; end if;
  insert into public.music_accounts(username, password_hash)
  values (v_username, crypt(p_password, gen_salt('bf', 12)))
  returning id into v_account_id;
  insert into public.music_sessions(token_hash, account_id) values (encode(digest(v_token, 'sha256'), 'hex'), v_account_id);
  return query select v_token, v_username;
exception when unique_violation then
  raise exception '该登录名已存在';
end;
$$;

create or replace function public.music_login(p_username text, p_password text)
returns table(token text, username text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_account public.music_accounts%rowtype;
  v_token text := encode(gen_random_bytes(32), 'hex');
begin
  select * into v_account from public.music_accounts where music_accounts.username = lower(trim(p_username));
  if v_account.id is null or v_account.password_hash <> crypt(p_password, v_account.password_hash) then
    raise exception '登录名或密码错误';
  end if;
  delete from public.music_sessions where expires_at <= now();
  insert into public.music_sessions(token_hash, account_id) values (encode(digest(v_token, 'sha256'), 'hex'), v_account.id);
  return query select v_token, v_account.username;
end;
$$;

create or replace function public.music_session_account(p_token text)
returns table(username text)
language sql security definer set search_path = public, extensions
as $$
  select a.username from public.music_sessions s join public.music_accounts a on a.id = s.account_id
  where s.token_hash = encode(digest(p_token, 'sha256'), 'hex') and s.expires_at > now();
$$;

create or replace function public.music_load_library(p_token text)
returns table(favorites jsonb, playlists jsonb, play_mode text)
language sql security definer set search_path = public, extensions
as $$
  select l.favorites, l.playlists, l.play_mode
  from public.music_sessions s left join public.music_username_libraries l on l.account_id = s.account_id
  where s.token_hash = encode(digest(p_token, 'sha256'), 'hex') and s.expires_at > now();
$$;

create or replace function public.music_save_library(p_token text, p_favorites jsonb, p_playlists jsonb, p_play_mode text)
returns void language plpgsql security definer set search_path = public, extensions
as $$
declare v_account_id uuid;
begin
  select account_id into v_account_id from public.music_sessions
  where token_hash = encode(digest(p_token, 'sha256'), 'hex') and expires_at > now();
  if v_account_id is null then raise exception '登录已失效，请重新登录'; end if;
  insert into public.music_username_libraries(account_id, favorites, playlists, play_mode, updated_at)
  values (v_account_id, coalesce(p_favorites, '[]'), coalesce(p_playlists, '[]'), p_play_mode, now())
  on conflict (account_id) do update set favorites = excluded.favorites, playlists = excluded.playlists,
    play_mode = excluded.play_mode, updated_at = now();
end;
$$;

create or replace function public.music_logout(p_token text)
returns void language sql security definer set search_path = public, extensions
as $$ delete from public.music_sessions where token_hash = encode(digest(p_token, 'sha256'), 'hex'); $$;

revoke all on public.music_accounts, public.music_sessions, public.music_username_libraries from anon, authenticated;
revoke all on function public.music_register(text, text) from public;
revoke all on function public.music_login(text, text) from public;
revoke all on function public.music_session_account(text) from public;
revoke all on function public.music_load_library(text) from public;
revoke all on function public.music_save_library(text, jsonb, jsonb, text) from public;
revoke all on function public.music_logout(text) from public;
grant execute on function public.music_register(text, text) to anon, authenticated;
grant execute on function public.music_login(text, text) to anon, authenticated;
grant execute on function public.music_session_account(text) to anon, authenticated;
grant execute on function public.music_load_library(text) to anon, authenticated;
grant execute on function public.music_save_library(text, jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.music_logout(text) to anon, authenticated;
