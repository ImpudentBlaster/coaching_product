ALTER TABLE checkin_assignments DROP CONSTRAINT checkin_assignments_frequency_check;
ALTER TABLE checkin_assignments ADD CONSTRAINT checkin_assignments_frequency_check CHECK(frequency IN ('ONCE','DAILY','WEEKLY','BIWEEKLY','MONTHLY'));
ALTER TABLE checkin_assignments ALTER COLUMN frequency SET DEFAULT 'DAILY';

-- Private PostgreSQL-backed storage: no public files, paths or URLs.
-- Keeping bytes in the transaction makes upload/delete and audit writes atomic.
CREATE TABLE checkin_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES checkin_assignments(id),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  content_type text NOT NULL DEFAULT 'image/jpeg' CHECK(content_type='image/jpeg'),
  image_bytes bytea NOT NULL CHECK(octet_length(image_bytes) BETWEEN 1 AND 8388608),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkin_photos_assignment ON checkin_photos(assignment_id,created_at,id);
ALTER TABLE checkin_submissions ADD COLUMN submitted_photo_ids uuid[] NOT NULL DEFAULT '{}';
