-- Learn lessons in Ranks (owner request 2026-11-10, via the Learn thread): each Learn lesson or tasmi'
-- passed that day (journey `ls`, summed across devices) is reported too, capped at 20 a day and 15 points
-- each. A fifth weekly quest "Pass 5 Learn lessons" joins the turn (this week's quest stays the same).
-- Apps from before send no lessons (default 0), so nothing they report changes.

alter table public.rank_days add column if not exists lessons smallint not null default 0;

create or replace function public.rank_score(pages int, listen int, surahs int, reels int, lessons int) returns int
language sql immutable set search_path = '' as $$
  select public.rank_score(pages, listen, surahs, reels) + lessons * 15
    + case when pages + listen + surahs + reels = 0 and lessons > 0 then 20 else 0 end;
$$;

create or replace function public.rank_quest(me uuid, wk date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  k int := (((wk - date '2026-11-09') / 7) % 5 + 5) % 5;
  kind text := (array['pages', 'listen', 'days', 'surahs', 'lessons'])[k + 1];
  target int := (array[50, 60, 5, 2, 5])[k + 1];
  v int;
begin
  select case kind when 'pages' then coalesce(sum(pages), 0)
                   when 'listen' then coalesce(sum(listen), 0) / 60
                   when 'days' then count(*) filter (where score > 0)
                   when 'lessons' then coalesce(sum(lessons), 0)
                   else coalesce(sum(surahs), 0) end
    into v from public.rank_days where user_id = me and day between wk and wk + 6;
  return jsonb_build_object('kind', kind, 'target', target, 'done', least(v, target), 'bonus', 50);
end $$;

drop function if exists public.rank_report(date, int, int, int, int, text);
create or replace function public.rank_report(d date, pages int, listen int, surahs int, reels int, my_name text, lessons int default 0)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  p public.rank_players;
  old public.rank_days;
  secs int;
  np int; nl int; ns int; nr int; nx int; sc int;
  wk date := public.rank_week(d);
  q jsonb;
begin
  perform public.rank_check_day(d);
  insert into public.rank_players (user_id, name) values (me, coalesce(public.clean_name(my_name, 24), 'Reader'))
    on conflict (user_id) do nothing;
  select * into p from public.rank_players where user_id = me for update;
  select * into old from public.rank_days where user_id = me and day = d for update;
  if not found then
    old.pages := 0; old.listen := 0; old.surahs := 0; old.reels := 0; old.lessons := 0; old.score := 0;
  end if;
  if old.updated_at > now() - interval '20 seconds' then return old.score; end if;
  secs := coalesce(extract(epoch from now() - coalesce(old.updated_at, p.last_report))::int, 3600);
  np := greatest(old.pages, least(greatest(coalesce(pages, 0), 0), 60, old.pages + secs / 60 + 3));
  nl := greatest(old.listen, least(greatest(coalesce(listen, 0), 0), 10800, old.listen + secs + 300));
  ns := greatest(old.surahs, least(greatest(coalesce(surahs, 0), 0), 10, old.surahs + secs / 60 + 1));
  nr := greatest(old.reels, least(greatest(coalesce(reels, 0), 0), 3, old.reels + secs / 60 + 1));
  nx := greatest(old.lessons, least(greatest(coalesce(lessons, 0), 0), 20, old.lessons + secs / 60 + 2));
  sc := public.rank_score(np, nl, ns, nr, nx);
  insert into public.rank_days (user_id, day, pages, listen, surahs, reels, lessons, score, updated_at)
    values (me, d, np, nl, ns, nr, nx, sc, now())
    on conflict (user_id, day) do update set pages = np, listen = nl, surahs = ns, reels = nr, lessons = nx, score = sc, updated_at = now();
  perform public.rank_join_league(me, wk);
  update public.rank_weeks set score = score + (sc - old.score) where user_id = me and week = wk;
  update public.rank_players set total = total + (sc - old.score), last_report = now() where user_id = me;
  q := public.rank_quest(me, wk);
  if (q ->> 'done')::int >= (q ->> 'target')::int then
    update public.rank_weeks set quest_done = true, score = score + 50 where user_id = me and week = wk and not quest_done;
    if found then update public.rank_players set total = total + 50 where user_id = me; end if;
  end if;
  return sc;
end $$;

revoke all on function public.rank_report(date, int, int, int, int, text, int) from public, anon;
grant execute on function public.rank_report(date, int, int, int, int, text, int) to authenticated;
