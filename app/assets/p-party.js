/* 파티 전투: 방을 만들고, 접속 중인 사람들이 들어와 턴마다 동시에 행동을 고른다 */
AG.boot();
(async function () {
  const $ = s => document.getElementById(s);
  const log = $('log'), input = $('actInput'), stage = $('stage'), lobby = $('lobby'), mates = $('mates');
  let p = null, shownLog = 0, busy = false, sig = '', skills = {};
  const qid = new URLSearchParams(location.search).get('id');
  const me = await AG.me().catch(() => null);
  if (me && me.avatar) { $('meAva').src = me.avatar; $('meAva').hidden = false; }
  AG.stats().then(s => skills = s.skills || {}).catch(() => {});

  const mine = () => p && p.members.find(m => m.id === p.me);
  function entry(e) {
    const d = document.createElement('div');
    d.className = 'ent pop' + (e.kind === 'urim' ? ' urim' : '');
    d.innerHTML = `<span class="t ${e.kind === 'urim' ? 's54' : 's52'} lb" style="position:static">${AG.esc(e.kind === 'urim' ? 'URIM' : e.label || '')}</span><p class="t ${e.kind === 'urim' ? 's55' : 's53'} tx" style="position:static"></p>`;
    d.querySelector('.tx').textContent = e.text; return d;
  }
  function renderLog() {
    const items = (p && p.log) || [];
    if (shownLog > items.length) { log.innerHTML = ''; shownLog = 0; }
    for (let i = shownLog; i < items.length; i++) log.appendChild(entry(items[i]));
    if (shownLog !== items.length) log.scrollTop = log.scrollHeight;
    shownLog = items.length;
  }
  function render() {
    const inLobby = !p || p.status === 'lobby';
    stage.classList.toggle('lobby-on', inLobby);
    lobby.hidden = !inLobby;
    if (!p) return;
    const my = mine();
    if (my) { $('meName').textContent = my.name + (my.id === p.host ? ' ★' : ''); $('meHp').style.width = Math.max(0, Math.min(1, my.hp / my.hpMax)) * 453 + 'px';
      $('meTxt').textContent = `HP ${my.hp} / ${my.hpMax} · 잔향 ${my.echo ?? 0}` + (my.down ? ' · 쓰러짐' : my.fled ? ' · 이탈' : p.status === 'battle' ? (my.chosen ? ' · 선택 완료' : ' · 고르는 중…') : ''); }
    mates.innerHTML = p.members.filter(m => m.id !== p.me).map(m => `<div class="mate${m.online ? ' on' : ''}${m.down || m.fled ? ' down' : ''}"><i></i><b>${AG.esc(m.name)}${m.id === p.host ? ' ★' : ''}</b>
      <small>${m.down ? '쓰러짐' : m.fled ? '이탈' : !m.online ? '접속 끊김' : p.status === 'battle' ? (m.chosen ? '선택 완료' : '고르는 중…') : `HP ${m.hp}`}</small>
      <div class="bar"><u style="width:${Math.max(0, Math.min(1, m.hp / m.hpMax)) * 100}%"></u></div></div>`).join('');
    const E = p.enemy;
    const est = String(E.state || '').replace(/(?:[,·/()]|\s)*(?:남은\s*)?(?:HP|체력)\s*[:=]?\s*\d+(?:\s*\/\s*\d+)?/gi, '').replace(/^[,\s·/]+|[,\s·/]+$/g, '').replace(/\s*,\s*,+/g, ', ').trim() || (E.hp <= 0 ? '쓰러짐' : '경계 상태');
    $('enName').textContent = E.name || '—'; $('enPic').textContent = E.name ? E.name.slice(0, 1) : '?';
    $('enHp').style.width = Math.max(0, Math.min(1, E.hp / E.hpMax)) * 440 + 'px';
    $('enTxt').textContent = `HP ${E.hp} / ${E.hpMax}${est ? ' · ' + est : ''}${E.fxText ? ' · ' + E.fxText : ''}`;
    $('turn').textContent = p.status === 'over' ? ({ win: 'VICTORY', lose: 'DEFEAT', run: 'ESCAPED' }[p.result] || 'END') : p.status === 'lobby' ? 'LOBBY' : `TURN ${String(p.turn).padStart(2, '0')}`;
    const m = mine();
    $('foot').innerHTML = p.status === 'over' ? (p.storyId ? `전투가 끝났어요 · <a href="${AG.PAGES.story}?id=${p.storyId}" style="pointer-events:auto;text-decoration:underline">이야기로 돌아가기</a>` : `전투가 끝났어요 · <a href="${AG.PAGES.party}" style="pointer-events:auto;text-decoration:underline">새 방 만들기</a>`)
      : m && m.chosen ? '행동을 골랐어요 · 다른 사람을 기다리는 중이에요 (다시 고르면 바뀌어요)' : '모두가 행동을 고르면 한꺼번에 판정해요 · 접속이 끊긴 사람은 방어로 처리돼요';
    renderLog();
    if (p.status === 'lobby') roomView();
  }
  function roomView() {
    const host = p.host === p.me, on = p.members.filter(m => m.online).length;
    lobby.innerHTML = `<h2>PARTY · ${p.members.length} / 4</h2><h3>${AG.esc(p.enemy.name)} 토벌 대기실</h3>
      <p>${host ? '지금 접속해 있는 사람만 함께 출발해요. 혼자서도 시작할 수 있어요.' : '방을 만든 사람이 시작하면 전투가 열려요. 이 화면을 열어 두세요.'}</p>
      <div class="bi-list">${p.members.map(m => `<div class="bi"><span class="bi-ic">${AG.esc(Array.from(m.name)[0])}</span><span class="bi-tx"><b>${AG.esc(m.name)}</b><small>${m.id === p.host ? 'HOST' : 'MEMBER'}</small></span><span class="bi-ef">${m.online ? `HP ${m.hp} / ${m.hpMax}` : '접속 끊김'}</span></div>`).join('')}</div>
      <div class="row"><button class="ghost" data-leave>나가기</button>${host ? `<button data-start>${on}명으로 시작</button>` : ''}</div>`;
    lobby.querySelector('[data-leave]').onclick = async () => { try { await AG.party.leave(p.id); } catch {} location.href = p.storyId ? AG.PAGES.story + '?id=' + p.storyId : AG.PAGES.party; };
    lobby.querySelector('[data-start]')?.addEventListener('click', () => go(() => AG.party.start(p.id)));
  }
  async function listView() {
    let lb = { open: [] };
    try { lb = await AG.party.lobby(); } catch (e) { AG.toast(AG.errMsg(e)); }
    if (lb.mine) { p = lb.mine; history.replaceState(null, '', '?id=' + p.id); return render(); }
    if (p) return;
    const s = JSON.stringify(lb.open); if (s === sig && lobby.innerHTML) return; sig = s;
    lobby.hidden = false; stage.classList.add('lobby-on');
    lobby.innerHTML = `<h2>PARTY · ROOMS ${lb.open.length}</h2><h3>함께 싸울 방</h3><p>방을 만들면 지금 접속 중인 사람이 들어올 수 있어요. 최대 4명, 턴마다 모두 고른 뒤 한꺼번에 판정해요.</p>
      <div class="bi-list">${lb.open.map(r => `<button class="bi" data-id="${AG.esc(r.id)}" type="button"><span class="bi-ic">${AG.esc(Array.from(r.host)[0])}</span><span class="bi-tx"><b>${AG.esc(r.host)}의 방</b><small>${AG.esc(r.enemy)}${r.story ? ' · STORY' : ''}</small></span><span class="bi-ef">${r.count} / ${r.max} · 들어가기</span></button>`).join('') || '<p class="bi-empty">지금 열려 있는 방이 없어요.<br>방을 만들고 단체 단말에서 사람을 불러 보세요.</p>'}</div>
      <div class="row"><button class="ghost" data-back>돌아가기</button><button data-new>방 만들기</button></div>`;
    lobby.querySelector('[data-back]').onclick = () => location.href = AG.PAGES.enter;
    lobby.querySelector('[data-new]').onclick = () => go(() => AG.party.create());
    lobby.querySelectorAll('[data-id]').forEach(b => b.onclick = () => go(() => AG.party.join(b.dataset.id)));
  }
  async function go(fn) {
    if (busy) return; busy = true; stage.classList.add('busy');
    try { p = await fn(); history.replaceState(null, '', '?id=' + p.id); render(); } catch (e) { AG.toast(AG.errMsg(e)); }
    busy = false; stage.classList.remove('busy');
  }
  /* 공격: 일반 / 특수 / 필살기 */
  function attackPopup() {
    const m0 = mine(); const b = { turn: p.turn, cool: (m0 && m0.cool) || {} };
    const rows = ['normal', 'special', 'ultimate'].map((k, i) => {
      const R = AG.SKILL_RULES[k], sk = skills[k] || {}, st = AG.skillState(b, k, skills);
      const rule = AG.skillRule(k, sk);
      return `<button class="sk sk-${k}" data-k="${k}" type="button" ${st.ok ? '' : 'disabled'} style="animation-delay:${i * .06}s"><span class="sk-kind">${{ normal: 'NORMAL', special: 'SPECIAL', ultimate: 'ULTIMATE' }[k]}</span>
        <span class="sk-tx"><b>${AG.esc(sk.name || (k === 'normal' ? '일반 공격' : '정하지 않음'))}</b>${sk.desc ? `<small>${AG.esc(sk.desc)}</small>` : ''}</span><span class="sk-st">${AG.esc(st.ok ? rule : st.why)}</span></button>`;
    }).join('');
    const m = AG.modal(`<h2>ATTACK</h2><h3>어떻게 공격할까요?</h3><div class="sk-list">${rows}</div><div class="row"><button class="ghost" data-x>닫기</button></div>`);
    m.el.classList.add('battle-items');
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelectorAll('.sk:not([disabled])').forEach(btn => btn.onclick = () => { m.close(); act('attack', null, btn.dataset.k); });
  }
  function act(action, text, skill) {
    if (!p || p.status !== 'battle') return;
    const m = mine(); if (!m || m.down || m.fled) return AG.toast('지금은 행동할 수 없어요');
    if (action === 'attack' && !skill) return attackPopup();
    go(() => AG.party.act(p.id, action, text, skill));
  }
  document.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', async () => {
    if (btn.dataset.act !== 'leave') return act(btn.dataset.act);
    if (p && p.status !== 'over') { try { await AG.party.leave(p.id); } catch {} }
    location.href = p && p.storyId ? AG.PAGES.story + '?id=' + p.storyId : AG.PAGES.enter;
  }));
  const custom = () => { const v = input.value.trim(); if (!v) return input.focus(); input.value = ''; act('custom', v); };
  $('sendBtn').addEventListener('click', custom);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); custom(); } });

  if (me) $('enName').textContent = '—';
  if (qid) {
    try { p = await AG.party.get(qid); }
    catch { try { p = await AG.party.join(qid); } catch (e) { AG.toast(AG.errMsg(e), 2600); history.replaceState(null, '', location.pathname); } }
  }
  if (p) render(); else await listView();
  // 접속 상태를 알리고 새 상태를 받아 온다 (2초마다)
  setInterval(async () => {
    if (document.hidden || busy) return;
    if (!p) return listView();
    if (p.status === 'over') return;
    try { const r = await AG.party.get(p.id); if (!busy) { p = r; render(); } } catch {}
  }, 2000);
})();
