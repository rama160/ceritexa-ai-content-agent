-- Scope new research by channel and audience without deleting historical generic trends.
ALTER TABLE trends ADD COLUMN channel TEXT NOT NULL DEFAULT 'unscoped';
ALTER TABLE trends ADD COLUMN region TEXT NOT NULL DEFAULT 'ID';
CREATE INDEX IF NOT EXISTS idx_trends_channel_created ON trends(channel,created_at);
