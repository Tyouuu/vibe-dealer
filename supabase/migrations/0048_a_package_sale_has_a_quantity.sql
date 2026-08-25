-- A package sale has a quantity.
--
-- Until now a package transaction recorded WHICH package and not HOW MANY, so
-- a dealer buying three of Package C was three separate rows. That works as
-- arithmetic -- the card money came out right, because three rows of 100 cards
-- is 300 cards -- but it fails as a record. Nothing on any screen could say
-- "this dealer bought three", and the /dealers list showed a tier letter "A"
-- beside RM 90.00 with no way to see that the 90 was three packages. The owner
-- read that as a wrong figure, and they were right to: a number nobody can
-- derive from what is next to it is not a figure, it is a claim.
--
-- Quantity multiplies everything a package sale already carries. Three of
-- Package C is 3000 reload points, RM 3810 collected, 300 SIM cards, and
-- RM 450 of card margin. `points` and `money_rm` are therefore written
-- pre-multiplied by the app, exactly as one row of three packages should read
-- on a statement; `quantity` is what lets the screens say why.
--
-- Every existing row is one package, which is what the default records.

alter table transactions
  add column if not exists quantity integer not null default 1;

alter table transactions drop constraint if exists transactions_quantity_check;
alter table transactions add constraint transactions_quantity_check
  check (quantity >= 1);

-- Only a package is bought in multiples. A top-up is an amount of money and a
-- correction adjusts one specific row, so a quantity other than 1 on either of
-- those is not a bigger sale, it is a bug that would silently multiply points.
alter table transactions drop constraint if exists transactions_quantity_packages_only;
alter table transactions add constraint transactions_quantity_packages_only
  check (type = 'package' or quantity = 1);

-- A ceiling, because the entry form's quantity box is a number input and a
-- fat finger on it moves real points out of the credit balance. The largest
-- single order in the business so far is 40 of Package C at the Northern
-- launch; 200 leaves five times that much headroom and still refuses a
-- mistyped 3000.
alter table transactions drop constraint if exists transactions_quantity_ceiling;
alter table transactions add constraint transactions_quantity_ceiling
  check (quantity <= 200);

comment on column transactions.quantity is
  'How many of this package were bought on this row. Always 1 for top-ups and corrections. points and money_rm are already multiplied by it.';
