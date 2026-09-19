ALTER TABLE exercises ADD COLUMN owner_coach_id uuid REFERENCES users(id) ON DELETE RESTRICT;
CREATE INDEX exercises_owner_idx ON exercises(owner_coach_id);

-- Imported GIFs remain in the user-owned import directory. Custom GIFs are
-- private application data, committed with the exercise and audit event.
CREATE TABLE exercise_animations (
  exercise_id text PRIMARY KEY REFERENCES exercises(external_id) ON DELETE CASCADE,
  gif_bytes bytea NOT NULL CHECK(octet_length(gif_bytes) BETWEEN 1 AND 8388608)
);
