-- Help improve the harakat check (owner plan 2026-11-10, steps 2–4; server/harakat). A learner who turns
-- on "Help improve the harakat check" (off by default, never in the Kids space) shares short clips (≤ 3 s:
-- one word with its neighbours) of words the server flagged, plus a few it did not, with the learner's own
-- answer ("I said it right" or not). Teachers (harakat_reviewers, added by the owner) label them; the
-- labels tune the check and train the model. Nobody reads the tables directly: the learner adds and
-- deletes their own clips through functions, a teacher reads and labels through functions. Google
-- accounts only; 40 clips a day each.

create table if not exists public.harakat_clips (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  surah int not null check (surah between 1 and 114),
  ayah int not null check (ayah between 1 and 286),
  words text[] not null check (cardinality(words) between 1 and 3),
  target int not null check (target >= 0 and target < 3),
  score real,
  flagged boolean not null,
  learner text not null check (learner in ('right', 'wrong', 'none')),
  audio bytea not null check (octet_length(audio) between 3200 and 96000),
  label text check (label in ('right', 'wrong', 'unclear')),
  note text check (char_length(note) <= 200),
  labelled_by uuid references auth.users (id) on delete set null,
  labelled_at timestamptz
);
create index if not exists harakat_clips_user on public.harakat_clips (user_id, created_at);
create index if not exists harakat_clips_open on public.harakat_clips (id) where label is null;
create table if not exists public.harakat_reviewers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.harakat_clips enable row level security;
alter table public.harakat_reviewers enable row level security;
revoke all on table public.harakat_clips, public.harakat_reviewers from anon, authenticated;

create or replace function public.harakat_me() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in with Google first' using errcode = '42501';
  end if;
  return me;
end $$;

-- A clip: 16 kHz mono 16-bit PCM (base64), ≤ 3 s. `learner`: what the learner said at the check.
create or replace function public.harakat_clip_add(p_surah int, p_ayah int, p_words text[], p_target int,
  p_score real, p_flagged boolean, p_learner text, p_audio text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.harakat_me();
  i bigint;
begin
  if (select count(*) from public.harakat_clips where user_id = me and created_at > now() - interval '1 day') >= 40 then
    raise exception 'That is enough clips for today, thank you' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_words) w where w is null or char_length(w) not between 1 and 40) then
    raise exception 'bad words' using errcode = '22023';
  end if;
  if p_target >= coalesce(cardinality(p_words), 0) then raise exception 'bad target' using errcode = '22023'; end if;
  insert into public.harakat_clips (user_id, surah, ayah, words, target, score, flagged, learner, audio)
    values (me, p_surah, p_ayah, p_words, p_target, p_score, p_flagged, p_learner, decode(p_audio, 'base64'))
    returning id into i;
  return i;
end $$;

-- The learner's own clips (no audio) and how many there are, for Export my data and the settings.
create or replace function public.harakat_my_clips() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('surah', surah, 'ayah', ayah, 'words', words, 'target', target,
    'flagged', flagged, 'learner', learner, 'label', label, 'created_at', created_at) order by id), '[]'::jsonb)
  from public.harakat_clips where user_id = public.harakat_me();
$$;
-- Deletes every clip the learner shared (turning the switch off does not; this does).
create or replace function public.harakat_forget_mine() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.harakat_clips where user_id = public.harakat_me();
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.harakat_is_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.harakat_reviewers where user_id = auth.uid());
$$;
create or replace function public.harakat_reviewer() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.harakat_is_reviewer() then raise exception 'Teachers only' using errcode = '42501'; end if;
end $$;

-- Clips waiting for a teacher, oldest first (flagged ones the learner disagreed with first). Never says who.
create or replace function public.harakat_review_queue(n int default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.harakat_reviewer();
  return (select coalesce(jsonb_agg(c), '[]'::jsonb) from (
    select id, surah, ayah, words, target, score, flagged, learner, encode(audio, 'base64') audio
    from public.harakat_clips where label is null
    order by (flagged and learner = 'right') desc, id limit least(greatest(n, 1), 50)) c);
end $$;
create or replace function public.harakat_review_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.harakat_reviewer();
  return (select jsonb_build_object('open', count(*) filter (where label is null), 'done', count(*) filter (where label is not null),
    'mine', count(*) filter (where labelled_by = auth.uid())) from public.harakat_clips);
end $$;
create or replace function public.harakat_label(p_id bigint, p_label text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.harakat_reviewer();
  update public.harakat_clips set label = p_label, note = nullif(left(p_note, 200), ''), labelled_by = auth.uid(), labelled_at = now()
    where id = p_id;
  if not found then raise exception 'no such clip' using errcode = '22023'; end if;
end $$;

revoke all on function public.harakat_me(), public.harakat_reviewer() from public, anon, authenticated;
revoke all on function public.harakat_clip_add(int, int, text[], int, real, boolean, text, text), public.harakat_my_clips(),
  public.harakat_forget_mine(), public.harakat_is_reviewer(), public.harakat_review_queue(int), public.harakat_review_counts(),
  public.harakat_label(bigint, text, text) from public, anon;
grant execute on function public.harakat_clip_add(int, int, text[], int, real, boolean, text, text), public.harakat_my_clips(),
  public.harakat_forget_mine(), public.harakat_is_reviewer(), public.harakat_review_queue(int), public.harakat_review_counts(),
  public.harakat_label(bigint, text, text) to authenticated;
