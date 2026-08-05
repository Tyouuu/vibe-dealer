-- Let each person keep their own handful of dealers at the top of the list.
--
-- /dealers sorts by cumulative top-up volume, which is a good default and a
-- poor answer to "where is the one I deal with every morning". Volume is a
-- property of the dealer; which dealers you personally work is a property of
-- you, and with 284 of them the list is 4,028px tall on a phone. The accountant
-- and the cs role work different subsets, so this cannot be one shared list.
--
-- Own rows only. A pin says something about how a colleague works, and there
-- is no screen that needs to show one person's pins to another.
--
-- current_role_name() is not null carries 0038 forward: a switched-off account
-- cannot read or write pins either, rather than this table quietly becoming
-- the one place `active` is not enforced.
create table if not exists dealer_pins (
  user_id uuid not null references profiles(id) on delete cascade,
  dealer_id uuid not null references dealers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, dealer_id)
);

-- The only query this table serves is "which dealers has this user pinned",
-- and the primary key already leads with user_id, so that read is covered.
-- The reverse direction is needed for the cascade when a dealer is removed.
create index if not exists idx_dealer_pins_dealer on dealer_pins (dealer_id);

alter table dealer_pins enable row level security;

drop policy if exists dealer_pins_own_select on dealer_pins;
create policy dealer_pins_own_select on dealer_pins
  for select using (user_id = auth.uid() and current_role_name() is not null);

drop policy if exists dealer_pins_own_insert on dealer_pins;
create policy dealer_pins_own_insert on dealer_pins
  for insert with check (user_id = auth.uid() and current_role_name() is not null);

drop policy if exists dealer_pins_own_delete on dealer_pins;
create policy dealer_pins_own_delete on dealer_pins
  for delete using (user_id = auth.uid() and current_role_name() is not null);

-- No update policy on purpose: a pin has nothing to change. It is created or
-- it is removed.

revoke all on dealer_pins from anon;
grant select, insert, delete on dealer_pins to authenticated;
