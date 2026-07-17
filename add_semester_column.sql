-- Migration: Add semester column to riwayat_poin
-- Run this SQL in your Supabase SQL Editor before deploying the new code.
-- This adds a 'semester' label to each point entry so we can archive and reset per-semester.

ALTER TABLE public.riwayat_poin
ADD COLUMN IF NOT EXISTS semester TEXT NOT NULL DEFAULT '2025/2026 Ganjil';

-- Optional: backfill existing rows with the current semester name
UPDATE public.riwayat_poin
SET semester = '2025/2026 Ganjil'
WHERE semester IS NULL OR semester = '';
