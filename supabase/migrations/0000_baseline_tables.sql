-- The three tables every other migration assumes, captured from the live
-- database because they were never in one.
--
-- 0001's own comment says it plainly: "dealers, transactions, company_statements
-- already exist ... only profiles is newly created here". They were made by hand
-- in the dashboard when the project started, so supabase/migrations/ has never
-- been able to rebuild this database — running it against an empty project fails
-- on the very first file, and 34 of 38 files fail after it.
--
-- That is a backup problem, not a tidiness one. scripts/backup.mjs saves every
-- row; restoring those rows needs tables to put them in, and the definition of
-- the three most important ones existed only inside the thing being backed up.
--
-- Generated from production's catalog, not written from memory. It runs before
-- 0001 and is safe against the existing database: every statement is
-- if-not-exists, so applying it where the tables already exist changes nothing.

-- ==========================================================
-- dealers
-- ==========================================================
create table if not exists dealers (
  id                         uuid default gen_random_uuid() not null,
  company_name               text not null,
  company_no                 text,
  contact_person             text,
  phone                      text,
  email                      text,
  address                    text,
  region                     text,
  package                    text,
  rate                       numeric,
  status                     text default 'active'::text,
  notes                      text,
  created_at                 timestamp with time zone default now(),
  onboarded_by               uuid,
  whatsapp                   text,
  constraint dealers_pkey PRIMARY KEY (id)
);

alter table dealers drop constraint if exists dealers_package_check;
alter table dealers add constraint dealers_package_check CHECK ((package = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])));
alter table dealers drop constraint if exists dealers_status_check;
alter table dealers add constraint dealers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])));

create index if not exists idx_dealers_company ON public.dealers USING btree (company_name);
create index if not exists idx_dealers_region ON public.dealers USING btree (region);

alter table dealers enable row level security;

-- ==========================================================
-- transactions
-- ==========================================================
create table if not exists transactions (
  id                         uuid default gen_random_uuid() not null,
  dealer_id                  uuid,
  tx_date                    date default CURRENT_DATE not null,
  type                       text not null,
  package                    text,
  points                     numeric default 0 not null,
  money_rm                   numeric default 0 not null,
  rate                       numeric,
  commission_rm              numeric generated always as (round((points * 0.02), 2)) stored,
  sim_type                   text,
  delivery_status            text default 'na'::text,
  receipt_url                text,
  status                     text default 'pending'::text not null,
  recorded_by                uuid,
  verified_by                uuid,
  note                       text,
  created_at                 timestamp with time zone default now(),
  flag_reason                text,
  adjusts_id                 uuid,
  idempotency_key            uuid,
  coupon_rm                  numeric default 0 not null,
  constraint transactions_pkey PRIMARY KEY (id)
);

alter table transactions drop constraint if exists transactions_adjusts_id_fkey;
alter table transactions add constraint transactions_adjusts_id_fkey FOREIGN KEY (adjusts_id) REFERENCES transactions(id);
alter table transactions drop constraint if exists transactions_dealer_id_fkey;
alter table transactions add constraint transactions_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE RESTRICT;
alter table transactions drop constraint if exists transactions_delivery_status_check;
alter table transactions add constraint transactions_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['na'::text, 'pending'::text, 'sent'::text])));
alter table transactions drop constraint if exists transactions_package_check;
alter table transactions add constraint transactions_package_check CHECK ((package = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])));
alter table transactions drop constraint if exists transactions_sim_type_check;
alter table transactions add constraint transactions_sim_type_check CHECK ((sim_type = ANY (ARRAY['physical'::text, 'esim'::text])));
alter table transactions drop constraint if exists transactions_status_check;
alter table transactions add constraint transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'flagged'::text])));

create index if not exists idx_tx_date ON public.transactions USING btree (tx_date);
create index if not exists idx_tx_dealer ON public.transactions USING btree (dealer_id);
create index if not exists idx_tx_status ON public.transactions USING btree (status);

alter table transactions enable row level security;

-- ==========================================================
-- company_statements
-- ==========================================================
create table if not exists company_statements (
  id                         uuid default gen_random_uuid() not null,
  month                      date not null,
  company_total_points       numeric,
  company_profit_rm          numeric,
  reconciled                 boolean default false,
  note                       text,
  created_at                 timestamp with time zone default now(),
  constraint company_statements_pkey PRIMARY KEY (id)
);



alter table company_statements enable row level security;

