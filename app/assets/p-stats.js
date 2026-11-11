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
  const W = 720, max = s.statMax || 80;
  const fill = (id, v, full, width) => requestAnimationFrame(() => { $(id).style.width = Math.max(0, Math.min(1, v / full)) * width + 'px'; });
  fill('expBar', s.exp, s.expMax, 520);
  for (const k of ['hp', 'atk', 'def', 'spd', 'echo']) {
    const v = typeof s[k] === 'number' ? s[k] : 0;
    $('v-' + k).textContent = v;
    fill('b-' + k, v, k === 'hp' ? (s.hpMax || 240) : max, W);
  }
  const ei = s.echoInfo || {};
  $('echoTitle').textContent = ei.type ? `ECHO · ${ei.type}` : 'ECHO · 잔향';
  $('echoDesc').textContent = ei.desc || '잔향이 아직 깨어나지 않았어요.';
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
