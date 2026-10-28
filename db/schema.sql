-- Section 35.4: Riptide Rising's board, runs and feedback, in Neon Postgres. Applied by `npm run db:migrate`; every
-- statement is idempotent, so it can run again at any time. Four tables, never joined to each other by a name:
--   runs         one row a Play Panjim run (reach and completion): no name, IP or device.
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS board (
  id uuid PRIMARY KEY,
  season text NOT NULL,
  name text NOT NULL,
  points integer NOT NULL,
  stars integer NOT NULL,
  edit_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_points ON board (points DESC);

CREATE TABLE IF NOT EXISTS feedback (
  -- One form a run.
  run_id uuid PRIMARY KEY,
  s1_before integer,
  s1_now integer,
  s2_feeling text,
  s2_why text,
  s3_change text,
  s4_enjoy integer,
  s5_actions text[],
  s6_remember text,
  s7_age text,
  s7_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash text NOT NULL,
  kind text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, kind, window_start)
);
