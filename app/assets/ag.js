/* ─────────────────────────────────────────────
   애프터 글로우 · 공통 스크립트
   - 화면 맞춤, 상단바, 토스트, 모달, 내 글 수정·삭제 버튼
   - 데이터: 로그인(ag-token)되어 있으면 서버(urim-proxy 워커), 아니면 이 브라우저 안의 체험 데이터
   ───────────────────────────────────────────── */
(function () {
'use strict';
const AG = window.AG = {};
const API = (() => { const d = 'https://urim-proxy.bucksve.workers.dev'; if (/(^|\.)lastsummerdream\.github\.io$/.test(location.hostname)) return d; try { return localStorage.getItem('ag-api') || d; } catch { return d; } })(); // ag-api: 개발용 서버 주소 덮어쓰기 (실제 사이트에서는 무시)
const TOKEN_KEY = 'ag-token';
const DEMO_KEY = 'ag-demo-v2';
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
AG.LS = LS;
AG.PROD = /(^|\.)lastsummerdream\.github\.io$/.test(location.hostname);   // 실제 사이트 (기존 Afterglow와 같은 주소라 로그인 정보를 함께 씀)
AG.PAGES = {
  cover: 'index.html', main: 'main.html', group: 'group.html', private: 'private.html', dm: 'dm.html', stats: 'stats.html',
  battle: 'battle.html', inventory: 'inventory.html', home: 'home.html', settings: 'settings.html', timeline: 'timeline.html',
};

/* ── 화면 ── */
/* 제목 글자를 한 글자씩 나눠 피그마처럼 차례로 내려오게 한다 (500ms 안에, 글자 수에 맞춰 간격 조절) */
AG.splitChars = function () {
  const grads = [];
  document.querySelectorAll('.mo-chars p.t').forEach(p => {
    if (p.dataset.split) return;
    const chars = [...p.textContent];
    const step = 500 / (chars.length + 1);
    p.dataset.split = '1';
    p.setAttribute('aria-label', p.textContent);
    p.textContent = '';
    chars.forEach((c, i) => {
      const s = document.createElement('span');
      s.className = 'ch'; s.textContent = c; s.setAttribute('aria-hidden', 'true');
      s.style.setProperty('--cd', (step * 2).toFixed(1) + 'ms');
      s.style.setProperty('--cl', (27 + step * i).toFixed(1) + 'ms');
      p.appendChild(s);
    });
    if (p.classList.contains('title-grad')) grads.push(p);
  });
  // 그라데이션 글자: 글자마다 같은 그라데이션을 제자리에 맞춰 깐다
  const paint = () => grads.forEach(p => {
    const w = p.offsetWidth;
    p.style.background = 'none';
    p.querySelectorAll('.ch').forEach(s => {
      s.style.cssText += `;background-image:linear-gradient(90deg,#f2f2f2 19.231%,#1e1e1e 100%);background-size:${w}px 100%;background-position:${-s.offsetLeft}px 0;-webkit-background-clip:text;background-clip:text;color:transparent`;
    });
  });
  paint();
  if (document.fonts) document.fonts.ready.then(paint);
};

/* 도형 레이어를 화면 전체(2560×1440)가 아니라 그림이 있는 곳만큼만 잡는다 → 그리는 면적·메모리 감소 */
AG.cropLayers = function () {
  document.querySelectorAll('.L > svg.sh').forEach(svg => {
    let b; try { b = svg.getBBox(); } catch { return; }
    if (!b || !b.width || !b.height) return;
    const m = 60;   // 그림자·흐림이 번지는 여유
    const x = Math.floor(b.x - m), y = Math.floor(b.y - m);
    const w = Math.ceil(b.x + b.width + m) - x, h = Math.ceil(b.y + b.height + m) - y;
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    svg.style.left = x + 'px'; svg.style.top = y + 'px'; svg.style.width = w + 'px'; svg.style.height = h + 'px';
  });
};

/* 70%로 줄인 좌우 패널: 바탕과 목록을 화면 아래까지 세로로 늘린다 */
AG.stretchSides = function () {
  document.querySelectorAll('#stage .L[data-r="left"], #stage .L[data-r="right"]').forEach(L => {
    const cs = getComputedStyle(L), sc = parseFloat(cs.scale);
    if (!(sc < 1)) return;
    const ay = parseFloat(cs.transformOrigin.split(' ')[1]);
    if (!(ay < 1000)) return;                      // 아래쪽에 붙인 것은 제외
    const bottom = y => ay + (y - ay) / sc;        // 화면 y → 레이어 안 좌표
    const walk = g => {
      const kids = [...g.children].filter(c => !/^(defs|title|desc)$/i.test(c.tagName));
      if (g.tagName.toLowerCase() === 'g' && kids.length > 1) { kids.forEach(walk); return; }   // 묶음은 풀어서 바탕만 늘린다
      let b; try { b = g.getBBox(); } catch { return; }
      if (b.height > 600 && b.y + b.height >= 1400) {
        const k = (bottom(1440) - b.y) / (1440 - b.y);
        g.setAttribute('transform', `translate(0 ${b.y}) scale(1 ${k}) translate(0 ${-b.y})`);
      }
    };
    L.querySelectorAll(':scope > svg.sh > *').forEach(walk);
    L.querySelectorAll('.scroll').forEach(el => {
      const want = bottom(el.id === 'comments' ? 1330 : 1410) - el.offsetTop;
      if (want > el.offsetHeight) el.style.height = want + 'px';
    });
  });
};

AG.boot = function (opts = {}) {
  AG.splitChars();
  AG.stretchSides();
  AG.cropLayers();
  const stage = document.getElementById('stage');
  const fit = () => {
    const s = Math.min(innerWidth / 2560, innerHeight / 1440);
    AG.scale = s;
    stage.style.transform = `translate(${(innerWidth - 2560 * s) / 2}px, ${(innerHeight - 1440 * s) / 2}px) scale(${s})`;
  };
  addEventListener('resize', fit); fit();
  const q = s => document.querySelector(s);
  q('[data-action="refresh"]')?.addEventListener('click', () => location.reload());
  q('[data-action="browse"]')?.addEventListener('click', () => AG.toast('다른 캐릭터 프로필 구경가기 · 준비 중이에요'));
  q('[data-action="back"]')?.addEventListener('click', () => {
    if (history.length > 1 && document.referrer) history.back(); else location.href = AG.PAGES.main;
  });
  if (AG.mode === 'demo' && !opts.noDemoChip) {
    const chip = document.createElement('div');
    chip.className = 'demo-chip in in-top';
    chip.textContent = '체험 모드';
    chip.title = '로그인하지 않아서 이 브라우저 안에서만 저장돼요. 설정에서 로그인할 수 있어요.';
    chip.addEventListener('click', () => location.href = AG.PAGES.settings);
    stage.appendChild(chip);
  }
  grain();
};

/* 비디오 질감 자리: 천천히 흔들리는 그레인 */
function grain() {
  const paths = document.querySelectorAll('path.vid');
  if (!paths.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const turb = document.getElementById('agGrainTurb');
  if (!turb) return;
  let seed = 1;
  setInterval(() => { seed = (seed % 97) + 1; turb.setAttribute('seed', seed); }, 90);
}

let toastTimer;
AG.toast = function (msg, ms = 1900) {
  let el = document.getElementById('pageToast');
  if (!el) { el = document.createElement('div'); el.id = 'pageToast'; el.className = 'page-toast'; el.setAttribute('role', 'status'); document.getElementById('stage').appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
};

AG.tpl = function (name, extra = '') {
  const t = document.getElementById('tpl-' + name);
  if (!t) return '';
  const [x, y, w, h] = t.dataset.box.split(',').map(Number);
  return `<svg viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" ${extra}>${t.content.firstElementChild.innerHTML}</svg>`;
};
AG.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
AG.time = ms => {
  const d = new Date(ms); let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h < 12 ? '오전' : '오후'; h = h % 12 || 12;
  const today = new Date(); const same = d.toDateString() === today.toDateString();
  return (same ? '' : `${d.getMonth() + 1}월 ${d.getDate()}일 `) + `${ap} ${h}:${m}`;
};
AG.af = ms => {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return `AF ${p(d.getFullYear() - 2014)}.${p(d.getMonth() + 1)}.${p(d.getDate())} · ${p(d.getHours())}:${p(d.getMinutes())}`;
};
AG.afDate = ms => { const d = new Date(ms); return `AF ${d.getFullYear() - 2014}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
AG.ago = ms => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return '방금'; if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`; if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  const d = new Date(ms); return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};
AG.SPECIES = { human: '순수 인간', later: '레이터', mixed: '혼혈', uc: '언섹션' };
AG.ORIGINS = ['TB-01','TB-02','TB-03','TB-04','TB-05','TB-06','TB-07','TB-08','TB-09','TB-10','TB-11','TB-12','OPH','SEIR','NOD'];

/* ── 모달 ── */
AG.modal = function (html, { onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.getElementById('stage').appendChild(back);
  const close = () => { back.remove(); removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', esc);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  setTimeout(() => back.querySelector('input,textarea,select,button')?.focus(), 30);
  return { el: back.firstElementChild, close };
};
AG.ask = function ({ title, sub, label, value = '', placeholder = '', ok = '확인', multiline = false }) {
  return new Promise(res => {
    const m = AG.modal(`<h2>${AG.esc(sub || '')}</h2><h3>${AG.esc(title)}</h3>${label ? `<label>${AG.esc(label)}</label>` : ''}
      ${multiline ? `<textarea maxlength="2000" placeholder="${AG.esc(placeholder)}">${AG.esc(value)}</textarea>` : `<input value="${AG.esc(value)}" placeholder="${AG.esc(placeholder)}" maxlength="60">`}
      <div class="row"><button class="ghost" data-x>취소</button><button data-ok>${AG.esc(ok)}</button></div>`, { onClose: () => res(null) });
    const inp = m.el.querySelector('input,textarea');
    const done = () => { const v = inp.value.trim(); if (!v) return inp.focus(); res(v); m.close(); };
    m.el.querySelector('[data-ok]').onclick = done;
    m.el.querySelector('[data-x]').onclick = () => m.close();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !multiline && !e.isComposing) done(); });
  });
};
AG.pick = function ({ title, sub, items }) {
  return new Promise(res => {
    const m = AG.modal(`<h2>${AG.esc(sub || '')}</h2><h3>${AG.esc(title)}</h3><div class="pick">${items.map((it, i) =>
      `<button data-i="${i}">${AG.esc(it.label)}${it.sub ? `<small>${AG.esc(it.sub)}</small>` : ''}</button>`).join('') || '<p>고를 수 있는 사람이 없어요</p>'}</div>
      <div class="row"><button class="ghost" data-x>닫기</button></div>`, { onClose: () => res(null) });
    m.el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { res(items[+b.dataset.i]); m.close(); });
    m.el.querySelector('[data-x]').onclick = () => m.close();
  });
};

/* ── 내 글 수정 · 삭제 ──
   host: 메시지 요소(.own 이 붙음), textEl: 본문 요소
   opts: { place: {right, top}, onSave(text), onDelete(), confirmText } */
AG.ownActions = function (host, textEl, opts) {
  host.classList.add('own');
  const acts = document.createElement('div');
  acts.className = 'acts';
  Object.assign(acts.style, opts.place || { right: '0px', top: '0px' });
  acts.innerHTML = `<button type="button" class="ed">수정</button><button type="button" class="del">삭제</button>`;
  host.appendChild(acts);
  acts.querySelector('.ed').onclick = e => {
    e.stopPropagation();
    if (host.classList.contains('editing')) return;
    host.classList.add('editing');
    const old = opts.getText ? opts.getText() : textEl.textContent;
    const box = document.createElement('div');
    box.innerHTML = `<textarea class="edit-box" rows="1"></textarea><div class="edit-row"><button type="button" class="ghost">취소</button><button type="button">저장</button></div>`;
    const ta = box.querySelector('textarea'); ta.value = old;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    textEl.hidden = true; textEl.after(box); grow(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    acts.style.visibility = 'hidden';
    const end = () => { box.remove(); textEl.hidden = false; host.classList.remove('editing'); acts.style.visibility = ''; };
    const save = async () => {
      const v = ta.value.trim();
      if (!v) return ta.focus();
      if (v === old) return end();
      try { await opts.onSave(v); end(); opts.done && opts.done(); } catch (err) { AG.toast(AG.errMsg(err)); }
    };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(); }
      if (e.key === 'Escape') end();
    });
    box.querySelector('.ghost').onclick = e => { e.stopPropagation(); end(); };
    box.querySelector('button:not(.ghost)').onclick = e => { e.stopPropagation(); save(); };
    box.addEventListener('click', e => e.stopPropagation());
  };
  acts.querySelector('.del').onclick = e => {
    e.stopPropagation();
    const keep = acts.innerHTML;
    acts.innerHTML = `<span class="confirm">${AG.esc(opts.confirmText || '삭제할까요?')}<button type="button" class="yes">삭제</button><button type="button" class="no">취소</button></span>`;
    host.classList.add('editing');
    const reset = () => { acts.innerHTML = keep; host.classList.remove('editing'); AG.ownActions.rewire(host, textEl, opts, acts); };
    acts.querySelector('.no').onclick = ev => { ev.stopPropagation(); reset(); };
    acts.querySelector('.yes').onclick = async ev => {
      ev.stopPropagation();
      host.classList.remove('editing');
      try { await opts.onDelete(); } catch (err) { AG.toast(AG.errMsg(err)); reset(); }
    };
  };
};
AG.ownActions.rewire = (host, textEl, opts, acts) => { acts.remove(); host.classList.remove('own'); AG.ownActions(host, textEl, opts); };

AG.errMsg = err => {
  const m = { unauthorized: '로그인이 필요해요', forbidden: '내가 쓴 글만 고칠 수 있어요', not_found: '이미 지워졌거나 찾을 수 없어요', too_long: '너무 길어요', empty: '내용을 입력해 주세요', network: '서버에 연결하지 못했어요', server_not_ready: '서버 준비 중이에요', exists: '이미 쓰고 있는 아이디예요', username_taken: '이미 쓰고 있는 아이디예요', bad_username: '아이디는 영문·숫자·밑줄 4~20자로 해 주세요', wrong_login: '아이디나 비밀번호가 맞지 않아요', wrong_password: '비밀번호가 맞지 않아요', bad_login: '아이디나 비밀번호가 맞지 않아요', server_error: '서버에서 문제가 생겼어요', invite_required: '초대 코드가 필요해요', bad_invite: '쓸 수 없는 초대 코드예요', short_password: '비밀번호는 8자 이상으로 해 주세요', long_password: '비밀번호가 너무 길어요', weak_password: '비밀번호는 8자 이상으로 해 주세요', rate_limited: '잠시 후 다시 시도해 주세요' };
  const code = err && (err.code || err.message);
  return m[code] || (typeof code === 'string' && code.length < 40 ? code : '처리하지 못했어요');
};


/* ── 이 브라우저에 저장하는 큰 이미지 (전신 일러스트) ── */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('afterglow', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
AG.illust = {
  async get() {
    const d = await idb();
    return new Promise(res => { const q = d.transaction('files').objectStore('files').get('illust'); q.onsuccess = () => res(q.result ? URL.createObjectURL(q.result) : null); q.onerror = () => res(null); });
  },
  async set(blob) {
    const d = await idb();
    return new Promise((res, rej) => { const t = d.transaction('files', 'readwrite'); blob ? t.objectStore('files').put(blob, 'illust') : t.objectStore('files').delete('illust'); t.oncomplete = res; t.onerror = () => rej(t.error); });
  },
};
/* 정사각형으로 잘라 줄이기 (프로필 사진 320px) */
AG.squareImage = (file, size = 320, max = 190000) => new Promise((res, rej) => {
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onload = () => {
    const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    URL.revokeObjectURL(url);
    for (const q of [.9, .8, .7, .55, .4]) { const d = c.toDataURL('image/webp', q); if (d.length <= max && d.startsWith('data:image/webp')) return res(d); }
    const j = c.toDataURL('image/jpeg', .7); j.length <= max ? res(j) : rej(new Error('too_long'));
  };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('이미지를 읽지 못했어요')); };
  img.src = url;
});
/* 도트 이미지 → data URL (작게) */
AG.pixelImage = (file, max = 160000) => new Promise((res, rej) => {
  if (file.size > max * 0.74) return rej(new Error('도트 이미지는 120KB 이하로 올려 주세요'));
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file);
});


/* 받침에 맞는 조사: AG.j('붕대', '을', '를') → '붕대를' */
AG.j = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1); const has = c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0; return w + (has ? a : b); };
/* 공격 종류 · 임시 값 (나중에 사용자 설정을 보고 바꿀 자리)
   mult: 일반 공격 대비 피해 배율 · cooldown: 쓴 뒤 다시 쓸 수 있을 때까지의 턴 수 · perBattle: 전투 한 번에 쓸 수 있는 횟수
   서버(worker.js SKILL_RULES)에도 같은 값이 있어요. 바꿀 때는 두 곳을 같이 바꿔 주세요. */
AG.SKILL_RULES = {
  normal: { label: '일반 공격', mult: 1 },
  special: { label: '특수 공격', mult: 1.5, cooldown: 2 },
  ultimate: { label: '필살기', mult: 2.5, perBattle: 1 },
};
/* 지금 쓸 수 있는지: { ok, why } */
AG.skillState = (b, kind, skills) => {
  const R = AG.SKILL_RULES[kind]; const sk = skills && skills[kind];
  if (kind !== 'normal' && !(sk && sk.name)) return { ok: false, why: '아직 정하지 않았어요 · 설정에서 정해 주세요' };
  const c = (b && b.cool) || {};
  if (R.cooldown && c[kind] && b.turn < c[kind]) return { ok: false, why: `${c[kind] - b.turn}턴 뒤에 다시 쓸 수 있어요` };
  if (R.perBattle && (c[kind + 'Used'] || 0) >= R.perBattle) return { ok: false, why: '이번 전투에서 이미 썼어요' };
  return { ok: true, why: '' };
};
/* 전투 중에 쓸 수 있는 아이템인지: 설명에 전투 효과가 적혀 있으면 쓸 수 있다 (쓰면 사라짐) */
AG.battleUse = it => {
  const d = String((it && it.desc) || ''); let m;
  if ((m = d.match(/체력을?\s*(\d+)\s*회복/))) return { heal: +m[1], label: `체력 ${m[1]} 회복` };
  if ((m = d.match(/잔향\s*\+(\d+)\s*\(전투 1회\)/))) return { echo: 1, label: '잔향 사용 +1' };
  return null;
};

/* 200자 미리보기 (공백 포함) */
AG.preview = (text, n = 200) => {
  const a = Array.from(text);
  return a.length > n ? { text: a.slice(0, n).join(''), cut: true } : { text, cut: false };
};

/* ─────────────────────────────────────────────
   데이터
   ───────────────────────────────────────────── */
const token = () => LS.get(TOKEN_KEY);
AG.mode = token() ? 'server' : 'demo';
/* 로그인 안 했으면 커버로 (실제 사이트) · 미리보기에서는 커버의 '체험 모드'를 고른 경우에만 둘러볼 수 있음 */
AG.toCover = () => location.replace(AG.PAGES.cover);
if (!window.AG_NO_GATE && !token() && (AG.PROD || LS.get('ag-demo') !== '1')) AG.toCover();

async function call(method, path, body) {
  let r;
  try {
    r = await fetch(API + path, {
      method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { const e = new Error('network'); e.code = 'network'; throw e; }
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) {
    if (r.status === 401 && token()) { LS.del(TOKEN_KEY); if (!window.AG_NO_GATE) AG.toCover(); }
    const e = new Error((j && j.error) || 'http_' + r.status); e.code = (j && j.error) || (r.status === 401 ? 'unauthorized' : 'http_' + r.status); throw e;
  }
  return j;
}
AG.call = call;

/* 서버 모드 */
const S = {
  async me() {
    const j = await call('GET', '/me');
    const c = j.characters.find(x => x.id === j.user.activeCharacterId) || j.characters[0] || null;
    return { id: j.user.id, username: j.user.username, character: c, name: c ? c.name : j.user.username, avatar: c && c.avatar, lines: j.profile?.lines || [], raw: j };
  },
  users: () => call('GET', '/users'),
  channels: {
    list: () => call('GET', '/channels'),
    create: name => call('POST', '/channels', { name }),
    messages: (id, after) => call('GET', `/channels/${id}/messages${after ? '?after=' + after : ''}`),
    send: (id, text) => call('POST', `/channels/${id}/messages`, { text }),
  },
  msg: { edit: (id, text) => call('PUT', `/messages/${id}`, { text }), del: id => call('DELETE', `/messages/${id}`) },
  talks: {
    list: () => call('GET', '/talks'),
    create: (partnerId, title) => call('POST', '/talks', { partnerId, title }),
    rename: (id, title) => call('PUT', `/talks/${id}`, { title }),
    leave: id => call('DELETE', `/talks/${id}`),
    messages: (id, after) => call('GET', `/talks/${id}/messages${after ? '?after=' + after : ''}`),
    send: (id, text) => call('POST', `/talks/${id}/messages`, { text }),
  },
  dms: {
    list: () => call('GET', '/dms'),
    messages: (uid, after) => call('GET', `/dms/${uid}/messages${after ? '?after=' + after : ''}`),
    send: (uid, text) => call('POST', `/dms/${uid}/messages`, { text }),
    read: uid => call('POST', `/dms/${uid}/read`, {}),
  },
  stats: uid => call('GET', '/stats' + (uid ? '?user=' + uid : '')),
  inventory: {
    list: () => call('GET', '/inventory'),
    equip: id => call('POST', `/inventory/${id}/equip`, {}),
    place: id => call('POST', `/inventory/${id}/place`, {}),
    discard: id => call('DELETE', `/inventory/${id}`),
    use: id => call('POST', `/inventory/${id}/use`, {}),
  },
  home: { get: () => call('GET', '/home'), save: layout => call('PUT', '/home', { layout }) },
  lines: { save: lines => call('PUT', '/me/lines', { lines }) },
  character: {
    save: async patch => {
      const me = await S.me(); const c = me.character;
      if (!c) {
        // 아직 캐릭터가 없으면 기본값으로 하나 만든다 (나중에 자세히 수정)
        const data = { name: me.username, origin: 'TB-03', species: 'human', G: 4, C: 3, T: 1, echoType: '없음', ...patch };
        delete data.avatar;
        return call('POST', '/characters', { data, ...('avatar' in patch ? { avatar: patch.avatar } : {}) });
      }
      const body = { data: { ...c.data, ...patch } };
      if ('avatar' in patch) { body.avatar = patch.avatar; delete body.data.avatar; }
      return call('PUT', `/characters/${c.id}`, body);
    },
  },
  account: {
    password: (current, next) => call('POST', '/me/password', { password: current, newPassword: next }),
    logout: async () => { try { await call('POST', '/auth/logout', {}); } catch {} LS.del(TOKEN_KEY); LS.del('ag-demo'); },
    remove: password => call('DELETE', '/me', { password }),
  },
  battle: {
    state: () => call('GET', '/battle'),
    start: () => call('POST', '/battle/start', {}),
    turn: (action, text, itemId, skill) => call('POST', '/battle/turn', { action, text, itemId, skill }),
  },
  posts: {
    list: before => call('GET', '/posts' + (before ? '?before=' + before : '')),
    create: text => call('POST', '/posts', { text }),
    edit: (id, text) => call('PUT', `/posts/${id}`, { text }),
    del: id => call('DELETE', `/posts/${id}`),
    comments: id => call('GET', `/posts/${id}/comments`),
    comment: (id, text, parentId) => call('POST', `/posts/${id}/comments`, { text, parentId }),
    editComment: (cid, text) => call('PUT', `/comments/${cid}`, { text }),
    delComment: cid => call('DELETE', `/comments/${cid}`),
  },
};

/* 체험 모드: 피그마 예시 내용으로 시작해서 이 브라우저(localStorage)에만 저장 */
const H = 3600e3, now0 = Date.now();
function seed() {
  const t = (h, m = 0) => now0 - h * H - m * 60e3;
  const U = {
    me: { id: 'me', name: '캐릭터 이름', sub: 'TB-03 · 순수 인간', job: '배급소 기록원', faction: 'TB-03 배급소', online: true },
    leon: { id: 'leon', name: '레온', sub: 'TB-07 · 레이터 · 경계 순찰대', job: '경계 순찰대', faction: 'TB-07 경계 순찰대', online: true },
    ciel: { id: 'ciel', name: '시엘', sub: 'TB-03 · 순수 인간', job: '배급소 기록원', faction: 'TB-03 배급소', online: true },
    hayun: { id: 'hayun', name: '하윤', sub: 'TB-05 · 혼혈', job: '수집가', faction: '자유 수집단', online: true },
    ian: { id: 'ian', name: '이안', sub: 'SEIR · 언섹션', job: '—', faction: '—', online: false },
  };
  let n = 0; const id = p => p + (++n);
  const msg = (uid, text, at) => ({ id: id('m'), userId: uid, text, at, editedAt: null, deleted: false });
  return {
    v: 2, users: U,
    channels: [
      { id: 'c1', name: '잔광 광장', members: 24, msgs: [
        msg('leon', '오늘 충돌구 근처 다녀온 사람? 잔향이 평소보다 세게 울리던데', t(1, 20)),
        msg('ciel', '나 방금 왔어. 경계선 표지가 두 개 쓰러져 있더라', t(1, 19)),
        msg('me', '내일 아침에 같이 확인하러 갈 사람 구해', t(1, 17)),
        msg('hayun', '전투 파티 채널에 올려 둘게. 3인이면 충분할 듯', t(1, 16)) ] },
      { id: 'c2', name: 'TB-03 주민 모임', members: 9, msgs: [msg('ciel', '배급 시간 바뀐 거 알아?', t(3))] },
      { id: 'c3', name: '전투 파티 모집', members: 14, msgs: [msg('hayun', '3인 파티 한 자리 남음', t(5))] },
      { id: 'c4', name: '잡담', members: 31, msgs: [msg('ian', 'ㅋㅋㅋㅋ', t(6))] },
    ],
    talks: [
      { id: 't1', partner: 'leon', title: '충돌구 조사 건', createdAt: t(24 * 40), msgs: [
        msg('leon', '경계선 표지 쓰러진 거, 바람 때문은 아닌 것 같아.\n부러진 단면이 너무 깔끔했어', t(2, 30)),
        msg('leon', '누가 일부러 그런 거면 경계 순찰대에도 알려야 해', t(2, 29)),
        msg('me', '그럼 누가 일부러 쓰러뜨렸다는 거야?', t(2, 28)),
        msg('leon', '내일 아침 7시에 남쪽 게이트. 장비 챙겨 와', t(2, 27)) ] },
      { id: 't2', partner: 'leon', title: '그냥 수다', createdAt: t(24 * 10), msgs: [msg('leon', 'ㅋㅋ 그거 진짜야?', t(20))] },
      { id: 't3', partner: 'ciel', title: 'TB-03 배급 일정', createdAt: t(24 * 5), msgs: [msg('ciel', '이번 주는 목요일로 바뀜', t(30))] },
      { id: 't4', partner: 'hayun', title: '파티 정리', createdAt: t(24 * 2), msgs: [msg('hayun', '전리품 나눈 거 확인해 줘', t(40))] },
    ],
    dms: {
      ciel: { unread: 2, msgs: [
        msg('ciel', '배급소 앞에서 이상한 사람을 봤어. 명부에 없는 얼굴이었어.\n너한테만 말하는 거야.', t(26)),
        msg('ciel', '확실하진 않은데, 이 근처 사람은 아니었어', t(25, 59)),
        msg('me', '알려 줘서 고마워. 내일 같이 확인해 보자', t(25, 48)),
        msg('ciel', '아침에 다시 갔는데 아무도 없었어.', t(10)) ] },
      leon: { unread: 0, msgs: [msg('leon', '알겠어. 내일 봐', t(28))] },
      hayun: { unread: 1, msgs: [msg('hayun', '전리품 목록 보냈어', t(12))] },
      ian: { unread: 0, msgs: [msg('ian', '…', t(50))] },
    },
    stats: { level: 7, exp: 620, expMax: 1000, hp: 184, hpMax: 240, atk: 42, def: 35, spd: 51, echo: 28, statMax: 80,
      registry: { nameEn: '', ageGender: '', origin: 'TB-03 · 3구역', species: '순수 인간', lineage: '', job: '배급소 기록원' },
      G: 4, Gmax: 5, C: 3, Cmax: 5, T: 2, Tmax: 4,
      echoInfo: { type: '감응형', desc: '감응형 — 주변 잔향의 흐름을 읽고 짧게 앞날을 본다. 전투에서 회피와 선제 행동에 보너스.' },
      equipment: { weapon: null, armor: null, acc1: null, acc2: null } },
    inventory: [
      { id: 'i1', name: '녹슨 갈고리', rarity: 'RARE', kind: '무기', source: '전리품', desc: '변이 수집자에게서 얻었다. 끝이 무뎌졌지만 아직 쓸 만하다.\n공격 +6 · 민첩 -2', slot: 'weapon' },
      { id: 'i2', name: '잔광 결정', rarity: 'EPIC', kind: '재료', source: '전리품', desc: '희미하게 빛나는 결정. 잔향 출력을 잠깐 끌어올린다.\n잔향 +8 (전투 1회)' },
      { id: 'i3', name: '배급 쿠폰', rarity: 'COMMON', kind: '소모품', source: '전리품', desc: 'TB-03 배급소에서 쓸 수 있는 쿠폰.' },
      { id: 'i4', name: '수집자 가면', rarity: 'RARE', kind: '방어구', source: '전리품', desc: '변이 수집자가 쓰던 가면. 숨이 조금 답답하다.\n방어 +5', slot: 'armor' },
      { id: 'i5', name: '방수포', rarity: 'COMMON', kind: '꾸미기', source: '숙소 꾸미기', desc: '숙소 바닥에 깔 수 있는 방수포.', deco: true },
      { id: 'i6', name: '붕대', rarity: 'COMMON', kind: '소모품', source: '전리품', desc: '전투 중 체력을 30 회복한다.' },
      { id: 'i7', name: '경계 표지 조각', rarity: 'RARE', kind: '꾸미기', source: '숙소 꾸미기', desc: '쓰러진 경계 표지에서 떼어 온 조각. 숙소에 세워 둘 수 있다.', deco: true },
      { id: 'i8', name: '깨진 단말', rarity: 'COMMON', kind: '꾸미기', source: '숙소 꾸미기', desc: '화면이 갈라진 오래된 단말.', deco: true },
      { id: 'i9', name: '회색 잔향 병', rarity: 'EPIC', kind: '장신구', source: '전리품', desc: '회색 잔광을 담아 둔 작은 병.\n잔향 +4', slot: 'acc' },
    ],
    home: { items: [], sprite: null, spriteName: null, pos: { x: 17, y: 15 } },
    battle: null,
    posts: [
      { id: 'p1', userId: 'leon', at: t(3), editedAt: null, text: '오늘 남쪽 경계선 순찰 끝. 표지가 두 개나 쓰러져 있었는데 바람 때문은 아닌 것 같다. 단면이 칼로 자른 것처럼 깔끔했고, 주변 흙에 낯선 발자국이 남아 있었다. 크기를 보면 성인 남자, 걸음 폭이 좁고 오른발을 조금 끈다. 혹시 최근에 다리를 다친 외부인을 본 사람이 있으면 알려 줘. TB-07 순찰대는 내일부터 순찰 간격을 두 배로 늘리기로 했다. 밤에는 되도록 경계선 근처에 가지 마. 특히 충돌구 쪽은 잔향이 평소보다 세게 울리고 있어서, 감응형은 두통이 올 수도 있다고 하더라. 무리하지 말고, 이상한 거 보면 바로 단체 단말에 올려 줘.',
        comments: [
          { id: 'k1', parentId: null, userId: 'ciel', at: t(2, 40), text: '배급소 앞에서 본 사람이랑 같은 사람일지도 몰라. 오른쪽 다리 끌던 거 맞아.', editedAt: null },
          { id: 'k2', parentId: 'k1', userId: 'leon', at: t(2, 30), text: '언제 봤어? DM으로 자세히 알려 줘.', editedAt: null },
          { id: 'k3', parentId: null, userId: 'hayun', at: t(2), text: '내일 순찰 같이 갈게.', editedAt: null } ] },
      { id: 'p2', userId: 'ciel', at: t(8), editedAt: null, text: '이번 주 배급은 목요일로 바뀌었어요. 줄이 길어질 테니 일찍 와 주세요.', comments: [] },
      { id: 'p3', userId: 'hayun', at: t(20), editedAt: null, text: '전투 파티 3인 구해요. 변이 수집자 잡으러 갈 거고 전리품은 똑같이 나눠요. 잔향 등급 2 이상이면 좋겠어요.', comments: [
          { id: 'k4', parentId: null, userId: 'ian', at: t(19), text: '…', editedAt: null } ] },
    ],
    lines: [],
    character: null,
  };
}
let D = null;
function db() {
  if (D) return D;
  try { D = JSON.parse(LS.get(DEMO_KEY)); } catch {}
  if (!D || D.v !== 2) D = seed();
  return D;
}
const save = () => LS.set(DEMO_KEY, JSON.stringify(D));
const rid = p => p + Math.random().toString(36).slice(2, 9);
const wait = (v, ms = 60) => new Promise(r => setTimeout(() => r(typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v))), ms));
const fail = code => { const e = new Error(code); e.code = code; return Promise.reject(e); };
const nm = uid => (db().users[uid] || { name: '알 수 없음' }).name;
const outMsg = m => ({ ...m, name: m.userId === 'me' ? meName() : nm(m.userId), mine: m.userId === 'me' });
const meName = () => (db().character && db().character.name) || db().users.me.name;
function findMsg(id) {
  const d = db();
  for (const c of d.channels) { const m = c.msgs.find(x => x.id === id); if (m) return { m, list: c.msgs, scope: 'ch' }; }
  for (const t of d.talks) { const m = t.msgs.find(x => x.id === id); if (m) return { m, list: t.msgs, scope: 'talk' }; }
  for (const k in d.dms) { const m = d.dms[k].msgs.find(x => x.id === id); if (m) return { m, list: d.dms[k].msgs, scope: 'dm' }; }
  return null;
}
const lastOf = list => { const l = [...list].reverse().find(m => !m.deleted); return l ? { name: l.userId === 'me' ? meName() : nm(l.userId), text: l.text, at: l.at } : null; };

const Dm = {
  async me() {
    const d = db(); const c = d.character || {};
    return { id: 'me', username: LS.get('ag-demo-username') || 'afterglow_user', name: meName(), avatar: c.avatar || null,
      character: { data: { name: meName(), origin: c.origin || 'TB-03', species: c.species || 'human', ...c } }, lines: d.lines.slice(), demo: true };
  },
  users: () => wait(Object.values(db().users).filter(u => u.id !== 'me').map(u => ({ ...u }))),
  channels: {
    list: () => wait(db().channels.map(c => ({ id: c.id, name: c.name, members: c.members, last: lastOf(c.msgs) }))),
    create: name => { const c = { id: rid('c'), name, members: 1, msgs: [] }; db().channels.push(c); save(); return wait({ id: c.id, name, members: 1, last: null }); },
    messages: id => { const c = db().channels.find(x => x.id === id); return c ? wait(c.msgs.map(outMsg)) : fail('not_found'); },
    send: (id, text) => { const c = db().channels.find(x => x.id === id); const m = { id: rid('m'), userId: 'me', text, at: Date.now(), editedAt: null, deleted: false }; c.msgs.push(m); save(); return wait(outMsg(m)); },
  },
  msg: {
    edit: (id, text) => { const f = findMsg(id); if (!f) return fail('not_found'); if (f.m.userId !== 'me') return fail('forbidden'); f.m.text = text; f.m.editedAt = Date.now(); save(); return wait(outMsg(f.m)); },
    del: id => {
      const f = findMsg(id); if (!f) return fail('not_found'); if (f.m.userId !== 'me') return fail('forbidden');
      if (f.scope === 'ch') { f.m.deleted = true; f.m.text = ''; f.m.deletedAt = Date.now(); }
      else f.list.splice(f.list.indexOf(f.m), 1);
      save(); return wait({ ok: true, scope: f.scope });
    },
  },
  talks: {
    list: () => wait(db().talks.map(t => ({ id: t.id, title: t.title, partner: { ...db().users[t.partner] }, createdAt: t.createdAt, count: t.msgs.length, last: lastOf(t.msgs) }))),
    create: (partnerId, title) => { const t = { id: rid('t'), partner: partnerId, title, createdAt: Date.now(), msgs: [] }; db().talks.unshift(t); save(); return wait({ id: t.id }); },
    rename: (id, title) => { const t = db().talks.find(x => x.id === id); t.title = title; save(); return wait({ ok: true }); },
    leave: id => { const d = db(); d.talks = d.talks.filter(x => x.id !== id); save(); return wait({ ok: true }); },
    messages: id => { const t = db().talks.find(x => x.id === id); return t ? wait(t.msgs.map(outMsg)) : fail('not_found'); },
    send: (id, text) => { const t = db().talks.find(x => x.id === id); const m = { id: rid('m'), userId: 'me', text, at: Date.now(), editedAt: null }; t.msgs.push(m); save(); return wait(outMsg(m)); },
  },
  dms: {
    list: () => { const d = db(); return wait(Object.entries(d.dms).map(([uid, x]) => ({ partner: { ...d.users[uid] }, unread: x.unread, last: lastOf(x.msgs), count: x.msgs.length })).sort((a, b) => (b.last?.at || 0) - (a.last?.at || 0))); },
    messages: uid => { const d = db(); if (!d.dms[uid]) d.dms[uid] = { unread: 0, msgs: [] }; return wait(d.dms[uid].msgs.map(outMsg)); },
    send: (uid, text) => { const d = db(); if (!d.dms[uid]) d.dms[uid] = { unread: 0, msgs: [] }; const m = { id: rid('m'), userId: 'me', text, at: Date.now(), editedAt: null }; d.dms[uid].msgs.push(m); save(); return wait(outMsg(m)); },
    read: uid => { const d = db(); if (d.dms[uid]) { d.dms[uid].unread = 0; save(); } return wait({ ok: true }); },
  },
  stats: () => { const d = db(); const s = d.stats; const c = d.character || {};
    if (s.echoLeft == null) s.echoLeft = 2;
    const r = { ...s, echoMax: 2, taintTier: demoTier(), name: meName(), registry: { ...s.registry, ...(c.origin ? { origin: c.origin } : {}), ...(c.species ? { species: AG.SPECIES[c.species] || c.species } : {}) },
      equipment: Object.fromEntries(Object.entries(s.equipment).map(([k, v]) => [k, v && d.inventory.find(i => i.id === v)?.name || null])), skills: demoSkills() };
    return wait(r); },
  inventory: {
    list: () => { const d = db(); return wait(d.inventory.map(i => ({ ...i, equipped: Object.values(d.stats.equipment).includes(i.id), placed: d.home.items.some(h => h.invId === i.id) }))); },
    equip: id => { const d = db(); const it = d.inventory.find(i => i.id === id); if (!it?.slot) return fail('장착할 수 없는 아이템이에요');
      const eq = d.stats.equipment; let slot = it.slot === 'acc' ? (eq.acc1 === id || eq.acc2 === id ? null : (!eq.acc1 ? 'acc1' : 'acc2')) : it.slot;
      if (Object.values(eq).includes(id)) { for (const k in eq) if (eq[k] === id) eq[k] = null; save(); return wait({ equipped: false }); }
      eq[slot] = id; save(); return wait({ equipped: true }); },
    place: id => { const d = db(); const it = d.inventory.find(i => i.id === id); if (!it?.deco) return fail('숙소에 놓을 수 없는 아이템이에요');
      if (d.home.items.some(h => h.invId === id)) return fail('이미 숙소에 있어요');
      d.home.items.push({ id: rid('h'), invId: id, name: it.name, x: 4 + d.home.items.length * 5, y: 12, w: 3, h: 3, img: it.img || null }); save(); return wait({ ok: true }); },
    use: id => { const d = db(); const s = d.stats; const it = d.inventory.find(i => i.id === id); const eff = AG.battleUse(it);
      if (!it || !eff) return fail('쓸 수 있는 아이템이 아니에요');
      if (eff.heal && s.hp >= s.hpMax) return fail('체력이 이미 가득해요');
      d.inventory = d.inventory.filter(i => i !== it);
      if (eff.heal) s.hp = Math.min(s.hpMax, s.hp + eff.heal);
      if (eff.echo) s.echoLeft = Math.min(9, (s.echoLeft ?? 2) + eff.echo);
      if (d.battle && !d.battle.over) { d.battle.me.hp = s.hp; d.battle.me.echo = s.echoLeft; d.battle.me.taint = demoTier(); }
      save(); return wait({ ok: true, label: eff.label }); },
    discard: id => { const d = db(); d.inventory = d.inventory.filter(i => i.id !== id); d.home.items = d.home.items.filter(h => h.invId !== id); for (const k in d.stats.equipment) if (d.stats.equipment[k] === id) d.stats.equipment[k] = null; save(); return wait({ ok: true }); },
  },
  home: { get: () => wait({ ...db().home, name: meName() }), save: layout => { db().home = { ...db().home, ...layout }; save(); return wait({ ok: true }); } },
  lines: { save: lines => { db().lines = lines; save(); return wait({ ok: true }); } },
  character: { save: patch => { const d = db(); d.character = { ...(d.character || {}), ...patch }; save(); return wait({ ok: true }); } },
  account: {
    password: () => fail('체험 모드에서는 바꿀 수 없어요'),
    logout: async () => {},
    remove: () => fail('체험 모드에서는 지울 계정이 없어요'),
  },
  battle: {
    state: () => wait(db().battle),
    start: () => { const d = db(); if (d.stats.hp <= 0) return fail('체력이 없어요. 창고에서 회복 아이템을 쓰고 다시 나가요'); d.battle = newBattle(); save(); return wait(d.battle); },
    turn: (action, text, itemId, skill) => {
      const d = db(); if (!d.battle || d.battle.over) { if (d.stats.hp <= 0) return fail('체력이 없어요. 창고에서 회복 아이템을 쓰고 다시 나가요'); d.battle = newBattle(); }
      let used = null;
      if (action === 'attack') {
        skill = AG.SKILL_RULES[skill] ? skill : 'normal';
        const st = AG.skillState(d.battle, skill, demoSkills());
        if (!st.ok) return fail(st.why);
      }
      if (action === 'item') {
        const it = d.inventory.find(i => i.id === itemId); const eff = AG.battleUse(it);
        if (!it || !eff) return fail('이 아이템은 전투에서 쓸 수 없어요');
        d.inventory = d.inventory.filter(i => i !== it); used = { name: it.name, ...eff };
      }
      const echoBefore = d.battle.me.echo;
      const out = demoTurn(d.battle, d.stats, action, text, used, skill); if (out.loot) d.inventory.push(out.loot);
      // 체력 · 잔향 · 오염도는 전투가 끝나도 그대로 남는다
      const S = d.stats, M = d.battle.me;
      S.hp = M.hp; S.echoLeft = M.echo;
      M.taint = demoTier();
      save(); return wait(d.battle, 700); },
  },
  posts: {
    list: () => { const d = db(); return wait(d.posts.slice().sort((a, b) => b.at - a.at).map(p => ({ id: p.id, userId: p.userId, name: p.userId === 'me' ? meName() : nm(p.userId), sub: (d.users[p.userId] || {}).sub || '', text: p.text, at: p.at, editedAt: p.editedAt, comments: p.comments.length, mine: p.userId === 'me', avatar: p.userId === 'me' ? (d.character && d.character.avatar) || null : null }))); },
    create: text => { const p = { id: rid('p'), userId: 'me', at: Date.now(), editedAt: null, text, comments: [] }; db().posts.unshift(p); save(); return wait({ id: p.id }); },
    edit: (id, text) => { const p = db().posts.find(x => x.id === id); if (!p) return fail('not_found'); if (p.userId !== 'me') return fail('forbidden'); p.text = text; p.editedAt = Date.now(); save(); return wait({ ok: true }); },
    del: id => { const d = db(); const p = d.posts.find(x => x.id === id); if (!p) return fail('not_found'); if (p.userId !== 'me') return fail('forbidden'); d.posts = d.posts.filter(x => x !== p); save(); return wait({ ok: true }); },
    comments: id => { const p = db().posts.find(x => x.id === id); return p ? wait(p.comments.map(c => ({ ...c, name: c.userId === 'me' ? meName() : nm(c.userId), mine: c.userId === 'me' }))) : fail('not_found'); },
    comment: (id, text, parentId) => { const p = db().posts.find(x => x.id === id); const c = { id: rid('k'), parentId: parentId || null, userId: 'me', at: Date.now(), text, editedAt: null }; p.comments.push(c); save(); return wait({ id: c.id }); },
    editComment: (cid, text) => { for (const p of db().posts) { const c = p.comments.find(x => x.id === cid); if (c) { if (c.userId !== 'me') return fail('forbidden'); c.text = text; c.editedAt = Date.now(); save(); return wait({ ok: true }); } } return fail('not_found'); },
    delComment: cid => { for (const p of db().posts) { const c = p.comments.find(x => x.id === cid); if (c) { if (c.userId !== 'me') return fail('forbidden'); p.comments = p.comments.filter(x => x.id !== cid && x.parentId !== cid); save(); return wait({ ok: true }); } } return fail('not_found'); },
  },
};

/* 체험 모드 전투: 스탯으로 굴리는 간단한 판정 (서버 모드에서는 Claude가 판정) */
const ENEMIES = [
  { name: '변이 수집자', hp: 160, atk: 30, def: 18, spd: 34, state: '경계 상태', loot: [{ name: '녹슨 갈고리', rarity: 'RARE', kind: '무기', slot: 'weapon', desc: '변이 수집자에게서 얻었다. 끝이 무뎌졌지만 아직 쓸 만하다.\n공격 +6 · 민첩 -2' }, { name: '잔광 결정', rarity: 'EPIC', kind: '재료', desc: '희미하게 빛나는 결정.' }] },
  { name: '잔향 들개', hp: 110, atk: 26, def: 12, spd: 48, state: '굶주림', loot: [{ name: '들개 이빨 목걸이', rarity: 'COMMON', kind: '장신구', slot: 'acc', desc: '민첩 +2' }, { name: '붕대', rarity: 'COMMON', kind: '소모품', desc: '전투 중 체력을 30 회복한다.' }] },
  { name: '무너진 감시 드론', hp: 140, atk: 34, def: 26, spd: 20, state: '오작동', loot: [{ name: '깨진 단말', rarity: 'COMMON', kind: '꾸미기', deco: true, desc: '화면이 갈라진 오래된 단말.' }] },
];
const demoTier = () => { const d = db(); const t = (d.character && d.character.T) ?? d.stats.T; return 'T' + (t ?? 0); };   // 오염도 = 캐릭터의 LCS 지수(T)
function newBattle() {
  const e = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
  const s = db().stats;
  return { id: rid('b'), turn: 1, over: false, result: null, me: { name: meName(), hp: s.hp, hpMax: s.hpMax, echo: s.echoLeft ?? 2, taint: demoTier() },
    enemy: { name: e.name, hp: e.hp, hpMax: e.hp, atk: e.atk, def: e.def, spd: e.spd, state: e.state, lootTable: e.loot },
    log: [{ kind: 'urim', text: `${e.name}이(가) 나타났어요. 행동을 고르거나 직접 입력해 주세요.` }] };
}
function demoSkills() {
  const c = db().character || {};
  return { normal: { name: c.attackNormalName || '', desc: c.attackNormal || '' }, special: { name: c.attackSpecialName || '', desc: c.attackSpecial || '' }, ultimate: { name: c.attackUltimateName || '', desc: c.attackUltimate || '' } };
}
function demoTurn(b, s, action, text, used, skill) {
  const r = (a, z) => a + Math.floor(Math.random() * (z - a + 1));
  const E = b.enemy, M = b.me; const T = `TURN ${String(b.turn).padStart(2, '0')}`;
  let dmg = 0, taken = 0, line = '';
  const act = action || 'custom';
  if (act === 'run') {
    if (Math.random() < 0.35 + s.spd / 300) { b.over = true; b.result = 'run'; b.log.push({ kind: 'turn', label: T, text: `몸을 낮추고 무너진 배급대 사이로 빠져나갔다. ${E.name}이(가) 쫓아오지 못했다.` }); b.log.push({ kind: 'urim', text: '무사히 빠져나왔어요. 다음에 다시 도전해요.' }); return {}; }
    line = '도망치려 했지만 길이 막혔다.';
  } else if (act === 'item') {
    if (used && used.heal) { const before = M.hp; M.hp = Math.min(M.hpMax, M.hp + used.heal); line = `${AG.j(used.name, '을', '를')} 썼다 — 체력 ${M.hp - before} 회복.`; }
    else if (used && used.echo) { M.echo += used.echo; line = `${AG.j(used.name, '이', '가')} 희미하게 빛났다. 잔향이 다시 차오른다 — 잔향 사용 +${used.echo}.`; }
    else line = '아이템을 꺼내려다 멈췄다.';
  } else if (act === 'guard') {
    line = '자세를 낮추고 다음 공격에 대비했다.';
  } else {
    const kind = act === 'attack' ? (skill || 'normal') : null;
    const R = kind && AG.SKILL_RULES[kind];
    const base = act === 'echo' ? s.echo * 1.4 + 6 : act === 'custom' ? s.atk * 0.9 : s.atk * 0.8 * (R ? R.mult : 1);
    if (kind && kind !== 'normal') {
      b.cool = b.cool || {};
      if (R.cooldown) b.cool[kind] = b.turn + R.cooldown + 1;
      if (R.perBattle) b.cool[kind + 'Used'] = (b.cool[kind + 'Used'] || 0) + 1;
    }
    dmg = Math.max(3, Math.round(base - E.def * 0.35 + r(-4, 8)));
    if (act === 'echo' && M.echo <= 0) { dmg = 0; line = '잔향을 끌어올리려 했지만 아무것도 울리지 않았다.'; }
    else {
      if (act === 'echo') M.echo -= 1;
      E.hp = Math.max(0, E.hp - dmg);
      line = act === 'echo' ? `감응형 잔향이 먼저 울렸다. 빈틈을 읽고 그대로 파고들었다 — 피해 ${dmg}.`
        : act === 'custom' ? `${text} — 피해 ${dmg}.`
        : kind && kind !== 'normal' ? `「${demoSkills()[kind].name}」${kind === 'ultimate' ? '! 모든 걸 실어' : ''} ${E.name}에게 꽂았다 — 피해 ${dmg}.`
        : `${E.name}의 빈틈을 노려 칼날을 꽂았다 — 피해 ${dmg}.`;
    }
  }
  b.log.push({ kind: 'turn', label: T, text: line });
  if (E.hp <= 0) {
    b.over = true; b.result = 'win';
    const l = E.lootTable[Math.floor(Math.random() * E.lootTable.length)];
    const loot = { id: rid('i'), ...l, source: '전리품' };
    b.log.push({ kind: 'urim', text: `${E.name}을(를) 쓰러뜨렸어요. 전리품 「${loot.name}」을(를) 창고에 넣었어요.` });
    s.exp += 120; if (s.exp >= s.expMax) { s.exp -= s.expMax; s.level += 1; b.log.push({ kind: 'urim', text: `레벨이 ${s.level}(으)로 올랐어요.` }); }
    return { loot };
  }
  taken = Math.max(2, Math.round(E.atk * (act === 'guard' ? 0.35 : 0.8) - s.def * 0.3 + r(-4, 6)));
  if (Math.random() < s.spd / 400 + (s.echo / 400)) { b.log.push({ kind: 'turn', label: T, text: `${E.name}이(가) 반격했지만 반 박자 빠르게 몸을 틀었다 — 피해 없음.` }); }
  else { M.hp = Math.max(0, M.hp - taken); b.log.push({ kind: 'turn', label: T, text: `${E.name}이(가) 반격했다 — 피해 ${taken}.` }); }
  if (M.hp <= 0) { b.over = true; b.result = 'lose'; b.log.push({ kind: 'urim', text: '쓰러졌어요. 숙소로 옮겨 놓을게요. 체력을 회복하고 다시 나가요.' }); return {}; }
  if (E.hp < E.hpMax * 0.4) E.state = '비틀거림';
  b.log.push({ kind: 'urim', text: E.hp < E.hpMax * 0.4 ? '상대가 많이 지쳤어요. 한두 번이면 쓰러뜨릴 수 있어요.' : M.hp < M.hpMax * 0.35 ? '체력이 낮아요. 방어하거나 아이템을 써 보세요.' : '상대의 움직임이 느려졌어요. 거리를 벌리면 반격을 피할 수 있어요.' });
  b.turn += 1;
  return {};
}

const impl = AG.mode === 'server' ? S : Dm;
Object.assign(AG, {
  me: () => impl.me(), users: () => impl.users(), channels: impl.channels, msg: impl.msg, talks: impl.talks, dms: impl.dms,
  stats: (...a) => impl.stats(...a), inventory: impl.inventory, home: impl.home, lines: impl.lines, character: impl.character,
  account: impl.account, battle: impl.battle, posts: impl.posts,
});
AG.auth = {
  async login(username, password) { const j = await rawAuth('/auth/login', username, password); LS.set(TOKEN_KEY, j.token); return j; },
  async signup(username, password, invite) { const j = await rawAuth('/auth/signup', username, password, invite); LS.set(TOKEN_KEY, j.token); return j; },
};
async function rawAuth(path, username, password, invite) {
  let r; try { r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password, ...(invite ? { invite } : {}) }) }); }
  catch { const e = new Error('network'); e.code = 'network'; throw e; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'http'); e.code = j.error || 'http_' + r.status; throw e; }
  return j;
}
/* 서버 모드에서만 주기적으로 새 내용을 가져옴 */
AG.poll = (fn, ms = 4000) => { if (AG.mode !== 'server') return () => {}; const h = setInterval(() => { if (!document.hidden) fn(); }, ms); return () => clearInterval(h); };
})();
