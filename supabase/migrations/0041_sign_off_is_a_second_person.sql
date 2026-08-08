-- Make "someone else has to sign this off" true outside the app as well.
--
-- records/actions.ts calls its check "Real gate, not just the VerifyButton UI
-- state above it". It is a real gate — right up until someone talks to
-- PostgREST instead of the form. transactions_update_accountant grants UPDATE
-- to any accountant or master with no WITH CHECK, and no trigger looked at who
-- was signing, so a correction could be posted and verified by the same person
-- in two API calls. That is the one thing the correction flow exists to stop.
--
-- Measured rather than reasoned about: signed in as the demo accountant,
-- POST a correction (201), then PATCH it to verified with verified_by set to
-- that same accountant (200). Accepted. This is the same shape as the hole
-- 0038 closed — the interface enforcing a rule the database did not.
--
-- And worse than it first looks, because verified_by was simply whatever the
-- caller sent. A rule that only compared verified_by against recorded_by would
-- have been satisfied by writing the master's id into the column: a signature
-- in someone else's name, sitting in the audit trail with nothing to mark it
-- as forged.
--
-- Hence two rules, and the order matters:
--   1. you sign as yourself
--   2. and you are not the person who posted the correction
--
-- Rule 1 is what gives rule 2 any force. Without it, rule 2 is a formality
-- anyone can step around by typing a different uuid.
--
-- Ordinary top-ups and packages are deliberately untouched. They have a
-- receipt and a formula behind them, which is exactly why the second
-- signature was only ever required for corrections — see the comment on
-- verifyTransaction. This migration enforces the rule that already existed;
-- it does not invent a stricter one.

create or replace function enforce_sign_off_is_a_second_person()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Only the moment a row becomes verified. Flagging it, attaching a receipt,
  -- marking a SIM sent, editing a note — none of that is this trigger's
  -- business, and a trigger that fires on work it has no opinion about is a
  -- trigger someone eventually disables.
  if NEW.status is distinct from 'verified' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.status = 'verified' then
    return NEW;
  end if;

  -- No end user behind this request: the service role, which is the seed, the
  -- restore script and the cron. They write verified rows on purpose and have
  -- no auth.uid() to check a signature against. The key that reaches this path
  -- is a backend secret, not something an accountant is ever given.
  if auth.uid() is null then
    return NEW;
  end if;

  if NEW.verified_by is distinct from auth.uid() then
    raise exception 'sign_off_not_yours: a transaction is signed off by the person doing it, not on their behalf';
  end if;

  -- INSERT is covered as well as UPDATE. Verification happens as an update in
  -- the app, but nothing stopped an accountant inserting a correction that was
  -- already verified — one call instead of two, same result, and it would have
  -- walked straight past a trigger that only watched updates.
  if NEW.type = 'adjustment' and NEW.recorded_by = NEW.verified_by then
    raise exception 'sign_off_needs_a_second_person: you posted this correction — a different accountant or master needs to verify it';
  end if;

  return NEW;
end;
$$;

revoke execute on function enforce_sign_off_is_a_second_person() from public, anon, authenticated;

drop trigger if exists trg_enforce_sign_off_is_a_second_person on transactions;
create trigger trg_enforce_sign_off_is_a_second_person
  before insert or update on transactions
  for each row
  execute function enforce_sign_off_is_a_second_person();
