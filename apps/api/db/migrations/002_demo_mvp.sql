CREATE TYPE record_status AS ENUM ('DRAFT','SUBMITTED','REVIEWED');
CREATE TYPE program_status AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
CREATE TYPE workout_session_status AS ENUM ('IN_PROGRESS','COMPLETED','ABANDONED');
CREATE TYPE subscription_status AS ENUM ('PENDING','ACTIVE','PAUSED','CANCELLED','EXPIRED');
CREATE TYPE feedback_context AS ENUM ('GENERAL','WORKOUT','CHECKIN');

CREATE TABLE exercises (
  external_id text PRIMARY KEY CHECK (external_id ~ '^[0-9A-Za-z_-]+$'),
  name text NOT NULL, body_part text NOT NULL, equipment text NOT NULL, target text NOT NULL,
  secondary_muscles jsonb NOT NULL DEFAULT '[]', instructions jsonb NOT NULL DEFAULT '[]',
  gif_available boolean NOT NULL DEFAULT false, imported_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exercises_search_idx ON exercises (lower(name));
CREATE INDEX exercises_filters_idx ON exercises (body_part,equipment,target);

CREATE TABLE onboarding_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid NOT NULL REFERENCES users(id), client_id uuid NOT NULL REFERENCES users(id),
  status record_status NOT NULL DEFAULT 'DRAFT', data jsonb NOT NULL, submitted_snapshot jsonb,
  submitted_at timestamptz, reviewed_at timestamptz, reviewed_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(coach_id,client_id)
);
CREATE INDEX onboarding_coach_status_idx ON onboarding_submissions(coach_id,status);

CREATE TABLE workout_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid NOT NULL REFERENCES users(id), name text NOT NULL, description text NOT NULL DEFAULT '',
  archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workout_templates_coach_idx ON workout_templates(coach_id,archived_at);
CREATE TABLE workout_template_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  exercise_external_id text NOT NULL REFERENCES exercises(external_id), position integer NOT NULL CHECK(position>=0),
  sets integer NOT NULL CHECK(sets>0), repetitions integer CHECK(repetitions>=0), duration_seconds integer CHECK(duration_seconds>=0),
  rest_seconds integer NOT NULL DEFAULT 60 CHECK(rest_seconds>=0), target_rpe numeric(3,1) CHECK(target_rpe BETWEEN 0 AND 10), tempo text, notes text,
  UNIQUE(template_id,position)
);
CREATE TABLE programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid NOT NULL REFERENCES users(id), name text NOT NULL, description text NOT NULL DEFAULT '',
  status program_status NOT NULL DEFAULT 'DRAFT', published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX programs_coach_status_idx ON programs(coach_id,status);
CREATE TABLE program_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES workout_templates(id), position integer NOT NULL CHECK(position>=0), day_label text NOT NULL, UNIQUE(program_id,position)
);
CREATE TABLE program_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid NOT NULL REFERENCES users(id), client_id uuid NOT NULL REFERENCES users(id), program_id uuid NOT NULL REFERENCES programs(id),
  snapshot jsonb NOT NULL, assigned_at timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true
);
CREATE INDEX assignments_client_active_idx ON program_assignments(client_id,active,assigned_at DESC);
CREATE INDEX assignments_coach_client_idx ON program_assignments(coach_id,client_id);

CREATE TABLE workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL REFERENCES program_assignments(id), coach_id uuid NOT NULL REFERENCES users(id), client_id uuid NOT NULL REFERENCES users(id),
  day_position integer NOT NULL CHECK(day_position>=0), workout_snapshot jsonb NOT NULL, status workout_session_status NOT NULL DEFAULT 'IN_PROGRESS',
  set_logs jsonb NOT NULL DEFAULT '[]', notes text, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workout_sessions_client_idx ON workout_sessions(client_id,started_at DESC);
CREATE INDEX workout_sessions_coach_idx ON workout_sessions(coach_id,status,started_at DESC);

CREATE TABLE nutrition_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid NOT NULL REFERENCES users(id), client_id uuid NOT NULL REFERENCES users(id),
  daily_calories integer NOT NULL CHECK(daily_calories>=0), protein_grams integer NOT NULL CHECK(protein_grams>=0), carbohydrate_grams integer NOT NULL CHECK(carbohydrate_grams>=0), fat_grams integer NOT NULL CHECK(fat_grams>=0),
  meal_guidance text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', starts_on date NOT NULL, ends_on date, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_on IS NULL OR ends_on>=starts_on)
);
CREATE INDEX nutrition_plans_client_active_idx ON nutrition_plans(client_id,active,starts_on DESC);
CREATE TABLE nutrition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES users(id), log_date date NOT NULL,
  calories integer NOT NULL CHECK(calories>=0), protein_grams integer NOT NULL CHECK(protein_grams>=0), carbohydrate_grams integer NOT NULL CHECK(carbohydrate_grams>=0), fat_grams integer NOT NULL CHECK(fat_grams>=0), notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id,log_date)
);

CREATE TABLE progress_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES users(id), measurement_date date NOT NULL,
  body_weight numeric(7,2) CHECK(body_weight>=0), waist numeric(7,2) CHECK(waist>=0), chest numeric(7,2) CHECK(chest>=0), arm numeric(7,2) CHECK(arm>=0), notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id,measurement_date)
);
CREATE INDEX progress_client_date_idx ON progress_entries(client_id,measurement_date DESC);

CREATE TABLE checkin_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid NOT NULL REFERENCES users(id), client_id uuid NOT NULL REFERENCES users(id), due_date date NOT NULL, notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkin_assignments_client_due_idx ON checkin_assignments(client_id,due_date DESC);
CREATE TABLE checkin_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL UNIQUE REFERENCES checkin_assignments(id), coach_id uuid NOT NULL REFERENCES users(id), client_id uuid NOT NULL REFERENCES users(id),
  status record_status NOT NULL DEFAULT 'DRAFT', data jsonb NOT NULL, submitted_snapshot jsonb, submitted_at timestamptz, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkin_submissions_coach_status_idx ON checkin_submissions(coach_id,status);

CREATE TABLE feedback_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid NOT NULL REFERENCES users(id), client_id uuid NOT NULL REFERENCES users(id), author_user_id uuid NOT NULL REFERENCES users(id),
  context feedback_context NOT NULL, context_id uuid, message text NOT NULL CHECK(char_length(message) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_thread_idx ON feedback_messages(coach_id,client_id,context,context_id,created_at);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid NOT NULL REFERENCES users(id), client_id uuid NOT NULL REFERENCES users(id), plan_name text NOT NULL,
  status subscription_status NOT NULL, starts_on date NOT NULL, ends_or_renews_on date, amount numeric(12,2) CHECK(amount>=0), currency char(3), notes text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(coach_id,client_id)
);
CREATE INDEX subscriptions_client_idx ON subscriptions(client_id,status);
