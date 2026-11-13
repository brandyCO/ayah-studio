-- Harakat clips as files (optimisation review 2026-11-13): new clips go to the private Storage bucket
-- `harakat-clips` (`{user id}/{random}.pcm`, 16 kHz mono 16-bit PCM, ≤ 96 KB) instead of the table's bytea
-- column, so they no longer fill the database. The row keeps the clip's details and its `path`.
-- Clips already shared keep their `audio` and work as before; old app versions still call
-- harakat_clip_add (base64) and are still accepted. A row has exactly one of the two.
-- Files: a learner uploads only into their own folder (Google accounts, the same 40 a day), reads and
-- deletes only their own; teachers read every clip to label it. Nobody else sees a file.

alter table public.harakat_clips alter column audio drop not null;
alter table public.harakat_clips add column if not exists path text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'harakat_clips_one_source') then
    alter table public.harakat_clips add constraint harakat_clips_one_source check ((audio is null) <> (path is null));
  end if;
end $$;
create unique index if not exists harakat_clips_path on public.harakat_clips (path) where path is not null;

insert into storage.buckets (id, name, public) values ('harakat-clips', 'harakat-clips', false)
  on conflict (id) do update set public = false;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    update storage.buckets set file_size_limit = 96000 where id = 'harakat-clips';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets set allowed_mime_types = array['application/octet-stream'] where id = 'harakat-clips';
  end if;
end $$;

-- May this account upload a clip now? (a Google account under today's 40; for the upload policy)
create or replace function public.harakat_can_upload() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and (select count(*) from public.harakat_clips where user_id = auth.uid() and created_at > now() - interval '1 day') < 40;
$$;
revoke all on function public.harakat_can_upload() from public, anon;
grant execute on function public.harakat_can_upload() to authenticated;

drop policy if exists "harakat clips: upload own" on storage.objects;
drop policy if exists "harakat clips: read own or teacher" on storage.objects;
drop policy if exists "harakat clips: delete own" on storage.objects;
create policy "harakat clips: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'harakat-clips' and split_part(name, '/', 1) = auth.uid()::text and public.harakat_can_upload());
create policy "harakat clips: read own or teacher" on storage.objects for select to authenticated
  using (bucket_id = 'harakat-clips' and (split_part(name, '/', 1) = auth.uid()::text or public.harakat_is_reviewer()));
create policy "harakat clips: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'harakat-clips' and split_part(name, '/', 1) = auth.uid()::text);

-- A clip uploaded as a file: the same checks as harakat_clip_add, plus the file must be the learner's own
-- and already uploaded.
create or replace function public.harakat_clip_add_file(p_surah int, p_ayah int, p_words text[], p_target int,
  p_score real, p_flagged boolean, p_learner text, p_path text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.harakat_me();
  sz bigint;
  i bigint;
begin
  if (select count(*) from public.harakat_clips where user_id = me and created_at > now() - interval '1 day') >= 40 then
    raise exception 'That is enough clips for today, thank you' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_words) w where w is null or char_length(w) not between 1 and 40) then
    raise exception 'bad words' using errcode = '22023';
  end if;
  if p_target >= coalesce(cardinality(p_words), 0) then raise exception 'bad target' using errcode = '22023'; end if;
  if p_path is null or p_path !~ ('^' || me::text || '/[A-Za-z0-9_-]{8,64}\.pcm$') then
    raise exception 'bad path' using errcode = '22023';
  end if;
  select coalesce((o.metadata ->> 'size')::bigint, -1) into sz from storage.objects o
    where o.bucket_id = 'harakat-clips' and o.name = p_path;
  if not found then raise exception 'no such file' using errcode = '22023'; end if;
  if sz <> -1 and sz not between 3200 and 96000 then raise exception 'bad clip' using errcode = '23514'; end if;
  insert into public.harakat_clips (user_id, surah, ayah, words, target, score, flagged, learner, path)
    values (me, p_surah, p_ayah, p_words, p_target, p_score, p_flagged, p_learner, p_path)
    returning id into i;
  return i;
end $$;
revoke all on function public.harakat_clip_add_file(int, int, text[], int, real, boolean, text, text) from public, anon;
grant execute on function public.harakat_clip_add_file(int, int, text[], int, real, boolean, text, text) to authenticated;

-- The learner's own clips now also say whether each is a file (Export my data).
create or replace function public.harakat_my_clips() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('surah', surah, 'ayah', ayah, 'words', words, 'target', target,
    'flagged', flagged, 'learner', learner, 'label', label, 'created_at', created_at, 'file', path is not null) order by id), '[]'::jsonb)
  from public.harakat_clips where user_id = public.harakat_me();
$$;

-- The queue gives a file clip's `path` (the teacher downloads it) and an old clip's `audio` as before.
create or replace function public.harakat_review_queue(n int default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.harakat_reviewer();
  return (select coalesce(jsonb_agg(c), '[]'::jsonb) from (
    select id, surah, ayah, words, target, score, flagged, learner, encode(audio, 'base64') audio, path
    from public.harakat_clips where label is null
    order by (flagged and learner = 'right') desc, id limit least(greatest(n, 1), 50)) c);
end $$;
