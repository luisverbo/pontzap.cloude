-- Optional selfie/photo on clock-in, chosen per company (to be gated by plan later).
-- Default OFF so photo capture is opt-in and does not block anyone.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS require_clock_photo BOOLEAN NOT NULL DEFAULT false;
