/* 전투 진입 · 텍스트 전투 (서버 모드: Claude 판정 / 체험 모드: 스탯 굴림) */
AG.boot();
(async function () {
  const $ = s => document.getElementById(s);
  const log = $('log'), input = $('actInput'), stage = document.getElementById('stage');
  let b = null, shownLog = 0, busy = false;

  const me = await AG.me().catch(() => null);
  if (me && me.avatar) { $('meAva').src = me.avatar; $('meAva').hidden = false; }

  function cleanState(st, hp, hpMax) {
    const s = String(st || '').replace(/(?:[,·/()]|\s)*(?:남은\s*)?(?:HP|체력)\s*[:=]?\s*\d+(?:\s*\/\s*\d+)?/gi, '').replace(/^[,\s·/]+|[,\s·/]+$/g, '').replace(/\s*,\s*,+/g, ', ').trim();
    if (hp != null && hp <= 0) return '쓰러짐';
    return s || (hp != null && hpMax ? (hp <= hpMax * 0.25 ? '빈사' : hp <= hpMax * 0.5 ? '중상' : '경계 상태') : '경계 상태');
  }
  function fixLogText(e) {
    const t = String((e && e.text) || '').trim();
    if (e && e.kind === 'urim') {
      return t
        .replace(/안전합니다([.!?]?)$/g, '안전해요$1')
        .replace(/정리됩니다([.!?]?)$/g, '정리돼요$1')
        .replace(/유리합니다([.!?]?)$/g, '유리해요$1')
        .replace(/가능합니다([.!?]?)$/g, '가능해요$1')
        .replace(/필요합니다([.!?]?)$/g, '필요해요$1')
        .replace(/위험합니다([.!?]?)$/g, '위험해요$1')
        .replace(/유효합니다([.!?]?)$/g, '유효해요$1')
        .replace(/충분합니다([.!?]?)$/g, '충분해요$1')
        .replace(/좋습니다([.!?]?)$/g, '좋아요$1')
        .replace(/입니다([.!?]?)$/g, '이에요$1');
    }
    const m = t.match(/^([^—]+?\.)\s+([^—]+?)\.\s*—\s*피해\s*(\d+)\.$/);
    if (!m) return t;
    const s1 = m[1].replace(/[.。]+$/, '').trim(), s2 = m[2].replace(/[.。]+$/, '').trim(), d = m[3];
    const dodged = /허공|빗나|피했|피하|스쳤|닿지\s*않|헛돌|비껴|물러서|막아/.test(s2);
    return `${s1} — 피해 ${d}. ${s2}${dodged ? ' — 피해 없음.' : '.'}`;
  }
  function bars(prev) {
    const pct = (v, m, el) => Math.max(0, Math.min(1, v / m)) * (+el.dataset.w || 440) + 'px';
    $('meName').textContent = b.me.name || (me && me.name) || '캐릭터 이름';
    $('meHp').style.width = pct(b.me.hp, b.me.hpMax, $('meHp'));
    $('meTxt').textContent = `HP ${b.me.hp} / ${b.me.hpMax} · 잔향 ${b.me.echo ?? 0}` + (b.me.taint ? ` · 오염도 ${b.me.taint}` : '');
    $('enName').textContent = b.enemy.name;
    $('enHp').style.width = pct(b.enemy.hp, b.enemy.hpMax, $('enHp'));
    const est = cleanState(b.enemy.state, b.enemy.hp, b.enemy.hpMax);
    $('enTxt').textContent = `HP ${b.enemy.hp} / ${b.enemy.hpMax}${est ? ' · ' + est : ''}${b.enemy.fxText ? ' · ' + b.enemy.fxText : ''}${b.me.fxText ? ' · 나: ' + b.me.fxText : ''}`;
    $('enPic').textContent = b.enemy.name ? b.enemy.name.slice(0, 1) : '?';
    $('turn').textContent = b.over ? ({ win: 'VICTORY', lose: 'DEFEAT', run: 'ESCAPED' }[b.result] || 'END') : `TURN ${String(b.turn).padStart(2, '0')}`;
    $('foot').textContent = b.over ? '전투가 끝났어요 · 행동 버튼을 누르면 새 전투를 시작해요' : '직접 적은 행동은 AI가 난이도를 정하고 주사위(d20 + 능력치)로 판정해요 · 지형·약점·내 능력을 쓸수록 유리해요';
    if (prev) {
      if (b.me.hp < prev.me.hp) { const l = document.querySelector('[data-r="left"]'); l.classList.remove('shake'); void l.offsetWidth; l.classList.add('shake'); }
      if (b.enemy.hp < prev.enemy.hp) { const r = $('enHp'); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); }
    }
  }
  function entry(e) {
    const d = document.createElement('div');
    d.className = 'ent pop' + (e.kind === 'urim' ? ' urim' : '');
    d.innerHTML = `<span class="t ${e.kind === 'urim' ? 's54' : 's52'} lb" style="position:static">${AG.esc(e.kind === 'urim' ? 'URIM' : e.label || '')}</span><p class="t ${e.kind === 'urim' ? 's55' : 's53'} tx" style="position:static"></p>`;
    return d;
  }
  function type(el, text) {
    return new Promise(res => {
      const host = el.closest('.ent'); host.classList.add('typing');
      const chars = Array.from(text); let i = 0;
      const step = () => {
        i = Math.min(chars.length, i + 2); el.textContent = chars.slice(0, i).join('');
        log.scrollTop = log.scrollHeight;
        if (i < chars.length) setTimeout(step, 18); else { host.classList.remove('typing'); res(); }
      };
      step();
    });
  }
  async function renderLog(animate) {
    const items = b.log || [];
    if (!animate || shownLog > items.length) { log.innerHTML = ''; shownLog = 0; }
    for (let i = shownLog; i < items.length; i++) {
      const d = entry(items[i]); log.appendChild(d);
      const tx = d.querySelector('.tx'), txt = fixLogText(items[i]);
      if (animate) await type(tx, txt); else tx.textContent = txt;
    }
    shownLog = items.length; log.scrollTop = log.scrollHeight;
  }
  function setBusy(v) { busy = v; stage.classList.toggle('busy', v); input.disabled = v; }

  /* 아이템: 창고에서 전투 중에 쓸 수 있는 것만 골라 팝업으로 */
  async function itemPopup() {
    if (busy) return;
    if (!b || b.over) return act('guard');
    let inv = [];
    try { inv = await AG.inventory.list(); } catch (e) { return AG.toast(AG.errMsg(e)); }
    const usable = inv.map(it => ({ it, eff: AG.battleUse(it) })).filter(x => x.eff);
    const rows = usable.map((x, i) => `<button class="bi" data-i="${i}" type="button">
        <span class="bi-ic">${AG.esc(Array.from(x.it.name)[0])}</span>
        <span class="bi-tx"><b>${AG.esc(x.it.name)}</b><small>${AG.esc([x.it.rarity, x.it.kind].filter(Boolean).join(' · '))}</small></span>
        <span class="bi-ef">${AG.esc(x.eff.label)}</span></button>`).join('');
    const m = AG.modal(`<h2>ITEMS · ${usable.length}</h2><h3>전투에서 쓸 아이템</h3>
      <p>쓰면 한 턴이 지나가고, 아이템은 창고에서 사라져요.</p>
      <div class="bi-list">${rows || '<p class="bi-empty">지금 쓸 수 있는 아이템이 없어요.<br>붕대처럼 전투 효과가 있는 아이템을 전리품으로 얻어 보세요.</p>'}</div>
      <div class="row">${usable.length ? '' : '<button class="ghost" data-inv>창고 열기</button>'}<button class="ghost" data-x>닫기</button></div>`);
    m.el.classList.add('battle-items');
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-inv]')?.addEventListener('click', () => location.href = AG.PAGES.inventory);
    m.el.querySelectorAll('.bi').forEach(btn => btn.onclick = () => { const x = usable[+btn.dataset.i]; m.close(); act('item', null, x.it.id); });
  }

  /* 공격: 일반 공격 / 특수 공격 / 필살기 */
  async function attackPopup() {
    if (busy) return;
    if (!b || b.over) return act('guard');
    let skills = {};
    try { skills = (await AG.stats()).skills || {}; } catch {}
    const kinds = ['normal', 'special', 'ultimate'];
    const rows = kinds.map((k, i) => {
      const R = AG.SKILL_RULES[k], sk = skills[k] || {}, st = AG.skillState(b, k, skills);
      const name = sk.name || (k === 'normal' ? '일반 공격' : '정하지 않음');
      const desc = sk.desc || (k === 'normal' ? '무기로 평범하게 공격해요.' : '');
      const rule = AG.skillRule(k, sk);
      return `<button class="sk sk-${k}" data-k="${k}" type="button" ${st.ok ? '' : 'disabled'} style="animation-delay:${i * .06}s">
        <span class="sk-kind">${{ normal: 'NORMAL', special: 'SPECIAL', ultimate: 'ULTIMATE' }[k]}<br><small style="font-family:'Noto Sans KR';font-size:18px;letter-spacing:0;font-weight:700;opacity:.8">${R.label}</small></span>
        <span class="sk-tx"><b>${AG.esc(name)}</b>${desc ? `<small>${AG.esc(desc)}</small>` : ''}</span>
        <span class="sk-st">${st.ok ? AG.esc(rule) : AG.esc(st.why)}</span></button>`;
    }).join('');
    const unset = !(skills.special && skills.special.name) || !(skills.ultimate && skills.ultimate.name);
    const m = AG.modal(`<h2>ATTACK</h2><h3>어떻게 공격할까요?</h3><div class="sk-list">${rows}</div>
      <div class="row">${unset ? '<button class="ghost" data-set>특수 공격 · 필살기 정하기</button>' : ''}<button class="ghost" data-x>닫기</button></div>`);
    m.el.classList.add('battle-items');
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-set]')?.addEventListener('click', () => location.href = AG.PAGES.settings + '?edit=skills');
    m.el.querySelectorAll('.sk:not([disabled])').forEach(btn => btn.onclick = () => { m.close(); act('attack', null, null, btn.dataset.k); });
  }

  async function act(action, text, itemId, skill) {
    if (action === 'item' && !itemId) return itemPopup();
    if (action === 'attack' && !skill) return attackPopup();
    if (busy) return;
    if (!b || b.over) { setBusy(true); try { b = await AG.battle.start(); log.innerHTML = ''; shownLog = 0; bars(); await renderLog(true); } catch (e) { AG.toast(AG.errMsg(e)); } setBusy(false); return; }
    setBusy(true);
    const prev = JSON.parse(JSON.stringify(b));
    try {
      b = await AG.battle.turn(action, text, itemId, skill);
      bars(prev); await renderLog(true);
      if (b.over && b.story) { AG.toast('이야기로 돌아가요', 1600); setTimeout(() => (AG.leaving(), location.href = AG.PAGES.story + '?id=' + b.story), 1700); return; }   // 스토리 중 전투였으면 이야기로
    } catch (e) { AG.toast(AG.errMsg(e)); }
    setBusy(false); input.focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => act(btn.dataset.act)));
  const custom = () => { const v = input.value.trim(); if (!v) return input.focus(); input.value = ''; act('custom', v); };
  $('sendBtn').addEventListener('click', custom);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); custom(); } });
  addEventListener('keydown', e => {
    if (document.activeElement === input || e.metaKey || e.ctrlKey) return;
    const k = { 1: 'attack', 2: 'guard', 3: 'echo', 4: 'item', 5: 'run' }[e.key]; if (k) act(k);
  });

  // 전투가 끝난 뒤 화면을 켜 둔 채 30분이 지나면 체력 회복을 바로 반영
  setInterval(async () => {
    if (document.hidden || busy || (b && !b.over)) return;
    const s = await AG.stats().catch(() => null);
    if (!s) return;
    if (b && b.me) {
      const hp = Math.min(b.me.hpMax, s.hp);
      if (hp !== b.me.hp) { b.me.hp = hp; bars(); }
    } else if (!b) {
      $('meTxt').textContent = `HP ${s.hp} / ${s.hpMax} · 잔향 ${s.echoLeft ?? 0} · 오염도 ${s.taintTier || 'T0'}`;
      $('meHp').style.width = Math.max(0, Math.min(1, s.hp / s.hpMax)) * 453 + 'px';
    }
  }, 30000);

  try { b = await AG.battle.state(); if (!b) b = await AG.battle.start(); }
  catch (e) {
    // 체력이 0이면 전투를 시작할 수 없다: 지금 상태만 보여 주고 창고로 안내
    const s = await AG.stats().catch(() => null);
    if (s) { $('meName').textContent = s.name || ''; $('meTxt').textContent = `HP ${s.hp} / ${s.hpMax} · 잔향 ${s.echoLeft ?? 0} · 오염도 ${s.taintTier || 'T0'}`; $('meHp').style.width = Math.max(0, Math.min(1, s.hp / s.hpMax)) * 453 + 'px'; }
    $('turn').textContent = 'REST'; $('enName').textContent = '—';
    const d = entry({ kind: 'urim' }); d.querySelector('.tx').textContent = AG.errMsg(e); log.appendChild(d);
    $('foot').innerHTML = '창고에서 회복 아이템을 쓴 뒤 행동 버튼을 누르면 전투를 시작해요 · <a href="' + AG.PAGES.inventory + '" style="pointer-events:auto;text-decoration:underline">창고 열기</a>';
    return;
  }
  bars(); setTimeout(() => renderLog(true), 900);
})();
