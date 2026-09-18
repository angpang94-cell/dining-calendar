create table if not exists public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  recorded_on date not null default current_date,
  amount bigint not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists savings_entries_household_date_idx
  on public.savings_entries (household_id, recorded_on desc);

alter table public.savings_entries enable row level security;

grant select, insert, update, delete on table public.savings_entries to anon, authenticated;

drop policy if exists "household members can read savings" on public.savings_entries;
create policy "household members can read savings"
  on public.savings_entries for select
  using (exists (
    select 1 from public.household_members member
    where member.household_id = savings_entries.household_id
      and member.user_id = auth.uid()
  ));

drop policy if exists "household members can insert savings" on public.savings_entries;
create policy "household members can insert savings"
  on public.savings_entries for insert
  with check (exists (
    select 1 from public.household_members member
    where member.household_id = savings_entries.household_id
      and member.user_id = auth.uid()
  ));

drop policy if exists "household members can update savings" on public.savings_entries;
create policy "household members can update savings"
  on public.savings_entries for update
  using (exists (
    select 1 from public.household_members member
    where member.household_id = savings_entries.household_id
      and member.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.household_members member
    where member.household_id = savings_entries.household_id
      and member.user_id = auth.uid()
  ));

drop policy if exists "household members can delete savings" on public.savings_entries;
create policy "household members can delete savings"
  on public.savings_entries for delete
  using (exists (
    select 1 from public.household_members member
    where member.household_id = savings_entries.household_id
      and member.user_id = auth.uid()
  ));

alter table public.savings_entries replica identity full;
alter publication supabase_realtime add table public.savings_entries;
