-- Activity index schema (Cloudflare D1 / SQLite).
--
-- One table, because every published object has the same shape: a signed body
-- with an author. Splitting it per kind would duplicate the signature columns
-- and force a UNION for the one query that matters — the mixed feed.
--
-- `id` is the canonical digest of the body, so the primary key does replay
-- protection for free: publishing the same event twice is a collision, not a
-- duplicate row, which is what lets the client retry a failed publish blindly.
--
-- `body` is the canonical JSON the signature covers. It is stored verbatim and
-- never rewritten: re-serialising it would change the bytes and invalidate the
-- signature. The extracted columns beside it exist only for indexing.

CREATE TABLE IF NOT EXISTS events (
  id          TEXT    PRIMARY KEY,
  kind        TEXT    NOT NULL,
  launch      TEXT    NOT NULL,
  actor       TEXT    NOT NULL,
  body        TEXT    NOT NULL,
  signature   TEXT    NOT NULL,
  received_at INTEGER NOT NULL
);

-- The feed, newest first. `id` breaks ties so pagination is stable within a
-- second — D1 timestamps are coarse and bursts do land in the same second.
CREATE INDEX IF NOT EXISTS events_recent ON events (received_at DESC, id DESC);

-- One launch's feed, and the per-kind filters the Activity page offers.
CREATE INDEX IF NOT EXISTS events_launch ON events (launch, received_at DESC);
CREATE INDEX IF NOT EXISTS events_kind   ON events (kind, received_at DESC);

-- "What has this identity been doing" — the portfolio and profile views.
CREATE INDEX IF NOT EXISTS events_actor  ON events (actor, received_at DESC);
