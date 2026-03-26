-- 1. profiles 테이블 생성
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  plan_type text default 'free',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS 활성화
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using ( auth.uid() = id );

create policy "Users can update own profile"
  on public.profiles for update
  using ( auth.uid() = id );

-- Insert trigger for new users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. usage_credits 테이블 생성
create table if not exists public.usage_credits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  total_credits integer default 5,
  used_credits integer default 0,
  reset_date timestamp with time zone,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.usage_credits enable row level security;

create policy "Users can view own credits"
  on public.usage_credits for select
  using ( auth.uid() = user_id );

-- Create trigger to initialize credits when profile is created
create or replace function public.initialize_user_credits()
returns trigger as $$
begin
  insert into public.usage_credits (user_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute procedure public.initialize_user_credits();


-- 3. analysis_results 테이블 생성
create table if not exists public.analysis_results (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  location text not null,
  business_type text not null,
  result_data jsonb not null,
  is_favorite boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.analysis_results enable row level security;

create policy "Users can view own analysis results"
  on public.analysis_results for select
  using ( auth.uid() = user_id );

create policy "Users can insert own analysis results"
  on public.analysis_results for insert
  with check ( auth.uid() = user_id );

create policy "Users can update own analysis results"
  on public.analysis_results for update
  using ( auth.uid() = user_id );

create policy "Users can delete own analysis results"
  on public.analysis_results for delete
  using ( auth.uid() = user_id );
