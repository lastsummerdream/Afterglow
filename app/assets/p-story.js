/* 스토리 진행: 노션의 줄거리를 URIM이 캐릭터에 맞춰 들려준다 */
AG.boot();
(async function () {
  const $ = s => document.getElementById(s);
  const rows = $('rows'), log = $('sLog'), input = $('actInput'), send = $('sendBtn'), choices = $('choices'), stage = $('stage');
  let list = [], run = null, shown = 0, busy = false, leaving = false;
  const qid = new URLSearchParams(location.search).get('id');

  function renderList() {
    const solo = list.filter(s => s.kind !== 'group' || (run && s.id === run.id));
    rows.innerHTML = solo.map(s => `<button class="srow${run && run.id === s.id ? ' on' : ''}" data-id="${AG.esc(s.id)}" type="button"><b>${AG.esc(s.title)}</b>
      ${s.intro ? `<small>${AG.esc(s.intro)}</small>` : ''}<em>${s.kind === 'group' ? '단체 스토리' : s.done ? '끝까지 봤어요' : s.started ? '이어서 하기' : '새 이야기'}</em></button>`).join('')
      || '<p class="sl empty" style="padding-top:60px;font-size:24px">아직 열린 이야기가 없어요.</p>';
    rows.querySelectorAll('.srow').forEach(b => b.onclick = () => open(b.dataset.id));
    const nt = (list.find(s => s.notice) || {}).notice;   // 노션 스크립트를 못 읽어 예시만 보일 때 이유를 알려 준다
    if (nt) rows.insertAdjacentHTML('beforeend', `<p class="snote">${AG.esc(nt)}</p>`);
  }
  function line(l) {
    const d = document.createElement('p');
    const mine = l.who === 'me' && (!l.userId || l.userId === run.me);
    d.className = 'sl pop ' + (l.who === 'urim' ? 'urim' : l.who === 'sys' ? 'sys' : mine ? 'me' : 'other');
    if (l.who === 'me') d.dataset.nm = l.name || '';
    return d;
  }
  function type(el, text) {
    return new Promise(res => {
      el.classList.add('typing'); const ch = Array.from(text); let i = 0;
      const step = () => { i = Math.min(ch.length, i + 3); el.textContent = ch.slice(0, i).join(''); log.scrollTop = log.scrollHeight; if (i < ch.length) setTimeout(step, 16); else { el.classList.remove('typing'); res(); } };
      step();
    });
  }
  async function renderLog(animate) {
    if (!animate || shown > run.log.length) { log.innerHTML = ''; shown = 0; }
    for (let i = shown; i < run.log.length; i++) {
      const l = run.log[i], d = line(l); log.appendChild(d);
      if (animate && l.who === 'urim') await type(d, l.text); else d.textContent = l.text;
    }
    shown = run.log.length; log.scrollTop = log.scrollHeight;
  }
  function controls() {
    const off = !run || run.done || !!run.battle;
    input.disabled = send.disabled = off || busy;
    input.placeholder = !run ? '목록에서 이야기를 골라 주세요' : run.done ? '이야기가 끝났어요' : run.battle ? '전투가 먼저예요' : '캐릭터의 행동이나 대사를 적어 주세요';
    choices.innerHTML = !run ? '' : run.done ? (run.kind === 'group' ? '' : '<button class="strip" data-reset type="button">처음부터 다시</button>') + '<a class="strip" href="' + AG.PAGES.enter + '">돌아가기</a>'
      : run.battle ? '<button class="strip" data-battle type="button">전투 화면으로</button>'
      : run.choices.map(c => `<button class="strip" data-c type="button">${AG.esc(c)}</button>`).join('');
    choices.querySelectorAll('[data-c]').forEach(b => b.onclick = () => act(b.textContent));
    choices.querySelector('[data-battle]')?.addEventListener('click', toBattle);
    choices.querySelector('[data-reset]')?.addEventListener('click', async () => { setBusy(true); try { run = await AG.story.reset(run.id); shown = 0; await renderLog(true); } catch (e) { AG.toast(AG.errMsg(e)); } setBusy(false); });
  }
  function setBusy(v) { busy = v; stage.classList.toggle('busy', v); controls(); }
  function toBattle() {   // 줄거리에 전투가 나오면 전투 화면으로 보낸다
    if (leaving || !run || !run.battle) return; leaving = true;
    AG.toast(`${run.battle.enemy || '적'}과(와) 전투가 시작돼요`, 1500);
    setTimeout(() => location.href = run.battle.party ? AG.PAGES.party + '?id=' + run.battle.party : AG.PAGES.battle, 1500);
  }
  async function open(id) {
    if (busy) return;
    setBusy(true);
    $('sTitle').textContent = (list.find(s => s.id === id) || {}).title || '불러오는 중…';
    log.innerHTML = '<p class="sl empty">URIM이 이야기를 준비하고 있어요…</p>'; shown = 0;
    try {
      const fresh = !(list.find(s => s.id === id) || {}).started;
      run = await AG.story.open(id);
      history.replaceState(null, '', '?id=' + id);
      $('sTitle').textContent = run.title; $('sCap').textContent = run.kind === 'group' ? 'GROUP STORY' : 'STORY';
      const it = list.find(s => s.id === id); if (it) it.started = true;
      renderList(); log.innerHTML = ''; await renderLog(fresh);
    } catch (e) { run = null; log.innerHTML = ''; AG.toast(AG.errMsg(e)); }
    setBusy(false);
    if (run && run.battle) toBattle(); else input.focus({ preventScroll: true });
  }
  async function act(text) {
    if (busy || !run || run.done || run.battle) return;
    setBusy(true);
    const mine = line({ who: 'me', name: '' }); mine.textContent = text; mine.classList.add('me'); log.appendChild(mine); log.scrollTop = log.scrollHeight;
    try { const r = await AG.story.act(run.id, text); mine.remove(); run = r; await renderLog(true); }
    catch (e) { mine.remove(); AG.toast(AG.errMsg(e)); }
    const it = list.find(s => s.id === run.id); if (it) it.done = run.done;
    setBusy(false); renderList();
    if (run.battle) toBattle(); else input.focus({ preventScroll: true });
  }
  const submit = () => { const v = input.value.trim(); if (!v) return input.focus(); input.value = ''; act(v); };
  send.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } });

  try { list = await AG.story.list(); } catch (e) { AG.toast(AG.errMsg(e)); }
  renderList(); controls();
  log.innerHTML = '<p class="sl empty">목록에서 이야기를 골라 주세요.<br>하던 이야기는 멈춘 곳에서 이어져요.</p>';
  const first = qid && list.find(s => s.id === qid) ? qid : null;
  if (first) open(first);
  // 단체 스토리는 다른 사람의 진행이 보이도록 주기적으로 새로 읽는다
  setInterval(async () => {
    if (document.hidden || busy || leaving || !run || run.kind !== 'group' || run.done) return;
    try { const r = await AG.story.open(run.id); if (busy) return; if (r.log.length !== run.log.length || !!r.battle !== !!run.battle) { run = r; await renderLog(true); controls(); if (run.battle) toBattle(); } } catch {}
  }, 4000);
})();
