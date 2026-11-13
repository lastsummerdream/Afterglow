/* 타임라인 · 목록(앞 200자 미리보기) → 글을 누르면 그 글 하나만 전문으로 보기
   댓글 · 답글은 열린 글에만 달 수 있고, 내 글과 댓글은 수정 · 삭제할 수 있다. */
AG.boot();
(function () {
  const $ = s => document.getElementById(s);
  const feed = $('feed'), cbox = $('comments'), compose = $('compose'), cInput = $('cInput');
  let skipPop = false, posts = [], view = null, comments = [], replyTo = null, firstFeed = true, sig = null, listScroll = 0;

  /* 글쓰기 */
  const updCount = () => {
    const n = Array.from(compose.value).length;
    $('count').textContent = n > 200 ? `${n}자 · 앞 200자만 타임라인에 보이고 나머지는 눌러서 봐요` : `${n}자 · 타임라인에는 앞 200자까지 보여요`;
  };
  compose.addEventListener('input', updCount);
  compose.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); } });
  async function post() {
    const v = compose.value.trim();
    if (!v) return compose.focus();
    try { await AG.posts.create(v); compose.value = ''; updCount(); AG.toast('타임라인에 올렸어요'); sig = null; if (view) close(true); await load(); feed.scrollTop = 0; }
    catch (e) { AG.toast(AG.errMsg(e)); }
  }
  $('postBtn').onclick = post;

  /* 피드 */
  async function load() {
    try { posts = await AG.posts.list(); } catch (e) { AG.toast(AG.errMsg(e)); posts = []; }
    const s = posts.map(p => p.id + ':' + (p.editedAt || 0) + ':' + p.comments).join('|');
    if (s === sig && !firstFeed) return;
    if (feed.querySelector('.editing')) return;
    sig = s;
    if (view && !posts.some(p => p.id === view)) { AG.toast('글이 삭제됐어요'); close(true); return; }
    render();
  }
  const ava = p => `<span class="ava" aria-hidden="true">${p.avatar ? `<img src="${AG.esc(p.avatar)}" alt="">` : AG.esc(Array.from(p.name || '?')[0])}</span>`;
  function meta(p) { return AG.esc([p.sub, AG.ago(p.at)].filter(Boolean).join(' · ')) + (p.editedAt ? '<span class="edited">수정됨</span>' : ''); }
  function ownMenu(el, p) {
    if (!p.mine) return;
    AG.ownActions(el, el.querySelector('.bd'), {
      place: { right: '40px', top: view ? '84px' : '0px' },
      getText: () => p.text,
      confirmText: '글을 삭제할까요? 댓글도 함께 지워져요',
      onSave: async v => { await AG.posts.edit(p.id, v); p.text = v; p.editedAt = Date.now(); sig = null; },
      done: () => { load(); AG.toast('글을 고쳤어요'); },
      onDelete: async () => { await AG.posts.del(p.id); sig = null; AG.toast('글을 삭제했어요'); if (view === p.id) close(true); await load(); },
    });
  }
  function render() {
    feed.classList.toggle('detail-mode', !!view);
    if (view) return renderDetail();
    if (!posts.length) { feed.innerHTML = '<p class="empty">아직 아무도 글을 올리지 않았어요. 첫 글을 남겨 보세요.</p>'; return; }
    feed.innerHTML = '';
    posts.forEach((p, i) => {
      const el = document.createElement('article');
      el.className = 'post' + (firstFeed ? ' pop' : '');
      if (firstFeed) el.style.animationDelay = (0.6 + i * 0.08) + 's';
      el.dataset.id = p.id; el.tabIndex = 0;
      el.setAttribute('aria-label', `${p.name}의 글 열기`);
      const pv = AG.preview(p.text);
      el.innerHTML = `${ava(p)}<div class="hd"><span class="nm">${AG.esc(p.name)}</span><span class="sb">${meta(p)}</span></div>
        <p class="bd">${AG.esc(pv.text + (pv.cut ? '…' : ''))}</p>
        ${pv.cut ? '<span class="more">본문 보기</span>' : ''}
        ${p.story ? `<span class="join">${p.storyDone ? '기록 보기' : p.storyStarted ? '중간 합류하기' : '참여하기'}</span>` : `<p class="ft">${p.comments ? `댓글 ${p.comments}` : '댓글 달기'}</p>`}`;
      if (p.story) { el.classList.add('story'); el.setAttribute('aria-label', '단체 스토리 참여하기'); el.querySelector('.more')?.remove(); el.querySelector('.bd').textContent = p.text; }
      const go = () => p.story ? (location.href = AG.PAGES.story + '?id=' + p.story) : open(p.id);
      el.addEventListener('click', e => { if (e.target.closest('.acts,.edit-box,.edit-row')) return; go(); });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === el) go(); });
      ownMenu(el, p);
      feed.appendChild(el);
    });
    firstFeed = false;
  }
  function renderDetail() {
    const p = posts.find(x => x.id === view);
    if (!p) return;
    feed.innerHTML = '';
    const el = document.createElement('article');
    el.className = 'post detail pop';
    el.dataset.id = p.id;
    el.innerHTML = `<button type="button" class="back">← 타임라인으로 돌아가기</button>${ava(p)}
      <div class="hd"><span class="nm">${AG.esc(p.name)}</span><span class="sb">${meta(p)}</span></div>
      <p class="bd">${AG.esc(p.text)}</p>
      <p class="ft">${p.comments ? `댓글 ${p.comments}` : '아직 댓글이 없어요 · 오른쪽에서 첫 댓글을 남겨 보세요'}</p>`;
    el.querySelector('.back').onclick = () => close();
    ownMenu(el, p);
    feed.appendChild(el);
    feed.scrollTop = 0;
  }

  /* 글 하나 열기 / 닫기 (브라우저 뒤로 가기와도 맞춤) */
  function open(id, fromHistory) {
    if (feed.querySelector('.editing')) return;
    if (!view) listScroll = feed.scrollTop;
    view = id; replyTo = null; setReply(null);
    if (!fromHistory) history.pushState({ post: id }, '', '#post-' + id);
    render(); showComments();
  }
  function close(replace, fromHistory) {
    view = null; setReply(null);
    if (!fromHistory) { if (!replace && history.state && history.state.post) { skipPop = true; history.back(); } else history.replaceState(null, '', location.pathname + location.search); }
    render(); feed.scrollTop = listScroll; showComments();
  }
  addEventListener('popstate', e => {
    if (skipPop) { skipPop = false; return; }
    const id = e.state && e.state.post;
    if (id && posts.some(p => p.id === id)) open(id, true); else if (view) close(false, true);
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && view && !document.querySelector('.editing,.modal-back') && document.activeElement !== cInput) close();
  });

  /* 댓글: 열린 글에만 */
  function showComments() {
    const p = posts.find(x => x.id === view);
    const on = !!p;
    $('cOwner').textContent = on ? `${p.name}의 글` : '글을 열면 댓글을 볼 수 있어요';
    cInput.disabled = !on; $('cSend').disabled = !on;
    cInput.placeholder = on ? '댓글을 입력하세요' : '글을 먼저 열어 주세요';
    if (!on) { comments = []; cbox.innerHTML = ''; $('cTitle').textContent = 'COMMENTS'; return; }
    cbox.innerHTML = ''; loadComments(true);
  }
  async function loadComments(first) {
    if (!view || cbox.querySelector('.editing')) return;
    const id = view;
    try { comments = await AG.posts.comments(id); } catch (e) { if (first) AG.toast(AG.errMsg(e)); return; }
    if (id !== view) return;
    $('cTitle').textContent = `COMMENTS · ${comments.length}`;
    renderComments(first);
  }
  function renderComments(anim) {
    if (!comments.length) { cbox.innerHTML = '<p class="empty">아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</p>'; return; }
    const kids = {}; comments.forEach(c => (kids[c.parentId || ''] = kids[c.parentId || ''] || []).push(c));
    Object.values(kids).forEach(a => a.sort((x, y) => x.at - y.at));
    cbox.innerHTML = '';
    let i = 0;
    const walk = (pid, lv) => (kids[pid || ''] || []).forEach(c => {
      const el = document.createElement('div');
      el.className = `cm lv${Math.min(lv, 2)}` + (anim ? ' pop' : '');
      if (anim) el.style.animationDelay = (i++ * 0.05) + 's';
      el.innerHTML = `<div class="hd"><span class="nm">${AG.esc(c.name)}</span><span class="tm">${AG.esc(AG.ago(c.at))}${c.editedAt ? ' · 수정됨' : ''}</span></div>
        <p class="bd">${AG.esc(c.text)}</p><button class="rp" type="button">답글</button>`;
      el.querySelector('.rp').onclick = () => setReply(c);
      if (c.mine) AG.ownActions(el, el.querySelector('.bd'), {
        place: { right: '0px', top: '0px' },
        getText: () => c.text,
        confirmText: kids[c.id] ? '삭제할까요? 답글도 함께 지워져요' : '삭제할까요?',
        onSave: async v => { await AG.posts.editComment(c.id, v); c.text = v; c.editedAt = Date.now(); },
        done: () => loadComments(),
        onDelete: async () => { await AG.posts.delComment(c.id); await loadComments(); bump(); },
      });
      cbox.appendChild(el);
      walk(c.id, lv + 1);
    });
    walk(null, 0);
  }
  function setReply(c) {
    replyTo = c;
    const r = $('replyTo');
    if (!c) { r.hidden = true; if (view) cInput.placeholder = '댓글을 입력하세요'; return; }
    r.hidden = false; r.innerHTML = `↳ ${AG.esc(c.name)}에게 답글 <button type="button">취소</button>`;
    r.querySelector('button').onclick = () => setReply(null);
    cInput.placeholder = `${c.name}에게 답글`; cInput.focus();
  }
  async function sendComment() {
    const v = cInput.value.trim();
    if (!view) return AG.toast('글을 먼저 열어 주세요');
    if (!v) return cInput.focus();
    cInput.value = '';
    try { await AG.posts.comment(view, v, replyTo ? replyTo.id : null); setReply(null); await loadComments(); cbox.scrollTop = cbox.scrollHeight; bump(); }
    catch (e) { cInput.value = v; AG.toast(AG.errMsg(e)); }
  }
  function bump() { sig = null; load(); }
  cInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendComment(); } if (e.key === 'Escape') setReply(null); });
  $('cSend').onclick = sendComment;

  /* 주소에 #post-ID 가 있으면 그 글을 바로 연다 */
  load().then(() => {
    const m = location.hash.match(/^#post-(.+)$/);
    if (m && posts.some(p => p.id === m[1])) { history.replaceState({ post: m[1] }, '', location.hash); open(m[1], true); }
    else showComments();
  });
  AG.poll(() => { load(); loadComments(); }, 6000);
})();
