/* 창고 · 전리품 / 숙소 꾸미기 아이템 */
AG.boot();
(async function () {
  const $ = s => document.getElementById(s), html = document.documentElement;
  const COLS = 6, CELL = 250, X0 = 17, Y0 = 24, CAP = 48;   // 칸 좌표는 스크롤 상자(#grid) 안 기준
  let items = [], tab = 'loot', sel = null, sig = '', asking = false;
  const grid = $('grid');
  const tabSvg = document.querySelector('.L[data-r="tabs"]:not(#L-tabs) > svg.sh');

  function cellXY(i) { return [X0 + (i % COLS) * CELL, Y0 + Math.floor(i / COLS) * CELL]; }
  function shown() { return items.filter(i => tab === 'deco' ? i.deco : !i.deco); }

  function render(first) {
    const list = shown();
    $('count').textContent = `ITEMS · ${items.length} / ${CAP}`; $('count').classList.toggle('full', items.length >= CAP);
    let h = `<svg class="selmark" id="selmark" viewBox="${document.getElementById('tpl-sel').dataset.box.split(',').join(' ')}" preserveAspectRatio="none" style="width:250px;height:236px;opacity:0">${document.getElementById('tpl-sel').content.firstElementChild.innerHTML}</svg>`;
    if (!list.length) h += `<p class="inv-empty">${tab === 'deco' ? '꾸미기 아이템이 아직 없어요.' : '아직 전리품이 없어요.'}</p>`;
    for (let i = 0; i < list.length; i++) {   // 가진 물건은 모두 보여 준다 (칸은 물건 수만큼)
      const it = list[i]; const [x, y] = cellXY(i);
      h += `<button class="cellbtn ${first ? 'pop' : ''}" data-id="${AG.esc(it.id)}" style="left:${x}px;top:${y}px;${first ? `animation-delay:${0.6 + Math.min(i, 17) * 0.04}s` : ''}" aria-label="${AG.esc(it.name)}">
        ${it.img ? `<img class="ico" src="${AG.esc(it.img)}" alt="">` : `<span class="glyph">${AG.esc(Array.from(it.name)[0])}</span>`}
        ${it.equipped ? '<span class="tag">장착</span>' : it.placed ? '<span class="tag">숙소</span>' : ''}
        <span class="t s57 nm">${AG.esc(it.name)}</span><span class="t s58 rr">${AG.esc(it.rarity || '')}</span></button>`;
    }
    const keep = grid.scrollTop; grid.innerHTML = h; grid.scrollTop = keep;
    if (list.length) grid.insertAdjacentHTML('beforeend', `<div style="position:absolute;left:0;top:${cellXY(list.length - 1)[1] + 250}px;width:1px;height:1px"></div>`);   // 마지막 줄 아래 여백
    grid.querySelectorAll('[data-id]').forEach(b => b.onclick = () => select(b.dataset.id));
    if (!list.some(i => i.id === sel)) sel = list[0]?.id || null;
    select(sel, true);
  }
  function select(id, quiet) {
    sel = id;
    const list = shown(); const i = list.findIndex(x => x.id === id); const it = list[i];
    const mark = $('selmark');
    grid.querySelectorAll('.cellbtn').forEach(c => c.classList.toggle('sel', c.dataset.id === id));
    if (it) { const [x, y] = cellXY(i); mark.style.left = (x - 17) + 'px'; mark.style.top = (y - 8) + 'px'; mark.style.opacity = 1; if (!quiet) grid.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    else mark.style.opacity = 0;
    $('dName').textContent = it ? it.name : (tab === 'deco' ? '꾸미기 아이템이 없어요' : '전리품이 없어요');
    $('dMeta').textContent = it ? [it.rarity, it.kind, it.source].filter(Boolean).join(' · ') : '';
    $('dDesc').textContent = it ? (it.desc || '') : (tab === 'deco' ? '전투나 탐색에서 얻은 꾸미기 아이템이 여기에 모여요.' : '전투에서 이기면 전리품이 여기에 들어와요.');
    $('dImgBox').innerHTML = it ? (it.img ? `<img src="${AG.esc(it.img)}" alt="">` : `<span class="glyph">${AG.esc(Array.from(it.name)[0])}</span>`) : '';
    const eff = it && AG.battleUse(it);   // 소모품(회복 · 정화 등)은 창고에서 바로 쓸 수 있다
    const canEquip = !!(it && (it.slot || eff)), canPlace = !!(it && it.deco && !it.placed);
    $('equipLbl').textContent = eff ? `사용하기 · ${eff.label}` : it && it.equipped ? '장착 해제' : '장착하기';
    $('equipBtn').disabled = !canEquip; $('equipLbl').style.opacity = canEquip ? 1 : .4;
    $('placeLbl').textContent = it && it.placed ? '숙소에 있어요' : '숙소에 놓기';
    $('placeBtn').disabled = !canPlace; $('placeLbl').style.opacity = canPlace ? 1 : .4;
    $('dropBtn').hidden = !it;
    if (!quiet && it) { const d = $('dName'); d.classList.remove('pop'); void d.offsetWidth; d.classList.add('pop'); }
  }
  async function load(first, quietFail) {
    let next;
    try { next = await AG.inventory.list(); } catch (e) { if (!quietFail) AG.toast(AG.errMsg(e)); return; }
    const s2 = JSON.stringify(next.map(i => [i.id, i.equipped, i.placed]));
    const changed = s2 !== sig; items = next; sig = s2;
    if (first || changed) render(first);
    if (items.length > CAP) askDiscard();
  }
  /* 창고가 넘치면 버릴 물건을 고르게 한다 (장착 중인 물건은 고를 수 없음) */
  function askDiscard() {
    if (asking || document.querySelector('.bw-back')) return;
    asking = true;
    const need = items.length - CAP, picked = new Set();
    const rows = items.map(it => `<button class="bw-row" data-id="${AG.esc(it.id)}" ${it.equipped ? 'disabled style="opacity:.45;cursor:default"' : ''}>
      <span class="bw-ic">${it.img ? `<img src="${AG.esc(it.img)}" alt="" style="width:52px;height:52px;object-fit:contain;image-rendering:pixelated">` : AG.esc(Array.from(it.name)[0])}</span>
      <span class="bw-tx"><b>${AG.esc(it.name)}</b><small>${AG.esc([it.rarity, it.kind, it.equipped ? '장착 중' : it.placed ? '숙소에 있음' : ''].filter(Boolean).join(' · '))}</small></span><span class="bw-on">선택</span></button>`).join('');
    const m = AG.sheet(`<h2>STORAGE FULL</h2><h3>창고가 가득 찼어요</h3><p class="bw-empty" style="padding:0 0 18px;text-align:left">창고에는 ${CAP}개까지 둘 수 있어요. 버릴 물건을 <b id="dNeed">${need}</b>개 이상 골라 주세요. 버린 물건은 되돌릴 수 없어요.</p>
      <div class="bw-list">${rows}</div><div class="bw-btns"><button class="bw-btn" data-ok disabled style="opacity:.45">골라서 버리기</button><button class="bw-btn" data-x>나중에</button></div>`, 'wide');
    const ok = m.el.querySelector('[data-ok]');
    const sync = () => { const done = picked.size >= need; ok.disabled = !done; ok.style.opacity = done ? 1 : .45; ok.textContent = picked.size ? `${picked.size}개 버리기` : "버릴 물건 고르기"; m.el.querySelector('#dNeed').textContent = Math.max(0, need - picked.size) || '0'; };
    m.el.querySelectorAll('.bw-row:not([disabled])').forEach(b => b.onclick = () => {
      const id = b.dataset.id; picked.has(id) ? picked.delete(id) : picked.add(id);
      const on = picked.has(id); b.querySelector('.bw-on').textContent = on ? '버릴 물건' : '선택'; b.querySelector('.bw-on').classList.toggle('on', on); b.style.filter = on ? 'brightness(1.5)' : '';
      sync();
    });
    const close = () => { m.close(); asking = false; };
    m.el.querySelector('[data-x]').onclick = () => { close(); AG.toast('창고가 넘친 상태예요. 다시 들어오면 또 물어볼게요'); };
    ok.onclick = async () => {
      ok.disabled = true;
      try { for (const id of picked) await AG.inventory.discard(id); AG.toast(`${picked.size}개를 버렸어요`); } catch (e) { AG.toast(AG.errMsg(e)); }
      close(); sel = null; await load(true);
    };
    sync();
  }
  /* 새로고침: 버튼 · 화면으로 돌아올 때 · 15초마다 */
  $('refBtn').onclick = async () => { const b = $('refBtn'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin'); sig = ''; await load(false); AG.toast('창고를 새로 불러왔어요'); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false, true); });
  AG.poll(() => load(false, true), 15000);
  function setTab(t) {
    tab = t;
    document.querySelectorAll('.tabbtn').forEach(b => { const on = b.dataset.tab === t; b.className = 't on tabbtn ' + (on ? 's29' : 's56'); });
    if (tabSvg) tabSvg.style.translate = t === 'deco' ? '330px 0' : '0 0';
    sel = null; render(true);
  }
  document.querySelectorAll('.tabbtn').forEach(b => b.onclick = () => setTab(b.dataset.tab));

  $('equipBtn').onclick = async () => {
    const it = items.find(i => i.id === sel); if (!it) return;
    if (AG.battleUse(it)) {
      try { const r = await AG.inventory.use(it.id); const s = await AG.stats().catch(() => null);
        AG.toast(`${AG.j(it.name, '을', '를')} 썼어요 · ${r.label}` + (s ? ` (체력 ${s.hp}/${s.hpMax} · 잔향 ${s.echoLeft} · 오염도 ${s.taintTier})` : '')); await load(); } catch (e) { AG.toast(AG.errMsg(e)); }
      return;
    }
    try { const r = await AG.inventory.equip(it.id); AG.toast(r.equipped ? `${it.name} 장착했어요` : `${it.name} 장착을 풀었어요`); await load(); } catch (e) { AG.toast(AG.errMsg(e)); }
  };
  $('placeBtn').onclick = async () => {
    const it = items.find(i => i.id === sel); if (!it) return;
    try { await AG.inventory.place(it.id); AG.toast(`${it.name}을(를) 숙소에 놓았어요`); await load(); } catch (e) { AG.toast(AG.errMsg(e)); }
  };
  $('dropBtn').onclick = () => {
    const it = items.find(i => i.id === sel); if (!it) return;
    const m = AG.modal(`<h2>DISCARD</h2><h3>${AG.esc(it.name)}을(를) 버릴까요?</h3><p>버린 아이템은 되돌릴 수 없어요.</p><div class="row"><button class="ghost" data-x>취소</button><button data-ok style="background:#b24545;color:#fff">버리기</button></div>`);
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-ok]').onclick = async () => { m.close(); try { await AG.inventory.discard(it.id); AG.toast('버렸어요'); sel = null; await load(); } catch (e) { AG.toast(AG.errMsg(e)); } };
  };
  addEventListener('keydown', e => {
    if (document.querySelector('.modal-back')) return;
    const list = shown(); const i = list.findIndex(x => x.id === sel); if (i < 0) return;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: html.classList.contains('m') ? 4 : COLS, ArrowUp: -(html.classList.contains('m') ? 4 : COLS) }[e.key];
    if (d && list[i + d]) { e.preventDefault(); select(list[i + d].id); }
  });
  if (new URLSearchParams(location.search).get('tab') === 'deco') setTab('deco'); else load(true);
})();
