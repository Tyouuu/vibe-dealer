-- Phase 12: flagging a transaction now requires a reason, so the audit trail
-- shows not just who voided it but why — previously flag_by (verified_by,
-- repurposed) was recorded but there was no way to say what was wrong with it.
alter table transactions add column if not exists flag_reason text;
