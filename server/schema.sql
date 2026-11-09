-- 사용자 등록 데이터베이스 (Cloudflare D1 · afterglow-users)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT NOT NULL,            -- PBKDF2-SHA256
  pw_salt TEXT NOT NULL,
  pw_iter INTEGER NOT NULL,
  active_character_id TEXT,         -- URIM과 대화하는 캐릭터
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,      -- 토큰 원문은 저장하지 않는다
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,               -- 캐릭터 정보 JSON (README 참고)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS characters_user ON characters(user_id);
CREATE TABLE IF NOT EXISTS attempts (
  key TEXT PRIMARY KEY,             -- 가입·로그인 시도 횟수 제한
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
