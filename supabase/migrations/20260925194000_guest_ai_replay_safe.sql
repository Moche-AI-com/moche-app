ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS guest_replay_safe boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.messages.guest_replay_safe IS 'Set only by the server after a guest-facing assistant answer has passed current safety checks. Legacy answers remain false and Wi-Fi replies are masked on history replay.';
