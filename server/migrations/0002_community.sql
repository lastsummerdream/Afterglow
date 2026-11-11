-- 커뮤니티 · 게임 기능 (2026-11) : 기존 afterglow-users D1에 한 번 실행
ALTER TABLE users ADD COLUMN last_seen INTEGER;
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
CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY, lines TEXT, home TEXT, game TEXT, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, rarity TEXT, kind TEXT, source TEXT, descr TEXT, slot TEXT, deco INTEGER DEFAULT 0, img TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS items_user ON items(user_id);
CREATE TABLE IF NOT EXISTS battles (user_id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER);
INSERT OR IGNORE INTO channels (id, name, created_by, created_at) VALUES ('square', '잔광 광장', NULL, 0), ('tb03', 'TB-03 주민 모임', NULL, 1), ('party', '전투 파티 모집', NULL, 2), ('chat', '잡담', NULL, 3);
