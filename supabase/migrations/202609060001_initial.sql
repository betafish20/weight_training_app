create extension if not exists pgcrypto;

create type public.weight_unit as enum ('lb', 'kg');
create type public.group_role as enum ('owner', 'trainer', 'client');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  email text not null,
  unit public.weight_unit not null default 'lb',
  created_at timestamptz not null default now()
);
create unique index profiles_email_lower_idx on public.profiles(lower(email));

create table public.training_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null references public.profiles(id),
  trainer_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.group_memberships (
  group_id uuid not null references public.training_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_role not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id, role)
);
create index group_memberships_user_idx on public.group_memberships(user_id, role);

create table public.join_links (
  group_id uuid primary key references public.training_groups(id) on delete cascade,
  token_hash text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.trainer_transfers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.training_groups(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  accepted_by uuid references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.workouts (
  id uuid primary key,
  group_id uuid not null references public.training_groups(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  workout_date date not null,
  title text not null check (char_length(title) between 1 and 100),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index workouts_client_date_idx on public.workouts(client_id, workout_date desc);

create table public.workout_exercises (
  id uuid primary key,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  unit public.weight_unit not null,
  tracking_mode text not null default 'reps' check (tracking_mode in ('reps', 'time')),
  position integer not null check (position >= 0)
);
create index workout_exercises_workout_idx on public.workout_exercises(workout_id, position);

create table public.workout_sets (
  id uuid primary key,
  exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  weight numeric(8,2) check (weight between 0 and 10000),
  reps integer check (reps between 1 and 10000),
  duration_seconds integer check (duration_seconds between 1 and 86400),
  completed boolean not null default false,
  position integer not null check (position >= 0),
  check (not completed or reps is not null or duration_seconds is not null)
);
create index workout_sets_exercise_idx on public.workout_sets(exercise_id, position);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, name, email)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)), new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.can_manage_group(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_memberships
    where group_id = p_group and user_id = auth.uid() and role in ('owner','trainer')
  );
$$;

create or replace function public.can_access_client(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() = p_client or exists (
    select 1
    from public.group_memberships manager
    join public.group_memberships client
      on client.group_id = manager.group_id and client.user_id = p_client and client.role = 'client'
    where manager.user_id = auth.uid() and manager.role in ('owner','trainer')
  );
$$;

create or replace function public.update_profile(p_name text, p_unit public.weight_unit)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or char_length(trim(p_name)) not between 1 and 100 then raise exception 'Invalid profile'; end if;
  update public.profiles set name = trim(p_name), unit = p_unit where id = auth.uid();
end $$;

create or replace function public.create_training_group(p_name text default 'My training group')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_group uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if exists (select 1 from public.group_memberships where user_id = auth.uid() and role = 'owner') then raise exception 'You already own a training group'; end if;
  insert into public.training_groups(name, owner_id) values (trim(p_name), auth.uid()) returning id into v_group;
  insert into public.group_memberships(group_id, user_id, role) values (v_group, auth.uid(), 'owner'), (v_group, auth.uid(), 'client');
  return v_group;
end $$;

create or replace function public.get_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_profile jsonb; v_group_id uuid; v_group jsonb; v_owner boolean; v_trainer boolean; v_client boolean; v_clients jsonb;
begin
  select to_jsonb(p) into v_profile from public.profiles p where p.id = auth.uid();
  if v_profile is null then raise exception 'Profile not found'; end if;
  select gm.group_id into v_group_id from public.group_memberships gm where gm.user_id = auth.uid() order by case gm.role when 'owner' then 1 when 'trainer' then 2 else 3 end limit 1;
  if v_group_id is null then
    return jsonb_build_object('profile',v_profile,'group',null,'is_owner',false,'is_trainer',false,'is_client',false,'clients',jsonb_build_array(v_profile));
  end if;
  select to_jsonb(g) || jsonb_build_object('trainer_name', tp.name) into v_group from public.training_groups g left join public.profiles tp on tp.id=g.trainer_id where g.id=v_group_id;
  select exists(select 1 from public.group_memberships where group_id=v_group_id and user_id=auth.uid() and role='owner'), exists(select 1 from public.group_memberships where group_id=v_group_id and user_id=auth.uid() and role='trainer'), exists(select 1 from public.group_memberships where group_id=v_group_id and user_id=auth.uid() and role='client') into v_owner,v_trainer,v_client;
  if v_owner or v_trainer then
    select coalesce(jsonb_agg(to_jsonb(p) order by p.name), '[]'::jsonb) into v_clients from public.group_memberships gm join public.profiles p on p.id=gm.user_id where gm.group_id=v_group_id and gm.role='client';
  else v_clients := jsonb_build_array(v_profile); end if;
  return jsonb_build_object('profile',v_profile,'group',v_group,'is_owner',v_owner,'is_trainer',v_trainer,'is_client',v_client,'clients',v_clients);
end $$;

create or replace function public.rotate_join_link()
returns text language plpgsql security definer set search_path = '' as $$
declare v_group uuid; v_token text;
begin
  select group_id into v_group from public.group_memberships where user_id=auth.uid() and role in ('owner','trainer') order by case role when 'owner' then 1 else 2 end limit 1;
  if v_group is null then raise exception 'Trainer or owner access required'; end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.join_links(group_id,token_hash,enabled,created_at) values(v_group,encode(digest(v_token,'sha256'),'hex'),true,now())
  on conflict(group_id) do update set token_hash=excluded.token_hash,enabled=true,created_at=now();
  return v_token;
end $$;

create or replace function public.disable_join_link()
returns void language plpgsql security definer set search_path = '' as $$
declare v_group uuid;
begin
  select group_id into v_group from public.group_memberships where user_id=auth.uid() and role in ('owner','trainer') limit 1;
  if v_group is null then raise exception 'Trainer or owner access required'; end if;
  update public.join_links set enabled=false where group_id=v_group;
end $$;

create or replace function public.join_group(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_group uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select group_id into v_group from public.join_links where enabled and token_hash=encode(digest(p_token,'sha256'),'hex');
  if v_group is null then raise exception 'This signup link is invalid or disabled'; end if;
  if exists(select 1 from public.group_memberships where user_id=auth.uid() and role='client' and group_id<>v_group) then raise exception 'This account already belongs to another training group'; end if;
  insert into public.group_memberships(group_id,user_id,role) values(v_group,auth.uid(),'client') on conflict do nothing;
end $$;

create or replace function public.list_workouts(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.can_access_client(p_client) then raise exception 'Access denied'; end if;
  select coalesce(jsonb_agg(item order by item->>'date' desc), '[]'::jsonb) into v_result from (
    select jsonb_build_object('id',w.id,'client_id',w.client_id,'date',w.workout_date,'title',w.title,'revision',w.revision,'updated_at',w.updated_at,'updated_by',w.updated_by,'editor_name',p.name,'exercises',
      coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'unit',e.unit,'tracking',e.tracking_mode,'sets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'weight',s.weight,'reps',s.reps,'duration_seconds',s.duration_seconds,'completed',s.completed) order by s.position) from public.workout_sets s where s.exercise_id=e.id),'[]'::jsonb)) order by e.position) from public.workout_exercises e where e.workout_id=w.id),'[]'::jsonb)) item
    from public.workouts w join public.profiles p on p.id=w.updated_by where w.client_id=p_client
  ) q;
  return v_result;
end $$;

create or replace function public.save_workout(p_workout jsonb, p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := (p_workout->>'id')::uuid; v_client uuid := (p_workout->>'client_id')::uuid; v_group uuid; v_current integer; v_saved jsonb; e jsonb; s jsonb; epos integer; spos integer;
begin
  if not public.can_access_client(v_client) then raise exception 'Access denied'; end if;
  select gm.group_id into v_group from public.group_memberships gm where gm.user_id=v_client and gm.role='client' limit 1;
  if v_group is null then raise exception 'Client has no training group'; end if;
  if jsonb_array_length(coalesce(p_workout->'exercises','[]'::jsonb)) > 50 then raise exception 'Too many exercises'; end if;
  select revision into v_current from public.workouts where id=v_id for update;
  if found and v_current <> p_expected_revision then raise exception 'CONFLICT: This workout changed in another session'; end if;
  if found then
    update public.workouts set workout_date=(p_workout->>'date')::date,title=trim(p_workout->>'title'),revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=v_id;
    delete from public.workout_exercises where workout_id=v_id;
  else
    if p_expected_revision <> 0 then raise exception 'CONFLICT: This workout no longer exists'; end if;
    insert into public.workouts(id,group_id,client_id,workout_date,title,revision,updated_by) values(v_id,v_group,v_client,(p_workout->>'date')::date,trim(p_workout->>'title'),1,auth.uid());
  end if;
  epos:=0;
  for e in select * from jsonb_array_elements(coalesce(p_workout->'exercises','[]'::jsonb)) loop
    if jsonb_array_length(coalesce(e->'sets','[]'::jsonb)) > 100 then raise exception 'Too many sets'; end if;
    insert into public.workout_exercises(id,workout_id,name,unit,tracking_mode,position) values((e->>'id')::uuid,v_id,trim(e->>'name'),(e->>'unit')::public.weight_unit,coalesce(nullif(e->>'tracking',''),'reps'),epos); epos:=epos+1; spos:=0;
    for s in select * from jsonb_array_elements(coalesce(e->'sets','[]'::jsonb)) loop
      if coalesce((s->>'completed')::boolean,false) and ((coalesce(nullif(e->>'tracking',''),'reps')='reps' and nullif(s->>'reps','') is null) or (e->>'tracking'='time' and nullif(s->>'duration_seconds','') is null)) then
        raise exception 'Completed sets require reps or time for the selected tracking type';
      end if;
      insert into public.workout_sets(id,exercise_id,weight,reps,duration_seconds,completed,position) values((s->>'id')::uuid,(e->>'id')::uuid,nullif(s->>'weight','')::numeric,nullif(s->>'reps','')::integer,nullif(s->>'duration_seconds','')::integer,coalesce((s->>'completed')::boolean,false),spos); spos:=spos+1;
    end loop;
  end loop;
  select value into v_saved from jsonb_array_elements(public.list_workouts(v_client)) value where value->>'id'=v_id::text;
  return v_saved;
end $$;

create or replace function public.create_transfer(p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_group uuid; v_token text;
begin
  select group_id into v_group from public.group_memberships where user_id=auth.uid() and role='owner' limit 1;
  if v_group is null then raise exception 'Owner access required'; end if;
  if p_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Enter a valid email'; end if;
  update public.trainer_transfers set confirmed_at=now() where group_id=v_group and confirmed_at is null;
  v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.trainer_transfers(group_id,email,token_hash) values(v_group,lower(trim(p_email)),encode(digest(v_token,'sha256'),'hex'));
  return v_token;
end $$;

create or replace function public.accept_transfer(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.trainer_transfers t set accepted_by=auth.uid()
  where t.token_hash=encode(digest(p_token,'sha256'),'hex') and t.confirmed_at is null and t.expires_at>now()
    and lower(t.email)=(select lower(email) from public.profiles where id=auth.uid());
  if not found then raise exception 'This invitation is invalid, expired, or belongs to another email'; end if;
end $$;

create or replace function public.list_transfers()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_group uuid; v_result jsonb;
begin
  select group_id into v_group from public.group_memberships where user_id=auth.uid() and role='owner' limit 1;
  if v_group is null then raise exception 'Owner access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'email',t.email,'accepted_by',t.accepted_by,'accepted_name',p.name,'expires_at',t.expires_at) order by t.created_at desc),'[]'::jsonb) into v_result from public.trainer_transfers t left join public.profiles p on p.id=t.accepted_by where t.group_id=v_group and t.confirmed_at is null;
  return v_result;
end $$;

create or replace function public.confirm_transfer(p_transfer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_group uuid; v_new uuid;
begin
  select t.group_id,t.accepted_by into v_group,v_new from public.trainer_transfers t join public.group_memberships gm on gm.group_id=t.group_id and gm.user_id=auth.uid() and gm.role='owner' where t.id=p_transfer and t.confirmed_at is null and t.expires_at>now() for update;
  if v_group is null or v_new is null then raise exception 'Transfer is not ready'; end if;
  delete from public.group_memberships where group_id=v_group and role='trainer';
  insert into public.group_memberships(group_id,user_id,role) values(v_group,v_new,'trainer') on conflict do nothing;
  update public.training_groups set trainer_id=v_new where id=v_group;
  update public.trainer_transfers set confirmed_at=now() where id=p_transfer;
end $$;

alter table public.profiles enable row level security;
alter table public.training_groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.join_links enable row level security;
alter table public.trainer_transfers enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.update_profile(text,public.weight_unit), public.create_training_group(text), public.get_context(), public.rotate_join_link(), public.disable_join_link(), public.join_group(text), public.list_workouts(uuid), public.save_workout(jsonb,integer), public.create_transfer(text), public.accept_transfer(text), public.list_transfers(), public.confirm_transfer(uuid) to authenticated;
