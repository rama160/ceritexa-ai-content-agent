CREATE TABLE IF NOT EXISTS trends(id TEXT PRIMARY KEY,topic TEXT NOT NULL,url TEXT NOT NULL,source TEXT NOT NULL,score INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,channel TEXT NOT NULL CHECK(channel IN ('facebook','panex','heros')),format TEXT NOT NULL,title TEXT NOT NULL,story TEXT NOT NULL,caption TEXT NOT NULL,topic TEXT NOT NULL,image_prompt TEXT NOT NULL,media_key TEXT,media_type TEXT,state TEXT NOT NULL,license_ok INTEGER NOT NULL DEFAULT 0,risk_note TEXT NOT NULL DEFAULT '',scheduled_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_posts_schedule ON posts(state,scheduled_at);
CREATE TABLE IF NOT EXISTS publications(post_id TEXT PRIMARY KEY,provider_id TEXT,provider_url TEXT,state TEXT NOT NULL,attempted_at TEXT NOT NULL,done_at TEXT,error TEXT);
CREATE TABLE IF NOT EXISTS metrics(post_id TEXT NOT NULL,metric TEXT NOT NULL,value REAL,observed_at TEXT NOT NULL,PRIMARY KEY(post_id,metric));
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,action TEXT NOT NULL,entity_id TEXT,detail TEXT,at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO settings(key,value) VALUES('paused','true');