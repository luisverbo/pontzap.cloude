-- Phase 3 (compliance): Comprovante de Ponto — NSR + tamper-evident hash chain.
--
-- Portaria 671/2021 requires that every clock record has a sequential number
-- (NSR) and that records form a tamper-evident chain. This adds:
--   * nsr          — global sequential number (unique, monotonic)
--   * prev_hash    — hash of the previous record (chain link)
--   * record_hash  — SHA-256 of this record's key fields + prev_hash
--
-- A BEFORE INSERT trigger assigns them atomically for EVERY insert (employee
-- punches via register-clock and admin manual entries), so nothing can be
-- written without a receipt number.

-- SHA-256 lives in pgcrypto (Supabase ships it in the `extensions` schema)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Sequential receipt number source (concurrency-safe, no locking needed)
CREATE SEQUENCE IF NOT EXISTS public.clock_records_nsr_seq;

ALTER TABLE public.clock_records
  ADD COLUMN IF NOT EXISTS nsr BIGINT,
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS record_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clock_records_nsr ON public.clock_records (nsr);

CREATE OR REPLACE FUNCTION public.assign_clock_receipt()
RETURNS TRIGGER AS $$
DECLARE
  v_prev_hash TEXT;
BEGIN
  -- Sequential receipt number
  NEW.nsr := nextval('public.clock_records_nsr_seq');

  -- Link to the previous record in the chain (global chain)
  SELECT record_hash INTO v_prev_hash
  FROM public.clock_records
  WHERE record_hash IS NOT NULL
  ORDER BY nsr DESC
  LIMIT 1;

  NEW.prev_hash := COALESCE(v_prev_hash, '');

  -- Tamper-evident hash of this record's key fields + previous hash
  NEW.record_hash := encode(
    digest(
      NEW.nsr::text || '|' ||
      NEW.employee_id::text || '|' ||
      NEW.type::text || '|' ||
      NEW.timestamp::text || '|' ||
      COALESCE(NEW.location_id::text, '') || '|' ||
      NEW.prev_hash,
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Runs after the duplicate-prevention trigger (alphabetical order: 'r_' > 'p')
DROP TRIGGER IF EXISTS r_assign_clock_receipt ON public.clock_records;
CREATE TRIGGER r_assign_clock_receipt
BEFORE INSERT ON public.clock_records
FOR EACH ROW
EXECUTE FUNCTION public.assign_clock_receipt();
