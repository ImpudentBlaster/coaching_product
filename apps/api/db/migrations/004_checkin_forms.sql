CREATE TABLE checkin_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES coach_profiles(user_id),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX checkin_default_form ON checkin_forms(coach_id) WHERE is_default;
CREATE TABLE checkin_form_versions (
  form_id uuid NOT NULL REFERENCES checkin_forms(id),
  version integer NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(form_id,version)
);
ALTER TABLE checkin_assignments ADD COLUMN form_id uuid;
ALTER TABLE checkin_assignments ADD COLUMN form_version integer;
ALTER TABLE checkin_assignments ADD COLUMN form_snapshot jsonb;
ALTER TABLE checkin_assignments ADD COLUMN schedule_id uuid;
ALTER TABLE checkin_assignments ADD COLUMN frequency text NOT NULL DEFAULT 'ONCE' CHECK(frequency IN ('ONCE','WEEKLY','BIWEEKLY','MONTHLY'));
ALTER TABLE checkin_assignments ADD FOREIGN KEY(form_id,form_version) REFERENCES checkin_form_versions(form_id,version);
-- Preserve the field identities used by existing answers and snapshots.
UPDATE checkin_assignments SET form_snapshot='{"name":"Weekly check-in","fields":[
{"id":"currentWeight","label":"Current weight","type":"NUMBER","required":true,"min":0.01,"max":1000,"unit":"kg","metric":true},
{"id":"energyRating","label":"Energy","type":"RATING","required":true,"min":1,"max":10,"metric":true},
{"id":"sleepRating","label":"Sleep quality","type":"RATING","required":true,"min":1,"max":10,"metric":true},
{"id":"stressRating","label":"Stress","type":"RATING","required":true,"min":1,"max":10,"metric":true},
{"id":"trainingAdherence","label":"Training adherence","type":"NUMBER","required":true,"min":0,"max":100,"unit":"%","metric":true},
{"id":"nutritionAdherence","label":"Nutrition adherence","type":"NUMBER","required":true,"min":0,"max":100,"unit":"%","metric":true},
{"id":"wins","label":"Wins","type":"LONG_TEXT","required":false},
{"id":"challenges","label":"Challenges","type":"LONG_TEXT","required":false},
{"id":"questions","label":"Questions for your coach","type":"LONG_TEXT","required":false},
{"id":"additionalNotes","label":"Additional notes","type":"LONG_TEXT","required":false}
]}'::jsonb;
ALTER TABLE checkin_assignments ALTER COLUMN form_snapshot SET NOT NULL;
ALTER TABLE checkin_submissions ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE checkin_submissions ADD COLUMN review_status text CHECK(review_status IN ('ON_TRACK','NEUTRAL','NEEDS_ATTENTION'));
ALTER TABLE checkin_submissions ADD COLUMN review_notes text NOT NULL DEFAULT '';
ALTER TABLE checkin_submissions ADD COLUMN reviewed_by uuid REFERENCES users(id);
ALTER TABLE checkin_submissions ADD COLUMN flags jsonb NOT NULL DEFAULT '[]';
CREATE TABLE checkin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES checkin_assignments(id),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkin_logs_assignment ON checkin_logs(assignment_id,created_at,id);
INSERT INTO checkin_logs(assignment_id,action,revision,snapshot)
SELECT assignment_id,'MIGRATED',revision,jsonb_build_object('status',status,'answers',COALESCE(submitted_snapshot,data)) FROM checkin_submissions;
