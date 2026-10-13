ALTER TABLE nutrition_library DROP CONSTRAINT nutrition_library_kind_check;
ALTER TABLE nutrition_library ADD CONSTRAINT nutrition_library_kind_check CHECK (kind IN ('foods','meals','days','plans','supplements'));

CREATE TABLE supplement_plan_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  plan_kind text NOT NULL DEFAULT 'supplements' CHECK (plan_kind = 'supplements'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (coach_id, client_id) REFERENCES coach_clients(coach_id, client_id),
  FOREIGN KEY (plan_id, coach_id, plan_kind) REFERENCES nutrition_library(id, coach_id, kind)
);
CREATE UNIQUE INDEX supplement_assignment_active ON supplement_plan_assignments(client_id) WHERE active;
CREATE INDEX supplement_assignment_coach ON supplement_plan_assignments(coach_id, assigned_at DESC);
