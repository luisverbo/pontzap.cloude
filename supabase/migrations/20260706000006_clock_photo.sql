-- Phase 4 (differentiation): photo verification at clock-in.
-- Stores a selfie captured when the employee punches, for anti-fraud.

ALTER TABLE public.clock_records ADD COLUMN IF NOT EXISTS photo_path TEXT;

-- Private-ish public bucket: objects are keyed by the clock record UUID, which
-- is effectively unguessable. Public read keeps admin viewing simple.
INSERT INTO storage.buckets (id, name, public)
VALUES ('clock-photos', 'clock-photos', true)
ON CONFLICT (id) DO NOTHING;
