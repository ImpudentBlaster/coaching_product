CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM ('PLATFORM_ADMIN', 'COACH', 'CLIENT');
CREATE TYPE approval_status AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  account_status approval_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coach_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 100),
  business_name text NOT NULL CHECK (char_length(business_name) BETWEEN 2 AND 120),
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  email citext NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coach_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status approval_status NOT NULL DEFAULT 'PENDING_REVIEW',
  rejection_reason text,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, client_id)
);

CREATE TABLE approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  previous_status approval_status NOT NULL,
  new_status approval_status NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_role_status_idx ON users(role, account_status);
CREATE INDEX client_invitations_coach_created_idx ON client_invitations(coach_id, created_at DESC);
CREATE INDEX coach_clients_coach_status_idx ON coach_clients(coach_id, status);
CREATE UNIQUE INDEX coach_clients_one_active_coach_per_client_idx ON coach_clients(client_id) WHERE status IN ('PENDING_REVIEW', 'APPROVED');
CREATE INDEX approval_decisions_subject_created_idx ON approval_decisions(subject_user_id, created_at DESC);
CREATE INDEX audit_events_entity_created_idx ON audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX refresh_sessions_user_idx ON refresh_sessions(user_id, expires_at DESC);
CREATE INDEX refresh_sessions_family_idx ON refresh_sessions(family_id);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens(user_id, expires_at DESC);
