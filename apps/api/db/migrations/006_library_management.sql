ALTER TABLE nutrition_library ADD COLUMN archived_at timestamptz;
ALTER TABLE nutrition_library ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE nutrition_library ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
