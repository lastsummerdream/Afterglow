/* 창고 · 전리품 / 숙소 꾸미기 아이템 */
AG.boot();
(async function () {
  const $ = s => document.getElementById(s);
  const COLS = 6, ROWS = 3, CELL = 250, X0 = 167, Y0 = 360;
  let items = [], tab = 'loot', sel = null;
  const grid = $('grid');
  const tabSvg = document.querySelector('.L[data-r="tabs"]:not(#L-tabs) > svg.sh');

  function cellXY(i) { return [X0 + (i % COLS) * CELL, Y0 + Math.floor(i / COLS) * CELL]; }
  function shown() { return items.filter(i => tab === 'deco' ? i.deco : !i.deco); }

  function render(first) {
    const list = shown();
    $('count').textContent = `ITEMS · ${items.length} / 48`;
    let h = `<svg class="selmark" id="selmark" viewBox="${document.getElementById('tpl-sel').dataset.box.split(',').join(' ')}" preserveAspectRatio="none" style="width:250px;height:236px;opacity:0">${document.getElementById('tpl-sel').content.firstElementChild.innerHTML}</svg>`;
    for (let i = 0; i < COLS * ROWS; i++) {
      const it = list[i]; const [x, y] = cellXY(i);
      if (!it) { h += `<div class="cellbtn" style="left:${x}px;top:${y}px;pointer-events:none"></div>`; continue; }
      h += `<button class="cellbtn ${first ? 'pop' : ''}" data-id="${AG.esc(it.id)}" style="left:${x}px;top:${y}px;${first ? `animation-delay:${0.6 + i * 0.04}s` : ''}" aria-label="${AG.esc(it.name)}">
        ${it.img ? `<img class="ico" src="${AG.esc(it.img)}" alt="">` : `<span class="glyph">${AG.esc(Array.from(it.name)[0])}</span>`}
        ${it.equipped ? '<span class="tag">장착</span>' : it.placed ? '<span class="tag">숙소</span>' : ''}
        <span class="t s57 nm">${AG.esc(it.name)}</span><span class="t s58 rr">${AG.esc(it.rarity || '')}</span></button>`;
    }
    grid.innerHTML = h;
    grid.querySelectorAll('[data-id]').forEach(b => b.onclick = () => select(b.dataset.id));
    if (!list.some(i => i.id === sel)) sel = list[0]?.id || null;
    select(sel, true);
  }
  function select(id, quiet) {
    sel = id;
    const list = shown(); const i = list.findIndex(x => x.id === id); const it = list[i];
    const mark = $('selmark');
    grid.querySelectorAll('.cellbtn').forEach(c => c.classList.toggle('sel', c.dataset.id === id));
    if (it) { const [x, y] = cellXY(i); mark.style.left = (x - 17) + 'px'; mark.style.top = (y - 8) + 'px'; mark.style.opacity = 1; }
    else mark.style.opacity = 0;
    $('dName').textContent = it ? it.name : (tab === 'deco' ? '꾸미기 아이템이 없어요' : '전리품이 없어요');
    $('dMeta').textContent = it ? [it.rarity, it.kind, it.source].filter(Boolean).join(' · ') : '';
    $('dDesc').textContent = it ? (it.desc || '') : (tab === 'deco' ? '전투나 탐색에서 얻은 꾸미기 아이템이 여기에 모여요.' : '전투에서 이기면 전리품이 여기에 들어와요.');
    $('dImgBox').innerHTML = it ? (it.img ? `<img src="${AG.esc(it.img)}" alt="">` : `<span class="glyph">${AG.esc(Array.from(it.name)[0])}</span>`) : '';
    const canEquip = !!(it && it.slot), canPlace = !!(it && it.deco && !it.placed);
    $('equipLbl').textContent = it && it.equipped ? '장착 해제' : '장착하기';
    $('equipBtn').disabled = !canEquip; $('equipLbl').style.opacity = canEquip ? 1 : .4;
    $('placeLbl').textContent = it && it.placed ? '숙소에 있어요' : '숙소에 놓기';
    $('placeBtn').disabled = !canPlace; $('placeLbl').style.opacity = canPlace ? 1 : .4;
    $('dropBtn').hidden = !it;
    if (!quiet && it) { const d = $('dName'); d.classList.remove('pop'); void d.offsetWidth; d.classList.add('pop'); }
  }
  async function load(first) {
    try { items = await AG.inventory.list(); } catch (e) { AG.toast(AG.errMsg(e)); items = []; }
    render(first);
  }
  function setTab(t) {
    tab = t;
    document.querySelectorAll('.tabbtn').forEach(b => { const on = b.dataset.tab === t; b.className = 't on tabbtn ' + (on ? 's29' : 's56'); });
    if (tabSvg) tabSvg.style.translate = t === 'deco' ? '330px 0' : '0 0';
    sel = null; render(true);
  }
  document.querySelectorAll('.tabbtn').forEach(b => b.onclick = () => setTab(b.dataset.tab));

  $('equipBtn').onclick = async () => {
    const it = items.find(i => i.id === sel); if (!it) return;
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
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key];
    if (d && list[i + d]) { e.preventDefault(); select(list[i + d].id); }
  });
  if (new URLSearchParams(location.search).get('tab') === 'deco') setTab('deco'); else load(true);
})();
