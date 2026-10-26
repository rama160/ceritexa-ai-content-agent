-- v1.7.0 owner dashboard session. Only Ceritexa D1; additive; no existing draft changes.
-- Session secrets are NEVER stored in plaintext, only SHA-256 hashes.
CREATE TABLE IF NOT EXISTS admin_sessions (
 session_hash TEXT PRIMARY KEY NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS admin_login_limits (
 client_hash TEXT PRIMARY KEY NOT NULL,
 failed_attempts INTEGER NOT NULL DEFAULT 0,
 reset_at INTEGER NOT NULL,
 locked_until INTEGER NOT NULL DEFAULT 0
);
