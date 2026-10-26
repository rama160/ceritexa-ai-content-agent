-- v1.5.0: one canonical per-post storyboard. Additive, idempotent, no existing post deletion.
CREATE TABLE IF NOT EXISTS video_storyboard (
 post_id TEXT NOT NULL REFERENCES posts(id),
 scene_index INTEGER NOT NULL CHECK(scene_index BETWEEN 0 AND 3),
 media_key TEXT NOT NULL,
 beat TEXT NOT NULL,
 prompt TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(post_id, scene_index)
);
CREATE INDEX IF NOT EXISTS idx_video_storyboard_post ON video_storyboard(post_id);
