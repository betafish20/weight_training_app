-- Keep both ends of the trainer invitation flow callable by signed-in users.
-- The functions still enforce owner/email checks internally.
grant execute on function public.create_transfer(text) to authenticated;
grant execute on function public.accept_transfer(text) to authenticated;
