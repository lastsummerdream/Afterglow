/* 커버 · 로딩 → 진입하기 → (로그인되어 있으면 바로 메인 / 아니면 로그인 · 초대 코드 회원가입) */
AG.boot({ noDemoChip: true });
(function () {
  const $ = s => document.getElementById(s);
  const stage = $('stage');
  const LOGO = 'assets/logo.png';   // 로고 파일을 이 이름으로 넣으면 가운데 칸에 나와요 (1000 × 440, 투명 PNG)
  const MAIN = AG.PAGES.main;

  /* 로고 */
  const logo = new Image();
  logo.onload = () => { $('logoImg').src = LOGO; $('logoImg').hidden = false; $('logoL').classList.add('has-logo'); };
  logo.src = LOGO;

  /* 로딩: 다음 화면에서 쓸 그림을 미리 불러오며 진행률 표시 */
  const PRELOAD = ['assets/bg.jpg', 'assets/dialog-box.png', 'assets/topbar.svg', 'assets/side-plate.svg', 'assets/side-disc.svg', 'assets/side-disc-active.svg',
    'assets/menu-battle.svg', 'assets/menu-home.svg', 'assets/menu-inventory.svg', 'assets/menu-dm.svg', 'assets/menu-settings.svg', 'assets/nameplate.svg', 'assets/vid-tile.png'];
  const STEPS = [[0, '기록 단말과 동기화하는 중 …'], [35, '명부를 불러오는 중 …'], [70, '잔향을 정리하는 중 …'], [100, '준비됐어요']];
  const fill = $('loadFill'), pct = $('loadPct'), txt = $('loadTxt');
  let loaded = 0, shown = 0, done = false;
  const t0 = performance.now(), MIN = 1800;
  PRELOAD.forEach(src => { const i = new Image(); i.onload = i.onerror = () => loaded++; i.src = src; });
  if (document.fonts) document.fonts.ready.then(() => { loaded += 0; });
  let session = null;   // 저장된 로그인이 아직 유효한지 미리 확인
  const check = AG.mode === 'server' ? AG.me().then(m => (session = m)).catch(() => (session = false)) : Promise.resolve(session = false);
  function tick(now) {
    const real = loaded / PRELOAD.length, time = Math.min(1, (now - t0) / MIN);
    const target = Math.min(real, time) * 100;
    shown += (target - shown) * 0.12;
    if (target >= 100 && 100 - shown < 0.6) shown = 100;
    fill.setAttribute('width', (1000 * shown / 100).toFixed(1));
    pct.textContent = Math.round(shown) + '%';
    const step = STEPS.filter(s => shown >= s[0]).pop(); if (txt.textContent !== step[1]) txt.textContent = step[1];
    if (shown >= 100 && !done) { done = true; check.then(ready); return; }
    if (!done) requestAnimationFrame(tick);
  }
  setTimeout(() => requestAnimationFrame(tick), 500);
  function ready() {
    stage.classList.add('ready');
    if (session) $('urimTxt').textContent = `URIM · ${session.name}, 다시 오셨네요`;
    if (!AG.PROD) $('demoBtn').hidden = false;
  }

  /* 진입 */
  function go(url) { stage.classList.add('leaving'); setTimeout(() => location.href = url, 450); }
  function enter() {
    if (!stage.classList.contains('ready') || stage.classList.contains('panel-open')) return;
    if (session) return go(MAIN);
    open('loginP');
  }
  $('enterBtn').onclick = enter;
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && stage.classList.contains('panel-open')) return close();
    if ((e.key === 'Enter' || e.key === ' ') && !stage.classList.contains('panel-open') && document.activeElement === document.body) { e.preventDefault(); enter(); }
  });
  $('demoBtn').onclick = () => { AG.LS.set('ag-demo', '1'); go(MAIN); };

  /* 패널 */
  function open(id) {
    stage.classList.add('panel-open');
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('show', p.id === id));
    $('lErr').textContent = $('sErr').textContent = '';
    setTimeout(() => (id === 'loginP' ? $('lUser') : $('sCode')).focus(), 60);
  }
  function close() { stage.classList.remove('panel-open'); document.querySelectorAll('.panel').forEach(p => p.classList.remove('show')); $('enterBtn').focus({ preventScroll: true }); }
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  $('toSignup').onclick = () => open('signupP');
  $('toLogin').onclick = () => open('loginP');

  const busy = (v) => stage.classList.toggle('busy', v);
  const netHint = e => e.code === 'network' && !AG.PROD ? ' · 이 주소에서는 서버에 연결할 수 없어요. 체험 모드로 둘러보세요' : '';

  async function login() {
    const u = $('lUser').value.trim(), p = $('lPass').value;
    if (!u) return $('lUser').focus(); if (!p) return $('lPass').focus();
    busy(true); $('lErr').textContent = '';
    try { await AG.auth.login(u, p); AG.LS.del('ag-demo'); go(MAIN); }
    catch (e) { $('lErr').textContent = AG.errMsg(e) + netHint(e); busy(false); }
  }
  $('lGo').onclick = login;
  ['lUser', 'lPass'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); id === 'lUser' ? $('lPass').focus() : login(); } }));

  async function signup() {
    const c = $('sCode').value.trim().toUpperCase(), u = $('sUser').value.trim(), p = $('sPass').value, p2 = $('sPass2').value;
    const err = m => { $('sErr').textContent = m; };
    if (!c) return err('초대 코드를 입력해 주세요'), $('sCode').focus();
    if (!/^[A-Za-z0-9_]{4,20}$/.test(u)) return err('아이디는 영문 · 숫자 · 밑줄 4~20자로 해 주세요'), $('sUser').focus();
    if (p.length < 8) return err('비밀번호는 8자 이상으로 해 주세요'), $('sPass').focus();
    if (p !== p2) return err('비밀번호가 서로 달라요'), $('sPass2').focus();
    busy(true); err('');
    try { await AG.auth.signup(u, p, c); AG.LS.del('ag-demo'); AG.toast('가입했어요 · 설정에서 캐릭터를 정해 주세요'); go(AG.PAGES.settings + '?welcome=1'); }
    catch (e) { err(AG.errMsg(e) + netHint(e)); busy(false); }
  }
  $('sGo').onclick = signup;
  ['sCode', 'sUser', 'sPass', 'sPass2'].forEach((id, i, a) => $(id).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); a[i + 1] ? $(a[i + 1]).focus() : signup(); } }));
  $('sCode').addEventListener('input', e => { const v = e.target.value.toUpperCase(); if (v !== e.target.value) e.target.value = v; });
})();
