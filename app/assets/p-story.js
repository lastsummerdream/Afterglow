/* 스토리 진행: 노션의 줄거리를 URIM이 캐릭터에 맞춰 들려준다 */
AG.boot();
(async function () {
  const $ = s => document.getElementById(s);
  const rows = $('rows'), log = $('sLog'), input = $('actInput'), send = $('sendBtn'), choices = $('choices'), stage = $('stage');
  let list = [], run = null, shown = 0, lastN = 0, busy = false, leaving = false;
  const qid = new URLSearchParams(location.search).get('id');

  function renderList() {
    rows.innerHTML = list.map(s => `<button class="srow${run && run.id === s.id ? ' on' : ''}" data-id="${AG.esc(s.id)}" type="button"><b>${AG.esc(s.title)}</b>
      ${s.intro ? `<small>${AG.esc(s.intro)}</small>` : ''}<em>${s.kind === 'group' ? (s.done ? '단체 스토리 · 끝까지 봤어요' : s.started ? '단체 스토리 · 중간 진입 가능' : '단체 스토리 · 참여하기') : s.done ? '끝까지 봤어요' : s.started ? '이어서 하기' : '새 이야기'}</em></button>`).join('')
      || '<p class="sl empty" style="padding-top:60px;font-size:24px">아직 열린 이야기가 없어요.</p>';
    rows.querySelectorAll('.srow').forEach(b => b.onclick = () => open(b.dataset.id));
    const nt = (list.find(s => s.notice) || {}).notice;   // 노션 스크립트를 못 읽어 예시만 보일 때 이유를 알려 준다
    if (nt) rows.insertAdjacentHTML('beforeend', `<p class="snote">${AG.esc(nt)}</p>`);
  }
  function line(l) {
    const d = document.createElement('p');
    const mine = l.who === 'me' && (!l.userId || l.userId === run.me);
    d.className = 'sl pop ' + (l.who === 'urim' ? 'urim' : l.who === 'sys' ? 'sys' : mine ? 'me' : 'other') + (l.for ? ' priv' : '');   // priv: 각자 진행 중 나에게만 보이는 줄
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
    const L = run.log;
    if (L.length && L[0].n != null) {   // 단체 스토리: 줄 번호로 새 줄만 덧붙인다
      if (!animate) { log.innerHTML = ''; lastN = 0; }
      for (const l of L) {
        if (l.n <= lastN) continue;
        const d = line(l); log.appendChild(d);
        if (animate && l.who === 'urim') await type(d, l.text); else d.textContent = l.text;
        lastN = l.n;
      }
      log.scrollTop = log.scrollHeight; return;
    }
    if (!animate || shown > run.log.length) { log.innerHTML = ''; shown = 0; }
    for (let i = shown; i < run.log.length; i++) {
      const l = run.log[i], d = line(l); log.appendChild(d);
      if (animate && l.who === 'urim') await type(d, l.text); else d.textContent = l.text;
    }
    shown = run.log.length; log.scrollTop = log.scrollHeight;
  }
  /* 단체 스토리의 지금 단계: vote(분기 투표) · solo(각자 진행) · wait(합류 대기) · busy(URIM이 일행 장면을 쓰는 중) · open */
  function phaseOf() {
    if (!run || run.kind !== 'group' || run.done || run.battle || !run.phase) return '';
    if (run.busy && run.phase !== 'solo') return 'busy';
    if (run.phase === 'solo' && run.track && run.track.ready) return 'wait';
    return run.phase;
  }
  const mins = ms => ms > 60000 ? `${Math.ceil(ms / 60000)}분` : '곧';
  function controls() {
    const ph = phaseOf(), v = run && run.vote, t = run && run.track;
    const pe = $('sPhase'); pe.textContent = { vote: '분기 투표', solo: '각자 진행', wait: '합류 대기', busy: 'URIM 진행 중', open: '준비 중' }[ph] || ''; pe.dataset.ph = ph;
    const off = !run || run.done || !!run.battle || (ph && ph !== 'solo') || (ph === 'solo' && run.busy);
    input.disabled = send.disabled = off || busy;
    input.placeholder = !run ? '목록에서 이야기를 골라 주세요' : run.done ? '이야기가 끝났어요' : run.battle ? '전투가 먼저예요'
      : ph === 'vote' && v ? `분기 투표 · 과반수 ${v.need}표면 진행 · ${v.voters}/${v.active}명 투표 · ${mins(v.left)} 뒤 마감`
      : ph === 'wait' && t ? (t.restNames.length ? `합류 지점에서 기다리는 중 · ${t.restNames.join(', ')} 님을 기다려요 (최대 ${mins(t.left)})` : '일행이 모두 모였어요')
      : ph === 'busy' ? 'URIM이 일행의 장면을 쓰고 있어요…' : ph === 'open' ? '이야기를 준비하고 있어요…'
      : ph === 'solo' && t ? `각자 진행 ${t.steps}/${t.max} · 캐릭터의 행동이나 대사를 적어 주세요` : '캐릭터의 행동이나 대사를 적어 주세요';
    choices.innerHTML = !run ? '' : run.done ? (run.kind === 'group' ? '' : '<button class="strip" data-reset type="button">처음부터 다시</button>') + '<a class="strip" href="' + AG.PAGES.enter + '">돌아가기</a>'
      : run.battle ? '<button class="strip" data-battle type="button">전투 화면으로</button>'
      : ph === 'vote' && v ? v.options.map((o, i) => `<button class="strip vote${v.mine === i ? ' on' : ''}" data-v="${i}" type="button">${AG.esc(o.text)}<span class="vn">${o.n}표</span></button>`).join('')
      : ph === 'wait' && t ? `<button class="strip" type="button" disabled>합류 대기 · ${t.readyNames.length}/${t.readyNames.length + t.restNames.length}명 도착</button>`
      : ph === 'busy' || ph === 'open' ? ''
      : run.choices.map(c => `<button class="strip" data-c type="button">${AG.esc(c)}</button>`).join('') + (ph === 'solo' ? '<button class="strip ready" data-ready type="button">합류 지점으로</button>' : '');
    choices.querySelectorAll('[data-c]').forEach(b => b.onclick = () => act(b.textContent));
    choices.querySelectorAll('[data-v]').forEach(b => b.onclick = () => vote(+b.dataset.v));
    choices.querySelector('[data-ready]')?.addEventListener('click', ready);
    choices.querySelector('[data-battle]')?.addEventListener('click', toBattle);
    choices.querySelector('[data-reset]')?.addEventListener('click', async () => { setBusy(true); try { run = await AG.story.reset(run.id); shown = 0; lastN = 0; await renderLog(true); } catch (e) { AG.toast(AG.errMsg(e)); } setBusy(false); });
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
    log.innerHTML = '<p class="sl empty">URIM이 이야기를 준비하고 있어요…</p>'; shown = 0; lastN = 0;
    try {
      const fresh = !(list.find(s => s.id === id) || {}).started;
      run = await AG.story.open(id, true);
      history.replaceState(null, '', '?id=' + id);
      $('sTitle').textContent = run.title; $('sCap').textContent = run.kind === 'group' ? 'GROUP STORY' : 'STORY';
      const it = list.find(s => s.id === id); if (it) { it.started = true; it.done = run.done; }
      renderList(); log.innerHTML = ''; lastN = 0; await renderLog(fresh);
      if (run.kind === 'group' && !run.battle) {
        if (run.midJoined && run.notified > 0) AG.toast(`진행 중인 단체 스토리에 중간 합류했어요 · 접속 중인 유저 ${run.notified}명에게 알림을 보냈어요`, 2800);
        else if (run.midJoined) AG.toast('진행 중인 단체 스토리에 중간 합류했어요', 2400);
        else if (run.notified > 0) AG.toast(`접속 중인 유저 ${run.notified}명에게 단체 스토리 알림을 보냈어요`, 2600);
      }
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
  /* 분기 투표: 과반수가 모이면 그 행동으로 이야기가 이어진다 */
  async function vote(i) {
    if (busy || !run || !run.vote) return;
    if (run.vote.mine === i) return AG.toast('이미 고른 선택지예요. 다른 걸 누르면 바꿀 수 있어요');
    setBusy(true);
    try { run = await AG.story.vote(run.id, i); await renderLog(true); if (run.phase === 'vote') AG.toast(`투표했어요 · 과반수(${run.vote.need}표)가 모이면 진행돼요`); } catch (e) { AG.toast(AG.errMsg(e)); }
    setBusy(false); if (run.battle) toBattle();
  }
  /* 각자 진행: 내 몫을 마치고 합류 지점으로 */
  async function ready() {
    if (busy || !run) return;
    setBusy(true);
    try { run = await AG.story.ready(run.id); await renderLog(true); } catch (e) { AG.toast(AG.errMsg(e)); }
    setBusy(false); if (run.battle) toBattle();
  }
  const sig = r => JSON.stringify([r.log.length, r.log.length && r.log[r.log.length - 1].n, r.phase, r.busy, !!r.battle, r.vote && r.vote.options.map(o => o.n), r.track && [r.track.ready, r.track.readyNames, r.track.restNames]]);
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
    try { const r = await AG.story.open(run.id); if (busy) return; if (sig(r) !== sig(run)) { run = r; await renderLog(true); controls(); if (run.battle) toBattle(); } } catch {}
  }, 4000);
})();
