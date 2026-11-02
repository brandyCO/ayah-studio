-- Problem reports (owner request 2026-11-02: "make it super easy for the users to report every single thing
-- at the time it happens"). The app sends what was happening (reciter, recording, surah:ayah, the word lit,
-- the time in the recording, screen, app version) with the kind of problem and an optional note. Nobody
-- reads or writes the table from the app: send_report() only adds a row; the owner reads them in the
-- Supabase dashboard (or with the service role). Nothing identifies the person beyond the account id when
-- signed in and the app's random install id.
create table if not exists public.problem_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('start', 'highlight', 'voice', 'skip', 'cut', 'text', 'reel', 'app', 'other')),
  note text check (note is null or length(note) <= 500),
  context jsonb not null default '{}'::jsonb check (length(context::text) <= 2000),
  install text check (install is null or length(install) <= 64),
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'seen', 'fixed', 'wontfix'))
);
alter table public.problem_reports enable row level security;
revoke all on public.problem_reports from anon, authenticated;
create index if not exists problem_reports_created on public.problem_reports (created_at);

create or replace function public.send_report(kind text, note text, context jsonb, install text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if kind is null or kind not in ('start', 'highlight', 'voice', 'skip', 'cut', 'text', 'reel', 'app', 'other') then
    raise exception 'Unknown kind' using errcode = '22023';
  end if;
  if note is not null and length(note) > 500 then raise exception 'Note too long' using errcode = '22023'; end if;
  if context is null or jsonb_typeof(context) <> 'object' or length(context::text) > 2000 then
    raise exception 'Bad context' using errcode = '22023';
  end if;
  if install is not null and length(install) > 64 then raise exception 'Bad install id' using errcode = '22023'; end if;
  -- Limits: 20 a day per install (or account), 5000 a day in all.
  select count(*) into n from public.problem_reports r
    where r.created_at > now() - interval '1 day'
      and ((install is not null and r.install = install) or (auth.uid() is not null and r.user_id = auth.uid()));
  if n >= 20 then raise exception 'Too many reports today' using errcode = '54000'; end if;
  select count(*) into n from public.problem_reports r where r.created_at > now() - interval '1 day';
  if n >= 5000 then raise exception 'Too many reports today' using errcode = '54000'; end if;
  insert into public.problem_reports (kind, note, context, install, user_id)
    values (kind, nullif(btrim(note), ''), context, install, auth.uid());
end $$;

revoke all on function public.send_report(text, text, jsonb, text) from public;
grant execute on function public.send_report(text, text, jsonb, text) to anon, authenticated;
