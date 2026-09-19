-- 日记向量表（用于知识库问答 RAG）
-- vector 列存 JSON 数组（1024 维 float），避开 D1 BLOB ArrayBuffer 对齐问题
CREATE TABLE IF NOT EXISTS diary_embeddings (
  diary_id  TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  content   TEXT NOT NULL,
  vector    TEXT NOT NULL,
  FOREIGN KEY (diary_id) REFERENCES diaries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_embeddings_user ON diary_embeddings(user_id);
