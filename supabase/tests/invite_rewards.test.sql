-- Invite rewards (supabase/migrations/20261114000000_invite_rewards.sql): a new player joining through an invite
-- link is recorded once; after 3 days with points both sides claim 50 Light once; old players and self-invites
-- are not recorded; nobody reads the table.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
create or replace function public.rank_xp_mult(d date) returns numeric language sql stable as 'select 1::numeric';

select plan(14);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000041', 'inviter@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000042', 'newbie@example.com'),
  ('cccccccc-0000-0000-0000-000000000043', 'oldtimer@example.com');

create function pg_temp.act_as(uid text) returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000041');
select rank_report(current_date, 2, 0, 0, 0, 'Amal');
insert into ids select 'code', rank_friend_invite();
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000042');
select rank_report(current_date, 1, 0, 0, 0, 'Bilal');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000043');
select rank_report(current_date, 1, 0, 0, 0, 'Dina');
reset role;
update rank_players set created_at = now() - interval '30 days' where user_id = 'cccccccc-0000-0000-0000-000000000043';
insert into ids select 'b', pid from rank_players where user_id = 'bbbbbbbb-0000-0000-0000-000000000042';

-- The new player joins through the link: recorded. The old player too: friends, but not recorded.
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000042');
select rank_friend_join((select v from ids where k = 'code'));
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000043');
select rank_friend_join((select v from ids where k = 'code'));
reset role;
select is((select count(*)::int from rank_invites), 1, 'only the new player is recorded as invited');
select is((select inviter from rank_invites where invitee = 'bbbbbbbb-0000-0000-0000-000000000042'),
  'aaaaaaaa-0000-0000-0000-000000000041'::uuid, 'recorded with the inviter');

-- Joining again changes nothing.
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000042');
select rank_friend_join((select v from ids where k = 'code'));
reset role;
select is((select count(*)::int from rank_invites), 1, 'a second join adds nothing');

-- One day with points: not yet.
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000042');
select is((rank_my_invites() -> 'invitedBy' ->> 'days')::int, 1, 'the invited friend sees 1 of 3 days');
select is(rank_claim_invite(null), null, 'no claim before 3 days');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000041');
select is(jsonb_array_length(rank_my_invites() -> 'friends'), 1, 'the inviter sees one invited friend');
select is(rank_claim_invite((select v from ids where k = 'b')), null, 'the inviter cannot claim before 3 days');

-- Three days with points.
reset role;
insert into rank_days (user_id, day, pages, score) values
  ('bbbbbbbb-0000-0000-0000-000000000042', current_date + 1, 1, 10),
  ('bbbbbbbb-0000-0000-0000-000000000042', current_date + 2, 1, 10);
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000042');
select is((rank_claim_invite(null) ->> 'light')::int, 50, 'the invited friend claims 50 Light');
select is(rank_claim_invite(null), null, 'only once');
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000041');
select is((rank_claim_invite((select v from ids where k = 'b')) ->> 'light')::int, 50, 'the inviter claims 50 Light');
select is(rank_claim_invite((select v from ids where k = 'b')), null, 'the inviter only once');
select is((rank_my_invites() ->> 'rewarded')::int, 1, 'one friend rewarded');

-- Someone else cannot claim for that friend; nobody reads the table.
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000043');
select is(rank_claim_invite((select v from ids where k = 'b')), null, 'a stranger cannot claim');
select throws_ok('select * from public.rank_invites', '42501', null, 'the table cannot be read directly');

select * from finish();
rollback;
