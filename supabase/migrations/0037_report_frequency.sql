-- Phase 37: how often each master wants the report.
--
-- The cron fires once a day and always did, sending yesterday's numbers to
-- every master whether they wanted them or not. The only way to stop it was
-- to stop being a master.
--
-- Frequency lives on profiles rather than in notification_preferences because
-- that table is (user_id, category, enabled) — a boolean per category — and
-- this is not a boolean. Squeezing four states into "enabled" would mean
-- inventing categories like report_weekly/report_monthly that are mutually
-- exclusive, which is a state machine pretending to be a set of switches.
--
-- 'off' rather than deleting the row: someone who turns the report off for a
-- quiet month should get it back by flipping one control, not by being
-- re-added to something.
alter table profiles
  add column if not exists report_frequency text not null default 'daily';

alter table profiles drop constraint if exists profiles_report_frequency_valid;
alter table profiles add constraint profiles_report_frequency_valid
  check (report_frequency in ('daily', 'weekly', 'monthly', 'off'));

comment on column profiles.report_frequency is
  'How often this person receives the emailed report. The cron runs daily and decides per recipient whether today is their send day; the period it summarises follows the same setting, so a monthly report covers the month rather than one day of it.';
