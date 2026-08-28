-- The notif_update policy only allowed UPDATE when recipient_profile_id = auth.uid(),
-- but notify() writes account-scoped rows with recipient_profile_id = NULL. Result:
-- no host could ever mark a notification read (UPDATE silently matched 0 rows).
-- Widen UPDATE to match the existing notif_select visibility rule: if you can
-- read the notification, you can mark it read.
drop policy if exists notif_update on public.notifications;

create policy notif_update on public.notifications
  for update
  using ((recipient_profile_id = auth.uid()) or is_account_member(host_account_id))
  with check ((recipient_profile_id = auth.uid()) or is_account_member(host_account_id));
