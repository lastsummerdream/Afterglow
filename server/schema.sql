-- 사용자 등록 데이터베이스 (Cloudflare D1 · afterglow-users)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT NOT NULL,            -- PBKDF2-SHA256
  pw_salt TEXT NOT NULL,
  pw_iter INTEGER NOT NULL,
  active_character_id TEXT,         -- URIM과 대화하는 캐릭터
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  last_seen INTEGER                 -- 마지막 요청 시각 (접속 중 표시)
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
  avatar TEXT,                      -- 프로필 사진 data URL (정사각형 320px, webp 또는 jpeg)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS characters_user ON characters(user_id);
CREATE TABLE IF NOT EXISTS attempts (
  key TEXT PRIMARY KEY,             -- 가입·로그인 시도 횟수 제한
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

-- 커뮤니티 · 게임
CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,              -- ch(단체 단말) · talk(1:1) · dm(개인 단말)
  room TEXT NOT NULL,               -- 채널 id · 대화 id · 두 사용자 id를 정렬해 ':'로 이은 값
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  deleted_at INTEGER                -- 단체 단말만: 지우면 내용은 비우고 URIM 안내로 보인다
);
CREATE INDEX IF NOT EXISTS messages_room ON messages(scope, room, created_at);
CREATE INDEX IF NOT EXISTS messages_user ON messages(user_id);
CREATE TABLE IF NOT EXISTS talks (id TEXT PRIMARY KEY, a_user TEXT NOT NULL, b_user TEXT NOT NULL, title TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS talks_a ON talks(a_user);
CREATE INDEX IF NOT EXISTS talks_b ON talks(b_user);
CREATE TABLE IF NOT EXISTS dm_reads (user_id TEXT NOT NULL, partner_id TEXT NOT NULL, read_at INTEGER NOT NULL, PRIMARY KEY (user_id, partner_id));
CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL, edited_at INTEGER);
CREATE INDEX IF NOT EXISTS posts_time ON posts(created_at);
CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, parent_id TEXT, user_id TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL, edited_at INTEGER);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, created_at);
CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY, lines TEXT, home TEXT, game TEXT, illust TEXT, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, rarity TEXT, kind TEXT, source TEXT, descr TEXT, slot TEXT, deco INTEGER DEFAULT 0, img TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS items_user ON items(user_id);
CREATE TABLE IF NOT EXISTS battles (user_id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER);
INSERT OR IGNORE INTO channels (id, name, created_by, created_at) VALUES ('square', '잔광 광장', NULL, 0), ('tb03', 'TB-03 주민 모임', NULL, 1), ('party', '전투 파티 모집', NULL, 2), ('chat', '잡담', NULL, 3);

-- 초대 코드
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,            -- 대문자로 저장 (예: AG-7K2Q-9WXM)
  note TEXT,                        -- 누구에게 줬는지 메모
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_used_by TEXT,
  last_used_at INTEGER
);
-- 코드 만들기 예시 (한 번 쓰면 끝):
-- INSERT INTO invites (code, note, max_uses, created_at) VALUES ('AG-XXXX-XXXX', '누구에게', 1, strftime('%s','now') * 1000);

-- 스토리 진행 · 파티 전투 (2026-11)
CREATE TABLE IF NOT EXISTS story_runs (
  id TEXT PRIMARY KEY,              -- "<user id 또는 group>:<story id>"
  story_id TEXT NOT NULL,
  owner TEXT NOT NULL,              -- user id (개인) 또는 'group' (단체)
  state TEXT NOT NULL,              -- JSON: 진행 기록 · 선택지 · 전투 대기
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  story_id TEXT,
  state TEXT NOT NULL,              -- JSON: 참여자 · 적 · 기록
  status TEXT NOT NULL,             -- lobby | battle | over
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_parties_open ON parties(status, updated_at);
