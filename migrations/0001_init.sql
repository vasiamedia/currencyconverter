-- Initial schema for currency rate storage
-- This table stores historical exchange rates fetched by the cron worker

CREATE TABLE IF NOT EXISTS rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  rate REAL NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

-- Index for fast lookups by base currency and time
CREATE INDEX IF NOT EXISTS idx_rates_base_time 
  ON rates(base, fetched_at DESC);

-- Index for fast lookups by currency pair and time
CREATE INDEX IF NOT EXISTS idx_rates_pair_time 
  ON rates(base, quote, fetched_at DESC);

-- Index for cleanup queries (removing old data)
CREATE INDEX IF NOT EXISTS idx_rates_fetched 
  ON rates(fetched_at DESC);

