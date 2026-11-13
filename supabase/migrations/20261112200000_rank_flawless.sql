-- Flawless Learn lessons (owner decision 2026-11-12, lamps for mistakes): a new lesson passed without a
-- wrong answer and recited from memory without a slip gives 10 extra XP. The app reports the day's count
-- after rank_report; it can never be more than that day's lessons, never goes down (lessons are already rate-limited
-- by rank_report). Like the weekly quest's bonus, the extra goes to the week's score and the all-time total.
alter table public.rank_days add column if not exists flawless smallint not null default 0;

create or replace function public.rank_flawless(d date, n int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.rank_me();
  r public.rank_days;
  nf int;
begin
  perform public.rank_check_day(d);
  select * into r from public.rank_days where user_id = me and day = d for update;
  if not found then return 0; end if;
  nf := greatest(r.flawless, least(greatest(coalesce(n, 0), 0), r.lessons));
  if nf > r.flawless then
    update public.rank_days set flawless = nf where user_id = me and day = d;
    update public.rank_weeks set score = score + (nf - r.flawless) * 10 where user_id = me and week = public.rank_week(d);
    update public.rank_players set total = total + (nf - r.flawless) * 10 where user_id = me;
  end if;
  return nf;
end $$;
revoke all on function public.rank_flawless(date, int) from public, anon;
grant execute on function public.rank_flawless(date, int) to authenticated;
