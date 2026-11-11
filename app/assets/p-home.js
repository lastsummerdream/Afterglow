/* 숙소 · 마이홈 : 32 × 20 도트 공간 (칸 50px), 도트 캐릭터 이동, 꾸미기 */
AG.boot();
(async function () {
  const $ = s => document.getElementById(s);
  const room = $('room'), furn = $('furn'), ch = $('char'), spr = $('spr');
  const CELL = 50, COLS = 32, ROWS = 20, FLOOR = 12; // 12번째 줄부터 바닥
  const CW = 2, CH = 3;                              // 캐릭터 크기 (칸)
  let home = { items: [], sprite: null, pos: { x: 14, y: 14 } }, mode = 'view';

  /* 탭 모양 (피그마 템플릿) */
  const tb = document.getElementById('tpl-tab').dataset.box.split(',').map(Number);
  $('tabShape').innerHTML = `<svg viewBox="${tb.join(' ')}" preserveAspectRatio="none" style="left:${tb[0]}px;top:${tb[1]}px;width:${tb[2]}px;height:${tb[3]}px">${document.getElementById('tpl-tab').content.firstElementChild.innerHTML}</svg>`;
  const tabSvg = $('tabShape').firstElementChild;

  try { home = { ...home, ...(await AG.home.get()) }; } catch (e) { AG.toast(AG.errMsg(e)); }
  const me = await AG.me().catch(() => null);
  $('cName').textContent = home.name || (me && me.name) || '캐릭터 이름';
  if (!home.pos) home.pos = { x: 14, y: 14 };

  const save = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => AG.home.save({ items: home.items, sprite: home.sprite, pos: home.pos }).catch(e => AG.toast(AG.errMsg(e))), 500); }; })();

  /* ── 캐릭터 ── */
  function place(animate = true) {
    ch.style.transition = animate ? '' : 'none';
    ch.style.left = home.pos.x * CELL + 'px'; ch.style.top = home.pos.y * CELL + 'px';
    if (!animate) { void ch.offsetWidth; ch.style.transition = ''; }
  }
  function sprite() {
    ch.classList.toggle('has', !!home.sprite);
    spr.style.backgroundImage = home.sprite ? `url("${home.sprite}")` : '';
  }
  const clampPos = (x, y) => ({ x: Math.max(0, Math.min(COLS - CW, x)), y: Math.max(FLOOR - CH + 1, Math.min(ROWS - CH, y)) });
  let walkTimer, path = [];
  function walkTo(tx, ty) {
    const t = clampPos(tx, ty); path = [];
    let { x, y } = home.pos;
    while (x !== t.x || y !== t.y) { if (x !== t.x) x += Math.sign(t.x - x); else y += Math.sign(t.y - y); path.push({ x, y }); }
    step();
  }
  function step() {
    clearTimeout(walkTimer);
    if (!path.length) { ch.classList.remove('walk'); save(); return; }
    const n = path.shift();
    if (n.x !== home.pos.x) ch.classList.toggle('flip', n.x < home.pos.x);
    home.pos = n; ch.classList.add('walk'); place();
    walkTimer = setTimeout(step, 160);
  }
  addEventListener('keydown', e => {
    if (mode !== 'view' || document.querySelector('.modal-back') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }[e.key];
    if (!d) return; e.preventDefault();
    walkTo(home.pos.x + d[0], home.pos.y + d[1]);
  });
  room.addEventListener('pointerdown', e => {
    if (mode !== 'view' || e.target.closest('.fu')) return;
    const r = room.getBoundingClientRect(), s = r.width / 1600;
    const cx = Math.floor((e.clientX - r.left) / s / CELL), cy = Math.floor((e.clientY - r.top) / s / CELL);
    if (cy < FLOOR) { AG.toast('바닥을 눌러 이동해요'); return; }
    walkTo(cx - 1, cy - CH + 1);
  });

  /* ── 가구 ── */
  function renderFurn() {
    furn.innerHTML = '';
    home.items.forEach(it => {
      const d = document.createElement('div');
      d.className = 'fu' + (it.img ? ' img' : '');
      Object.assign(d.style, { left: it.x * CELL + 'px', top: it.y * CELL + 'px', width: it.w * CELL + 'px', height: it.h * CELL + 'px', zIndex: it.y + it.h > home.pos.y + CH ? 6 : 4 });
      if (it.img) d.style.backgroundImage = `url("${it.img}")`;
      d.innerHTML = `${AG.esc(it.img ? '' : it.name)}<button class="x" title="치우기" aria-label="${AG.esc(it.name)} 치우기">×</button>`;
      d.querySelector('.x').onclick = e => { e.stopPropagation(); home.items = home.items.filter(x => x !== it); renderFurn(); renderList(); save(); AG.toast(`${it.name}을(를) 치웠어요`); };
      drag(d, it);
      furn.appendChild(d);
    });
  }
  function drag(el, it) {
    el.addEventListener('pointerdown', e => {
      if (mode !== 'edit' || e.target.classList.contains('x')) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('drag');
      const r = room.getBoundingClientRect(), s = r.width / 1600;
      const ox = (e.clientX - r.left) / s - it.x * CELL, oy = (e.clientY - r.top) / s - it.y * CELL;
      const mv = ev => {
        it.x = Math.max(0, Math.min(COLS - it.w, Math.round(((ev.clientX - r.left) / s - ox) / CELL)));
        it.y = Math.max(0, Math.min(ROWS - it.h, Math.round(((ev.clientY - r.top) / s - oy) / CELL)));
        el.style.left = it.x * CELL + 'px'; el.style.top = it.y * CELL + 'px';
      };
      const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); save(); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
    });
  }
  function renderList() {
    const box = $('placed');
    if (!home.items.length) { box.innerHTML = '<p class="empty-p">아직 놓은 가구가 없어요. 창고에서 가져오거나 도트 이미지를 올려 보세요.</p>'; return; }
    box.innerHTML = home.items.map((it, i) => `<div class="prow pop" style="animation-delay:${i * .05}s"><span class="th" style="${it.img ? `background-image:url('${AG.esc(it.img)}')` : ''}"></span>
      <span class="t s69 nm">${AG.esc(it.name)}</span><span class="t s70 sb">${it.invId ? '창고에서 꺼냄' : `도트 · ${it.w}×${it.h}`}</span>
      <button class="rm" data-i="${i}">치우기</button></div>`).join('');
    box.querySelectorAll('.rm').forEach(b => b.onclick = () => { const it = home.items[+b.dataset.i]; home.items.splice(+b.dataset.i, 1); renderFurn(); renderList(); save(); AG.toast(`${it.name}을(를) 치웠어요`); });
  }

  /* ── 모드 ── */
  function setMode(m) {
    mode = m;
    room.classList.toggle('editmode', m === 'edit');
    document.querySelectorAll('.tabbtn').forEach(b => { const on = b.dataset.mode === m; b.className = 't on tabbtn ' + (on ? 's65' : 's66'); });
    tabSvg.style.left = (m === 'edit' ? tb[0] + 256 : tb[0]) + 'px';
    $('hint').textContent = m === 'edit' ? '가구를 끌어 옮기고 × 로 치워요' : '방향키 / 바닥 클릭으로 이동';
  }
  document.querySelectorAll('.tabbtn').forEach(b => b.onclick = () => setMode(b.dataset.mode));

  /* ── 버튼 ── */
  const imgSize = src => new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([100, 100]); i.src = src; });
  $('upBtn').onclick = () => $('pickFurn').click();
  $('pickFurn').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const url = await AG.pixelImage(f); const [w, h] = await imgSize(url);
      const k = Math.max(1, Math.round(Math.max(w, h) / 32));
      const cw = Math.max(1, Math.min(10, Math.round(w / k / 16))), chh = Math.max(1, Math.min(10, Math.round(h / k / 16)));
      const name = await AG.ask({ sub: 'NEW FURNITURE', title: '가구 이름', label: '이름', value: f.name.replace(/\.\w+$/, '').slice(0, 20), ok: '놓기' });
      if (!name) return;
      home.items.push({ id: 'h' + Date.now(), name, img: url, x: 2, y: FLOOR - chh + 2, w: cw, h: chh });
      renderFurn(); renderList(); save(); setMode('edit'); AG.toast('새 가구를 놓았어요 · 끌어서 옮겨 보세요');
    } catch (err) { AG.toast(AG.errMsg(err)); }
  };
  $('sprBtn').onclick = () => {
    if (home.sprite) {
      const m = AG.modal(`<h2>SPRITE</h2><h3>도트 캐릭터</h3><p>새 이미지를 올리거나 기본 모습으로 돌릴 수 있어요.</p><div class="row"><button class="ghost" data-reset>기본으로</button><button data-up>새로 올리기</button></div>`);
      m.el.querySelector('[data-reset]').onclick = () => { m.close(); home.sprite = null; sprite(); save(); };
      m.el.querySelector('[data-up]').onclick = () => { m.close(); $('pickSpr').click(); };
    } else $('pickSpr').click();
  };
  $('pickSpr').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { home.sprite = await AG.pixelImage(f); sprite(); save(); AG.toast('도트 캐릭터를 바꿨어요'); } catch (err) { AG.toast(AG.errMsg(err)); }
  };
  $('fromInvBtn').onclick = async () => {
    let inv = []; try { inv = await AG.inventory.list(); } catch (e) { return AG.toast(AG.errMsg(e)); }
    const can = inv.filter(i => i.deco && !home.items.some(h => h.invId === i.id));
    if (!can.length) { AG.toast('숙소에 놓을 꾸미기 아이템이 없어요'); return; }
    const p = await AG.pick({ sub: 'FROM INVENTORY', title: '창고에서 가져오기', items: can.map(i => ({ label: i.name, sub: `${i.rarity} · ${i.kind}`, i })) });
    if (!p) return;
    home.items.push({ id: 'h' + Date.now(), invId: p.i.id, name: p.i.name, img: p.i.img || null, x: 3 + (home.items.length * 4) % 26, y: FLOOR - 1, w: 3, h: 3 });
    renderFurn(); renderList(); save(); setMode('edit'); AG.toast(`${p.i.name}을(를) 꺼냈어요`);
  };

  place(false); sprite(); renderFurn(); renderList(); setMode('view');
})();
