CREATE TABLE feed_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES users(id),
  author_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (char_length(body) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feed_posts_timeline_idx ON feed_posts(coach_id, created_at DESC, id DESC);

-- Private, bounded demo storage. Bytes are served only after live tenant authorization.
CREATE TABLE feed_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 180),
  media_type text NOT NULL CHECK (media_type IN ('image/jpeg', 'application/octet-stream')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 10485760)
);
CREATE INDEX feed_attachments_post_idx ON feed_attachments(post_id);
CREATE TABLE feed_likes (
  post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY(post_id, user_id)
);
CREATE TABLE feed_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feed_comments_post_idx ON feed_comments(post_id, created_at, id);
