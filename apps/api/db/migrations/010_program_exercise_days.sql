-- Keep program-specific exercise days out of the reusable workout library.
ALTER TABLE workout_templates ADD COLUMN program_day_only boolean NOT NULL DEFAULT false;
