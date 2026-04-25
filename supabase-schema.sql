-- Run this in Supabase SQL Editor: supabase.com → your project → SQL Editor

-- Enable Row Level Security
-- Portfolio items (one row per owned item per user)
create table if not exists portfolios (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  item_id text not null,
  item_key text,
  item_data jsonb not null, -- stores brand, name, category, avgPrice, etc.
  condition text not null,
  added_date timestamptz default now(),
  updated_date timestamptz default now(),
  unique(user_id, item_id)
);

-- Price history (daily snapshots per item key)
create table if not exists price_history (
  id uuid default gen_random_uuid() primary key,
  item_key text not null,
  price numeric not null,
  date date default current_date,
  source text,
  created_at timestamptz default now(),
  unique(item_key, date)
);

-- RLS policies
alter table portfolios enable row level security;
alter table price_history enable row level security;

-- Users can only see/edit their own portfolio
create policy "Users own their portfolio" on portfolios
  for all using (auth.uid() = user_id);

-- Price history is public read, no writes from client
create policy "Price history is public" on price_history
  for select using (true);

-- Index for fast lookups
create index if not exists portfolios_user_id_idx on portfolios(user_id);
create index if not exists price_history_item_key_idx on price_history(item_key);
create index if not exists price_history_date_idx on price_history(item_key, date desc);
