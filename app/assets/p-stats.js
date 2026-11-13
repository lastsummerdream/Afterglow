/* 개인 단말 · 캐릭터 스탯 */
AG.boot();
(async function () {
  const $ = s => document.getElementById(s);
  const qs = new URLSearchParams(location.search);
  const other = qs.get('user');
  let s;
  try { s = await AG.stats(other || undefined); } catch (e) { AG.toast(AG.errMsg(e)); return; }
  if (other) {
    const u = (await AG.users().catch(() => [])).find(x => x.id === other);
    if (u) { s.name = u.name; s.registry = { ...s.registry, origin: (u.sub || '').split(' · ')[0] || s.registry.origin, job: u.job || s.registry.job }; }
    document.querySelector('.tablink[href="dm.html"]').href = 'dm.html?with=' + encodeURIComponent(other);
  }
  $('cName').textContent = s.name || '캐릭터 이름';
  for (const k of ['nameEn', 'ageGender', 'origin', 'species', 'lineage', 'job']) $('r-' + k).textContent = s.registry[k] || '—';

  /* 지수 칸 */
  const row = { G: 1040, C: 1132, T: 1224 };
  for (const L of ['G', 'C', 'T']) {
    const n = s[L] ?? 0, max = s[L + 'max'] ?? 5;
    const box = $('cells-' + L);
    let h = '';
    for (let i = 0; i < max; i++) {
      const on = i < n;
      const tb = document.getElementById(on ? 'tpl-cellOn' : 'tpl-cellOff').dataset.box.split(',').map(Number);
      h += `<div class="cell" style="left:${1005 + 82 * i}px;top:${row[L] - 8}px;width:${tb[2]}px;height:${tb[3]}px;animation-delay:${0.8 + i * 0.08 + (L === 'C' ? .15 : L === 'T' ? .3 : 0)}s">${AG.tpl(on ? 'cellOn' : 'cellOff', 'style="width:100%;height:100%;overflow:visible"')}</div>`;
    }
    box.innerHTML = h;
    const cnt = $('cnt-' + L); cnt.textContent = `${n} / ${max}`; cnt.style.left = (1015 + 82 * max + 10) + 'px';
  }

  /* 전투 스탯 (막대는 진입 애니메이션 뒤에 차오름) */
  $('lv').textContent = `Lv. ${s.level}`;
  $('expTxt').textContent = `EXP ${s.exp} / ${s.expMax}`;
  const W = 655, max = s.statMax || 80;
  const fill = (id, v, full, width) => requestAnimationFrame(() => { $(id).style.width = Math.max(0, Math.min(1, v / full)) * width + 'px'; });
  fill('expBar', s.exp, s.expMax, 473);
  for (const k of ['hp', 'atk', 'def', 'spd', 'echo']) {
    const v = typeof s[k] === 'number' ? s[k] : 0;
    $('v-' + k).textContent = v;
    fill('b-' + k, v, k === 'hp' ? (s.hpMax || 240) : max, W);
  }
  const waitHeal = st => {
    if (!st || !st.healAt || st.hp >= st.hpMax) return;
    setTimeout(async () => {
      const next = await AG.stats(other || undefined).catch(() => null);
      if (!next) return;
      $('v-hp').textContent = next.hp;
      fill('b-hp', next.hp, next.hpMax || 240, W);
      waitHeal(next);
    }, Math.max(1000, st.healAt - Date.now() + 200));
  };
  waitHeal(s);
  /* 평판: -100 ~ 100, 가운데에서 좌우로 */
  const rp = s.rep || { score: 0, title: '이름 없는', who: [], log: [] };
  $('v-rep').textContent = (rp.score > 0 ? '+' : '') + rp.score;
  $('repLab').textContent = `REP 평판 · ${rp.title}`;
  requestAnimationFrame(() => { const b = $('b-rep'), w = Math.min(1, Math.abs(rp.score) / 100) * 327.5; b.classList.add(rp.score < 0 ? 'down' : 'up'); b.style.width = w + 'px'; if (rp.score < 0) b.style.left = (2160 - w) + 'px'; });
  $('repBtn').addEventListener('click', () => {
    const e = AG.esc, sg = n => (n > 0 ? '+' : '') + n;
    const who = rp.who.length ? `<dl>${rp.who.map(w => `<dt>${e(w.name)}</dt><dd>${sg(w.v)} · ${w.v >= 20 ? '호의적' : w.v >= 5 ? '우호적' : w.v > -5 ? '무덤덤' : w.v > -20 ? '경계' : '적대'}</dd>`).join('')}</dl>` : '<p class="bw-empty">아직 알고 지내는 세력이나 인물이 없어요.</p>';
    const log = rp.log.length ? rp.log.map(l => `<div class="bw-row" style="height:auto;min-height:92px;cursor:default"><div class="bw-tx"><b style="white-space:normal">${e(l.deed || '행동이 알려졌다')}</b><small>${e([l.story, l.score ? '평판 ' + sg(l.score) : '', ...(l.who || []).map(w => w.name + ' ' + sg(w.d))].filter(Boolean).join(' · '))}</small></div></div>`).join('') : '<p class="bw-empty">스토리에서 한 행동이 여기에 남아요.<br>도움을 주면 오르고, 배신하면 내려가요.</p>';
    const m = AG.sheet(`<h2>REPUTATION</h2><h3>평판 ${sg(rp.score)} · ${e(rp.title)}</h3><div class="bw-list"><h4>세력 · 인물</h4>${who}<h4>최근 행동</h4>${log}</div><div class="bw-btns"><button class="bw-btn" data-x>닫기</button></div>`);
    m.el.querySelector('[data-x]').onclick = m.close;
  });
  const ei = s.echoInfo || {};
  $('echoTitle').textContent = ei.type ? `ECHO · ${ei.type}` : 'ECHO · 잔향';
  $('echoDesc').textContent = ei.desc || '잔향이 아직 깨어나지 않았어요.';
  // 기본공격 · 특수공격 · 필살기 설명 (설정에서 적은 내용)
  const sk = s.skills || {};
  const skTxt = (k, none) => { const v = sk[k] || {}; return v.name ? (v.desc ? `${v.name} — ${v.desc}` : v.name) : (v.desc || none); };
  $('atkN').textContent = skTxt('normal', '일반 공격');
  $('atkS').textContent = skTxt('special', '아직 정하지 않았어요');
  $('atkU').textContent = skTxt('ultimate', '아직 정하지 않았어요');
  const eq = s.equipment || {};
  const labels = { weapon: '무기', armor: '방어구', acc1: '장신구', acc2: '장신구' };
  for (const k in labels) {
    const el = $('eq-' + k); const v = eq[k];
    el.textContent = v || labels[k]; el.classList.toggle('eqslot', !!v); el.title = v ? `${labels[k]} · ${v}` : `${labels[k]} · 비어 있음`;
  }

  /* 전신 일러스트 (설정에서 바꾼 것) */
  if (!other) {
    const url = await AG.illust.get().catch(() => null);
    if (url) { $('illu').src = url; $('illu').hidden = false; $('illuHint').hidden = true; }
  }
})();
