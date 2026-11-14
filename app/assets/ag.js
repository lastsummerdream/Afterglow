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
  enter: 'enter.html', story: 'story.html', party: 'party.html',
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

/* ── 모바일(세로) 화면 ──
   폭 720 단위의 세로 캔버스를 쓴다. 가운데 본문은 화면에 맞게 다시 배치하고(ag-m.css),
   좌우 패널은 피그마 모양 그대로 서랍처럼 꺼내 본다. */
AG.M_PAGES = { index: { css: 1 }, main: { css: 1 },
  stats: { start: 1, panes: [{ label: '일러스트', stack: ['left'] }, { label: '명부', stack: ['center', 'bottom'] }, { label: '전투 스탯', stack: ['right'] }] },
  battle: { reserve: 740, panes: [{ label: '전투', stack: ['right', 'left'] }] }, party: { reserve: 740, panes: [{ label: '전투', stack: ['right', 'left'] }] },
  inventory: { jump: ['.cellbtn', 1], panes: [{ label: '목록', stack: [], free: ['center'] }, { label: '상세', stack: ['right'] }] },
  home: { panes: [{ label: '방', stack: ['center', 'bottom'] }, { label: '가구', stack: ['right'] }] },
  settings: { panes: [{ label: '계정', stack: ['left'] }, { label: '캐릭터', stack: ['center', 'bottom'] }, { label: '대사', stack: ['right'] }] },
  timeline: { start: 1, jump: ['.post:not(.story)', 2], panes: [{ label: '글쓰기', stack: ['left'], content: true }, { label: '글', stack: ['center'], fill: true }, { label: '댓글', stack: ['right'] }] },
  enter: { css: 1 }, story: { css: 1 },
  group: { drawers: { left: '채널', right: '접속' }, mid: '대화', fit: ['center'] },
  private: { drawers: { left: '대화 목록', right: '정보' }, mid: '대화', fit: ['center'] },
  dm: { fitTop: 312, drawers: { left: '연락처', right: '프로필' }, mid: '신호', fit: ['center'] } };
AG.page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
AG.M = !!AG.M_PAGES[AG.page] && innerWidth < innerHeight && innerWidth <= 820;
if (AG.M) document.documentElement.classList.add('m', 'm-' + AG.page);
if (AG.M && AG.M_PAGES[AG.page].drawers) document.documentElement.classList.add('m-dr');
{ const w0 = innerWidth; addEventListener('resize', () => { if (Math.abs(innerWidth - w0) > 120) { AG.leaving && AG.leaving(); location.reload(); } }); }   // 화면을 돌리면 배치를 새로
AG.MW = 1030;   // 세로 캔버스의 폭. 항상 화면 폭에 꽉 맞추고(양옆 여백 없음), 높이는 화면 비율만큼 — 위쪽은 위에, 아래쪽은 아래에 붙여 배치한다
AG.fitStage = function (stage) {
  if (!AG.M) {
    const s = Math.min(innerWidth / 2560, innerHeight / 1440);
    AG.scale = s;
    stage.style.transform = `translate(${(innerWidth - 2560 * s) / 2}px, ${(innerHeight - 1440 * s) / 2}px) scale(${s})`;
    return;
  }
  AG.vh0 = Math.max(AG.vh0 || 0, innerHeight);                    // 키보드가 올라와도 배치와 크기는 그대로
  const s = innerWidth / AG.MW; AG.scale = s; AG.mh = Math.max(1500, AG.vh0 / s);
  document.documentElement.style.setProperty('--mh', AG.mh + 'px'); document.documentElement.style.setProperty('--mhn', AG.mh);
  let y = 0;
  const vv = window.visualViewport;
  const kb = !!(vv && vv.height < AG.vh0 - 120);
  if (kb) y = Math.min(0, vv.offsetTop + vv.height - AG.mh * s);   // 키보드가 가리면 아래쪽(입력창)이 보이게 위로 민다
  else if (window.scrollY || (vv && vv.offsetTop)) window.scrollTo(0, 0);   // 키보드가 내려가면 브라우저가 밀어 올린 화면을 제자리로 (올라간 채 굳는 것 방지)
  stage.style.width = AG.MW + 'px'; stage.style.height = AG.mh + 'px';
  stage.style.transform = `translate(0px, ${y}px) scale(${s})`;
  AG.mobileLayout && AG.mobileLayout();
};
if (AG.M) { const st = document.getElementById('stage'); if (st) { AG.fitStage(st); addEventListener('resize', () => AG.fitStage(st)); } }
if (AG.M) {   // 입력을 마치면(키보드가 내려가면) 화면을 원래 자리로 되돌린다
  const back = () => { const st = document.getElementById('stage'); if (!st) return; window.scrollTo(0, 0); AG.fitStage(st); };
  addEventListener('focusout', e => { if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable]')) [60, 300, 700].forEach(t => setTimeout(back, t)); });
  addEventListener('focusin', e => { if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable]')) [250, 600].forEach(t => setTimeout(() => { const st = document.getElementById('stage'); st && AG.fitStage(st); }, t)); });
}
if (AG.M && window.visualViewport) { const f = () => { const st = document.getElementById('stage'); st && AG.fitStage(st); }; visualViewport.addEventListener('resize', f); visualViewport.addEventListener('scroll', f); }
AG.mobileSetup = function () {
  const cfg = AG.M_PAGES[AG.page] || {}, stage = document.getElementById('stage'), root = document.documentElement;
  const sr = stage.getBoundingClientRect(), S = AG.scale;
  // 영역의 실제 크기: 바탕 도형 + 그 위의 글씨·버튼 (화면 밖으로 나간 부분은 뺀다)
  const box = (r, contentOnly, shapeOnly) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (x, y, w, h) => { if (!(w > 0 && h > 0)) return; x = Math.max(0, x); y = Math.max(0, y); const xe = Math.min(2560, x + w), ye = Math.min(1440, y + h); if (xe <= x || ye <= y) return; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, xe); y1 = Math.max(y1, ye); };
    document.querySelectorAll(`#stage .L[data-r="${r}"]`).forEach(L => {
      const svg = L.querySelector(':scope > svg.sh'); if (svg && !contentOnly) { try { const b = svg.getBBox(); add(b.x, b.y, b.width, b.height); } catch {} }
      if (!shapeOnly) [...L.children].forEach(c => { if (c === svg || c.hidden) return; const b = c.getBoundingClientRect(); add((b.left - sr.left) / S, (b.top - sr.top) / S, b.width / S, b.height / S); });
    });
    return x1 > x0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  };
  const regions = [...new Set([...document.querySelectorAll('#stage .L[data-r]')].map(L => L.dataset.r))];
  const src = {}; regions.forEach(r => src[r] = box(r)); AG._boxes = src;
  Object.keys(cfg.drawers || {}).forEach(r => {   // 서랍은 패널 바탕(가장 큰 도형들) 기준으로 맞춘다
    const svg = document.querySelector(`#stage .L[data-r="${r}"]:not([id]) > svg.sh`); if (!svg) return;
    const bs = [...svg.children].filter(c => c.tagName !== 'defs').map(c => { try { return c.getBBox(); } catch { return null; } }).filter(b => b && b.width > 0);
    const mh = Math.max(0, ...bs.map(b => b.height)), big = bs.filter(b => b.height >= mh * .5); if (!big.length) return;
    const x0 = Math.max(0, Math.min(...big.map(b => b.x))), x1 = Math.min(2560, Math.max(...big.map(b => b.x + b.width))), y0 = Math.max(0, Math.min(...big.map(b => b.y))), y1 = Math.min(1440, Math.max(...big.map(b => b.y + b.height)));
    if (x1 > x0 && y1 > y0) src[r] = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  });
  const put = (r, tx, ty, k, shapeOnly) => document.querySelectorAll(`#stage .L[data-r="${r}"]${shapeOnly ? ':not([id])' : ''}`).forEach(L => L.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`);
  (cfg.panes || []).forEach(p => { if (p.content) p.stack.forEach(r => { const b = box(r, true); if (b) src[r] = { x: b.x - 30, y: b.y - 30, width: b.width + 60, height: b.height + 60 }; }); });   // 바탕이 화면 밖까지 뻗은 패널은 내용 크기로 맞춘다
  if (cfg.panes) cfg.panes = cfg.panes.filter(p => p.stack.some(r => src[r]) || (p.free || []).length);   // 이 화면에 없는 영역만 있는 칸은 뺀다
  const TOP = cfg.top || 190, BOT = cfg.panes || cfg.drawers ? 124 : 30;
  AG.mobileLayout = () => {
    if (src.tabs && !cfg.css) { const b = src.tabs, k = Math.min(1, (AG.MW - 80) / b.width); put('tabs', 40 - b.x * k, 204 - b.y * k, k); }
    for (const r of Object.keys(cfg.drawers || {})) {   // 서랍: 패널을 원래 크기로 화면 가운데 위쪽에
      const b = src[r]; if (!b) continue;
      const k = Math.min(1.35, (AG.MW - 40) / b.width, (AG.mh - 170 - 124) / b.height);
      put(r, (AG.MW - b.width * k) / 2 - b.x * k, 170 - b.y * k, k);
    }
    for (const r of cfg.fit || []) {   // 본문 바탕: 모양을 화면 크기에 맞게 늘린다 (내용은 CSS로 배치)
      const svg = document.querySelector(`#stage .L[data-r="${r}"]:not([id]) > svg.sh`); let b; try { b = svg.getBBox(); } catch {} if (!b || !b.width) continue;
      const x = 24, y = cfg.fitTop || 214, w = AG.MW - 48, h = AG.mh - y - 250; root.style.setProperty('--ft', y + 'px');
      document.querySelectorAll(`#stage .L[data-r="${r}"]:not([id])`).forEach(L => L.style.transform = `translate(${x - b.x * w / b.width}px, ${y - b.y * h / b.height}px) scale(${w / b.width}, ${h / b.height})`);
    }
    (cfg.panes || []).forEach(p => {   // 칸: 영역들을 위에서 아래로 쌓고 화면 폭에 맞춘다
      const rs = p.stack.filter(r => src[r]); if (!rs.length) return;
      const gap = p.gap ?? 26, maxK = p.max || 1.3, availH = AG.mh - TOP - BOT - (src.tabs ? 104 : 0) - (cfg.reserve || 0), top0 = TOP + (src.tabs ? 104 : 0);
      let ks = rs.map(r => Math.min(maxK, (AG.MW - 40) / src[r].width));
      const total = () => rs.reduce((a, r, i) => a + src[r].height * ks[i], 0) + gap * (rs.length - 1);
      if (total() > availH) { const f = (availH - gap * (rs.length - 1)) / (total() - gap * (rs.length - 1)); ks = ks.map(k => k * f); }
      let y = top0 + (p.center ? Math.max(0, (availH - total()) / 2) : 0);
      if (p.fill && rs.length === 1) {   // 세로로 화면 끝까지: 바탕은 늘리고 목록은 그만큼 길게
        const r = rs[0], b = src[r], k = ks[0], sy = Math.max(1, availH / (b.height * k)), tx = (AG.MW - b.width * k) / 2 - b.x * k;
        document.querySelectorAll(`#stage .L[data-r="${r}"]`).forEach(L => {
          if (L.id) { L.style.transform = `translate(${tx}px, ${y - b.y * k}px) scale(${k})`;
            L.querySelectorAll('.scroll').forEach(el => { el.dataset.h0 = el.dataset.h0 || el.offsetHeight; el.style.height = (+el.dataset.h0 + (availH - b.height * k) / k) + 'px'; }); }
          else L.style.transform = `translate(${tx}px, ${y - b.y * k * sy}px) scale(${k}, ${k * sy})`;
        });
        root.style.setProperty('--se', (y + availH) + 'px'); return;
      }
      rs.forEach((r, i) => { const b = src[r], k = ks[i]; put(r, (AG.MW - b.width * k) / 2 - b.x * k, y - b.y * k, k); y += b.height * k + gap; });
      root.style.setProperty('--se', y + 'px');   // 쌓은 영역이 끝나는 높이 (그 아래에 CSS로 배치하는 것들이 쓴다)
    });
  };
  const tabs = cfg.panes ? cfg.panes.map((p, i) => [String(i), p.label]) : cfg.drawers ? (() => { const it = Object.entries(cfg.drawers), mid = ['', cfg.mid || '본문']; return it.length > 1 ? [it[0], mid, ...it.slice(1)] : [mid, ...it]; })() : null;
  if (tabs && tabs.length > 1) {
    const nav = document.createElement('nav'); nav.className = 'm-nav';
    nav.innerHTML = tabs.map(([r, l]) => `<button type="button" data-d="${r}">${AG.esc(l)}</button>`).join('');
    stage.append(nav);
    if (cfg.panes) {
      const set = i => { root.setAttribute('data-pane', i); nav.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.d === String(i)));
        cfg.panes.forEach((p, n) => [...p.stack, ...(p.free || [])].forEach(r => document.querySelectorAll(`#stage .L[data-r="${r}"]`).forEach(L => L.classList.toggle('m-off', n !== +i)))); };
      nav.addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(b.dataset.d); });
      AG.mobilePane = set; set(cfg.start || 0);
      if (cfg.jump) stage.addEventListener('click', e => { if (e.target.closest(cfg.jump[0]) && !e.target.closest('.acts, .edit-box, .edit-row, button.more')) setTimeout(() => set(cfg.jump[1]), 120); });   // 고르면 상세 칸으로
    } else {
      const back = document.createElement('div'); back.className = 'm-back'; stage.append(back);
      const set = r => { r ? root.setAttribute('data-drawer', r) : root.removeAttribute('data-drawer'); nav.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.d === (r || ''))); };
      nav.addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(b.dataset.d === root.getAttribute('data-drawer') ? null : b.dataset.d || null); });
      back.addEventListener('click', () => set(null));
      document.querySelectorAll('#stage .L[data-r="left"] .scroll').forEach(el => el.addEventListener('click', e => { if (e.target.closest('button, .row')) setTimeout(() => set(null), 150); }));   // 목록에서 고르면 본문으로
      set(null);
    }
  }
  AG.mobileLayout();
};

AG.boot = function (opts = {}) {
  AG.splitChars();
  AG.stretchSides();
  AG.cropLayers();
  const stage = document.getElementById('stage');
  const fit = () => AG.fitStage(stage);
  if (AG.M) AG.mobileSetup();
  addEventListener('resize', fit); fit();
  const q = s => document.querySelector(s);
  q('[data-action="home"]')?.addEventListener('click', () => { location.href = AG.PAGES.main; });
  q('[data-action="browse"]')?.addEventListener('click', () => AG.browse());
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
  if (AG.mode === 'server' && AG.page !== 'index') {
    const checkAlarms = async () => {
      try {
        const alarms = await AG.story.alarms();
        if (!Array.isArray(alarms) || !alarms.length) return;
        const curStory = AG.page === 'story' ? new URLSearchParams(location.search).get('id') : null;
        let seen = {}; try { seen = JSON.parse(LS.get('ag-seen-alarms') || '{}'); } catch {}
        for (const a of alarms) {
          if (!a || !a.id || seen[a.id] || a.storyId === curStory) continue;
          seen[a.id] = Date.now();
          LS.set('ag-seen-alarms', JSON.stringify(seen));
          AG.storyAlarm(a);
          break;
        }
      } catch {}
    };
    setTimeout(checkAlarms, 1200);
    AG.poll(checkAlarms, 5000);
  }
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

let toastTimer, alarmTimer;
AG.toast = function (msg, ms = 1900) {
  let el = document.getElementById('pageToast');
  if (!el) { el = document.createElement('div'); el.id = 'pageToast'; el.className = 'page-toast'; el.setAttribute('role', 'status'); document.getElementById('stage').appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
};
AG.storyAlarm = function (a, ms = 9000) {
  const stage = document.getElementById('stage'); if (!stage) return;
  let el = document.getElementById('storyAlarm');
  if (!el) { el = document.createElement('div'); el.id = 'storyAlarm'; el.className = 'story-alarm'; el.setAttribute('role', 'alert'); stage.appendChild(el); }
  const label = a.mid ? '중간 합류하기 →' : '참여하기 →';
  const desc = `${a.byName || '누군가'} 님이 「${a.title || '단체 스토리'}」 진행을 ${a.mid ? '이어가고 있어요' : '시작했어요'}`;
  el.innerHTML = `<button type="button" class="sa-go"><span class="sa-badge">단체 스토리</span><span>${AG.esc(desc)}</span><span class="sa-join">${label}</span></button><button type="button" class="sa-close" aria-label="알림 닫기">×</button>`;
  el.querySelector('.sa-go').onclick = () => { location.href = AG.PAGES.story + '?id=' + encodeURIComponent(a.storyId); };
  el.querySelector('.sa-close').onclick = () => { el.classList.remove('show'); clearTimeout(alarmTimer); };
  el.classList.add('show');
  clearTimeout(alarmTimer); alarmTimer = setTimeout(() => el.classList.remove('show'), ms);
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
const idbIllust = {
  async get() {
    const d = await idb();
    return new Promise(res => { const q = d.transaction('files').objectStore('files').get('illust'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
  },
  async set(blob) {
    const d = await idb();
    return new Promise((res, rej) => { const t = d.transaction('files', 'readwrite'); blob ? t.objectStore('files').put(blob, 'illust') : t.objectStore('files').delete('illust'); t.oncomplete = res; t.onerror = () => rej(t.error); });
  },
};
/* 전신 일러스트: 이 브라우저에 두고, 다른 사람이 구경할 수 있게 서버에도 올린다 */
AG.illust = {
  async get() {
    const b = await idbIllust.get().catch(() => null);
    if (b) return URL.createObjectURL(b);
    try { const r = await AG.people.illust('me'); return (r && r.illust) || null; } catch { return null; }   // 다른 기기에서 올린 일러스트
  },
  async set(file) {
    await idbIllust.set(file);
    await impl.illustPut(file ? await AG.fitImage(file) : null);
  },
};
/* 비율을 지키며 줄이기 (투명 배경 유지, 서버에 올릴 수 있는 크기로) */
AG.fitImage = (file, maxW = 1200, maxH = 1600, max = 1500000) => new Promise((res, rej) => {
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    let k = Math.min(1, maxW / img.width, maxH / img.height);
    for (let n = 0; n < 6; n++, k *= .8) {
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      for (const q of [.9, .8, .65]) { const d = c.toDataURL('image/webp', q); if (d.startsWith('data:image/webp') && d.length <= max) return res(d); }
      const png = c.toDataURL('image/png'); if (png.length <= max) return res(png);   // webp를 못 만드는 브라우저
    }
    rej(new Error('too_long'));
  };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad_image')); };
  img.src = url;
});

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
/* 공격 설명 한 줄: 서버가 기술 서술을 읽어 정한 효과(sk.fx)가 있으면 그것을 쓴다 */
AG.skillRule = (kind, sk) => {
  const R = AG.SKILL_RULES[kind], f = (sk && sk.fx) || { mult: R.mult };
  return [`피해 ×${f.mult}`, f.crit > 5 ? `급소 ${f.crit}%` : '', f.sure ? '반드시 명중' : '', f.weaken ? '적 반격 약화' : '', f.echoCost ? `잔향 ${f.echoCost} 소모` : '', f.recoil ? '다음 턴 행동 불가' : '',
    R.cooldown ? `${R.cooldown}턴 쉬어요` : '', R.perBattle ? `전투당 ${R.perBattle}번` : ''].filter(Boolean).join(' · ');
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
/* 최종 전투가 끝난 뒤 30분마다 최대 체력의 75%씩 회복 (최대 체력을 넘을 수 없다) */
AG.HEAL_MS = 30 * 60 * 1000;
AG.HEAL_RATE = 0.75;

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
AG.toCover = () => { AG.leaving(); location.replace(AG.PAGES.cover); };
if (!window.AG_NO_GATE && !token() && (AG.PROD || LS.get('ag-demo') !== '1')) AG.toCover();

/* 자주 묻는 것(/me · /stats · /users · /stories)은 30초 동안 기억해 두고 바로 돌려준다. 화면을 넘길 때마다 서버를 기다리지 않게.
   돌려준 뒤 뒤에서 새로 받아 두고, 무언가를 바꾸는 요청이 나가면 기억을 지운다. */
const CACHEABLE = ['/me', '/stats', '/users', '/stories'], CK = 'ag-c:';
async function call(method, path, body) {
  if (method === 'GET' && CACHEABLE.includes(path)) {
    let hit = null; try { hit = JSON.parse(sessionStorage.getItem(CK + path)); } catch {}
    const fresh = rawCall(method, path).then(j => { try { sessionStorage.setItem(CK + path, JSON.stringify({ t: Date.now(), k: token().slice(-12), j })); } catch {} return j; });
    const due = path === '/stats' && hit && hit.j && hit.j.healAt && Date.now() >= hit.j.healAt;
    if (!due && hit && hit.k === token().slice(-12) && Date.now() - hit.t < 30000) { fresh.catch(() => {}); return hit.j; }
    return fresh;
  }
  if (method !== 'GET') { try { Object.keys(sessionStorage).filter(k => k.startsWith(CK)).forEach(k => sessionStorage.removeItem(k)); } catch {} }
  return rawCall(method, path, body);
}
async function rawCall(method, path, body) {
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
  urim: messages => call('POST', '/urim', { messages }),
  people: { get: id => call('GET', `/people/${id}`), illust: id => call('GET', `/people/${id}/illust`) },
  illustPut: illust => call('PUT', '/me/illust', { illust }),
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
  notify: () => call('GET', '/notify'),
  seen: area => call('POST', '/seen', { area }),
  push: { info: () => call('GET', '/push'), add: sub => call('POST', '/push', { subscription: sub }), remove: sub => call('DELETE', '/push', { subscription: sub }) },
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
  story: {
    list: () => call('GET', '/stories'),
    alarms: () => call('GET', '/story-alarms'),
    open: (id, notify) => call('GET', `/story/${id}${notify ? '?notify=1' : ''}`),
    act: (id, text) => call('POST', `/story/${id}/act`, { text }),
    vote: (id, option) => call('POST', `/story/${id}/vote`, { option }),   // 단체 스토리 분기 투표
    ready: id => call('POST', `/story/${id}/ready`, {}),   // 단체 스토리: 내 몫을 마치고 합류 지점으로
    reset: id => call('POST', `/story/${id}/reset`, {}),
  },
  party: {
    lobby: () => call('GET', '/party'),
    create: () => call('POST', '/party', {}),
    get: id => call('GET', `/party/${id}`),
    join: id => call('POST', `/party/${id}/join`, {}),
    leave: id => call('POST', `/party/${id}/leave`, {}),
    start: id => call('POST', `/party/${id}/start`, {}),
    act: (id, action, text, skill) => call('POST', `/party/${id}/act`, { action, text, skill }),
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
      rep: { score: 24, title: '신뢰받는', who: [{ name: '3구역 배급소', v: 12 }, { name: '기록원', v: 8 }, { name: '회수반', v: -6 }], log: [{ story: '배급소의 빈 상자', deed: '굶주린 아이에게 배급을 나눠 줌', score: 3, who: [{ name: '3구역 배급소', d: 6 }] }] },
      registry: { nameEn: '', ageGender: '', origin: 'TB-03 · 3구역', species: '순수 인간', lineage: '', job: '배급소 기록원' },
      G: 4, Gmax: 5, C: 3, Cmax: 5, T: 2, Tmax: 4,
      echoInfo: { type: '감응형', desc: '감응형 — 주변 잔향의 흐름을 읽고 짧게 앞날을 본다. 전투에서 회피와 선제 행동에 보너스.' },
      equipment: { weapon: null, armor: null, acc1: null, acc2: null } },
    inventory: [
      { id: 'i1', name: '녹슨 갈고리', rarity: 'RARE', kind: '무기', source: '전리품', desc: '변이 수집자에게서 얻었다. 끝이 무뎌졌지만 아직 쓸 만하다.\n공격 +6 · 민첩 -2', slot: 'weapon' },
      { id: 'i2', name: '잔광 결정', rarity: 'EPIC', kind: '재료', source: '전리품', desc: '희미하게 빛나는 결정. 잔향 출력을 잠깐 끌어올린다.\n잔향 +8 (전투 1회)' },
      { id: 'q01', name: '01 회수반 지휘관의 명령서', rarity: 'EPIC', kind: '단서', source: '전리품', desc: "발령처는 '명부 관리청 · 자동 발령'. 서명란은 비어 있다." },
      { id: 'q12', name: '12 THUMMIM의 첫 파형', rarity: 'EPIC', kind: '단서', source: '전리품', desc: '작은 유리병 안에서 심장 박동 같은 빛이 떠 있다.' },
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
function syncDemoHeal(d) {
  const s = d && d.stats;
  if (!s) return;
  if (s.hp >= s.hpMax) { s.hp = s.hpMax; if (s.battleEndAt) { s.battleEndAt = null; save(); } return; }
  if ((d.battle && !d.battle.over) || (d.party && d.party.status === 'battle')) return;
  const now = Date.now();
  if (s.battleEndAt === undefined) { s.battleEndAt = now; save(); }
  if (!s.battleEndAt || now - s.battleEndAt < AG.HEAL_MS) return;
  const steps = Math.floor((now - s.battleEndAt) / AG.HEAL_MS);
  const healAmt = Math.max(1, Math.round(s.hpMax * AG.HEAL_RATE));
  s.hp = Math.min(s.hpMax, s.hp + steps * healAmt);
  s.battleEndAt = s.hp >= s.hpMax ? null : s.battleEndAt + steps * AG.HEAL_MS;
  if (d.battle && d.battle.over && d.battle.me) d.battle.me.hp = s.hp;
  save();
}
function db() {
  if (!D) {
    try { D = JSON.parse(LS.get(DEMO_KEY)); } catch {}
    if (!D || D.v !== 2) D = seed();
  }
  syncDemoHeal(D);
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
  notify: async () => { const d = db(); return { group: true, private: false, dm: Object.values(d.dms).some(x => x.unread > 0), inv: Math.max(0, (Array.isArray(d.inventory) ? d.inventory.length : 0) - 48) }; },
  seen: async () => ({ ok: true }),
  push: { info: async () => ({ key: '', on: false }), add: async () => ({ ok: true }), remove: async () => ({ ok: true }) },
  async me() {
    const d = db(); const c = d.character || {};
    return { id: 'me', username: LS.get('ag-demo-username') || 'afterglow_user', name: meName(), avatar: c.avatar || null,
      character: { data: { name: meName(), origin: c.origin || 'TB-03', species: c.species || 'human', ...c } }, lines: d.lines.slice(), demo: true };
  },
  users: () => wait(Object.values(db().users).filter(u => u.id !== 'me').map(u => ({ ...u }))),
  people: {
    get: id => { const u = db().users[id]; if (!u) return fail('not_found');
      const [o, sp] = String(u.sub || '').split(' · '); const species = Object.keys(AG.SPECIES).find(k => AG.SPECIES[k] === sp) || 'human';
      return wait({ ...u, avatar: null, level: 3, hasIllust: false, lines: ['어, 구경 왔어?', '여긴 체험 모드라 보여 줄 게 많지 않아.', '로그인하면 진짜 사람들을 만날 수 있어.'],
        data: { name: u.name, nameEn: '', age: '20대', gender: '', height: '170cm', origin: o || 'TB-03', originDetail: '', species, lineage: '', G: 4, C: 3, T: 1, echoType: '감응형', echoAbility: '광맥의 떨림을 읽는다', job: u.job, faction: u.faction,
          appearance: '체험 모드의 예시 캐릭터예요.', personality: '말수가 적지만 부탁은 잘 들어준다.', background: '', notes: '', attackStyle: '근접', attackStyle2: '' } }); },
    illust: () => wait({ illust: null }),
  },
  illustPut: () => wait({ ok: true }),
  urim: messages => wait({ text: ['체험 모드에서는 정해진 대답만 할 수 있어요. 로그인하면 캐릭터에 맞춰 이야기해 드릴게요.', '전투 진입에서 스토리나 전투를 고를 수 있어요. 체력은 창고의 회복 아이템으로 채워요.', '상단의 가운데 버튼을 누르면 다른 캐릭터를 구경할 수 있어요.'][messages.filter(m => m.role === 'user').length % 3] }, 700),
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
    const healAt = s.hp < s.hpMax && s.battleEndAt ? s.battleEndAt + AG.HEAL_MS : null;
    const r = { ...s, healAt, echoMax: 2, taintTier: demoTier(), name: meName(), registry: { ...s.registry, ...(c.origin ? { origin: c.origin } : {}), ...(c.species ? { species: AG.SPECIES[c.species] || c.species } : {}) },
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
      // 체력 · 잔향 · 오염도는 전투가 끝나도 그대로 남고, 최종 전투 종료 30분 뒤마다 최대 체력의 75%씩 회복
      const S = d.stats, M = d.battle.me;
      S.hp = Math.min(S.hpMax, M.hp); S.echoLeft = M.echo;
      if (d.battle.over) S.battleEndAt = Date.now();
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
  const s = db().stats; s.battleEndAt = null;
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
    const lt = demoLoot(E.lootTable, b.story), l = lt[Math.floor(Math.random() * lt.length)];
    const loot = { id: rid('i'), ...l, source: '전리품' };
    b.log.push({ kind: 'urim', text: `${E.name}을(를) 쓰러뜨렸어요. 전리품 「${loot.name}」을(를) 창고에 넣었어요.` });
    s.exp += 120; if (s.exp >= s.expMax) { s.exp -= s.expMax; s.level += 1; b.log.push({ kind: 'urim', text: `레벨이 ${s.level}(으)로 올랐어요.` }); }
    return { loot };
  }
  taken = Math.max(2, Math.round(E.atk * (act === 'guard' ? 0.35 : 0.8) - s.def * 0.3 + r(-4, 6)));
  if (Math.random() < s.spd / 400 + (s.echo / 400)) { b.log.push({ kind: 'turn', label: T, text: `${E.name}이(가) 반격했지만 반 박자 빠르게 몸을 틀었다 — 피해 없음.` }); }
  else { M.hp = Math.max(0, M.hp - taken); b.log.push({ kind: 'turn', label: T, text: `${E.name}이(가) 반격했다 — 반격 피해 ${taken}.` }); }
  if (M.hp <= 0) { b.over = true; b.result = 'lose'; b.log.push({ kind: 'urim', text: '쓰러졌어요. 숙소로 옮겨 놓을게요. 체력을 회복하고 다시 나가요.' }); return {}; }
  if (E.hp < E.hpMax * 0.4) E.state = '비틀거림';
  b.log.push({ kind: 'urim', text: E.hp < E.hpMax * 0.4 ? '상대가 많이 지쳤어요. 한두 번이면 쓰러뜨릴 수 있어요.' : M.hp < M.hpMax * 0.35 ? '체력이 낮아요. 방어하거나 아이템을 써 보세요.' : '상대의 움직임이 느려졌어요. 거리를 벌리면 반격을 피할 수 있어요.' });
  b.turn += 1;
  return {};
}

/* 체험 모드 스토리 · 파티: 예시 줄거리를 한 장면씩 읽고, 파티는 가상의 동료 한 명과 함께 */
const DEMO_STORIES = [
  { id: 'ration', title: '배급소의 빈 상자', kind: 'solo', intro: '배급 상자 하나가 비어 있다. 누가, 왜 가져갔을까.', enemy: '잔향 들개',
    scenes: [['3구역 배급소의 아침이에요. 안개가 짙게 깔렸고, 줄 맨 앞의 상자 하나가 텅 비어 있어요. 기록원이 장부를 넘기며 수량이 맞지 않는다고 중얼거려요.', ['기록원에게 묻는다', '상자를 살핀다']],
             ['상자 바닥에는 젖은 흙이 묻어 있고, 작은 발자국이 무너진 창고 뒤편으로 이어져 있어요.', ['발자국을 따라간다', '기록원을 더 캐묻는다']],
             ['창고 뒤편은 조용해요. 그런데 낮게 으르렁거리는 소리가 들려요. 굶주린 들개가 길을 막아섰어요.', [], true],
             ['들개가 물러난 자리 뒤, 무너진 선반 아래에 아이 하나가 빈 통조림을 끌어안고 숨어 있어요. 상자를 가져간 건 이 아이였어요.', ['기록원에게 알린다', '모른 척 돌아선다', '내 몫을 나눠 준다']],
             ['당신의 선택은 장부에 남지 않았지만, 안개가 걷힌 배급소는 어제보다 조금 조용했어요. 여기까지가 이번 이야기예요.', [], false, true]] },
  { id: 'marker', title: '남쪽 경계선의 쓰러진 표지', kind: 'group', intro: '경계 표지가 칼로 자른 듯 쓰러져 있다. 함께 조사할 사람을 모은다.', enemy: '변이 수집자',
    scenes: [['남쪽 경계선이에요. 표지 두 개가 나란히 쓰러져 있고 단면이 지나치게 깔끔해요. 순찰대가 모여 웅성거리고 있어요.', ['단면을 살핀다', '주변 흙을 본다']],
             ['흙 위에 한쪽 발을 끄는 자국이 남아 있어요. 자국은 폐허가 된 관측소 쪽으로 이어져요.', ['관측소로 간다', '지원을 기다린다']],
             ['관측소 문이 안쪽에서 열려요. 가면을 쓴 변이 수집자가 갈고리를 끌며 걸어 나와요.', [], true],
             ['수집자가 떨어뜨린 자루에는 잘라 낸 표지 조각이 가득해요. 누군가 경계를 지우려 하고 있어요. 이번 조사는 여기까지예요.', [], false, true]] },
];
/* 스토리용 전리품(단서)은 스토리 전투에서만 (체험 모드) */
function demoLoot(table, storyId) { const t = (table || []).filter(l => storyId || l.kind !== '단서'); return t.length ? t : [{ name: '배급 영양 팩', rarity: 'COMMON', kind: '소모품', desc: '테바 하층 배급소의 회색 팩. 맛은 없다.\n전투 중 체력을 30 회복한다.' }]; }
function demoStoryRun(st) { const d = db(); d.stories = d.stories || {}; return d.stories[st.id]; }
function demoStoryView(st) { const r = demoStoryRun(st); const v = { id: st.id, title: st.title, kind: st.kind, intro: st.intro, log: r.log, choices: r.choices, done: r.done, battle: r.battle, me: 'me' };
  if (st.kind !== 'group' || r.done || r.battle) return v;
  v.phase = r.phase || 'solo';
  if (v.phase === 'vote' && r.vote) { v.choices = []; v.vote = { q: r.vote.q, options: r.vote.options.map(t => ({ text: t, n: 0 })), mine: null, need: 2, active: 3, voters: 0, left: 8 * 60000 }; }
  if (v.phase === 'solo') { const t = r.track || {}; v.choices = t.ready ? [] : r.choices; v.track = { steps: t.steps || 0, max: 2, ready: !!t.ready, readyNames: [], restNames: [nm('hayun'), nm('juno')], left: 8 * 60000 }; }
  return v; }
/* 체험 모드 단체 스토리: 분기마다 투표, 그 사이에는 각자 진행 (가상의 동료가 함께한다) */
function demoGroupNext(r, after) {
  if (r.done || r.battle) { r.phase = null; return; }
  if (after === 'regroup' && r.choices.length) { r.phase = 'vote'; r.vote = { q: '일행은 어떻게 할까요?', options: r.choices.slice() }; r.log.push({ who: 'sys', text: '분기 — 일행은 어떻게 할까요? (일행 과반수가 고른 행동만 일어나요)' }); }
  else { r.phase = 'solo'; r.vote = null; r.track = { steps: 0 }; r.log.push({ who: 'sys', text: '각자 진행 — 저마다 움직이다가 합류 지점에서 일행과 다시 모여요.' }); }
}
function demoStoryStep(st, r) {
  const sc = st.scenes[r.step]; if (!sc) { r.done = true; r.choices = []; return; }
  r.step += 1; r.log.push({ who: 'urim', text: sc[0] }); r.choices = sc[1] || []; if (sc[3]) r.done = true;
  if (sc[2]) {
    const d = db(); const e = ENEMIES.find(x => x.name === st.enemy) || ENEMIES[0];
    if (st.kind === 'group') { const p = demoNewParty(e, st.id); d.party = p; r.battle = { party: p.id, enemy: e.name }; }
    else if (d.stats.hp > 0) { d.battle = newBattle(); Object.assign(d.battle.enemy, { name: e.name, hp: e.hp, hpMax: e.hp, atk: e.atk, def: e.def, spd: e.spd, state: e.state, lootTable: e.loot }); d.battle.story = st.id;
      d.battle.log = [{ kind: 'urim', text: `${e.name}이(가) 길을 막았어요. 이야기는 전투가 끝난 뒤에 이어져요.` }]; r.battle = { solo: d.battle.id, enemy: e.name }; }
    else r.log.push({ who: 'urim', text: '지금은 체력이 없어서 싸울 수 없어요. 창고에서 회복한 뒤에 다시 말을 걸어 주세요.' }), r.step -= 1, r.log.splice(-2, 1);
  }
}
const KO_RESULT = { win: '승리했다', lose: '쓰러졌다', run: '달아났다', closed: '흩어졌다' };
function demoStorySync(st, r) {
  if (!r.battle) return; const d = db();
  if (st.kind === 'group') { const b = d.party; const over = !b || b.id !== r.battle.party || b.status === 'over'; if (!over) return; r.log.push({ who: 'sys', text: `전투 결과 — ${KO_RESULT[(b && b.id === r.battle.party && b.result) || 'closed']}` }); r.battle = null; demoStoryStep(st, r); demoGroupNext(r, 'regroup'); return; }
  const b = r.battle.solo ? d.battle : d.party; const id = r.battle.solo || r.battle.party;
  const over = !b || b.id !== id || (r.battle.solo ? b.over : b.status === 'over');
  if (!over) return;
  r.log.push({ who: 'sys', text: `전투 결과 — ${KO_RESULT[(b && b.id === id && b.result) || 'closed']}` }); r.battle = null; demoStoryStep(st, r);
}
function demoMember(id, name, s) { return { id, name, hp: s.hp, hpMax: s.hpMax, echo: s.echoLeft ?? 2, down: false, fled: false, online: true, chosen: false, cool: {} }; }
function demoNewParty(e, storyId) {
  e = e || ENEMIES[Math.floor(Math.random() * ENEMIES.length)]; const s = db().stats;
  return { id: rid('pt'), status: 'lobby', turn: 0, result: null, host: 'me', me: 'me', storyId: storyId || null, polls: 0,
    enemy: { name: e.name, hp: e.hp, hpMax: e.hp, atk: e.atk, def: e.def, spd: e.spd, state: e.state, lootTable: e.loot }, members: [demoMember('me', meName(), s)],
    log: [{ kind: 'urim', text: '방을 열었어요. 함께할 사람이 들어오면 시작할 수 있어요. (체험 모드에서는 가상의 동료가 들어와요)' }] };
}
function demoPartyAct(p, action, text, skill) {
  const d = db(), s = d.stats, r = (a, z) => a + Math.floor(Math.random() * (z - a + 1)); const E = p.enemy; const parts = [];
  const meM = p.members[0], bot = p.members[1];
  const R = AG.SKILL_RULES[skill] || AG.SKILL_RULES.normal;
  let dmg = action === 'guard' || action === 'run' ? 0 : action === 'echo' ? (meM.echo > 0 ? Math.round(s.echo * 1.4 + 6 - E.def * .35) : 0) : Math.max(3, Math.round(s.atk * .8 * (action === 'attack' ? R.mult : 1) - E.def * .35 + r(-4, 8)));
  if (action === 'echo') meM.echo = Math.max(0, meM.echo - 1);
  if (action === 'attack' && skill) { if (R.cooldown) meM.cool[skill] = p.turn + R.cooldown + 1; if (R.perBattle) meM.cool[skill + 'Used'] = (meM.cool[skill + 'Used'] || 0) + 1; }
  if (action === 'run' && Math.random() < .5) { meM.fled = true; parts.push(`${meM.name}은(는) 전장을 빠져나갔다.`); }
  else { E.hp = Math.max(0, E.hp - dmg); parts.push(action === 'guard' ? `${meM.name}은(는) 자세를 낮춰 막았다.` : action === 'custom' ? `${meM.name}: ${text} — 피해 ${dmg}.` : action === 'run' ? `${meM.name}은(는) 빠져나가지 못했다.` : `${meM.name}의 공격 — 피해 ${dmg}.`); }
  if (bot && !bot.down) { const bd = r(14, 26); E.hp = Math.max(0, E.hp - bd); parts.push(`${bot.name}의 공격 — 피해 ${bd}.`); }
  if (E.hp > 0) { const alive = p.members.filter(x => !x.down && !x.fled); const t = alive[r(0, alive.length - 1)];
    if (t) { const tk = Math.max(2, Math.round(E.atk * (t === meM && action === 'guard' ? .35 : .8) - (t === meM ? s.def : 14) * .3 + r(-4, 6))); t.hp = Math.max(0, t.hp - tk); parts.push(`${E.name}의 반격 — ${t.name} 피해 ${tk}.`); if (t.hp <= 0) { t.down = true; parts.push(`${t.name}이(가) 쓰러졌다.`); } } }
  p.log.push({ kind: 'turn', label: `TURN ${String(p.turn).padStart(2, '0')}`, text: parts.join(' ') });
  s.hp = Math.min(s.hpMax, meM.hp); s.echoLeft = meM.echo;
  const still = p.members.filter(x => !x.down && !x.fled);
  if (E.hp <= 0) { p.status = 'over'; p.result = 'win'; s.battleEndAt = Date.now(); const l = demoLoot(E.lootTable, p.storyId)[0]; if (l) d.inventory.push({ id: rid('i'), source: '전리품', ...l });
    p.log.push({ kind: 'urim', text: `${E.name}을(를) 함께 쓰러뜨렸어요. 전리품은 각자 창고에 넣어 두었어요.` }); }
  else if (!still.length || meM.down || meM.fled) { p.status = 'over'; p.result = meM.fled ? 'run' : 'lose'; s.battleEndAt = Date.now(); p.log.push({ kind: 'urim', text: meM.fled ? '전장을 벗어났어요.' : '쓰러졌어요. 숙소로 옮겨 놓을게요. 체력을 회복하고 다시 나가요.' }); }
  else p.turn += 1;
}
Object.assign(Dm, {
  story: {
    list: () => { const d = db(); d.stories = d.stories || {}; return wait(DEMO_STORIES.map(s => ({ id: s.id, title: s.title, kind: s.kind, intro: s.intro, started: !!d.stories[s.id], done: !!(d.stories[s.id] && d.stories[s.id].done), at: now0 - 2 * H }))); },
    alarms: () => wait([]),
    open: (id, notify) => { const st = DEMO_STORIES.find(s => s.id === id); if (!st) return fail('not_found'); const d = db(); d.stories = d.stories || {};
      let notified = 0, midJoined = false;
      if (!d.stories[id]) { d.stories[id] = { step: 0, log: [], choices: [], done: false, battle: null, participants: ['me'] }; demoStoryStep(st, d.stories[id]); if (st.kind === 'group') demoGroupNext(d.stories[id], 'regroup'); }
      else if (st.kind === 'group' && !d.stories[id].done) {
        d.stories[id].participants = Array.isArray(d.stories[id].participants) ? d.stories[id].participants : [];
        if (!d.stories[id].participants.includes('me')) {
          d.stories[id].participants.push('me');
          if ((d.stories[id].step || 0) > 0) { midJoined = true; d.stories[id].log.push({ who: 'sys', text: `${meName()} 님이 이야기 도중에 합류했어요.` }); }
        }
      }
      if (st.kind === 'group' && !d.stories[id].done && notify) {
        notified = Object.values(d.users || {}).filter(u => u.id !== 'me' && u.online).length;
      }
      demoStorySync(st, d.stories[id]); save(); return wait({ ...demoStoryView(st), notified, midJoined }, 300); },
    vote: (id, i) => { const st = DEMO_STORIES.find(s => s.id === id); const r = st && demoStoryRun(st); if (!r || r.phase !== 'vote' || !r.vote) return fail('지금은 투표할 분기가 없어요');
      const pick = r.vote.options[i]; r.log.push({ who: 'sys', text: `투표 결과 — 「${pick}」 (2표 · 과반수) · 체험 모드의 가상 동료도 같은 쪽을 골랐어요` });
      r.log.push({ who: 'me', userId: 'me', name: meName(), text: pick }); r.vote = null; demoStoryStep(st, r); demoGroupNext(r, 'vote'); save(); return wait(demoStoryView(st), 700); },
    ready: id => { const st = DEMO_STORIES.find(s => s.id === id); const r = st && demoStoryRun(st); if (!r || r.phase !== 'solo') return fail('지금은 합류할 수 없어요');
      r.log.push({ who: 'sys', for: 'me', text: '합류 지점으로 향했어요.' }); r.log.push({ who: 'sys', text: '일행이 모두 합류했어요.' }); r.track = null; demoStoryStep(st, r); demoGroupNext(r, 'regroup'); save(); return wait(demoStoryView(st), 700); },
    act: (id, text) => { const st = DEMO_STORIES.find(s => s.id === id); const r = st && demoStoryRun(st); if (!r) return fail('not_found');
      if (st.kind === 'group' && r.phase === 'vote') return fail('지금은 일행이 함께 정하는 분기예요. 선택지 중 하나에 투표해 주세요');
      if (st.kind === 'group' && r.phase === 'solo' && !r.done && !r.battle) {
        const t = r.track = r.track || { steps: 0 }; if (t.ready) return fail('합류 지점에서 일행을 기다리는 중이에요');
        r.log.push({ who: 'me', userId: 'me', name: meName(), text, for: 'me' }); t.steps += 1;
        r.log.push({ who: 'urim', for: 'me', text: t.steps >= 2 ? '혼자 살핀 흔적을 정리하고, 일행이 모이기로 한 곳으로 향해요. (체험 모드: 각자 진행은 두 번까지)' : '혼자 주변을 더 살펴요. 다른 사람들은 지금 다른 곳을 조사하고 있어요. 이 장면은 당신에게만 보여요.' });
        if (t.steps >= 2) { save(); return Dm.story.ready(id); }   // 체험 모드: 가상 동료는 이미 도착해 있어 바로 합류한다
        save(); return wait(demoStoryView(st), 700);
      }
      if (!r.done && !r.battle) { r.log.push({ who: 'me', userId: 'me', name: meName(), text }); demoStoryStep(st, r); } save(); return wait(demoStoryView(st), 700); },
    reset: id => { const d = db(); const st = DEMO_STORIES.find(s => s.id === id); if (d.stories) delete d.stories[id]; save(); return Dm.story.open(id); },
  },
  party: {
    lobby: () => { const d = db(); const p = d.party && d.party.status !== 'over' ? d.party : null; return wait({ mine: p, open: p ? [] : [{ id: 'demo-room', host: nm('hayun'), count: 1, max: 4, enemy: '변이 수집자', story: null }] }); },
    create: () => { const d = db(); if (d.stats.hp <= 0) return fail('체력이 없어요. 창고에서 회복 아이템을 쓰고 다시 나가요'); d.party = demoNewParty(); save(); return wait(d.party); },
    get: id => { const d = db(); const p = d.party; if (!p || p.id !== id) return fail('not_found'); p.polls += 1;
      if (p.status === 'lobby' && p.members.length < 2 && p.polls >= 2) { p.members.push({ id: 'leon', name: nm('leon'), hp: 180, hpMax: 180, echo: 2, down: false, fled: false, online: true, chosen: true }); p.log.push({ kind: 'urim', text: `${nm('leon')} 님이 들어왔어요.` }); }
      if (p.status === 'lobby' && p.autostart && p.polls >= 2) { p.autostart = false; p.status = 'battle'; p.turn = 1; d.stats.battleEndAt = null; p.log.push({ kind: 'urim', text: `${p.enemy.name}이(가) 나타났어요. 모두 행동을 고르면 한꺼번에 판정해요.` }); }
      save(); return wait(p, 100); },
    join: id => { const d = db(); if (d.stats.hp <= 0) return fail('체력이 없어요. 창고에서 회복 아이템을 쓰고 다시 나가요'); const p = demoNewParty(ENEMIES[0]); p.host = 'hayun'; p.members.unshift({ id: 'hayun', name: nm('hayun'), hp: 170, hpMax: 170, echo: 3, down: false, fled: false, online: true, chosen: true });
      p.members.reverse(); p.log = [{ kind: 'urim', text: `${nm('hayun')} 님의 방에 들어왔어요. 곧 시작해요.` }]; p.autostart = true; d.party = p; save(); return wait(p); },
    leave: id => { const d = db(); if (d.party && d.party.status === 'battle') d.stats.battleEndAt = Date.now(); d.party = null; save(); return wait({ status: 'over', result: 'closed', members: [], log: [], enemy: {} }); },
    start: id => { const d = db(), p = d.party; if (!p) return fail('not_found'); if (p.status === 'lobby') { p.status = 'battle'; p.turn = 1; d.stats.battleEndAt = null; p.enemy.hp = p.enemy.hpMax = Math.round(p.enemy.hp * (0.55 + 0.6 * p.members.length)); p.log.push({ kind: 'urim', text: `${p.enemy.name}이(가) 나타났어요. ${p.members.length}명이 모두 행동을 고르면 한꺼번에 판정해요.` }); } save(); return wait(p); },
    act: (id, action, text, skill) => { const p = db().party; if (!p || p.status !== 'battle') return fail('전투 중이 아니에요'); demoPartyAct(p, action, text, skill); save(); return wait(p, 600); },
  },
});

{ const base = Dm.posts.list;   // 단체 스토리는 타임라인 맨 위의 참여 글로
  Dm.posts.list = async (...a) => { const l = await base(...a); const d = db(); d.stories = d.stories || {}; DEMO_STORIES.filter(s => s.kind === 'group').forEach(s => { const r = d.stories[s.id]; const started = !!(r && !r.done), done = !!(r && r.done); l.unshift({ id: 'story-' + s.id, userId: 'urim', name: 'URIM', sub: started ? '단체 스토리 · 진행 중 (중간 진입 가능)' : done ? '단체 스토리 · 완료' : '단체 스토리', text: `【단체 스토리】 ${s.title}\n${s.intro}`, at: now0 - H, editedAt: null, comments: 0, mine: false, story: s.id, storyStarted: started, storyDone: done }); }); return l; }; }

const impl = AG.mode === 'server' ? S : Dm;
/* 퀘스트 아이템 그림: 이름 앞 두 자리 번호로 assets/items/qNN.png 를 붙인다 (서버가 아직 안 붙였어도) */
AG.questImg = name => { const k = String(name || '').slice(0, 2); return /^(0[1-9]|1[0-9])$/.test(k) && / /.test(String(name).slice(2, 3)) ? `assets/items/q${k}.png` : null; };
{ const base = impl.inventory.list; impl.inventory.list = async (...a) => (await base(...a)).map(it => it.img ? it : { ...it, img: AG.questImg(it.name) }); }
Object.assign(AG, {
  me: () => impl.me(), users: () => impl.users(), people: impl.people, urim: m => impl.urim(m), channels: impl.channels, msg: impl.msg, talks: impl.talks, dms: impl.dms,
  stats: (...a) => impl.stats(...a), inventory: impl.inventory, home: impl.home, lines: impl.lines, character: impl.character,
  account: impl.account, battle: impl.battle, posts: impl.posts, story: impl.story, party: impl.party,
  notify: () => impl.notify(), seen: a => impl.seen(a),
});
/* 이 화면을 보고 있는 동안 '읽음'으로 남긴다 (메인의 새 메시지 점이 꺼진다) */
AG.markSeen = area => {
  const mark = () => { if (!document.hidden) AG.seen(area).catch(() => {}); };
  mark(); setInterval(mark, 30000);
  document.addEventListener('visibilitychange', mark); addEventListener('pagehide', () => AG.seen(area).catch(() => {}));
};
/* 푸시 알림: 브라우저 구독을 만들어 서버에 맡긴다 */
const b64ToU8 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
AG.pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && location.protocol === 'https:';
AG.pushState = async () => {
  if (!AG.pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
};
AG.pushOn = async () => {
  if (!AG.pushSupported()) throw new Error('이 브라우저는 알림을 지원하지 않아요. 홈 화면에 앱으로 추가하면 받을 수 있어요');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림 권한이 꺼져 있어요');
  const info = await impl.push.info(); if (!info.key) throw new Error('서버 알림이 아직 준비되지 않았어요');
  const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(info.key) });
  await impl.push.add(sub.toJSON()); LS.set('ag-push', 'on');
  return true;
};
AG.pushOff = async () => {
  const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription();
  if (sub) { await impl.push.remove(sub.toJSON()).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  LS.set('ag-push', 'off');
};
// 메인에서 처음 한 번만 묻는다
AG.pushAsk = async () => {
  if (AG.mode !== 'server' || LS.get('ag-push-asked') || !AG.pushSupported() || Notification.permission !== 'default') return;
  LS.set('ag-push-asked', '1');
  const m = AG.sheet(`<h2>NOTIFICATION</h2><h3>새 메시지 알림을 받을까요?</h3><p class="bw-empty" style="padding:10px 0 0;text-align:left">단체 단말 · 개인 연락망 · 개인 단말에 새 메시지가 오면 휴대폰이나 컴퓨터로 알려 드려요.<br>설정에서 언제든 끌 수 있어요.</p><div class="bw-btns"><button class="bw-btn" data-y>알림 받기</button><button class="bw-btn" data-x>나중에</button></div>`);
  m.el.querySelector('[data-x]').onclick = m.close;
  m.el.querySelector('[data-y]').onclick = async () => { m.close(); try { await AG.pushOn(); AG.toast('새 메시지가 오면 알려 드릴게요'); } catch (e) { AG.toast(e.message || '알림을 켜지 못했어요'); } };
};
/* 창고가 넘치면 (48칸 초과) 어느 화면에서든 알려 주고 창고로 보낸다. 고르는 건 창고 화면에서 */
AG.INV_CAP = 48;
AG.invCheck = function (f) {
  const n = f && f.inv; if (!(n > 0)) return;
  if (/inventory\.html$/.test(location.pathname) || document.querySelector('.bw-back')) return;
  try { if (Date.now() - (+sessionStorage.getItem('ag-invask') || 0) < 60000) return; sessionStorage.setItem('ag-invask', String(Date.now())); } catch {}
  const m = AG.sheet(`<h2>STORAGE FULL</h2><h3>창고가 넘쳤어요</h3><p class="bw-empty" style="padding:10px 0 0;text-align:left">창고에는 ${AG.INV_CAP}개까지 둘 수 있어요. 새로 들어온 물건 때문에 ${n}개가 넘쳤어요.<br>창고에서 버릴 물건을 골라 주세요.</p><div class="bw-btns"><button class="bw-btn" data-y>창고로 가기</button><button class="bw-btn" data-x>나중에</button></div>`);
  m.el.querySelector('[data-x]').onclick = m.close;
  m.el.querySelector('[data-y]').onclick = () => { location.href = AG.PAGES.inventory; };
};
// 메인 · 창고 · 로그인 화면이 아니면 들어올 때 한 번 확인한다 (메인은 20초마다 따로 확인)
addEventListener('load', () => {
  if (/(?:^|\/)(?:index|main|inventory)\.html$|\/$/.test(location.pathname) || new URLSearchParams(location.search).get('visit')) return;
  setTimeout(async () => { try { AG.invCheck(await AG.notify()); } catch {} }, 1500);
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

/* ── 다른 캐릭터 구경: 어느 화면에서나 쓰는 팝업 (스타일을 직접 갖고 다닌다) ── */
AG.sheet = function (html, cls = '') {
  if (!document.getElementById('bwCss')) {
    const st = document.createElement('style'); st.id = 'bwCss';
    st.textContent = `.bw-back{position:absolute;inset:0;z-index:60;display:grid;place-items:center;background:rgba(10,10,10,.6);pointer-events:auto;animation:bwIn .2s backwards}
@keyframes bwIn{from{opacity:0}}@keyframes bwUp{from{opacity:0;translate:0 26px}}
.bw{position:relative;width:1120px;max-height:1180px;display:flex;flex-direction:column;padding:56px 110px 50px;box-sizing:border-box;color:#f2f2f2;font-family:"Noto Sans KR",sans-serif;filter:drop-shadow(0 26px 40px rgba(0,0,0,.5));animation:bwUp .32s cubic-bezier(.2,.8,.2,1) backwards}
.bw.wide{width:1500px}
.bw::before{content:"";position:absolute;inset:0;z-index:-1;clip-path:polygon(0 0,calc(100% - 56px) 0,100% 100%,56px 100%);background:repeating-conic-gradient(rgba(0,0,0,.16) 0 25%,transparent 0 50%) 0 0/34px 34px,linear-gradient(90deg,rgba(10,10,10,.96),rgba(74,74,74,.94))}
.bw h2{font-family:"Passion One",sans-serif;font-weight:400;font-size:24px;letter-spacing:.32em;color:#bdbdbd;margin:0 0 4px}
.bw h3{font-size:42px;font-weight:900;margin:0 0 22px;width:fit-content;background:linear-gradient(180deg,#f2f2f2,#8c8c8c);-webkit-background-clip:text;background-clip:text;color:transparent}
.bw .bw-list{flex:1;min-height:0;overflow-y:auto;padding-right:14px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.3) transparent}
.bw .bw-row{position:relative;display:flex;align-items:center;gap:22px;width:100%;height:92px;padding:0 40px;margin-bottom:10px;box-sizing:border-box;text-align:left;color:#fff;font:inherit;border:0;background:none;cursor:pointer;transition:translate .18s,filter .18s}
.bw .bw-row::before{content:"";position:absolute;inset:0;z-index:-1;clip-path:polygon(0 0,calc(100% - 20px) 0,100% 100%,20px 100%);background:linear-gradient(92deg,rgba(255,255,255,.05),rgba(123,123,123,.5) 55%,rgba(23,23,23,.9))}
.bw .bw-row:hover{translate:10px 0;filter:brightness(1.35)}
.bw .bw-ic{flex:none;width:58px;height:58px;display:grid;place-items:center;font-size:26px;font-weight:900;background:rgba(255,255,255,.14)}
.bw .bw-tx{flex:1;min-width:0}.bw .bw-tx b{display:block;font-size:28px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bw .bw-tx small{display:block;font-size:19px;color:#b9b9b9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bw .bw-on{flex:none;font-size:18px;font-weight:700;color:#9a9a9a}.bw .bw-on.on{color:#cfe5a8}
.bw .bw-empty{padding:60px 0;text-align:center;font-size:24px;color:#b5b5b5;line-height:1.6}
.bw .bw-btns{display:flex;gap:16px;margin-top:26px}
.bw .bw-btn{position:relative;height:72px;padding:0 54px;font:inherit;font-size:24px;font-weight:900;color:#fff;border:0;background:none;cursor:pointer;transition:filter .18s}
.bw .bw-btn::before{content:"";position:absolute;inset:0;z-index:-1;clip-path:polygon(0 0,calc(100% - 18px) 0,100% 100%,18px 100%);background:linear-gradient(92deg,#5a5a5a,#171717)}
.bw .bw-btn:hover{filter:brightness(1.4)}
.bw input.bw-q{width:100%;height:64px;margin-bottom:16px;padding:0 26px;box-sizing:border-box;font:inherit;font-size:24px;color:#fff;background:rgba(255,255,255,.09);border:0;outline:0}
.bw dl{display:grid;grid-template-columns:200px 1fr;gap:12px 26px;margin:0 0 26px;font-size:24px;line-height:1.55}
.bw dt{color:#a9a9a9;font-weight:700}.bw dd{margin:0;color:#f0f0f0;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}
.bw h4{font-family:"Passion One",sans-serif;font-weight:400;font-size:20px;letter-spacing:.3em;color:#9f9f9f;margin:8px 0 14px;padding-bottom:8px;border-bottom:2px solid rgba(255,255,255,.14)}`;
    document.head.appendChild(st);
  }
  const back = document.createElement('div'); back.className = 'bw-back';
  back.innerHTML = `<div class="bw ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  document.getElementById('stage').appendChild(back);
  const close = () => { back.remove(); removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', esc);
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  return { el: back.firstElementChild, close };
};
/* 캐릭터 고르기 → 그 캐릭터의 화면으로 */
AG.browse = async function () {
  const m = AG.sheet(`<h2>VISIT</h2><h3>누구를 보러 갈까요?</h3><input class="bw-q" placeholder="이름 · 직업 · 소속으로 찾기" aria-label="캐릭터 찾기"><div class="bw-list"><p class="bw-empty">불러오는 중…</p></div><div class="bw-btns"><button class="bw-btn" data-x type="button">닫기</button></div>`);
  m.el.querySelector('[data-x]').onclick = m.close;
  const box = m.el.querySelector('.bw-list'), q = m.el.querySelector('.bw-q');
  let users = [];
  const draw = () => {
    const k = q.value.trim().toLowerCase();
    const l = users.filter(u => !k || [u.name, u.sub, u.job, u.faction].join(' ').toLowerCase().includes(k));
    box.innerHTML = l.map(u => `<button class="bw-row" data-id="${AG.esc(u.id)}" type="button"><span class="bw-ic">${AG.esc(Array.from(u.name || '?')[0])}</span><span class="bw-tx"><b>${AG.esc(u.name)}</b><small>${AG.esc([u.sub, u.faction && u.faction !== '—' ? u.faction : ''].filter(Boolean).join(' · '))}</small></span><span class="bw-on${u.online ? ' on' : ''}">${u.online ? '접속 중' : ''}</span></button>`).join('')
      || `<p class="bw-empty">${users.length ? '찾는 캐릭터가 없어요.' : '아직 다른 캐릭터가 없어요.'}</p>`;
    box.querySelectorAll('[data-id]').forEach(b => b.onclick = () => location.href = AG.PAGES.main + '?visit=' + encodeURIComponent(b.dataset.id));
  };
  q.addEventListener('input', draw);
  try { users = await AG.users(); draw(); } catch (e) { box.innerHTML = `<p class="bw-empty">${AG.esc(AG.errMsg(e))}</p>`; }
};
/* 공개 프로필 자세히 (비밀 칸은 서버가 보내지 않는다) */
AG.profileSheet = function (p) {
  const d = p.data || {}, e = AG.esc;
  const row = (k, v) => v || v === 0 ? `<dt>${k}</dt><dd>${e(v)}</dd>` : '';
  const sec = (t, rows) => rows.join('') ? `<h4>${t}</h4><dl>${rows.join('')}</dl>` : '';
  const atk = (n, t) => [n, t].filter(Boolean).join(' — ');
  const m = AG.sheet(`<h2>PROFILE</h2><h3>${e(d.name || p.name)}</h3><div class="bw-list">
    ${sec('BASIC', [row('영문 이름', d.nameEn), row('나이', d.age), row('성별', d.gender), row('키', d.height), row('직업', d.job), row('소속', d.faction)])}
    ${sec('ORIGIN', [row('출신', [d.origin, d.originDetail].filter(Boolean).join(' · ')), row('종족', AG.SPECIES[d.species] || d.species), row('혈통', d.lineage), d.G != null ? row('지수', `G ${d.G} · C ${d.C} · T ${d.T}`) : ''])}
    ${sec('ECHO', [row('잔향 갈래', d.echoType), row('잔향 능력', d.echoAbility)])}
    ${sec('CHARACTER', [row('외형', d.appearance), row('성격', d.personality), row('배경', d.background), row('메모', d.notes)])}
    ${sec('COMBAT', [row('공격 스타일', [d.attackStyle, d.attackStyle2].filter(Boolean).join(' · ')), row('일반 공격', atk(d.attackNormalName, d.attackNormal)), row('특수 공격', atk(d.attackSpecialName, d.attackSpecial)), row('필살기', atk(d.attackUltimateName, d.attackUltimate))])}
    </div><div class="bw-btns"><button class="bw-btn" data-x type="button">닫기</button></div>`, 'wide');
  m.el.querySelector('[data-x]').onclick = m.close;
  return m;
};

/* ── URIM과 대화: 캐릭터 보조 어시스턴트 (대화는 이 브라우저에 최근 40개까지 남는다) ── */
AG.urimChat = function () {
  const KEY = 'ag-urim-chat';
  let hist = []; try { hist = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
  const m = AG.sheet(`<h2>URIM</h2><h3>무엇을 도와드릴까요?</h3>
    <style>.uc-log{flex:1;min-height:420px;max-height:640px;overflow-y:auto;padding-right:14px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.3) transparent}
    .uc-m{max-width:78%;margin:0 0 16px;padding:16px 24px;font-size:24px;line-height:1.6;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere;background:rgba(255,255,255,.1)}
    .uc-m.me{margin-left:auto;background:rgba(242,242,242,.92);color:#1e1e1e}.uc-m.wait{color:#b5b5b5}
    .uc-in{display:flex;gap:14px;margin-top:20px}.uc-in input{flex:1;height:72px;padding:0 26px;font:inherit;font-size:24px;color:#fff;background:rgba(255,255,255,.09);border:0;outline:0}
    .uc-hint{font-size:19px;color:#a9a9a9;margin:0 0 14px}</style>
    <p class="uc-hint">캐릭터 상태, 대사·행동 아이디어, 사이트 사용법을 물어보세요.</p>
    <div class="uc-log" aria-live="polite"></div>
    <div class="uc-in"><input maxlength="600" placeholder="URIM에게 말하기" aria-label="URIM에게 말하기"><button class="bw-btn" data-send type="button">보내기</button></div>
    <div class="bw-btns"><button class="bw-btn" data-x type="button">닫기</button><button class="bw-btn" data-clear type="button">대화 지우기</button></div>`);
  const log = m.el.querySelector('.uc-log'), input = m.el.querySelector('.uc-in input');
  let busy = false;
  const add = (role, text, cls = '') => { const p = document.createElement('p'); p.className = 'uc-m ' + (role === 'user' ? 'me ' : '') + cls; p.textContent = text; log.appendChild(p); log.scrollTop = log.scrollHeight; return p; };
  const draw = () => { log.innerHTML = ''; if (!hist.length) add('assistant', '안녕하세요. 개인 단말의 URIM이에요. 캐릭터에 대해 궁금한 점이나 막히는 부분을 말씀해 주세요.'); hist.forEach(h => add(h.role, h.content)); };
  const keep = () => { hist = hist.slice(-40); try { localStorage.setItem(KEY, JSON.stringify(hist)); } catch {} };
  const send = async () => {
    const v = input.value.trim(); if (!v || busy) return;
    input.value = ''; busy = true; hist.push({ role: 'user', content: v }); add('user', v);
    const w = add('assistant', '…', 'wait');
    try { const r = await AG.urim(hist.slice(-16)); w.remove(); hist.push({ role: 'assistant', content: r.text }); add('assistant', r.text); keep(); }
    catch (e) { hist.pop(); w.classList.remove('wait'); w.textContent = e && e.status === 429 ? '잠시 쉬었다가 다시 말을 걸어 주세요.' : '지금은 대답할 수 없어요. 조금 뒤에 다시 시도해 주세요.'; }
    busy = false; input.focus({ preventScroll: true });
  };
  m.el.querySelector('[data-x]').onclick = m.close;
  m.el.querySelector('[data-clear]').onclick = () => { hist = []; keep(); draw(); };
  m.el.querySelector('[data-send]').onclick = send;
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } e.stopPropagation(); });
  draw(); setTimeout(() => input.focus({ preventScroll: true }), 50);
  return m;
};

/* ── 프로필 사진: 정사각형으로 잘라 내기 (끌어서 위치, 조절바로 크기) ── */
AG.cropSquare = file => new Promise((res, rej) => {
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad_image')); };
  img.onload = () => {
    const V = 560, base = V / Math.min(img.width, img.height);   // 100% = 짧은 변이 틀에 꼭 맞는 크기
    const st = { z: 1, x: (V - img.width * base) / 2, y: (V - img.height * base) / 2 };
    const m = AG.sheet(`<h2>PROFILE PHOTO</h2><h3>사진을 맞춰 주세요</h3>
      <style>.cs-box{position:relative;width:${V}px;height:${V}px;margin:0 auto;overflow:hidden;background:#111;cursor:grab;touch-action:none}.cs-box.drag{cursor:grabbing}
      .cs-box img{position:absolute;left:0;top:0;max-width:none;transform-origin:0 0;pointer-events:none;user-select:none}
      .cs-box::after{content:"";position:absolute;inset:0;box-shadow:inset 0 0 0 3px rgba(255,255,255,.7);pointer-events:none}
      .cs-z{display:flex;align-items:center;gap:20px;margin:24px auto 0;width:${V}px;font-size:22px;font-weight:700;color:#cfcfcf}.cs-z input{flex:1;accent-color:#e6e6e6;height:30px}</style>
      <div class="cs-box"><img alt=""></div>
      <label class="cs-z">크기<input type="range" min="100" max="300" value="100" aria-label="사진 크기"><span>100%</span></label>
      <div class="bw-btns"><button class="bw-btn" data-x type="button">취소</button><button class="bw-btn" data-ok type="button">이대로 쓰기</button></div>`);
    const box = m.el.querySelector('.cs-box'), el = box.querySelector('img'), range = m.el.querySelector('.cs-z input'), pct = m.el.querySelector('.cs-z span');
    el.src = url;
    const apply = () => {
      const k = base * st.z, w = img.width * k, h = img.height * k;
      st.x = Math.min(0, Math.max(V - w, st.x)); st.y = Math.min(0, Math.max(V - h, st.y));
      el.style.width = img.width + 'px'; el.style.transform = `translate(${st.x}px, ${st.y}px) scale(${k})`;
      range.value = Math.round(st.z * 100); pct.textContent = Math.round(st.z * 100) + '%';
    };
    const zoom = z => { z = Math.min(3, Math.max(1, z)); const c = V / 2, r = z / st.z; st.x = c - (c - st.x) * r; st.y = c - (c - st.y) * r; st.z = z; apply(); };
    range.addEventListener('input', () => zoom(range.value / 100));
    let d = null;
    box.addEventListener('pointerdown', e => { d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: st.x, y: st.y, k: box.getBoundingClientRect().width / V }; box.setPointerCapture(e.pointerId); box.classList.add('drag'); });
    box.addEventListener('pointermove', e => { if (!d || e.pointerId !== d.id) return; st.x = d.x + (e.clientX - d.sx) / d.k; st.y = d.y + (e.clientY - d.sy) / d.k; apply(); });
    const end = () => { d = null; box.classList.remove('drag'); };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    box.addEventListener('wheel', e => { e.preventDefault(); zoom(st.z * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    const done = v => { m.close(); URL.revokeObjectURL(url); v ? res(v) : rej(new Error('cancel')); };
    m.el.querySelector('[data-x]').onclick = () => done(null);
    m.el.querySelector('[data-ok]').onclick = () => {
      const size = 320, max = 190000, k = base * st.z, c = document.createElement('canvas'); c.width = c.height = size;
      c.getContext('2d').drawImage(img, -st.x / k, -st.y / k, V / k, V / k, 0, 0, size, size);
      for (const q of [.9, .8, .7, .55, .4]) { const u = c.toDataURL('image/webp', q); if (u.length <= max && u.startsWith('data:image/webp')) return done(u); }
      const j = c.toDataURL('image/jpeg', .7); j.length <= max ? done(j) : (m.close(), rej(new Error('too_long')));
    };
    apply();
  };
  img.src = url;
});

/* ── 배경음악: 화면마다 정해진 곡 (메인·커버·그 밖 = main, 숙소 = myhome, 대화 = chat, 전투 = battle) ──
   켬/끔은 이 브라우저에 저장되고, 같은 곡이 이어지는 화면으로 넘어가면 듣던 자리부터 이어진다 */
AG.bgm = (() => {
  const MAP = { home: 'myhome', group: 'chat', private: 'chat', dm: 'chat', battle: 'battle', party: 'battle' };
  const page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
  const track = MAP[page] || 'main';
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const a = new Audio(); a.loop = true; a.preload = 'none'; a.volume = .45;
  let on = get('ag-bgm') !== '0', armed = false;
  const listeners = [];
  function play() {
    if (!on) return;
    if (!a.src) {
      a.src = `assets/bgm/${track}.mp3`;
      let pos = null; try { pos = JSON.parse(sessionStorage.getItem('ag-bgm-pos')); } catch {}
      if (pos && pos.track === track && pos.t > 0) a.addEventListener('loadedmetadata', () => { try { a.currentTime = pos.t % (a.duration || 1e9); } catch {} }, { once: true });
    }
    a.play().catch(() => {   // 브라우저가 자동 재생을 막으면 첫 클릭·키 입력 때 시작
      if (armed) return; armed = true;
      const go = () => { armed = false; removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); play(); };
      addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
    });
  }
  addEventListener('pagehide', () => { try { if (a.src) sessionStorage.setItem('ag-bgm-pos', JSON.stringify({ track, t: a.currentTime })); } catch {} });
  document.addEventListener('visibilitychange', () => { if (document.hidden) a.pause(); else play(); });
  play();
  return {
    track, get on() { return on; },
    toggle() { on = !on; try { localStorage.setItem('ag-bgm', on ? '1' : '0'); } catch {} on ? play() : a.pause(); listeners.forEach(f => f(on)); return on; },
    onChange(f) { listeners.push(f); },
  };
})();

/* ── 마우스 커서: 작은 엠블럼(톱니 + 불꽃)에 삼각형 촉을 단 모양. 누를 수 있는 곳에서는 밝은 색. 가리키는 점은 삼각형 끝 ── */
if (matchMedia('(pointer: fine)').matches) {
  const st = document.createElement('style');
  st.textContent = `html, body, #stage { cursor: url(assets/cursor.png) 1 1, auto; }
a, button, select, summary, label[for], [role="button"], [role="link"], [role="option"], [tabindex="0"], [data-menu], .hb, .opt, .side-btn, .top-btn, .row, .post, .cellbtn, .strip, .bw-row, .bw-btn, .tablink { cursor: url(assets/cursor-on.png) 1 1, pointer !important; }
button:disabled, [disabled] { cursor: url(assets/cursor.png) 1 1, not-allowed !important; }
input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable] { cursor: text; }`;
  document.head.appendChild(st);
}

/* ── 다음 화면을 미리 받아 둔다 (화면이 한가할 때, 데이터 절약 모드가 아니면) ── */
addEventListener('load', () => {
  const c = navigator.connection; if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;
  const run = () => [...new Set(Object.values(AG.PAGES))].filter(h => h && !location.pathname.endsWith('/' + h)).forEach(h => { const l = document.createElement('link'); l.rel = 'prefetch'; l.href = h; document.head.appendChild(l); });
  (window.requestIdleCallback || (f => setTimeout(f, 1200)))(run, { timeout: 3000 });
});

/* ── 창(탭)을 닫으려 하면 한 번 묻는다 ──
   사이트 안에서 화면을 옮길 때(누르고 바로 이동 · AG.leaving()을 부른 이동)는 묻지 않는다.
   문구는 브라우저가 정해서 '사이트에서 나가시겠습니까?'처럼 보인다. 데스크톱 앱은 앱이 직접 '정말 종료하시겠습니까?'를 묻고,
   휴대폰 브라우저는 이 확인을 거의 띄우지 않아서 켜지 않는다 */
(function () {
  let inside = 0;
  AG.leaving = () => { inside = Date.now(); };
  if (/Electron/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches) return;
  addEventListener('click', AG.leaving, true);
  addEventListener('submit', AG.leaving, true);
  addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape' || e.key === 'Backspace' && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) AG.leaving(); }, true);
  addEventListener('beforeunload', e => { if (Date.now() - inside < 4000) return; e.preventDefault(); e.returnValue = ''; });
})();

/* ── 정적 파일을 기기에 저장해 두고 바로 꺼내 쓴다 (sw.js). 새 버전은 뒤에서 받아 다음 이동 때 반영 ── */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
