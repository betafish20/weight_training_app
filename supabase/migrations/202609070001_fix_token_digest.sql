-- Supabase installs pgcrypto in the extensions schema. These functions use an
-- empty search_path, so qualify digest explicitly to keep token hashing working.

create or replace function public.rotate_join_link()
returns text language plpgsql security definer set search_path = '' as $$
declare v_group uuid; v_token text;
begin
  select group_id into v_group from public.group_memberships where user_id=auth.uid() and role in ('owner','trainer') order by case role when 'owner' then 1 else 2 end limit 1;
  if v_group is null then raise exception 'Trainer or owner access required'; end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.join_links(group_id,token_hash,enabled,created_at) values(v_group,encode(extensions.digest(v_token,'sha256'),'hex'),true,now())
  on conflict(group_id) do update set token_hash=excluded.token_hash,enabled=true,created_at=now();
  return v_token;
end $$;

create or replace function public.join_group(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_group uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select group_id into v_group from public.join_links where enabled and token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  if v_group is null then raise exception 'This signup link is invalid or disabled'; end if;
  if exists(select 1 from public.group_memberships where user_id=auth.uid() and role='client' and group_id<>v_group) then raise exception 'This account already belongs to another training group'; end if;
  insert into public.group_memberships(group_id,user_id,role) values(v_group,auth.uid(),'client') on conflict do nothing;
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
  insert into public.trainer_transfers(group_id,email,token_hash) values(v_group,lower(trim(p_email)),encode(extensions.digest(v_token,'sha256'),'hex'));
  return v_token;
end $$;

create or replace function public.accept_transfer(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.trainer_transfers t set accepted_by=auth.uid()
  where t.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and t.confirmed_at is null and t.expires_at>now()
    and lower(t.email)=(select lower(email) from public.profiles where id=auth.uid());
  if not found then raise exception 'This invitation is invalid, expired, or belongs to another email'; end if;
end $$;

revoke all on function public.rotate_join_link(), public.join_group(text), public.create_transfer(text), public.accept_transfer(text) from public, anon, authenticated;
grant execute on function public.rotate_join_link(), public.join_group(text), public.create_transfer(text), public.accept_transfer(text) to authenticated;
