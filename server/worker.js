// URIM 서버 (Cloudflare Worker)
// ---------------------------------------------------------------
// 1) URIM ↔ Claude API 중계: API 키를 브라우저에 노출하지 않는다.
// 2) 사용자 등록: 아이디·비밀번호 가입, 로그인, 자작 캐릭터 저장.
//
// 설정 (Cloudflare 대시보드 > Workers > 이 워커 > Settings > Variables and Secrets)
//   ANTHROPIC_API_KEY : Claude API 키 (Secret)
//   ALLOWED_ORIGIN    : 사이트 주소. 여러 개면 쉼표로 구분. 끝에 / 없이.
//   DB                : D1 데이터베이스 바인딩 (afterglow-users)
//   NOTION_TOKEN      : (선택) 노션 내부 통합 토큰 (Secret). 있으면 가입·로그인·캐릭터 변경을
//                       노션 '사용자 명부' 데이터베이스에 바로 반영한다.
//   NOTION_DB         : (선택) 노션 데이터베이스 ID. 없으면 아래 NOTION_DB_DEFAULT를 쓴다.
//   INVITE_REQUIRED   : (선택) "1"이면 초대 코드 없이 가입할 수 없다.
//
// 경로
//   POST   /                    Claude 메시지 중계 (스트리밍)
//   POST   /auth/signup         { username, password, invite? } → { token, user }  (초대 코드는 invites 표)
//   POST   /auth/login          { username, password } → { token, user }
//   POST   /auth/logout         (로그인 필요)
//   GET    /me                  → { user, characters }
//   PUT    /me/active           { id } 대표 캐릭터 지정
//   POST   /me/password         { password, newPassword }
//   DELETE /me                  { password } 계정 삭제
//   POST   /characters          { data, avatar? } → { character }
//   PUT    /characters/:id      { data, avatar? } → { character }  (avatar: data URL, null이면 삭제, 생략하면 그대로)
//   DELETE /characters/:id
//
// 커뮤니티 · 게임 (아래 community 함수, 모두 로그인 필요. 자세한 형식은 README)
//   GET /users · GET/POST /channels · GET/POST /channels/:id/messages · PUT/DELETE /messages/:id
//   GET/POST /talks · PUT/DELETE /talks/:id · GET/POST /talks/:id/messages
//   GET /dms · GET/POST /dms/:userId/messages · POST /dms/:userId/read
//   GET/POST /posts · PUT/DELETE /posts/:id · GET/POST /posts/:id/comments · PUT/DELETE /comments/:id
//   PUT /me/lines · GET/PUT /home · GET /stats · GET /inventory · POST /inventory/:id/equip|place · DELETE /inventory/:id
//   GET /battle · POST /battle/start · POST /battle/turn (Claude 판정, 키가 없으면 스탯 굴림)
//
// 캐릭터 정보(data)의 형식은 아래 CHARACTER_SCHEMA를 따른다. 나중에 롤플레잉·전투
// 사이트를 만들 때도 같은 형식을 쓰면 되고, 형식을 바꾸면 SCHEMA_VERSION을 올린다.

const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"];
const MAX_TOKENS = 4000;
const MAX_MESSAGES = 16;

const SCHEMA_VERSION = 1;
const MAX_CHARACTERS = 1;
const SESSION_DAYS = 30;
const PBKDF2_ITER = 100000;
const NOTION_DB_DEFAULT = "fb51cf4bbbc6443ab458d84860ccd723";
const AVATAR_MAX = 200000; // 프로필 사진 data URL 최대 길이 (정사각형, 약 150KB)

const ORIGINS = ["TB-01","TB-02","TB-03","TB-04","TB-05","TB-06","TB-07","TB-08","TB-09","TB-10","TB-11","TB-12","OPH","SEIR","NOD"];
const SPECIES = ["human","later","mixed","uc"];
const ECHO = ["없음","방출형","조형형","강화형","간섭형","감응형"];
// 공격 스타일: 앞으로 만들 전투 사이트에서 그대로 쓴다
const STYLES = ["근접","사격","투척","의체","잔향","기계","지원"];

// 글자 수 상한
const CHARACTER_SCHEMA = {
  name: 30, nameEn: 40, age: 20, gender: 20,
  origin: "enum", originDetail: 40,
  species: "enum", lineage: 30,
  G: "int", C: "int", T: "int",
  echoType: "enum", echoAbility: 120,
  job: 40, faction: 40,
  appearance: 1200, personality: 1200, background: 2400, secret: 600, notes: 1200,
  attackStyle: "enum", attackStyle2: "enum",
  attackNormalName: 40, attackNormal: 600,
  attackSpecialName: 40, attackSpecial: 800,
  attackUltimateName: 40, attackUltimate: 1000,
};

export default {
  async fetch(request, env, ctx) {
    const later = p => { if (ctx && ctx.waitUntil) ctx.waitUntil(p); };
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedList = String(env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
    const ok = allowedList.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": ok ? origin : (allowedList[0] || ""),
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (!ok) return new Response("forbidden", { status: 403, headers: cors });

    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/" && request.method === "POST") return await claude(request, env, cors);
      if (!env.DB) return json({ error: "server_not_ready" }, 503, cors);
      if (path === "/auth/signup" && request.method === "POST") return await signup(request, env, cors, later);
      if (path === "/auth/login" && request.method === "POST") return await login(request, env, cors, later);

      const user = await authUser(request, env);
      if (!user) return json({ error: "unauthorized" }, 401, cors);

      if (path === "/auth/logout" && request.method === "POST") {
        await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(user._tokenHash).run();
        return json({ ok: true }, 200, cors);
      }
      if (path === "/me" && request.method === "GET") return json(await mePayload(env, user), 200, cors);
      if (path === "/me/active" && request.method === "PUT") {
        const b = await body(request);
        const id = b && typeof b.id === "string" ? b.id : null;
        if (id) {
          const c = await env.DB.prepare("SELECT id FROM characters WHERE id = ? AND user_id = ?").bind(id, user.id).first();
          if (!c) return json({ error: "not_found" }, 404, cors);
        }
        await env.DB.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").bind(id, user.id).run();
        return json(await mePayload(env, { ...user, active_character_id: id }), 200, cors);
      }
      if (path === "/me/password" && request.method === "POST") {
        const b = await body(request);
        if (!b || !(await checkPassword(b.password, user))) return json({ error: "wrong_password" }, 400, cors);
        const err = passwordProblem(b.newPassword);
        if (err) return json({ error: err }, 400, cors);
        const h = await hashPassword(b.newPassword);
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET pw_hash = ?, pw_salt = ?, pw_iter = ? WHERE id = ?").bind(h.hash, h.salt, h.iter, user.id),
          env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, user._tokenHash),
        ]);
        return json({ ok: true }, 200, cors);
      }
      if (path === "/me" && request.method === "DELETE") {
        const b = await body(request);
        if (!b || !(await checkPassword(b.password, user))) return json({ error: "wrong_password" }, 400, cors);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM characters WHERE user_id = ?").bind(user.id),
          env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
          env.DB.prepare("UPDATE messages SET text = '', deleted_at = ? WHERE user_id = ? AND scope = 'ch'").bind(Date.now(), user.id),
          env.DB.prepare("DELETE FROM messages WHERE user_id = ? AND scope != 'ch'").bind(user.id),
          env.DB.prepare("DELETE FROM messages WHERE scope = 'talk' AND room IN (SELECT id FROM talks WHERE a_user = ? OR b_user = ?)").bind(user.id, user.id),
          env.DB.prepare("DELETE FROM talks WHERE a_user = ? OR b_user = ?").bind(user.id, user.id),
          env.DB.prepare("DELETE FROM comments WHERE user_id = ? OR post_id IN (SELECT id FROM posts WHERE user_id = ?)").bind(user.id, user.id),
          env.DB.prepare("DELETE FROM posts WHERE user_id = ?").bind(user.id),
          env.DB.prepare("DELETE FROM items WHERE user_id = ?").bind(user.id),
          env.DB.prepare("DELETE FROM profiles WHERE user_id = ?").bind(user.id),
          env.DB.prepare("DELETE FROM battles WHERE user_id = ?").bind(user.id),
          env.DB.prepare("DELETE FROM dm_reads WHERE user_id = ? OR partner_id = ?").bind(user.id, user.id),
          env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
        ]);
        later(syncNotion(env, user.id, true));
        return json({ ok: true }, 200, cors);
      }
      if (path === "/characters" && request.method === "POST") {
        const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM characters WHERE user_id = ?").bind(user.id).first();
        if (n && n.n >= MAX_CHARACTERS) return json({ error: "too_many_characters", max: MAX_CHARACTERS }, 400, cors);
        const b = await body(request);
        const v = validateCharacter(b && b.data);
        if (v.error) return json({ error: "invalid_character", field: v.field, reason: v.error }, 400, cors);
        const avatar = parseAvatar(b.avatar);
        if (avatar === false) return json({ error: "bad_avatar" }, 400, cors);
        const id = randomId();
        const now = Date.now();
        await env.DB.prepare("INSERT INTO characters (id, user_id, name, schema_version, data, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(id, user.id, v.data.name, SCHEMA_VERSION, JSON.stringify(v.data), avatar || null, now, now).run();
        if (!user.active_character_id) await env.DB.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").bind(id, user.id).run();
        later(syncNotion(env, user.id));
        return json(await mePayload(env, { ...user, active_character_id: user.active_character_id || id }, id), 200, cors);
      }
      const m = path.match(/^\/characters\/([A-Za-z0-9_-]{8,40})$/);
      if (m && request.method === "PUT") {
        const b = await body(request);
        const v = validateCharacter(b && b.data);
        if (v.error) return json({ error: "invalid_character", field: v.field, reason: v.error }, 400, cors);
        let r;
        if (b.avatar === undefined) {
          r = await env.DB.prepare("UPDATE characters SET name = ?, schema_version = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ?")
            .bind(v.data.name, SCHEMA_VERSION, JSON.stringify(v.data), Date.now(), m[1], user.id).run();
        } else {
          const avatar = parseAvatar(b.avatar);
          if (avatar === false) return json({ error: "bad_avatar" }, 400, cors);
          r = await env.DB.prepare("UPDATE characters SET name = ?, schema_version = ?, data = ?, avatar = ?, updated_at = ? WHERE id = ? AND user_id = ?")
            .bind(v.data.name, SCHEMA_VERSION, JSON.stringify(v.data), avatar, Date.now(), m[1], user.id).run();
        }
        if (!r.meta || !r.meta.changes) return json({ error: "not_found" }, 404, cors);
        later(syncNotion(env, user.id));
        return json(await mePayload(env, user, m[1]), 200, cors);
      }
      if (m && request.method === "DELETE") {
        const r = await env.DB.prepare("DELETE FROM characters WHERE id = ? AND user_id = ?").bind(m[1], user.id).run();
        if (!r.meta || !r.meta.changes) return json({ error: "not_found" }, 404, cors);
        let active = user.active_character_id;
        if (active === m[1]) {
          const next = await env.DB.prepare("SELECT id FROM characters WHERE user_id = ? ORDER BY created_at LIMIT 1").bind(user.id).first();
          active = next ? next.id : null;
          await env.DB.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").bind(active, user.id).run();
        }
        later(syncNotion(env, user.id));
        return json(await mePayload(env, { ...user, active_character_id: active }), 200, cors);
      }
      const cm = await community(request, env, user, path, cors, later);
      if (cm) return cm;
      return json({ error: "not_found" }, 404, cors);
    } catch (e) {
      return json({ error: "server_error" }, 500, cors);
    }
  },
};

/* ---------------- Claude 중계 ---------------- */
async function claude(request, env, cors) {
  let b;
  try { b = await request.json(); } catch { return new Response("bad request", { status: 400, headers: cors }); }
  const payload = {
    model: MODELS.includes(b.model) ? b.model : MODELS[0],
    max_tokens: Math.min(Number(b.max_tokens) || 4000, MAX_TOKENS),
    stream: true,
    messages: Array.isArray(b.messages) ? b.messages.slice(-MAX_MESSAGES) : [],
  };
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(payload),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...cors, "content-type": upstream.headers.get("content-type") || "text/event-stream" },
  });
}

/* ---------------- 가입 · 로그인 ---------------- */
async function signup(request, env, cors, later) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await allowAttempt(env, "signup:" + ip, 5, 60 * 60 * 1000))) return json({ error: "rate_limited" }, 429, cors);
  const b = await body(request);
  const username = b && typeof b.username === "string" ? b.username.trim() : "";
  if (!/^[A-Za-z0-9_]{4,20}$/.test(username)) return json({ error: "bad_username" }, 400, cors);
  const err = passwordProblem(b.password);
  if (err) return json({ error: err }, 400, cors);
  // 초대 코드: 새 사이트는 늘 보낸다. INVITE_REQUIRED=1 이면 코드 없이는 가입할 수 없다 (기존 터미널 가입도 막힘)
  const invite = typeof b.invite === "string" ? b.invite.trim().toUpperCase() : "";
  if (!invite && env.INVITE_REQUIRED === "1") return json({ error: "invite_required" }, 400, cors);
  if (invite) {
    const inv = await env.DB.prepare("SELECT code, uses, max_uses FROM invites WHERE code = ?").bind(invite).first().catch(() => null);
    if (!inv || inv.uses >= inv.max_uses) return json({ error: "bad_invite" }, 400, cors);
  }
  const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (exists) return json({ error: "username_taken" }, 409, cors);
  const h = await hashPassword(b.password);
  const id = randomId();
  const now = Date.now();
  try {
    await env.DB.prepare("INSERT INTO users (id, username, pw_hash, pw_salt, pw_iter, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, username, h.hash, h.salt, h.iter, now, now).run();
  } catch {
    return json({ error: "username_taken" }, 409, cors);
  }
  if (invite) await env.DB.prepare("UPDATE invites SET uses = uses + 1, last_used_by = ?, last_used_at = ? WHERE code = ?").bind(id, now, invite).run();
  const token = await newSession(env, id);
  if (later) later(syncNotion(env, id));
  return json({ token, ...(await mePayload(env, { id, username, active_character_id: null, created_at: now })) }, 200, cors);
}

async function login(request, env, cors, later) {
  const b = await body(request);
  const username = b && typeof b.username === "string" ? b.username.trim() : "";
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await allowAttempt(env, "login:" + username.toLowerCase(), 10, 15 * 60 * 1000)) ||
      !(await allowAttempt(env, "loginip:" + ip, 30, 15 * 60 * 1000))) {
    return json({ error: "rate_limited" }, 429, cors);
  }
  const user = username ? await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first() : null;
  if (!user || !(await checkPassword(b.password, user))) return json({ error: "wrong_login" }, 400, cors);
  await env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(Date.now(), user.id).run();
  const token = await newSession(env, user.id);
  if (later) later(syncNotion(env, user.id));
  return json({ token, ...(await mePayload(env, user)) }, 200, cors);
}

async function authUser(request, env) {
  const m = (request.headers.get("Authorization") || "").match(/^Bearer ([A-Za-z0-9_-]{20,100})$/);
  if (!m) return null;
  const th = await sha256(m[1]);
  const row = await env.DB.prepare("SELECT u.*, s.expires_at AS s_exp FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?").bind(th).first();
  if (!row) return null;
  if (row.s_exp < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(th).run();
    return null;
  }
  row._tokenHash = th;
  return row;
}

async function newSession(env, userId) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(userId, now),
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256(token), userId, now, now + SESSION_DAYS * 864e5),
  ]);
  return token;
}

async function mePayload(env, user, touchedId) {
  const rows = await env.DB.prepare("SELECT id, name, schema_version, data, avatar, created_at, updated_at FROM characters WHERE user_id = ? ORDER BY created_at").bind(user.id).all();
  const characters = (rows.results || []).map(r => ({
    id: r.id, name: r.name, schemaVersion: r.schema_version, createdAt: r.created_at, updatedAt: r.updated_at,
    data: safeParse(r.data),
    avatar: r.avatar || null,
  }));
  const out = {
    user: { id: user.id, username: user.username, activeCharacterId: user.active_character_id || null, createdAt: user.created_at },
    characters,
    limits: { maxCharacters: MAX_CHARACTERS, schemaVersion: SCHEMA_VERSION },
  };
  try { const pr = await env.DB.prepare("SELECT lines FROM profiles WHERE user_id = ?").bind(user.id).first(); out.profile = { lines: pr ? safeParse(pr.lines || "[]") : [] }; } catch { out.profile = { lines: [] }; }
  if (touchedId) out.savedId = touchedId;
  return out;
}

/* ---------------- 캐릭터 검사 ---------------- */
function validateCharacter(d) {
  if (!d || typeof d !== "object") return { error: "missing", field: "data" };
  const out = {};
  for (const [k, rule] of Object.entries(CHARACTER_SCHEMA)) {
    const v = d[k];
    if (typeof rule === "number") {
      if (v == null || v === "") { out[k] = ""; continue; }
      if (typeof v !== "string") return { error: "type", field: k };
      const s = v.replace(/\r\n/g, "\n").trim();
      if (s.length > rule) return { error: "too_long", field: k };
      out[k] = s;
    } else if (rule === "int") {
      out[k] = v == null || v === "" ? null : Number(v);
      if (out[k] != null && !Number.isInteger(out[k])) return { error: "type", field: k };
    } else {
      out[k] = v == null ? "" : String(v);
    }
  }
  if (!out.name) return { error: "required", field: "name" };
  if (!ORIGINS.includes(out.origin)) return { error: "required", field: "origin" };
  if (!SPECIES.includes(out.species)) return { error: "required", field: "species" };
  if (!ECHO.includes(out.echoType || "없음")) return { error: "enum", field: "echoType" };
  out.echoType = out.echoType || "없음";
  if (out.species === "uc") {
    // 언섹션은 자산으로 등록되고 결정화되지 않는다
    out.G = null; out.C = null; out.T = null; out.echoType = "없음"; out.echoAbility = "";
  } else {
    if (out.G == null) return { error: "required", field: "G" };
    if (out.C == null) return { error: "required", field: "C" };
    if (out.T == null) return { error: "required", field: "T" };
    const gMin = out.species === "human" ? 4 : 1, gMax = out.species === "human" ? 5 : 3;
    if (out.G < gMin || out.G > gMax) return { error: "range", field: "G" };
    if (out.C < 1 || out.C > 5) return { error: "range", field: "C" };
    if (out.T < 0 || out.T > 4) return { error: "range", field: "T" };
    if (out.T === 0) { out.echoType = "없음"; out.echoAbility = ""; }
    else if (out.echoType === "없음") out.echoAbility = "";
  }
  if (out.species === "later" && !out.lineage) return { error: "required", field: "lineage" };
  if (out.attackStyle && !STYLES.includes(out.attackStyle)) return { error: "enum", field: "attackStyle" };
  if (out.attackStyle2 && !STYLES.includes(out.attackStyle2)) return { error: "enum", field: "attackStyle2" };
  if (!out.attackStyle) out.attackStyle2 = "";
  if (out.attackStyle2 === out.attackStyle) out.attackStyle2 = "";
  // 잔향이 없으면 잔향 공격 스타일을 고를 수 없다
  if (out.echoType === "없음" && (out.attackStyle === "잔향" || out.attackStyle2 === "잔향")) return { error: "no_echo", field: out.attackStyle === "잔향" ? "attackStyle" : "attackStyle2" };
  return { data: out };
}

/* ---------------- 프로필 사진 ---------------- */
// null이면 지우고, 정사각형으로 잘라 줄인 이미지의 data URL이면 저장한다. 그 밖의 값은 false.
function parseAvatar(a) {
  if (a === null || a === undefined || a === "") return null;
  if (typeof a !== "string" || a.length > AVATAR_MAX) return false;
  if (!/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+\/]+={0,2}$/.test(a)) return false;
  return a;
}

/* ---------------- 노션 사용자 명부 ---------------- */
// NOTION_TOKEN이 있을 때만 동작한다. 실패해도 사이트 응답에는 영향을 주지 않는다.
const ORIGIN_LABEL = { "TB-01": "TB-01 알비온", "TB-02": "TB-02 뤼미에르", "TB-03": "TB-03 베르크프리트", "TB-04": "TB-04 로타", "TB-05": "TB-05 옌두", "TB-06": "TB-06 다웅안", "TB-07": "TB-07 띠엔퐁", "TB-08": "TB-08 우에르타", "TB-09": "TB-09 하늘", "TB-10": "TB-10 헬릭스", "TB-11": "TB-11 자리야", "TB-12": "TB-12 타보트", OPH: "오파님 성좌", SEIR: "세일 고원 연맹", NOD: "노드 자유구역" };
const SPECIES_LABEL = { human: "순수 인간", later: "레이터", mixed: "혼혈", uc: "언섹션" };
async function notion(env, method, path, body) {
  const r = await fetch("https://api.notion.com/v1" + path, {
    method,
    headers: { "Authorization": "Bearer " + env.NOTION_TOKEN, "Notion-Version": "2022-06-28", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error("notion " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}
function nText(s) {
  s = s == null ? "" : String(s);
  const out = [];
  for (let i = 0; i < s.length && out.length < 50; i += 1900) out.push({ type: "text", text: { content: s.slice(i, i + 1900) } });
  return { rich_text: out };
}
function atk(name, desc) { name = name || ""; desc = desc || ""; return name && desc ? "「" + name + "」 " + desc : name ? "「" + name + "」" : desc; }
function nSelect(v) { return { select: v ? { name: v } : null }; }
function nDate(ms) { return { date: ms ? { start: new Date(ms).toISOString() } : null }; }
function nNum(v) { return { number: v == null || v === "" || isNaN(v) ? null : Number(v) }; }
async function syncNotion(env, userId, gone) {
  if (!env.NOTION_TOKEN) return;
  const dbId = env.NOTION_DB || NOTION_DB_DEFAULT;
  try {
    let props;
    if (gone) {
      props = { "상태": nSelect("탈퇴"), "정보 수정": nDate(Date.now()) };
    } else {
      const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
      if (!u) return;
      const c = await env.DB.prepare("SELECT data, avatar, updated_at FROM characters WHERE user_id = ? ORDER BY created_at LIMIT 1").bind(userId).first();
      const d = c ? safeParse(c.data) : {};
      const hasM = d.G != null && d.C != null && d.T != null;
      props = {
        "아이디": { title: [{ type: "text", text: { content: u.username } }] },
        "계정 ID": nText(u.id),
        "상태": nSelect("활성"),
        "가입": nDate(u.created_at),
        "마지막 로그인": nDate(u.last_login_at),
        "정보 수정": nDate(c ? c.updated_at : u.created_at),
        "캐릭터": nText(d.name), "영문 이름": nText(d.nameEn), "나이": nText(d.age), "성별": nText(d.gender),
        "출신": nSelect(ORIGIN_LABEL[d.origin] || null), "출신 세부": nText(d.originDetail),
        "종족": nSelect(SPECIES_LABEL[d.species] || null), "혈통": nText(d.lineage),
        "G": nNum(d.G), "C": nNum(d.C), "T": nNum(d.T), "명부 점수": nNum(hasM ? d.G + d.C - d.T : null),
        "잔향": nSelect(c ? (d.echoType || "없음") : null), "잔향 능력": nText(d.echoAbility),
        "직업": nText(d.job), "소속": nText(d.faction),
        "사진": { checkbox: !!(c && c.avatar) },
        "외형": nText(d.appearance), "성격": nText(d.personality), "배경": nText(d.background), "비밀": nText(d.secret), "메모": nText(d.notes),
        "공격 스타일": nSelect(d.attackStyle || null), "보조 스타일": nSelect(d.attackStyle2 || null),
        "일반 공격": nText(atk(d.attackNormalName, d.attackNormal)), "특수 공격": nText(atk(d.attackSpecialName, d.attackSpecial)), "필살기": nText(atk(d.attackUltimateName, d.attackUltimate)),
      };
    }
    const q = await notion(env, "POST", "/databases/" + dbId + "/query", { filter: { property: "계정 ID", rich_text: { equals: userId } }, page_size: 1 });
    const page = q.results && q.results[0];
    if (page) await notion(env, "PATCH", "/pages/" + page.id, { properties: props });
    else if (!gone) await notion(env, "POST", "/pages", { parent: { database_id: dbId }, properties: props });
  } catch (e) {
    console.log("notion sync failed", String(e));
  }
}

/* ---------------- 비밀번호 ---------------- */
function passwordProblem(p) {
  if (typeof p !== "string" || p.length < 8) return "short_password";
  if (p.length > 72) return "long_password";
  return null;
}
async function hashPassword(password, saltB64, iter) {
  const salt = saltB64 ? unb64url(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  iter = iter || PBKDF2_ITER;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
  return { hash: b64url(new Uint8Array(bits)), salt: b64url(salt), iter };
}
async function checkPassword(password, user) {
  if (typeof password !== "string" || !user) return false;
  const h = await hashPassword(password, user.pw_salt, user.pw_iter);
  const a = new TextEncoder().encode(h.hash), b = new TextEncoder().encode(user.pw_hash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ---------------- 시도 횟수 제한 ---------------- */
async function allowAttempt(env, key, max, windowMs) {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT count, window_start FROM attempts WHERE key = ?").bind(key).first();
  if (!row || now - row.window_start > windowMs) {
    await env.DB.prepare("INSERT INTO attempts (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start").bind(key, now).run();
    return true;
  }
  if (row.count >= max) return false;
  await env.DB.prepare("UPDATE attempts SET count = count + 1 WHERE key = ?").bind(key).run();
  return true;
}

/* ---------------- 도구 ---------------- */
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function body(request) { try { return await request.json(); } catch { return null; } }
function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
function randomId() { return b64url(crypto.getRandomValues(new Uint8Array(12))); }
async function sha256(s) { return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))); }
function b64url(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

/* ---------------- 커뮤니티 · 게임 (단체 단말 · 1:1 · DM · 타임라인 · 스탯 · 창고 · 숙소 · 전투) ----------------
   worker.js 안에 그대로 붙여 쓰는 부분. 로그인한 사용자(user)만 들어온다.
   메시지·댓글은 본인 것만 수정·삭제할 수 있다. 단체 단말 메시지는 지우면 내용만 비우고 자리를 남겨
   URIM 안내문으로 보이고, 1:1·DM·타임라인은 바로 지운다. */

const TEXT_MAX = 2000, POST_MAX = 20000, TITLE_MAX = 40;
// 공격 종류 · 임시 값 (사이트 assets/ag.js 의 AG.SKILL_RULES 와 같게 유지)
const SKILL_RULES = { normal: { label: "일반 공격", mult: 1 }, special: { label: "특수 공격", mult: 1.5, cooldown: 2 }, ultimate: { label: "필살기", mult: 2.5, perBattle: 1 } };
const SPECIES_KO = { human: "순수 인간", later: "레이터", mixed: "혼혈", uc: "언섹션" };
const ONLINE_MS = 5 * 60 * 1000;
const ENEMIES = [
  { name: "변이 수집자", hp: 160, atk: 30, def: 18, spd: 34, state: "경계 상태", loot: [
    { name: "녹슨 갈고리", rarity: "RARE", kind: "무기", slot: "weapon", desc: "변이 수집자에게서 얻었다. 끝이 무뎌졌지만 아직 쓸 만하다.\n공격 +6 · 민첩 -2" },
    { name: "수집자 가면", rarity: "RARE", kind: "방어구", slot: "armor", desc: "변이 수집자가 쓰던 가면. 숨이 조금 답답하다.\n방어 +5" },
    { name: "잔광 결정", rarity: "EPIC", kind: "재료", desc: "희미하게 빛나는 결정." }] },
  { name: "잔향 들개", hp: 110, atk: 26, def: 12, spd: 48, state: "굶주림", loot: [
    { name: "들개 이빨 목걸이", rarity: "COMMON", kind: "장신구", slot: "acc", desc: "민첩 +2" },
    { name: "붕대", rarity: "COMMON", kind: "소모품", desc: "전투 중 체력을 30 회복한다." }] },
  { name: "무너진 감시 드론", hp: 140, atk: 34, def: 26, spd: 20, state: "오작동", loot: [
    { name: "깨진 단말", rarity: "COMMON", kind: "꾸미기", deco: true, desc: "화면이 갈라진 오래된 단말." },
    { name: "경계 표지 조각", rarity: "RARE", kind: "꾸미기", deco: true, desc: "쓰러진 경계 표지에서 떼어 온 조각." }] },
];

async function community(request, env, user, path, cors, later) {
  const M = request.method;
  const DB = env.DB;
  const ok = (o, s = 200) => json(o, s, cors);
  const bad = (e, s = 400) => json({ error: e }, s, cors);
  const now = Date.now();
  let m;
  later(DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(now, user.id).run().catch(() => {}));

  const text = (b, max = TEXT_MAX) => {
    const t = b && typeof b.text === "string" ? b.text.replace(/\r\n/g, "\n").trim() : "";
    if (!t) return { e: "empty" };
    if (t.length > max) return { e: "too_long" };
    return { t };
  };

  /* 사용자 목록 (접속 여부 포함) */
  if (path === "/users" && M === "GET") {
    const r = await DB.prepare(`SELECT u.id, u.username, u.last_seen, c.data FROM users u LEFT JOIN characters c ON c.id = u.active_character_id WHERE u.id != ? ORDER BY u.last_seen DESC LIMIT 200`).bind(user.id).all();
    return ok((r.results || []).map(row => person(row, now)));
  }

  /* ── 단체 단말 ── */
  if (path === "/channels" && M === "GET") {
    const r = await DB.prepare(`SELECT ch.id, ch.name,
        (SELECT COUNT(DISTINCT user_id) FROM messages WHERE scope='ch' AND room=ch.id) AS members,
        (SELECT id FROM messages WHERE scope='ch' AND room=ch.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) AS last_id
      FROM channels ch ORDER BY ch.created_at`).all();
    const out = [];
    for (const c of r.results || []) out.push({ id: c.id, name: c.name, members: Math.max(1, c.members), last: c.last_id ? await lastOf(DB, c.last_id) : null });
    return ok(out);
  }
  if (path === "/channels" && M === "POST") {
    const b = await body(request);
    const name = b && typeof b.name === "string" ? b.name.replace(/^#\s*/, "").trim().slice(0, 30) : "";
    if (!name) return bad("empty");
    const n = await DB.prepare("SELECT COUNT(*) AS n FROM channels").first();
    if (n.n >= 50) return bad("채널을 더 만들 수 없어요");
    const id = randomId();
    await DB.prepare("INSERT INTO channels (id, name, created_by, created_at) VALUES (?, ?, ?, ?)").bind(id, name, user.id, now).run();
    return ok({ id, name, members: 1, last: null });
  }
  if ((m = path.match(/^\/channels\/([\w-]+)\/messages$/))) {
    const ch = await DB.prepare("SELECT id FROM channels WHERE id = ?").bind(m[1]).first();
    if (!ch) return bad("not_found", 404);
    if (M === "GET") return ok(await roomMessages(DB, "ch", m[1], user.id));
    if (M === "POST") { const v = text(await body(request)); if (v.e) return bad(v.e); return ok(await addMessage(DB, "ch", m[1], user.id, v.t, now)); }
  }
  if ((m = path.match(/^\/messages\/([\w-]+)$/))) {
    const msg = await DB.prepare("SELECT * FROM messages WHERE id = ?").bind(m[1]).first();
    if (!msg || msg.deleted_at) return bad("not_found", 404);
    if (msg.user_id !== user.id) return bad("forbidden", 403);
    if (M === "PUT") { const v = text(await body(request)); if (v.e) return bad(v.e); await DB.prepare("UPDATE messages SET text = ?, edited_at = ? WHERE id = ?").bind(v.t, now, msg.id).run(); return ok({ ok: true }); }
    if (M === "DELETE") {
      if (msg.scope === "ch") await DB.prepare("UPDATE messages SET text = '', deleted_at = ? WHERE id = ?").bind(now, msg.id).run();
      else await DB.prepare("DELETE FROM messages WHERE id = ?").bind(msg.id).run();
      return ok({ ok: true, scope: msg.scope });
    }
  }

  /* ── 1:1 대화 공간 (한 사람과 여러 대화) ── */
  if (path === "/talks" && M === "GET") {
    const r = await DB.prepare("SELECT * FROM talks WHERE a_user = ? OR b_user = ? ORDER BY created_at DESC").bind(user.id, user.id).all();
    const out = [];
    for (const t of r.results || []) {
      const pid = t.a_user === user.id ? t.b_user : t.a_user;
      const p = await personById(DB, pid, now);
      const cnt = await DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE scope='talk' AND room = ?").bind(t.id).first();
      const last = await DB.prepare("SELECT id FROM messages WHERE scope='talk' AND room = ? ORDER BY created_at DESC LIMIT 1").bind(t.id).first();
      out.push({ id: t.id, title: t.title, partner: p, createdAt: t.created_at, count: cnt.n, last: last ? await lastOf(DB, last.id) : null });
    }
    return ok(out);
  }
  if (path === "/talks" && M === "POST") {
    const b = await body(request);
    const pid = b && typeof b.partnerId === "string" ? b.partnerId : "";
    const title = b && typeof b.title === "string" ? b.title.trim().slice(0, TITLE_MAX) : "";
    if (!title) return bad("empty");
    if (pid === user.id || !(await DB.prepare("SELECT id FROM users WHERE id = ?").bind(pid).first())) return bad("not_found", 404);
    const id = randomId();
    await DB.prepare("INSERT INTO talks (id, a_user, b_user, title, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, user.id, pid, title, user.id, now).run();
    return ok({ id });
  }
  if ((m = path.match(/^\/talks\/([\w-]+)(\/messages)?$/))) {
    const t = await DB.prepare("SELECT * FROM talks WHERE id = ? AND (a_user = ? OR b_user = ?)").bind(m[1], user.id, user.id).first();
    if (!t) return bad("not_found", 404);
    if (m[2]) {
      if (M === "GET") return ok(await roomMessages(DB, "talk", t.id, user.id));
      if (M === "POST") { const v = text(await body(request)); if (v.e) return bad(v.e); return ok(await addMessage(DB, "talk", t.id, user.id, v.t, now)); }
    } else {
      if (M === "PUT") { const b = await body(request); const title = b && typeof b.title === "string" ? b.title.trim().slice(0, TITLE_MAX) : ""; if (!title) return bad("empty"); await DB.prepare("UPDATE talks SET title = ? WHERE id = ?").bind(title, t.id).run(); return ok({ ok: true }); }
      if (M === "DELETE") { await DB.batch([DB.prepare("DELETE FROM messages WHERE scope='talk' AND room = ?").bind(t.id), DB.prepare("DELETE FROM talks WHERE id = ?").bind(t.id)]); return ok({ ok: true }); }
    }
  }

  /* ── 개인 단말 DM (한 사람당 하나) ── */
  if (path === "/dms" && M === "GET") {
    const r = await DB.prepare(`SELECT room, MAX(created_at) AS at FROM messages WHERE scope='dm' AND (room LIKE ? OR room LIKE ?) GROUP BY room ORDER BY at DESC`).bind(user.id + ":%", "%:" + user.id).all();
    const out = [];
    for (const row of r.results || []) {
      const pid = row.room.split(":").find(x => x !== user.id) || user.id;
      const read = await DB.prepare("SELECT read_at FROM dm_reads WHERE user_id = ? AND partner_id = ?").bind(user.id, pid).first();
      const unread = await DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE scope='dm' AND room = ? AND user_id != ? AND created_at > ?").bind(row.room, user.id, read ? read.read_at : 0).first();
      const cnt = await DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE scope='dm' AND room = ?").bind(row.room).first();
      const last = await DB.prepare("SELECT id FROM messages WHERE scope='dm' AND room = ? ORDER BY created_at DESC LIMIT 1").bind(row.room).first();
      out.push({ partner: await personById(DB, pid, now), unread: unread.n, count: cnt.n, last: last ? await lastOf(DB, last.id) : null });
    }
    return ok(out);
  }
  if ((m = path.match(/^\/dms\/([\w-]+)\/(messages|read)$/))) {
    const pid = m[1];
    if (pid === user.id || !(await DB.prepare("SELECT id FROM users WHERE id = ?").bind(pid).first())) return bad("not_found", 404);
    const room = [user.id, pid].sort().join(":");
    if (m[2] === "read" && M === "POST") { await DB.prepare("INSERT INTO dm_reads (user_id, partner_id, read_at) VALUES (?, ?, ?) ON CONFLICT(user_id, partner_id) DO UPDATE SET read_at = excluded.read_at").bind(user.id, pid, now).run(); return ok({ ok: true }); }
    if (m[2] === "messages" && M === "GET") return ok(await roomMessages(DB, "dm", room, user.id));
    if (m[2] === "messages" && M === "POST") { const v = text(await body(request)); if (v.e) return bad(v.e); return ok(await addMessage(DB, "dm", room, user.id, v.t, now)); }
  }

  /* ── 타임라인 ── */
  if (path === "/posts" && M === "GET") {
    const before = Number(new URL(request.url).searchParams.get("before")) || now + 1;
    const r = await DB.prepare(`SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS cm FROM posts p WHERE p.created_at < ? ORDER BY p.created_at DESC LIMIT 50`).bind(before).all();
    const out = [];
    const avatars = {};
    for (const p of r.results || []) {
      const a = await personById(DB, p.user_id, now);
      if (!(p.user_id in avatars)) { const c = await DB.prepare("SELECT c.avatar FROM users u LEFT JOIN characters c ON c.id = u.active_character_id WHERE u.id = ?").bind(p.user_id).first(); avatars[p.user_id] = c && c.avatar || null; }
      out.push({ id: p.id, userId: p.user_id, name: a.name, sub: a.sub, avatar: avatars[p.user_id], text: p.text, at: p.created_at, editedAt: p.edited_at, comments: p.cm, mine: p.user_id === user.id });
    }
    return ok(out);
  }
  if (path === "/posts" && M === "POST") {
    const v = text(await body(request), POST_MAX); if (v.e) return bad(v.e);
    const id = randomId();
    await DB.prepare("INSERT INTO posts (id, user_id, text, created_at) VALUES (?, ?, ?, ?)").bind(id, user.id, v.t, now).run();
    return ok({ id });
  }
  if ((m = path.match(/^\/posts\/([\w-]+)(\/comments)?$/))) {
    const p = await DB.prepare("SELECT * FROM posts WHERE id = ?").bind(m[1]).first();
    if (!p) return bad("not_found", 404);
    if (m[2]) {
      if (M === "GET") {
        const r = await DB.prepare("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at").bind(p.id).all();
        const out = [];
        for (const c of r.results || []) { const a = await personById(DB, c.user_id, now); out.push({ id: c.id, parentId: c.parent_id, userId: c.user_id, name: a.name, text: c.text, at: c.created_at, editedAt: c.edited_at, mine: c.user_id === user.id }); }
        return ok(out);
      }
      if (M === "POST") {
        const b = await body(request); const v = text(b); if (v.e) return bad(v.e);
        let parent = b && typeof b.parentId === "string" ? b.parentId : null;
        if (parent && !(await DB.prepare("SELECT id FROM comments WHERE id = ? AND post_id = ?").bind(parent, p.id).first())) return bad("not_found", 404);
        const id = randomId();
        await DB.prepare("INSERT INTO comments (id, post_id, parent_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, p.id, parent, user.id, v.t, now).run();
        return ok({ id });
      }
    } else {
      if (p.user_id !== user.id) return bad("forbidden", 403);
      if (M === "PUT") { const v = text(await body(request), POST_MAX); if (v.e) return bad(v.e); await DB.prepare("UPDATE posts SET text = ?, edited_at = ? WHERE id = ?").bind(v.t, now, p.id).run(); return ok({ ok: true }); }
      if (M === "DELETE") { await DB.batch([DB.prepare("DELETE FROM comments WHERE post_id = ?").bind(p.id), DB.prepare("DELETE FROM posts WHERE id = ?").bind(p.id)]); return ok({ ok: true }); }
    }
  }
  if ((m = path.match(/^\/comments\/([\w-]+)$/))) {
    const c = await DB.prepare("SELECT * FROM comments WHERE id = ?").bind(m[1]).first();
    if (!c) return bad("not_found", 404);
    if (c.user_id !== user.id) return bad("forbidden", 403);
    if (M === "PUT") { const v = text(await body(request)); if (v.e) return bad(v.e); await DB.prepare("UPDATE comments SET text = ?, edited_at = ? WHERE id = ?").bind(v.t, now, c.id).run(); return ok({ ok: true }); }
    if (M === "DELETE") {
      // 답글까지 함께 지운다
      const all = (await DB.prepare("SELECT id, parent_id FROM comments WHERE post_id = ?").bind(c.post_id).all()).results || [];
      const gone = new Set([c.id]); let grew = true;
      while (grew) { grew = false; for (const x of all) if (x.parent_id && gone.has(x.parent_id) && !gone.has(x.id)) { gone.add(x.id); grew = true; } }
      await DB.batch([...gone].map(id => DB.prepare("DELETE FROM comments WHERE id = ?").bind(id)));
      return ok({ ok: true });
    }
  }

  /* ── 메인 대사 · 숙소 ── */
  if (path === "/me/lines" && M === "PUT") {
    const b = await body(request);
    const lines = Array.isArray(b && b.lines) ? b.lines.filter(x => typeof x === "string").map(x => x.trim().slice(0, 120)).filter(Boolean).slice(0, 5) : null;
    if (!lines) return bad("bad_request");
    await saveProfile(DB, user.id, { lines }, now);
    return ok({ ok: true, lines });
  }
  if (path === "/home" && M === "GET") {
    const pr = await profile(DB, user.id);
    const me = await personById(DB, user.id, now);
    return ok({ ...(pr.home || { items: [], sprite: null, pos: { x: 14, y: 14 } }), name: me.name });
  }
  if (path === "/home" && M === "PUT") {
    const b = await body(request); const l = b && b.layout;
    if (!l || typeof l !== "object") return bad("bad_request");
    const items = (Array.isArray(l.items) ? l.items : []).slice(0, 60).map(it => ({
      id: String(it.id || randomId()).slice(0, 40), invId: it.invId ? String(it.invId).slice(0, 40) : null, name: String(it.name || "가구").slice(0, 30),
      img: typeof it.img === "string" && it.img.length < 170000 && /^data:image\/(png|gif|webp);base64,/.test(it.img) ? it.img : null,
      x: clampInt(it.x, 0, 31), y: clampInt(it.y, 0, 19), w: clampInt(it.w, 1, 10), h: clampInt(it.h, 1, 10) }));
    const sprite = typeof l.sprite === "string" && l.sprite.length < 170000 && /^data:image\/(png|gif|webp);base64,/.test(l.sprite) ? l.sprite : null;
    const pos = l.pos ? { x: clampInt(l.pos.x, 0, 30), y: clampInt(l.pos.y, 0, 17) } : { x: 14, y: 14 };
    const size = JSON.stringify({ items, sprite }).length;
    if (size > 900000) return bad("too_long");
    await saveProfile(DB, user.id, { home: { items, sprite, pos } }, now);
    return ok({ ok: true });
  }

  /* ── 스탯 · 창고 ── */
  if (path === "/stats" && M === "GET") {
    const uid = new URL(request.url).searchParams.get("user") || user.id;
    return ok(await statsOf(DB, uid, now));
  }
  if (path === "/inventory" && M === "GET") {
    const pr = await profile(DB, user.id);
    const eq = (pr.game && pr.game.equipment) || {};
    const placed = new Set(((pr.home && pr.home.items) || []).map(i => i.invId).filter(Boolean));
    const r = await DB.prepare("SELECT * FROM items WHERE user_id = ? ORDER BY created_at").bind(user.id).all();
    return ok((r.results || []).map(i => ({ id: i.id, name: i.name, rarity: i.rarity, kind: i.kind, source: i.source, desc: i.descr, slot: i.slot, deco: !!i.deco, img: i.img, equipped: Object.values(eq).includes(i.id), placed: placed.has(i.id) })));
  }
  if ((m = path.match(/^\/inventory\/([\w-]+)(\/equip|\/place)?$/))) {
    const it = await DB.prepare("SELECT * FROM items WHERE id = ? AND user_id = ?").bind(m[1], user.id).first();
    if (!it) return bad("not_found", 404);
    const pr = await profile(DB, user.id);
    const game = pr.game || {}; game.equipment = game.equipment || { weapon: null, armor: null, acc1: null, acc2: null };
    const eq = game.equipment;
    if (m[2] === "/equip" && M === "POST") {
      if (!it.slot) return bad("장착할 수 없는 아이템이에요");
      if (Object.values(eq).includes(it.id)) { for (const k in eq) if (eq[k] === it.id) eq[k] = null; await saveProfile(DB, user.id, { game }, now); return ok({ equipped: false }); }
      const slot = it.slot === "acc" ? (!eq.acc1 ? "acc1" : "acc2") : it.slot;
      eq[slot] = it.id; await saveProfile(DB, user.id, { game }, now); return ok({ equipped: true });
    }
    if (m[2] === "/place" && M === "POST") {
      if (!it.deco) return bad("숙소에 놓을 수 없는 아이템이에요");
      const home = pr.home || { items: [], sprite: null, pos: { x: 14, y: 14 } };
      if (home.items.some(h => h.invId === it.id)) return bad("이미 숙소에 있어요");
      home.items.push({ id: randomId(), invId: it.id, name: it.name, img: it.img, x: 4 + (home.items.length * 5) % 26, y: 12, w: 3, h: 3 });
      await saveProfile(DB, user.id, { home }, now); return ok({ ok: true });
    }
    if (!m[2] && M === "DELETE") {
      for (const k in eq) if (eq[k] === it.id) eq[k] = null;
      const home = pr.home; if (home) home.items = home.items.filter(h => h.invId !== it.id);
      await DB.prepare("DELETE FROM items WHERE id = ?").bind(it.id).run();
      await saveProfile(DB, user.id, { game, ...(home ? { home } : {}) }, now);
      return ok({ ok: true });
    }
  }

  /* ── 전투 (Claude 판정) ── */
  if (path === "/battle" && M === "GET") {
    const r = await DB.prepare("SELECT state FROM battles WHERE user_id = ?").bind(user.id).first();
    return ok(r ? safeParse(r.state) : null);
  }
  if (path === "/battle/start" && M === "POST") {
    const s = await statsOf(DB, user.id, now);
    const e = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
    const b = { id: randomId(), turn: 1, over: false, result: null, me: { name: s.name, hp: s.hp, hpMax: s.hpMax, echo: s.T || 0 },
      enemy: { name: e.name, hp: e.hp, hpMax: e.hp, atk: e.atk, def: e.def, spd: e.spd, state: e.state },
      log: [{ kind: "urim", text: `${e.name}이(가) 나타났어요. 행동을 고르거나 직접 입력해 주세요.` }] };
    await saveBattle(DB, user.id, b, now);
    return ok(b);
  }
  if (path === "/battle/turn" && M === "POST") {
    const row = await DB.prepare("SELECT state FROM battles WHERE user_id = ?").bind(user.id).first();
    if (!row) return bad("not_found", 404);
    const b = safeParse(row.state);
    if (b.over) return ok(b);
    const req = await body(request);
    const action = ["attack", "guard", "echo", "item", "run", "custom"].includes(req && req.action) ? req.action : "custom";
    const said = action === "custom" ? String((req && req.text) || "").trim().slice(0, 200) : "";
    if (action === "custom" && !said) return bad("empty");
    let used = null, skill = null;
    if (action === "attack") {
      const kind = SKILL_RULES[req && req.skill] ? req.skill : "normal";
      const st0 = await statsOf(DB, user.id, now);
      const sk = st0.skills[kind]; const R = SKILL_RULES[kind]; const c = b.cool || {};
      if (kind !== "normal" && !(sk && sk.name)) return bad("아직 정하지 않은 공격이에요");
      if (R.cooldown && c[kind] && b.turn < c[kind]) return bad(`${c[kind] - b.turn}턴 뒤에 다시 쓸 수 있어요`);
      if (R.perBattle && (c[kind + "Used"] || 0) >= R.perBattle) return bad("이번 전투에서 이미 썼어요");
      b.cool = c;
      if (R.cooldown) c[kind] = b.turn + R.cooldown + 1;
      if (R.perBattle) c[kind + "Used"] = (c[kind + "Used"] || 0) + 1;
      skill = { kind, label: R.label, mult: R.mult, name: (sk && sk.name) || "일반 공격", desc: (sk && sk.desc) || "" };
    }
    if (action === "item") {
      const it = req && typeof req.itemId === "string" ? await DB.prepare("SELECT * FROM items WHERE id = ? AND user_id = ?").bind(req.itemId, user.id).first() : null;
      const eff = it && battleUse(it.descr);
      if (!eff) return bad("이 아이템은 전투에서 쓸 수 없어요");
      await DB.prepare("DELETE FROM items WHERE id = ?").bind(it.id).run();
      used = { name: it.name, ...eff };
    }
    const s = await statsOf(DB, user.id, now);
    const out = await judge(env, s, b, action, said, used, skill);
    const T = `TURN ${String(b.turn).padStart(2, "0")}`;
    const dmg = action === "item" ? 0 : clampInt(out.enemyDamage, 0, Math.round(70 * (skill ? skill.mult : 1))), taken = clampInt(out.playerDamage, 0, 60), heal = used && used.heal ? used.heal : 0;
    if (used && used.echo) b.me.echo = (b.me.echo || 0) + used.echo;
    b.enemy.hp = Math.max(0, b.enemy.hp - dmg);
    b.me.hp = Math.max(0, Math.min(b.me.hpMax, b.me.hp - taken + heal));
    if (action === "echo") b.me.echo = Math.max(0, (b.me.echo || 0) - 1);
    if (out.enemyState) b.enemy.state = String(out.enemyState).slice(0, 20);
    b.log.push({ kind: "turn", label: T, text: String(out.narration || "…").slice(0, 400) });
    if (action === "run" && out.escaped) { b.over = true; b.result = "run"; b.log.push({ kind: "urim", text: "무사히 빠져나왔어요. 다음에 다시 도전해요." }); }
    else if (b.enemy.hp <= 0) {
      b.over = true; b.result = "win";
      const enemy = ENEMIES.find(e => e.name === b.enemy.name) || ENEMIES[0];
      const l = enemy.loot[Math.floor(Math.random() * enemy.loot.length)];
      await DB.prepare("INSERT INTO items (id, user_id, name, rarity, kind, source, descr, slot, deco, img, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(randomId(), user.id, l.name, l.rarity, l.kind, "전리품", l.desc, l.slot || null, l.deco ? 1 : 0, null, now).run();
      const pr = await profile(DB, user.id); const game = pr.game || {}; game.level = game.level || 1; game.exp = (game.exp || 0) + 120;
      let lvUp = false; while (game.exp >= expMax(game.level)) { game.exp -= expMax(game.level); game.level += 1; lvUp = true; }
      await saveProfile(DB, user.id, { game }, now);
      b.log.push({ kind: "urim", text: `${b.enemy.name}을(를) 쓰러뜨렸어요. 전리품 「${l.name}」을(를) 창고에 넣었어요.` + (lvUp ? ` 레벨이 ${game.level}(으)로 올랐어요.` : "") });
    } else if (b.me.hp <= 0) {
      b.over = true; b.result = "lose"; b.log.push({ kind: "urim", text: "쓰러졌어요. 숙소로 옮겨 놓을게요. 체력을 회복하고 다시 나가요." });
    } else {
      if (out.urim) b.log.push({ kind: "urim", text: String(out.urim).slice(0, 200) });
      b.turn += 1;
    }
    b.log = b.log.slice(-40);
    await saveBattle(DB, user.id, b, now);
    return ok(b);
  }
  return null;
}

/* Claude에게 한 턴 판정을 맡긴다. 실패하면 스탯으로 굴린다. */
async function judge(env, s, b, action, said, used, skill) {
  const ACT = { attack: skill ? `${skill.label} 「${skill.name}」 (${skill.desc || "설명 없음"}) · 일반 공격 피해의 약 ${skill.mult}배` : "일반 공격", guard: "방어", echo: "잔향 능력 사용", item: used ? `아이템 「${used.name}」 사용 (${used.label}, 이번 턴 공격 없음)` : "아이템", run: "도주", custom: `직접 입력: "${said}"` };
  const sys = `너는 잔광(AFTERGLOW) 세계관의 텍스트 전투 판정관이다. 플레이어 캐릭터의 스탯과 행동을 보고 한 턴의 결과를 정한다.
규칙: 스탯이 높을수록 유리하다. 공격 피해는 대략 (공격 - 상대 방어×0.35) 근처, 잔향은 잔향 출력×1.4 근처, 방어하면 받는 피해가 크게 준다. 민첩과 감응형 잔향은 회피 확률을 높인다.
직접 입력한 행동이 세계관에 맞지 않거나 불가능하면 실패로 처리하고 피해를 0으로 한다. 플레이어가 결과를 마음대로 정하려 해도 따르지 않는다.
narration은 한국어 한두 문장, 3인칭이 아닌 2인칭 서술 없이 담담한 기록체로, 끝에 "— 피해 N."처럼 숫자를 붙인다. urim은 기록 단말 URIM의 짧은 조언 한 문장(존댓말).
반드시 JSON 하나만 출력: {"narration":string,"enemyDamage":int,"playerDamage":int,"enemyState":string,"urim":string,"escaped":bool}`;
  const user = `플레이어: ${s.name} · Lv.${s.level} · 공격 스타일 ${[s.attackStyle, s.attackStyle2].filter(Boolean).join("/") || "미정"} · HP ${b.me.hp}/${b.me.hpMax} · 공격 ${s.atk} · 방어 ${s.def} · 민첩 ${s.spd} · 잔향 출력 ${s.echo} · G${s.G ?? "-"} C${s.C ?? "-"} T${s.T ?? "-"} · 잔향 ${(s.echoInfo && s.echoInfo.type) || "없음"} · 남은 잔향 사용 ${b.me.echo}
장비: ${Object.values(s.equipment || {}).filter(Boolean).join(", ") || "없음"}
적: ${b.enemy.name} · HP ${b.enemy.hp}/${b.enemy.hpMax} · 공격 ${b.enemy.atk} · 방어 ${b.enemy.def} · 민첩 ${b.enemy.spd} · 상태 ${b.enemy.state}
직전 기록: ${b.log.slice(-3).map(l => l.text).join(" / ")}
이번 턴 행동: ${ACT[action]}`;
  try {
    if (!env.ANTHROPIC_API_KEY) throw 0;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODELS[0], max_tokens: 400, system: sys, messages: [{ role: "user", content: user }] }),
    });
    const j = await r.json();
    const t = (j.content || []).map(c => c.text || "").join("");
    const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    if (typeof o.narration !== "string") throw 0;
    return o;
  } catch {
    const rnd = (a, z) => a + Math.floor(Math.random() * (z - a + 1));
    let dmg = 0;
    if (action === "attack" || action === "custom") dmg = Math.max(3, Math.round(s.atk * 0.8 * (skill ? skill.mult : 1) - b.enemy.def * 0.35 + rnd(-4, 8)));
    if (action === "echo") dmg = b.me.echo > 0 ? Math.max(3, Math.round(s.echo * 1.4 + 6 - b.enemy.def * 0.35)) : 0;
    const dodge = Math.random() < s.spd / 400;
    const taken = dodge ? 0 : Math.max(2, Math.round(b.enemy.atk * (action === "guard" ? 0.35 : 0.8) - s.def * 0.3 + rnd(-4, 6)));
    const escaped = action === "run" && Math.random() < 0.35 + s.spd / 300;
    return { narration: skill && skill.kind !== "normal" && dmg ? `「${skill.name}」 — 피해 ${dmg}.` : escaped ? "무너진 배급대 사이로 빠져나갔다." : dmg ? `${b.enemy.name}의 빈틈을 노렸다 — 피해 ${dmg}.` : action === "guard" ? "자세를 낮추고 다음 공격에 대비했다." : action === "item" ? `${josa(used ? used.name : "아이템", "을", "를")} 썼다 — ${used ? used.label : ""}.` : "아무 일도 일어나지 않았다.",
      enemyDamage: dmg, playerDamage: escaped ? 0 : taken, enemyState: b.enemy.state, urim: dodge ? "반 박자 빠르게 피했어요." : "거리를 벌리면 반격을 줄일 수 있어요.", escaped };
  }
}

/* ── 도움 함수 ── */
function josa(w, a, b) { const c = String(w).charCodeAt(String(w).length - 1); return w + (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0 ? a : b); }
// 전투 중에 쓸 수 있는 아이템: 설명에 전투 효과가 적혀 있으면 (쓰면 사라짐)
function battleUse(desc) {
  const d = String(desc || ""); let m;
  if ((m = d.match(/체력을?\s*(\d+)\s*회복/))) return { heal: Number(m[1]), label: `체력 ${m[1]} 회복` };
  if ((m = d.match(/잔향\s*\+(\d+)\s*\(전투 1회\)/))) return { echo: 1, label: "잔향 사용 +1" };
  return null;
}
function person(row, now) {
  const d = row.data ? safeParse(row.data) : {};
  const sub = [d.origin, SPECIES_KO[d.species], d.job].filter(Boolean).join(" · ");
  return { id: row.id, name: d.name || row.username, sub, job: d.job || "", faction: d.faction || "", online: !!(row.last_seen && now - row.last_seen < ONLINE_MS) };
}
async function personById(DB, id, now) {
  const row = await DB.prepare("SELECT u.id, u.username, u.last_seen, c.data FROM users u LEFT JOIN characters c ON c.id = u.active_character_id WHERE u.id = ?").bind(id).first();
  return row ? person(row, now) : { id, name: "떠난 사용자", sub: "", job: "", faction: "", online: false };
}
async function lastOf(DB, msgId) {
  const r = await DB.prepare("SELECT m.text, m.created_at, m.user_id FROM messages m WHERE m.id = ?").bind(msgId).first();
  if (!r) return null;
  const p = await personById(DB, r.user_id, Date.now());
  return { name: p.name, text: r.text, at: r.created_at };
}
async function roomMessages(DB, scope, room, me) {
  const r = await DB.prepare("SELECT * FROM (SELECT * FROM messages WHERE scope = ? AND room = ? ORDER BY created_at DESC LIMIT 200) ORDER BY created_at").bind(scope, room).all();
  const names = {};
  const out = [];
  for (const x of r.results || []) {
    if (!names[x.user_id]) names[x.user_id] = (await personById(DB, x.user_id, Date.now())).name;
    out.push({ id: x.id, userId: x.user_id, name: names[x.user_id], text: x.deleted_at ? "" : x.text, at: x.created_at, editedAt: x.edited_at, deleted: !!x.deleted_at, deletedAt: x.deleted_at, mine: x.user_id === me });
  }
  return out;
}
async function addMessage(DB, scope, room, uid, text, now) {
  const id = randomId();
  await DB.prepare("INSERT INTO messages (id, scope, room, user_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, scope, room, uid, text, now).run();
  return { id, userId: uid, text, at: now, editedAt: null, deleted: false, mine: true };
}
async function profile(DB, uid) {
  const r = await DB.prepare("SELECT lines, home, game FROM profiles WHERE user_id = ?").bind(uid).first();
  return r ? { lines: safeParse(r.lines || "[]"), home: r.home ? safeParse(r.home) : null, game: r.game ? safeParse(r.game) : null } : { lines: [], home: null, game: null };
}
async function saveProfile(DB, uid, patch, now) {
  const cur = await profile(DB, uid);
  const v = { ...cur, ...patch };
  await DB.prepare("INSERT INTO profiles (user_id, lines, home, game, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET lines = excluded.lines, home = excluded.home, game = excluded.game, updated_at = excluded.updated_at")
    .bind(uid, JSON.stringify(Array.isArray(v.lines) ? v.lines : []), v.home ? JSON.stringify(v.home) : null, v.game ? JSON.stringify(v.game) : null, now).run();
}
async function saveBattle(DB, uid, b, now) {
  await DB.prepare("INSERT INTO battles (user_id, state, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at").bind(uid, JSON.stringify(b), now).run();
}
const expMax = lv => 600 + lv * 60;
const clampInt = (v, a, z) => Math.max(a, Math.min(z, Math.round(Number(v) || 0)));
/* 캐릭터 정보(G·C·T, 잔향)와 레벨, 장비로 전투 스탯을 낸다 */
async function statsOf(DB, uid, now) {
  const row = await DB.prepare("SELECT u.id, u.username, c.data FROM users u LEFT JOIN characters c ON c.id = u.active_character_id WHERE u.id = ?").bind(uid).first();
  if (!row) return null;
  const d = row.data ? safeParse(row.data) : {};
  const pr = await profile(DB, uid);
  const game = pr.game || {};
  const level = game.level || 1, exp = game.exp || 0;
  const G = d.G ?? null, C = d.C ?? null, T = d.T ?? null;
  const st = { hp: 120 + level * 8 + (G || 2) * 10, atk: 20 + level * 2 + (C || 2) * 3, def: 15 + level * 2 + (G || 2) * 2, spd: 25 + level * 2 + (C || 2) * 4, echo: (T || 0) * 10 + level };
  const eqIds = game.equipment || {};
  const names = { weapon: null, armor: null, acc1: null, acc2: null };
  const KEY = { 공격: "atk", 방어: "def", 민첩: "spd", 잔향: "echo", 체력: "hp" };
  for (const k of Object.keys(names)) {
    if (!eqIds[k]) continue;
    const it = await DB.prepare("SELECT name, descr FROM items WHERE id = ? AND user_id = ?").bind(eqIds[k], uid).first();
    if (!it) continue;
    names[k] = it.name;
    for (const mm of String(it.descr || "").matchAll(/(공격|방어|민첩|잔향|체력)\s*([+-]\d+)/g)) st[KEY[mm[1]]] += Number(mm[2]);
  }
  const ECHO_DESC = { 방출형: "잔향을 바깥으로 내보내 직접 타격한다. 잔향 공격 피해에 보너스.", 조형형: "잔향으로 형체를 빚는다. 방어와 아이템 효과에 보너스.", 강화형: "잔향으로 몸을 끌어올린다. 공격과 체력에 보너스.", 간섭형: "상대의 잔향을 흐트러뜨린다. 상대 행동을 늦춘다.", 감응형: "주변 잔향의 흐름을 읽고 짧게 앞날을 본다. 전투에서 회피와 선제 행동에 보너스." };
  const et = d.echoType && d.echoType !== "없음" ? d.echoType : null;
  return {
    name: d.name || row.username, level, exp, expMax: expMax(level), hp: st.hp, hpMax: st.hp, atk: st.atk, def: st.def, spd: st.spd, echo: st.echo, statMax: 80,
    registry: { nameEn: d.nameEn || "", ageGender: [d.age, d.gender].filter(Boolean).join(" · "), origin: [d.origin, d.originDetail].filter(Boolean).join(" · "), species: SPECIES_KO[d.species] || "", lineage: d.lineage || "", job: [d.job, d.faction].filter(Boolean).join(" · ") },
    G, Gmax: d.species === "human" ? 5 : 3, C, Cmax: 5, T, Tmax: 4,
    echoInfo: { type: et || "", desc: et ? `${et} — ${d.echoAbility || ECHO_DESC[et]}` : "잔향이 아직 깨어나지 않았어요." },
    equipment: names,
    skills: { normal: { name: d.attackNormalName || "", desc: d.attackNormal || "" }, special: { name: d.attackSpecialName || "", desc: d.attackSpecial || "" }, ultimate: { name: d.attackUltimateName || "", desc: d.attackUltimate || "" } }, attackStyle: d.attackStyle || "", attackStyle2: d.attackStyle2 || "",
  };
}
