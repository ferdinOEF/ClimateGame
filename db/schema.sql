-- Section 35.4: Riptide Rising's board, runs and feedback, in Neon Postgres. Applied by `npm run db:migrate`; every
-- statement is idempotent (CREATE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, DROP COLUMN IF EXISTS), so it can run
-- again at any time. Four tables, never joined to each other by a name:
--   runs         one row a Play Panjim run (reach and completion): no name, IP or device.
-- Section 38.4b: each of the three has a `tag` (null = a real player); a tagged row is a test session's, kept but
-- never shown on the board or counted in a rank. No tags table, no active flag: a tag is hidden by existing.
--   board        the one running board: a name, its points and stars, its season. No run id.
--   feedback     the form after the game, by run id. No name.
--   rate_limits  writes per salted IP hash per hour. The raw IP is never stored.

CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY,
  started_at timestamptz,
  ended_at timestamptz,
  finished boolean NOT NULL DEFAULT false,
  year_reached integer,
  minutes real,
  points integer,
  stars integer[],
  builds jsonb,
  nature_share real,
  biodiversity_end real,
  tutorial_first boolean,
  -- The server's own note that this run has put its one row on the board (never which row).
  on_board boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Section 38.4b: a test session's tag; null is a real player. A tagged row is never shown on the board.
  tag text
);

ALTER TABLE runs ADD COLUMN IF NOT EXISTS tag text;

CREATE TABLE IF NOT EXISTS board (
  id uuid PRIMARY KEY,
  season text NOT NULL,
  name text NOT NULL,
  points integer NOT NULL,
  stars integer NOT NULL,
  edit_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Section 38.4b: a test session's tag; null is a real player. The board and every rank read untagged rows only.
  tag text
);

ALTER TABLE board ADD COLUMN IF NOT EXISTS tag text;

CREATE INDEX IF NOT EXISTS board_points ON board (points DESC);

CREATE TABLE IF NOT EXISTS feedback (
  -- One form a run.
  run_id uuid PRIMARY KEY,
  -- Section 38.4: the four questions, 1 to 5 stars, null when unanswered.
  q1 integer,
  q2 integer,
  q3 integer,
  q4 integer,
  -- "One thing you'll remember", at most 140 characters.
  remember text,
  -- "u17", "18_30", "31_plus" or null.
  age_group text,
  -- The nudge (Section 38.3): "none", "shown_answered", "shown_left" or null.
  nudge text,
  -- Seconds from the card opening to Submit or to leaving.
  card_seconds real,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Section 38.4b: a test session's tag; null is a real player.
  tag text
);

-- Section 38.4: a feedback table made before Section 38 gets the new columns and loses the old questions (every row
-- then was test data). Each statement is idempotent, like the rest of this file.
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS q1 integer;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS q2 integer;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS q3 integer;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS q4 integer;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS remember text;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS age_group text;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS nudge text;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS card_seconds real;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE feedback DROP COLUMN IF EXISTS s1_before;
ALTER TABLE feedback DROP COLUMN IF EXISTS s1_now;
ALTER TABLE feedback DROP COLUMN IF EXISTS s2_feeling;
ALTER TABLE feedback DROP COLUMN IF EXISTS s2_why;
ALTER TABLE feedback DROP COLUMN IF EXISTS s3_change;
ALTER TABLE feedback DROP COLUMN IF EXISTS s4_enjoy;
ALTER TABLE feedback DROP COLUMN IF EXISTS s5_actions;
ALTER TABLE feedback DROP COLUMN IF EXISTS s6_remember;
ALTER TABLE feedback DROP COLUMN IF EXISTS s7_age;
ALTER TABLE feedback DROP COLUMN IF EXISTS s7_status;

CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash text NOT NULL,
  kind text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, kind, window_start)
);
