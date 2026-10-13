ALTER TABLE coach_clients ADD COLUMN deleted_at timestamptz;
ALTER TABLE refresh_sessions ADD COLUMN acting_coach_id uuid REFERENCES users(id);
