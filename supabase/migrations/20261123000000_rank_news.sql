-- News page (owner request 2026-11-23): besides friends' milestones, the news of readers you follow and of readers near
-- you — the same country flag as yours, or, without a flag, a clock within an hour of yours. Never a private or blocked
-- player, never a friend (those are in rank_feats_feed), at most 2 milestones a player, the last 7 days, 30 in all.
-- MashaAllah may now be said on any milestone shown on the News page (a public, unblocked player), not only a friend's.
create index if not exists rank_feats_at on public.rank_feats (at desc);
create index if not exists rank_players_flag on public.rank_players (flag) where flag is not null and not private;

create or replace function public.rank_feats_near() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  myflag text;
  myoff int;
begin
  select p.flag, p.utc_off into myflag, myoff from public.rank_players p where p.user_id = me;
  return coalesce((select jsonb_agg(public.rank_face(p, me) || jsonb_build_object('id', y.id, 'kind', y.kind, 'n', y.n, 'at', y.at,
        'scope', y.scope,
        'cheers', (select count(*) from public.rank_feat_cheers k where k.feat = y.id),
        'cheered', exists (select 1 from public.rank_feat_cheers k where k.feat = y.id and k.user_id = me))
      order by y.at desc)
    from (
      select z.id, z.user_id, z.kind, z.n, z.at, z.scope from (
        select f.id, f.user_id, f.kind, f.n, f.at,
          case when exists (select 1 from public.rank_follows w where w.follower = me and w.followee = f.user_id) then 'follow' else 'near' end as scope,
          row_number() over (partition by f.user_id order by f.at desc) as k
        from public.rank_feats f
        join public.rank_players q on q.user_id = f.user_id and not q.private
        where f.at > now() - interval '7 days' and f.user_id <> me
          and not public.rank_is_friend(me, f.user_id)
          and not exists (select 1 from public.rank_blocks b where (b.blocker = me and b.blocked = f.user_id) or (b.blocker = f.user_id and b.blocked = me))
          and (exists (select 1 from public.rank_follows w where w.follower = me and w.followee = f.user_id)
            or (myflag is not null and q.flag = myflag)
            or (myflag is null and q.flag is null and myoff is not null and q.utc_off is not null and abs(q.utc_off - myoff) <= 60))
        order by f.at desc limit 200) z
      where z.k <= 2 order by z.at desc limit 30) y
    join public.rank_players p on p.user_id = y.user_id), '[]'::jsonb);
end $$;
revoke all on function public.rank_feats_near() from public, anon;
grant execute on function public.rank_feats_near() to authenticated;

create or replace function public.rank_feat_cheer(id bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  owner uuid;
  priv boolean;
  c int;
begin
  select f.user_id, p.private into owner, priv from public.rank_feats f join public.rank_players p on p.user_id = f.user_id
    where f.id = rank_feat_cheer.id and f.at > now() - interval '7 days';
  if owner is null or owner = me or (priv and not public.rank_is_friend(me, owner)) then
    raise exception 'Only for a friend''s milestone' using errcode = '22023';
  end if;
  select count(*) into c from public.rank_feat_cheers k where k.user_id = me and k.at > now() - interval '1 day';
  if c >= 60 then raise exception 'That is plenty for today' using errcode = '22023'; end if;
  insert into public.rank_feat_cheers (feat, user_id) values (rank_feat_cheer.id, me) on conflict do nothing;
  return (select count(*) from public.rank_feat_cheers k where k.feat = rank_feat_cheer.id);
end $$;
revoke all on function public.rank_feat_cheer(bigint) from public, anon;
grant execute on function public.rank_feat_cheer(bigint) to authenticated;
