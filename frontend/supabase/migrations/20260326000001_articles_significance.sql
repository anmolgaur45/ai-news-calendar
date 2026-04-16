-- Add significance_base to articles for use during clustering (Phase 2)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS significance_base FLOAT DEFAULT 0;
