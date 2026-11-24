-- News page, faster (2026-11-24, owner OK): rank_feats_near ran the friend, block and follow checks on every milestone of the
-- week before narrowing them down (~130 ms with 10,000 players in the load test, growing with every player). Now:
--  * followed readers: each one's newest 2 milestones straight from rank_feats_user (≤ 300 followed);
--  * readers near you: only the newest 5,000 milestones of the week are looked at (rank_feats_at), filtered by flag / clock
--    with a plain join, the newest 300 kept;
--  * the friend and block checks run on those few hundred only.
-- Same rules and the same answer as before: never a private or blocked player, never a friend, ≤ 2 a player, 7 days, 30 in all.
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
        select c.*, row_number() over (partition by c.user_id order by c.at desc) as k
        from (
          -- Readers I follow: their newest two each.
          select f.id, f.user_id, f.kind, f.n, f.at, 'follow' as scope
          from (select w.followee from public.rank_follows w where w.follower = me order by w.at desc limit 300) w
          cross join lateral (select f.* from public.rank_feats f
            where f.user_id = w.followee and f.at > now() - interval '7 days' order by f.at desc limit 2) f
          union all
          -- Readers near me (same flag, or both without one and clocks within an hour), not followed.
          select n.id, n.user_id, n.kind, n.n, n.at, 'near' from (
            select f.id, f.user_id, f.kind, f.n, f.at
            from (select f.* from public.rank_feats f where f.at > now() - interval '7 days' order by f.at desc limit 5000) f
            join public.rank_players q on q.user_id = f.user_id
            where f.user_id <> me and not q.private
              and ((myflag is not null and q.flag = myflag)
                or (myflag is null and q.flag is null and myoff is not null and q.utc_off is not null and abs(q.utc_off - myoff) <= 60))
            order by f.at desc limit 300) n
          where not exists (select 1 from public.rank_follows w where w.follower = me and w.followee = n.user_id)
        ) c
        join public.rank_players q on q.user_id = c.user_id and not q.private
        where not public.rank_is_friend(me, c.user_id)
          and not exists (select 1 from public.rank_blocks b where (b.blocker = me and b.blocked = c.user_id) or (b.blocker = c.user_id and b.blocked = me))
      ) z
      where z.k <= 2 order by z.at desc limit 30) y
    join public.rank_players p on p.user_id = y.user_id), '[]'::jsonb);
end $$;
revoke all on function public.rank_feats_near() from public, anon;
grant execute on function public.rank_feats_near() to authenticated;
