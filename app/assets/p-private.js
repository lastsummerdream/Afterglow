/* 개인 연락망 · 개인채팅 (한 사람과 여러 대화) */
AG.boot();
(function () {
  const $ = s => document.getElementById(s);
  const qs = new URLSearchParams(location.search);
  const flat = s => String(s || '').replace(/\s+/g, ' ');
  let talks = [];
  const chat = AGChat({
    listItems: async () => {
      talks = await AG.talks.list();
      return talks.map(t => ({ id: t.id, title: `${t.partner.name} · ${t.title}`, sub: t.last ? flat(t.last.text) : '아직 메시지가 없어요' }));
    },
    initial: items => {
      const w = qs.get('with'); if (!w) return null;
      const t = talks.find(x => x.partner.id === w);
      if (!t) setTimeout(() => newTalk(w), 300);
      return t ? t.id : null;
    },
    loadMessages: id => AG.talks.messages(id),
    send: (id, t) => AG.talks.send(id, t),
    emptyList: '아직 1:1 대화가 없어요. + 를 눌러 시작해 보세요',
    onSelect: (id) => info(id),
    afterRender: msgs => { $('iCount').textContent = `${msgs.length}개`; },
    onPlus: () => newTalk(),
  });
  chat.loadList();

  function info(id) {
    const t = talks.find(x => x.id === id);
    $('pName').textContent = t ? t.partner.name : '—';
    $('pSub').textContent = t ? (t.partner.sub || '') : '';
    $('pDot').style.background = t && t.partner.online ? '#7ea34a' : '#9a9a9a';
    $('iTitle').textContent = t ? t.title : '—';
    $('iDate').textContent = t ? AG.afDate(t.createdAt) : '—';
    $('iCount').textContent = t ? `${t.count ?? 0}개` : '—';
  }

  async function newTalk(partnerId) {
    let partner = null;
    if (partnerId) {
      const us = await AG.users().catch(() => []);
      partner = us.find(u => u.id === partnerId);
    }
    if (!partner) {
      const us = await AG.users().catch(() => []);
      const p = await AG.pick({ sub: 'NEW TALK', title: '누구와 대화할까요?', items: us.map(u => ({ label: u.name, sub: u.sub, u })) });
      if (!p) return; partner = p.u;
    }
    const title = await AG.ask({ sub: 'NEW TALK', title: `${partner.name}와(과) 새 대화`, label: '대화 제목', placeholder: '예: 충돌구 조사 건', ok: '시작하기' });
    if (!title) return;
    try { const r = await AG.talks.create(partner.id, title.slice(0, 40)); await chat.loadList(r.id); chat.select(r.id); }
    catch (e) { AG.toast(AG.errMsg(e)); }
  }

  $('renameBtn').onclick = async () => {
    const t = talks.find(x => x.id === chat.active); if (!t) return;
    const v = await AG.ask({ sub: 'RENAME', title: '대화 제목 바꾸기', label: '새 제목', value: t.title, ok: '바꾸기' });
    if (!v || v === t.title) return;
    try { await AG.talks.rename(t.id, v.slice(0, 40)); await chat.loadList(t.id); info(t.id); AG.toast('제목을 바꿨어요'); } catch (e) { AG.toast(AG.errMsg(e)); }
  };
  $('newWithBtn').onclick = () => { const t = talks.find(x => x.id === chat.active); newTalk(t && t.partner.id); };
  $('leaveBtn').onclick = () => {
    const t = talks.find(x => x.id === chat.active); if (!t) return;
    const m = AG.modal(`<h2>LEAVE</h2><h3>대화에서 나갈까요?</h3><p>「${AG.esc(t.title)}」 대화와 메시지가 모두 지워져요. 되돌릴 수 없어요.</p><div class="row"><button class="ghost" data-x>취소</button><button data-ok style="background:#b24545;color:#fff">나가기</button></div>`);
    m.el.querySelector('[data-x]').onclick = m.close;
    m.el.querySelector('[data-ok]').onclick = async () => { m.close(); try { await AG.talks.leave(t.id); await chat.loadList(); AG.toast('대화에서 나왔어요'); } catch (e) { AG.toast(AG.errMsg(e)); } };
  };
})();
