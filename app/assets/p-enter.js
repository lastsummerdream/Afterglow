/* 전투 진입: 스토리 진행 / 전투 고르기 */
AG.boot();
(async function () {
  const $ = s => document.getElementById(s);
  const go = () => location.href = AG.PAGES.story;
  $('cStory').addEventListener('click', go);
  $('cStory').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  AG.story.list().then(l => {
    const solo = l.filter(s => s.kind !== 'group'), on = solo.filter(s => s.started && !s.done).length, grp = l.filter(s => s.kind === 'group'), grpOn = grp.filter(s => s.started && !s.done).length;
    $('stStory').textContent = (solo.length ? `개인 스토리 ${solo.length}편` + (on ? ` · 진행 중 ${on}편` : '') : '아직 열린 개인 스토리가 없어요') + (grp.length ? ` · 단체 ${grp.length}편` + (grpOn ? ` (진행 중 ${grpOn}편 · 중간 진입 가능)` : '') : '');
  }).catch(() => $('stStory').textContent = '');
  Promise.all([AG.stats(), AG.party.lobby().catch(() => ({ open: [] }))]).then(([s, lb]) => {
    $('stBattle').textContent = `HP ${s.hp} / ${s.hpMax} · 잔향 ${s.echoLeft ?? 0}` + (lb.mine ? ' · 참여 중인 방이 있어요' : lb.open.length ? ` · 열린 방 ${lb.open.length}개` : '');
  }).catch(() => $('stBattle').textContent = '');
})();
