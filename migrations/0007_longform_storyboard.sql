-- Preserve the same canonical storyboard table; support multi-minute story narration.
-- 0..255 is a defensive storage ceiling, not a fixed scene count.
CREATE TABLE IF NOT EXISTS video_storyboard_longform_stage (
 post_id TEXT NOT NULL REFERENCES posts(id),
 scene_index INTEGER NOT NULL CHECK(scene_index BETWEEN 0 AND 255),
 media_key TEXT NOT NULL,
 beat TEXT NOT NULL,
 prompt TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(post_id,scene_index)
);
INSERT OR IGNORE INTO video_storyboard_longform_stage(post_id,scene_index,media_key,beat,prompt,created_at)
 SELECT post_id,scene_index,media_key,beat,prompt,created_at FROM video_storyboard;
DROP TABLE video_storyboard;
ALTER TABLE video_storyboard_longform_stage RENAME TO video_storyboard;
CREATE INDEX IF NOT EXISTS idx_video_storyboard_post ON video_storyboard(post_id);
