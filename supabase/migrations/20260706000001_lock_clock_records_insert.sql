-- Phase 2 security lockdown: close direct clock-record forgery.
--
-- Legitimate punches now go through the `register-clock` Edge Function, which
-- runs with the service role (bypassing RLS) and enforces the timestamp,
-- geofence and company ownership server-side. Admin manual entries are still
-- allowed by the "Admins can manage company clock records" policy.
--
-- Removing the employee self-insert policy means a client can no longer insert
-- an arbitrary clock_record directly (forging location/time from anywhere).
--
-- IMPORTANT: apply this ONLY after `register-clock` is deployed and verified,
-- otherwise employee punches would be rejected.

DROP POLICY IF EXISTS "Employees can insert their own clock records" ON public.clock_records;
