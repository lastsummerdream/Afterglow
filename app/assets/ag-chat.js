/* 채팅 3종(단체 단말 · 개인 연락망 · 개인 단말) 공통 엔진 */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = AG.esc;



/* cfg = {
     listItems(): Promise<[{id, title, sub, badge}]>, emptyList, onSelect(id, item),
     loadMessages(id), send(id, text), timeFmt(ms), urimDeleted: bool, emptyMsgs,
     onPlus(), afterRender() } */
window.AGChat = function (cfg) {
  const list = $('#list'), box = $('#msgs'), input = $('#msgInput'), sendBtn = $('#sendBtn');
  const st = { items: [], active: null, msgs: [], sig: null };
  const fmt = cfg.timeFmt || AG.time;

  async function loadList(keep) {
    try { st.items = await cfg.listItems(); } catch (e) { AG.toast(AG.errMsg(e)); st.items = []; }
    renderList();
    const want = keep || st.active || cfg.initial?.(st.items) || st.items[0]?.id;
    if (want && st.items.some(i => i.id === want)) { if (want !== st.active) select(want); }
    else if (!st.items.length) { st.active = null; box.innerHTML = `<p class="empty">${esc(cfg.emptyList || '아직 아무것도 없어요')}</p>`; cfg.onSelect?.(null, null); }
  }
  function renderList() {
    list.innerHTML = '';
    st.items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'row' + (st.listShown ? '' : ' slide-in') + (it.id === st.active ? ' active' : '');
      if (!st.listShown) b.style.animationDelay = (0.5 + i * 0.07) + 's';
      b.setAttribute('role', 'option'); b.dataset.id = it.id;
      b.innerHTML = AG.tpl('rowSel', 'class="selsh"') +
        `<span class="t ttl ${it.id === st.active ? 's3' : 's5'}">${esc(it.title)}</span>` +
        `<span class="t sub ${it.id === st.active ? 's4' : 's6'}">${esc(it.sub || '')}</span>` +
        (it.badge ? `<span class="badge"></span><span class="t s23" style="left:530px;top:38px;width:44px">${it.badge > 99 ? '99+' : it.badge}</span>` : '');
      b.onclick = () => select(it.id);
      list.appendChild(b);
    });
    st.listShown = true;
  }
  function markActive() {
    list.querySelectorAll('.row').forEach(r => {
      const on = r.dataset.id === st.active;
      r.classList.toggle('active', on);
      r.querySelector('.ttl').className = 't ttl ' + (on ? 's3' : 's5');
      r.querySelector('.sub').className = 't sub ' + (on ? 's4' : 's6');
    });
  }
  async function select(id) {
    st.active = id; st.sig = null; markActive();
    const item = st.items.find(i => i.id === id);
    cfg.onSelect?.(id, item);
    box.innerHTML = '';
    await refresh(true);
    input.focus({ preventScroll: true });
  }
  async function refresh(first) {
    if (!st.active) return;
    if (box.querySelector('.editing')) return; // 고치는 중엔 다시 그리지 않음
    const id = st.active;
    let msgs;
    try { msgs = await cfg.loadMessages(id); } catch (e) { if (first) AG.toast(AG.errMsg(e)); return; }
    if (id !== st.active) return;
    const sig = msgs.map(m => m.id + ':' + (m.editedAt || 0) + ':' + (m.deleted ? 1 : 0)).join('|');
    if (sig === st.sig) return;
    const old = new Set(st.msgs.map(m => m.id));
    st.msgs = msgs; st.sig = sig;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 200;
    render(first ? null : old);
    if (first || nearBottom) box.scrollTop = box.scrollHeight;
    cfg.afterRender?.(msgs);
  }
  function render(old) {
    box.innerHTML = '';
    if (!st.msgs.length) { box.innerHTML = `<p class="empty">${esc(cfg.emptyMsgs || '첫 메시지를 보내 보세요')}</p>`; return; }
    st.msgs.forEach((m, i) => box.appendChild(node(m, old ? !old.has(m.id) : true, i)));
  }
  function node(m, anim, i) {
    const el = document.createElement('div');
    if (m.deleted) {
      if (!cfg.urimDeleted) return document.createDocumentFragment();
      el.className = 'msg urim';
      el.innerHTML = `<div class="hd"><span class="nm">URIM</span><span class="t s12" style="position:static">${esc(fmt(m.deletedAt || m.at))}</span></div>
        <p class="bd t s13" style="position:static">${esc(m.name)}님이 보낸 메시지가 삭제됐어요. 삭제된 내용은 URIM도 볼 수 없어요.</p>`;
    } else if (m.mine) {
      el.className = 'msg me';
      el.innerHTML = `<span class="t s15 tm" style="position:static">${esc(fmt(m.at))}${m.editedAt ? '<span class="edited">수정됨</span>' : ''}</span>
        <div class="bub">${AG.tpl('mine')}<p class="t s14 bd" style="position:relative">${esc(m.text)}</p></div>`;
      const txt = el.querySelector('.bd');
      AG.ownActions(el, txt, {
        place: { right: '150px', top: '-8px' },
        getText: () => m.text,
        confirmText: cfg.urimDeleted ? '삭제할까요? URIM이 안내를 남겨요' : '삭제할까요?',
        onSave: async v => { await AG.msg.edit(m.id, v); m.text = v; m.editedAt = Date.now(); st.sig = null; },
        done: () => refresh(),
        onDelete: async () => { await AG.msg.del(m.id); st.sig = null; el.style.transition = 'opacity .25s, translate .25s'; el.style.opacity = 0; el.style.translate = '40px 0'; setTimeout(() => refresh(), 250); },
      });
    } else {
      el.className = 'msg';
      el.innerHTML = `<div class="hd"><span class="t s11" style="position:static">${esc(m.name)}</span><span class="t s12" style="position:static">${esc(fmt(m.at))}${m.editedAt ? '<span class="edited">수정됨</span>' : ''}</span></div>
        <p class="bd t s13" style="position:static">${esc(m.text)}</p>`;
    }
    if (anim) { el.classList.add('pop'); el.style.animationDelay = Math.min(i, 8) * 0.04 + 's'; }
    return el;
  }
  async function send() {
    const v = input.value.trim();
    if (!v || !st.active) { if (!st.active) AG.toast(cfg.emptyList || '대화 상대를 먼저 골라 주세요'); return; }
    input.value = '';
    try {
      await cfg.send(st.active, v);
      st.sig = null; await refresh(); box.scrollTop = box.scrollHeight;
      loadList(st.active);
    } catch (e) { input.value = v; AG.toast(AG.errMsg(e)); }
  }
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } });
  sendBtn.addEventListener('click', send);
  $('#plusBtn')?.addEventListener('click', () => cfg.onPlus?.());
  AG.poll(() => { refresh(); loadList(st.active); }, 4000);

  return { loadList, select, refresh, get active() { return st.active; }, get items() { return st.items; }, get msgs() { return st.msgs; } };
};
})();
