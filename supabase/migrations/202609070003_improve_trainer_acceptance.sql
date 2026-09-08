create or replace function public.accept_transfer(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_invited text; v_current text;
begin
  select t.email into v_invited from public.trainer_transfers t
  where t.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and t.confirmed_at is null and t.expires_at>now();
  if v_invited is null then raise exception 'This invitation is invalid or expired'; end if;
  select p.email into v_current from public.profiles p where p.id=auth.uid();
  if lower(v_invited)<>lower(v_current) then raise exception 'This invitation is for %, but you are signed in as %. Use another Google account.',v_invited,v_current; end if;
  update public.trainer_transfers t set accepted_by=auth.uid()
  where t.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and t.confirmed_at is null and t.expires_at>now();
end $$;

revoke all on function public.accept_transfer(text) from public, anon, authenticated;
grant execute on function public.accept_transfer(text) to authenticated;
