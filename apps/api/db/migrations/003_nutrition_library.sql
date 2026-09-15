-- Reusable, immutable nutrition templates. Compositions store server-resolved
-- child snapshots so saved meals, days and plans remain stable.
CREATE TABLE nutrition_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES coach_profiles(user_id),
  kind text NOT NULL CHECK (kind IN ('foods','meals','days','plans')),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, coach_id, kind)
);
CREATE INDEX nutrition_library_coach_kind ON nutrition_library(coach_id, kind, created_at DESC);

CREATE TABLE nutrition_plan_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  plan_kind text NOT NULL DEFAULT 'plans' CHECK (plan_kind = 'plans'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (coach_id, client_id) REFERENCES coach_clients(coach_id, client_id),
  FOREIGN KEY (plan_id, coach_id, plan_kind) REFERENCES nutrition_library(id, coach_id, kind)
);
CREATE UNIQUE INDEX nutrition_assignment_active ON nutrition_plan_assignments(client_id) WHERE active;
CREATE INDEX nutrition_assignment_coach ON nutrition_plan_assignments(coach_id, assigned_at DESC);
