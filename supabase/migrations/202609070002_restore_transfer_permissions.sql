-- Keep both client and trainer invitation flows callable by signed-in users.
-- The functions still enforce owner, trainer, token, and email checks internally.
grant execute on function public.rotate_join_link() to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.create_transfer(text) to authenticated;
grant execute on function public.accept_transfer(text) to authenticated;
