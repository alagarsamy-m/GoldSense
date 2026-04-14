create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fcm_token text not null,
  enabled boolean not null default true,
  device_label text,
  browser text,
  notification_time_utc text not null default '03:00',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists push_subscriptions_user_token_idx
  on public.push_subscriptions(user_id, fcm_token);

alter table public.push_subscriptions enable row level security;

create policy "users read own push subscriptions"
  on public.push_subscriptions
  for select
  using (auth.uid() = user_id);

create policy "users insert own push subscriptions"
  on public.push_subscriptions
  for insert
  with check (auth.uid() = user_id);

create policy "users update own push subscriptions"
  on public.push_subscriptions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
