/* 설정 · 계정 / 캐릭터 / 메인 화면 대사 (최대 5개) */
AG.boot();
(async function () {
  const $ = s => document.getElementById(s);
  const demo = AG.mode === 'demo';
  let me = null;
  try { me = await AG.me(); } catch (e) { AG.toast(AG.errMsg(e)); }
  const data = (me && me.character && me.character.data) || {};

  /* 계정 */
  $('fUser').value = me ? me.username : '';
  if (demo) { $('outLbl').textContent = '로그인 / 가입'; $('fCur').placeholder = '로그인하면 바꿀 수 있어요'; $('fCur').disabled = $('fNew').disabled = true; }
  $('pwBtn').onclick = async () => {
    if (demo) return AG.toast('로그인하면 비밀번호를 바꿀 수 있어요');
    const cur = $('fCur').value, nx = $('fNew').value;
    if (!cur) return $('fCur').focus();
    if (nx.length < 8) { AG.toast('새 비밀번호는 8자 이상으로 해 주세요'); return $('fNew').focus(); }
    try { await AG.account.password(cur, nx); $('fCur').value = $('fNew').value = ''; AG.toast('비밀번호를 바꿨어요'); } catch (e) { AG.toast(AG.errMsg(e)); }
  };
  $('outBtn').onclick = async () => {
    if (demo) { AG.LS.del('ag-demo'); return location.href = AG.PAGES.cover; }
    await AG.account.logout(); AG.toast('로그아웃했어요'); setTimeout(() => location.href = AG.PAGES.cover, 600);
  };
  $('delBtn').onclick = () => {
    if (demo) return AG.toast('체험 모드에는 지울 계정이 없어요');
    const m = AG.modal(`<h2>DELETE ACCOUNT</h2><h3>계정을 삭제할까요?</h3><p>캐릭터와 대화 기록이 모두 지워지고 되돌릴 수 없어요. 계속하려면 비밀번호를 입력해 주세요.</p>
      <label>비밀번호</label><input type="password" autocomplete="current-password"><p class="err"></p>
      <div class="row"><button class="ghost" data-x>취소</button><button data-ok style="background:#b24545;color:#fff">영구 삭제</button></div>`);
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-ok]').onclick = async () => {
      const pw = m.el.querySelector('input').value; if (!pw) return m.el.querySelector('input').focus();
      try { await AG.account.remove(pw); AG.LS.del('ag-token'); m.close(); AG.toast('계정을 삭제했어요'); setTimeout(() => location.href = AG.PAGES.cover, 900); }
      catch (e) { m.el.querySelector('.err').textContent = AG.errMsg(e); }
    };
  };
  function loginModal() {
    const m = AG.modal(`<h2>LOGIN</h2><h3>로그인</h3><p>로그인하면 다른 사람들과 실제로 대화하고, 기록이 서버에 저장돼요.</p>
      <label>아이디</label><input data-u autocomplete="username" maxlength="30"><label>비밀번호</label><input data-p type="password" autocomplete="current-password">
      <p class="err"></p><div class="row"><button class="ghost" data-sign>가입하기</button><button data-in>로그인</button></div>`);
    const u = m.el.querySelector('[data-u]'), p = m.el.querySelector('[data-p]'), err = m.el.querySelector('.err');
    const go = async kind => {
      if (!u.value.trim()) return u.focus(); if (!p.value) return p.focus();
      err.textContent = '';
      try { await AG.auth[kind](u.value.trim(), p.value); m.close(); AG.toast(kind === 'login' ? '로그인했어요' : '가입했어요'); setTimeout(() => location.reload(), 600); }
      catch (e) { err.textContent = AG.errMsg(e) + (e.code === 'network' ? ' · 이 페이지 주소에서는 서버를 쓸 수 없을 수 있어요' : ''); }
    };
    m.el.querySelector('[data-in]').onclick = () => go('login');
    m.el.querySelector('[data-sign]').onclick = () => go('signup');
    p.addEventListener('keydown', e => { if (e.key === 'Enter') go('login'); });
  }

  /* 캐릭터 */
  $('fOrigin').innerHTML = AG.ORIGINS.map(o => `<option>${o}</option>`).join('');
  $('fSpecies').innerHTML = Object.entries(AG.SPECIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('fName').value = data.name || (me && me.name) || '';
  $('fOrigin').value = data.origin || 'TB-03';
  $('fSpecies').value = data.species || 'human';
  if (me && me.avatar) { $('ava').src = me.avatar; $('ava').hidden = false; }
  const saveChar = async (patch, msg) => {
    try { await AG.character.save(patch); AG.toast(msg || '저장했어요'); } catch (e) { AG.toast(AG.errMsg(e)); }
  };
  $('fName').addEventListener('change', () => { const v = $('fName').value.trim(); if (v) saveChar({ name: v }, '이름을 저장했어요'); });
  $('fName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  $('fOrigin').addEventListener('change', () => saveChar({ origin: $('fOrigin').value }, '출신을 저장했어요'));
  $('fSpecies').addEventListener('change', () => saveChar({ species: $('fSpecies').value }, '종족을 저장했어요'));
  $('avaBtn').onclick = $('avaTxt').onclick = () => $('pickAva').click();
  $('pickAva').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const url = await AG.squareImage(f); await AG.character.save({ avatar: url }); $('ava').src = url; $('ava').hidden = false; AG.toast('프로필 사진을 바꿨어요'); }
    catch (err) { AG.toast(AG.errMsg(err)); }
  };
  $('illuBtn').onclick = () => $('pickIllu').click();
  $('pickIllu').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { await AG.illust.set(f); AG.toast('전신 일러스트를 바꿨어요 · 구경 온 사람에게도 보여요', 2600); } catch (err) { AG.toast(err && err.message === 'too_long' ? '이미지가 너무 커요. 더 작은 파일로 해 주세요' : '이 기기에는 저장했지만 서버에 올리지 못했어요', 2800); }
  };
  $('detailBtn').onclick = () => {
    const F = [['nameEn', '영문 이름', 40], ['age', '나이', 20], ['gender', '성별', 20], ['height', '키', 20], ['job', '직업', 40], ['faction', '소속', 40], ['echoAbility', '잔향 능력', 120]];
    const T = [['appearance', '외형', 1200], ['personality', '성격', 1200]];
    const SK = [['attackNormalName', '일반 공격 이름', 40, 'input'], ['attackNormal', '일반 공격 설명', 600, 'area'], ['attackSpecialName', '특수 공격 이름', 40, 'input'], ['attackSpecial', '특수 공격 설명', 800, 'area'], ['attackUltimateName', '필살기 이름', 40, 'input'], ['attackUltimate', '필살기 설명', 1000, 'area']];
    const echo = ['없음', '방출형', '조형형', '강화형', '간섭형', '감응형'];
    const m = AG.modal(`<h2>CHARACTER</h2><h3>캐릭터 정보</h3><div style="max-height:820px;overflow-y:auto;padding-right:10px">
      ${F.map(([k, l, n]) => `<label>${l}</label><input data-k="${k}" maxlength="${n}" value="${AG.esc(data[k] || '')}">`).join('')}
      <label>잔향 유형</label><select data-k="echoType">${echo.map(x => `<option ${x === (data.echoType || '없음') ? 'selected' : ''}>${x}</option>`).join('')}</select>
      ${T.map(([k, l, n]) => `<label>${l}</label><textarea data-k="${k}" maxlength="${n}">${AG.esc(data[k] || '')}</textarea>`).join('')}
      <h2 id="skillsHead" style="margin-top:40px">COMBAT SKILLS</h2><p style="margin-bottom:0">전투에서 '공격'을 누르면 고를 수 있어요. 피해 같은 숫자는 따로 정해져요.</p>
      ${SK.map(([k, l, n, t]) => `<label>${l}</label>${t === 'input' ? `<input data-k="${k}" maxlength="${n}" value="${AG.esc(data[k] || '')}">` : `<textarea data-k="${k}" maxlength="${n}" style="height:140px">${AG.esc(data[k] || '')}</textarea>`}`).join('')}</div>
      <div class="row"><button class="ghost" data-x>취소</button><button data-ok>저장</button></div>`);
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-ok]').onclick = async () => {
      const patch = {}; m.el.querySelectorAll('[data-k]').forEach(x => { patch[x.dataset.k] = x.value.trim(); });
      Object.assign(data, patch); m.close(); await saveChar(patch, '캐릭터 정보를 저장했어요');
    };
    return m;
  };
  if (new URLSearchParams(location.search).get('welcome')) setTimeout(() => { AG.toast('환영해요 · 캐릭터 이름과 정보를 정해 주세요', 3000); $('fName').focus(); }, 1400);
  if (new URLSearchParams(location.search).get('edit') === 'skills') setTimeout(() => {
    const m = $('detailBtn').onclick();
    const h = m && m.el.querySelector('#skillsHead'); if (h) { h.scrollIntoView({ block: 'start' }); m.el.querySelector('[data-k="attackSpecialName"]').focus({ preventScroll: true }); }
  }, 1200);

  /* 메인 화면 대사 */
  const lines = (me && me.lines) || [];
  document.querySelectorAll('.line').forEach((inp, i) => {
    inp.value = lines[i] || '';
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { const n = document.querySelector(`.line[data-i="${i + 1}"]`); n ? n.focus() : $('saveLines').click(); } });
  });
  $('saveLines').onclick = async () => {
    const v = [...document.querySelectorAll('.line')].map(x => x.value.trim()).filter(Boolean).slice(0, 5);
    try { await AG.lines.save(v); AG.toast(v.length ? `메인 화면 대사 ${v.length}개를 저장했어요` : '대사를 모두 비웠어요'); } catch (e) { AG.toast(AG.errMsg(e)); }
  };
})();
