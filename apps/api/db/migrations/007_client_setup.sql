ALTER TABLE client_invitations ADD COLUMN setup jsonb;
ALTER TABLE client_invitations ADD COLUMN setup_revision integer NOT NULL DEFAULT 1;
CREATE TABLE client_setup (
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  data jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id,client_id),
  FOREIGN KEY (coach_id,client_id) REFERENCES coach_clients(coach_id,client_id)
);
