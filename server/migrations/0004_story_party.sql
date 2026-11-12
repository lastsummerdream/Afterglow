-- 스토리 진행 · 파티 전투 (2026-11) : 기존 afterglow-users D1에 한 번 실행
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
