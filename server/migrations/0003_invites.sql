-- 초대 코드 (2026-11) : 기존 afterglow-users D1에 한 번 실행
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
