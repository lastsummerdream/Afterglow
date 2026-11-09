// URIM 서버 (Cloudflare Worker)
// ---------------------------------------------------------------
// 1) URIM ↔ Claude API 중계: API 키를 브라우저에 노출하지 않는다.
// 2) 사용자 등록: 아이디·비밀번호 가입, 로그인, 자작 캐릭터 저장.
//
// 설정 (Cloudflare 대시보드 > Workers > 이 워커 > Settings > Variables and Secrets)
//   ANTHROPIC_API_KEY : Claude API 키 (Secret)
//   ALLOWED_ORIGIN    : 사이트 주소. 여러 개면 쉼표로 구분. 끝에 / 없이.
//   DB                : D1 데이터베이스 바인딩 (afterglow-users)
//
// 경로
//   POST   /                    Claude 메시지 중계 (스트리밍)
//   POST   /auth/signup         { username, password } → { token, user }
//   POST   /auth/login          { username, password } → { token, user }
//   POST   /auth/logout         (로그인 필요)
//   GET    /me                  → { user, characters }
//   PUT    /me/active           { id } 대표 캐릭터 지정
//   POST   /me/password         { password, newPassword }
//   DELETE /me                  { password } 계정 삭제
//   POST   /characters          { data } → { character }
//   PUT    /characters/:id      { data } → { character }
//   DELETE /characters/:id
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

const ORIGINS = ["TB-01","TB-02","TB-03","TB-04","TB-05","TB-06","TB-07","TB-08","TB-09","TB-10","TB-11","TB-12","OPH","SEIR","NOD"];
const SPECIES = ["human","later","mixed","uc"];
const ECHO = ["없음","방출형","조형형","강화형","간섭형","감응형"];

// 글자 수 상한
const CHARACTER_SCHEMA = {
  name: 30, nameEn: 40, age: 20, gender: 20,
  origin: "enum", originDetail: 40,
  species: "enum", lineage: 30,
  G: "int", C: "int", T: "int",
  echoType: "enum", echoAbility: 120,
  job: 40, faction: 40,
  appearance: 1200, personality: 1200, background: 2400, secret: 600, notes: 1200,
};

export default {
  async fetch(request, env) {
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
      if (path === "/auth/signup" && request.method === "POST") return await signup(request, env, cors);
      if (path === "/auth/login" && request.method === "POST") return await login(request, env, cors);

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
          env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
        ]);
        return json({ ok: true }, 200, cors);
      }
      if (path === "/characters" && request.method === "POST") {
        const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM characters WHERE user_id = ?").bind(user.id).first();
        if (n && n.n >= MAX_CHARACTERS) return json({ error: "too_many_characters", max: MAX_CHARACTERS }, 400, cors);
        const b = await body(request);
        const v = validateCharacter(b && b.data);
        if (v.error) return json({ error: "invalid_character", field: v.field, reason: v.error }, 400, cors);
        const id = randomId();
        const now = Date.now();
        await env.DB.prepare("INSERT INTO characters (id, user_id, name, schema_version, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(id, user.id, v.data.name, SCHEMA_VERSION, JSON.stringify(v.data), now, now).run();
        if (!user.active_character_id) await env.DB.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").bind(id, user.id).run();
        return json(await mePayload(env, { ...user, active_character_id: user.active_character_id || id }, id), 200, cors);
      }
      const m = path.match(/^\/characters\/([A-Za-z0-9_-]{8,40})$/);
      if (m && request.method === "PUT") {
        const b = await body(request);
        const v = validateCharacter(b && b.data);
        if (v.error) return json({ error: "invalid_character", field: v.field, reason: v.error }, 400, cors);
        const r = await env.DB.prepare("UPDATE characters SET name = ?, schema_version = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ?")
          .bind(v.data.name, SCHEMA_VERSION, JSON.stringify(v.data), Date.now(), m[1], user.id).run();
        if (!r.meta || !r.meta.changes) return json({ error: "not_found" }, 404, cors);
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
        return json(await mePayload(env, { ...user, active_character_id: active }), 200, cors);
      }
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
async function signup(request, env, cors) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await allowAttempt(env, "signup:" + ip, 5, 60 * 60 * 1000))) return json({ error: "rate_limited" }, 429, cors);
  const b = await body(request);
  const username = b && typeof b.username === "string" ? b.username.trim() : "";
  if (!/^[A-Za-z0-9_]{4,20}$/.test(username)) return json({ error: "bad_username" }, 400, cors);
  const err = passwordProblem(b.password);
  if (err) return json({ error: err }, 400, cors);
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
  const token = await newSession(env, id);
  return json({ token, ...(await mePayload(env, { id, username, active_character_id: null, created_at: now })) }, 200, cors);
}

async function login(request, env, cors) {
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
  const rows = await env.DB.prepare("SELECT id, name, schema_version, data, created_at, updated_at FROM characters WHERE user_id = ? ORDER BY created_at").bind(user.id).all();
  const characters = (rows.results || []).map(r => ({
    id: r.id, name: r.name, schemaVersion: r.schema_version, createdAt: r.created_at, updatedAt: r.updated_at,
    data: safeParse(r.data),
  }));
  const out = {
    user: { id: user.id, username: user.username, activeCharacterId: user.active_character_id || null, createdAt: user.created_at },
    characters,
    limits: { maxCharacters: MAX_CHARACTERS, schemaVersion: SCHEMA_VERSION },
  };
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
  return { data: out };
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
