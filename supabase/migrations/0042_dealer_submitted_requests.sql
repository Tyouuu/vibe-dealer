-- A dealer can ask; only a person can record.
--
-- Every row in `transactions` was, until now, typed by staff from something a
-- dealer said over WhatsApp. The dealer's own words never reached the system,
-- so a wrong figure was always the fault of whoever retyped it, and confirming
-- what a dealer actually wanted meant another message and another wait.
--
-- This adds a queue in front of the ledger, and nothing else. A submitted
-- request is a claim. It has no points, no rate, no effect on the credit
-- balance, and it is not a transaction until an accountant or master opens it,
-- checks the bank the way they already do, and saves it through /entry — where
-- every existing rule still applies, because it is the same code path it was
-- yesterday.

-- ---------------------------------------------------------------- the link
--
-- One permanent token per dealer, not one per request: a dealer tops up
-- several times a month and must not need a new link each time. The token
-- identifies a dealer, it does not authenticate a person — which is only
-- acceptable because the link cannot move money. The worst a leaked one can do
-- is put a false claim in a queue that a human is already checking against a
-- bank statement.
--
-- Rotating a compromised token is an update to this column, and the old URL
-- stops resolving immediately.
alter table dealers
  add column if not exists submit_token text not null default replace(gen_random_uuid()::text, '-', '');

-- Existing rows took the default at add-column time, so each already has its
-- own value; this only guards a re-run against a column added some other way.
update dealers set submit_token = replace(gen_random_uuid()::text, '-', '') where submit_token is null or submit_token = '';

create unique index if not exists idx_dealers_submit_token on dealers (submit_token);

-- cs reads dealers through this view (0015 keeps `rate` out of it), and cs is
-- the role that talks to dealers all day — the person most likely to be asked
-- "how do I send my order in". The token is a contact channel, like the phone
-- number two columns up, so it belongs to everyone who can see the dealer.
-- It is not a key to anything cs cannot already reach: what a link can do is
-- add a row to a queue that only accountant and master can read or act on.
--
-- Appended at the end rather than beside the other contact columns —
-- create or replace view cannot reorder existing columns (42P16), and
-- PostgREST callers select by name (same reasoning as 0022/0023/0030).
create or replace view dealers_directory
with (security_invoker = off) as
select
  id,
  company_name,
  company_no,
  contact_person,
  phone,
  email,
  address,
  region,
  package,
  status,
  created_at,
  onboarded_by,
  notes,
  whatsapp,
  submit_token
from dealers
where current_role_name() in ('cs', 'accountant', 'master');

-- ------------------------------------------------------------- the queue
create table if not exists topup_requests (
  id             uuid primary key default gen_random_uuid(),
  dealer_id      uuid not null references dealers(id) on delete cascade,
  type           text not null check (type in ('topup', 'package')),
  -- Exactly one of these carries the ask, decided by `type`. A top-up is
  -- stated in ringgit because ringgit is what the dealer transferred; points
  -- are derived at /entry from the dealer's rate, and deriving them here would
  -- be storing a price the dealer does not get to set.
  money_rm       numeric(12, 2),
  package        text check (package is null or package in ('A', 'B', 'C')),
  note           text,
  slip_url       text,
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reject_reason  text,
  -- What makes the chain auditable end to end: a verified transaction can be
  -- traced back, months later, to the exact words the dealer submitted.
  transaction_id uuid references transactions(id) on delete set null,
  decided_by     uuid references profiles(id),
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),

  constraint topup_request_states_its_ask check (
    (type = 'topup'   and money_rm is not null and money_rm > 0 and package is null) or
    (type = 'package' and package  is not null and money_rm is null)
  ),
  constraint decided_requests_say_who check (
    (status = 'pending' and decided_by is null and decided_at is null) or
    (status <> 'pending' and decided_by is not null and decided_at is not null)
  ),
  constraint rejections_give_a_reason check (
    status <> 'rejected' or (reject_reason is not null and length(trim(reject_reason)) > 0)
  )
);

-- The inbox reads pending rows newest-first; a dealer's own link reads their
-- rows newest-first. Both are covered here.
create index if not exists idx_topup_requests_pending on topup_requests (created_at desc) where status = 'pending';
create index if not exists idx_topup_requests_dealer on topup_requests (dealer_id, created_at desc);

-- --------------------------------------------------------- one dealer, five
--
-- The submitting endpoint is unauthenticated. The server action rate-limits by
-- token, but a rate limit only slows a flood down; this caps how much of the
-- inbox one dealer can occupy at all. Five is enough for a dealer settling a
-- run of top-ups in one sitting, and small enough that a stuck or malicious
-- link cannot bury the queue the staff have to read.
--
-- Enforced in the database rather than only in the action, for the same reason
-- createDealer re-checks for a duplicate name after the form already did: the
-- form is a courtesy, the constraint is the rule.
create or replace function enforce_pending_request_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_count integer;
begin
  if NEW.status is distinct from 'pending' then
    return NEW;
  end if;

  select count(*) into open_count
  from topup_requests
  where dealer_id = NEW.dealer_id and status = 'pending';

  if open_count >= 5 then
    raise exception 'too_many_pending_requests: this dealer already has 5 requests waiting to be reviewed';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_pending_request_cap on topup_requests;
create trigger trg_enforce_pending_request_cap
  before insert on topup_requests
  for each row execute function enforce_pending_request_cap();

-- ------------------------------------------------------------------- access
alter table topup_requests enable row level security;

-- Nothing for anon, ever. The public page at /r/<token> renders on the server
-- and writes through a Server Action holding the service role, so the browser
-- never carries a key that can reach this table.
--
-- The alternative — a SECURITY DEFINER function callable by anon — is the
-- pattern used elsewhere in this schema, and it is the wrong one here. It would
-- widen the PostgREST surface, which is exactly where both 0038 and 0041 found
-- real holes. A table anon cannot address at all has no such surface.
revoke all on topup_requests from anon;

-- Accepting a request creates a money row, so this is the accountant/master
-- pair, same as /entry and /records. cs gets no policy at all, matching every
-- other table that carries an amount.
create policy topup_requests_select_finance on topup_requests
  for select using (current_role_name() in ('accountant', 'master'));

create policy topup_requests_update_finance on topup_requests
  for update using (current_role_name() in ('accountant', 'master'))
  with check (current_role_name() in ('accountant', 'master'));

-- No insert policy on purpose: staff do not create requests, dealers do, and
-- dealers arrive through the service role. A staff member wanting to record
-- something goes to /entry, which is the front door and always was.

comment on table topup_requests is
  'Dealer-submitted top-up/package claims awaiting staff review. Not a ledger table: nothing here affects the credit balance until accepted into transactions.';
