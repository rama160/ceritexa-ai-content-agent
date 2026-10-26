-- Ceritexa v1.3.0. Additive, idempotent review metadata. Keep deployed posts intact.
-- Using one metadata table avoids altering the canonical posts schema and preserves older records.
CREATE TABLE IF NOT EXISTS draft_reviews (
 post_id TEXT PRIMARY KEY REFERENCES posts(id),
 parent_id TEXT REFERENCES posts(id),
 revision_depth INTEGER NOT NULL DEFAULT 0 CHECK(revision_depth BETWEEN 0 AND 3),
 rejection_reason TEXT,
 rejection_note TEXT,
 regen_state TEXT NOT NULL DEFAULT 'NONE'
   CHECK(regen_state IN ('NONE','GENERATING','FAILED','DONE','LIMIT_REACHED')),
 preview_media_key TEXT,
 last_error TEXT,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_draft_reviews_parent ON draft_reviews(parent_id);
-- Preserve thumbnails of existing IMAGE/VIDEO-artwork drafts. Do not expose any files publicly.
INSERT OR IGNORE INTO draft_reviews(post_id,preview_media_key)
SELECT id, CASE WHEN media_type IN ('image/jpeg','image/png') THEN media_key ELSE NULL END
FROM posts;
