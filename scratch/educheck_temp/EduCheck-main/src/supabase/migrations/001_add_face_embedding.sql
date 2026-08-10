-- Migration: Add face_embedding column to students table
-- Run this in Supabase SQL Editor

BEGIN;

-- Enable pgvector extension (optional - for vector similarity search)
CREATE EXTENSION IF NOT EXISTS vector;

-- Check if face_embedding column exists, add if not
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'students' AND column_name = 'face_embedding'
    ) THEN
        ALTER TABLE public.students ADD COLUMN face_embedding text;
    END IF;
END
$$;

-- Create index for faster queries (if using text/jsonb)
CREATE INDEX IF NOT EXISTS students_face_embedding_idx ON public.students (face_embedding) 
WHERE face_embedding IS NOT NULL;

-- Optional: Create vector type index if pgvector is enabled
-- Uncomment below if using pgvector with vector type
-- CREATE INDEX IF NOT EXISTS students_face_embedding_vector_idx ON public.students 
-- USING ivfflat (face_embedding vector_cosine_ops) 
-- WITH (lists = 100) 
-- WHERE face_embedding IS NOT NULL;

COMMIT;