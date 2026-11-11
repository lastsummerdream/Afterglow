/* 개인 단말 · DM (한 사람당 하나) */
AG.boot();
(function () {
  const $ = s => document.getElementById(s);
  const qs = new URLSearchParams(location.search);
  const flat = s => String(s || '').replace(/\s+/g, ' ');
  let dms = [], pending = null, users = [];
  const chat = AGChat({
    timeFmt: AG.af,
    listItems: async () => {
      dms = await AG.dms.list();
      if (pending && !dms.some(d => d.partner.id === pending.id)) dms.unshift({ partner: pending, unread: 0, last: null, count: 0 });
      return dms.map(d => ({ id: d.partner.id, title: d.partner.name, sub: d.last ? flat(d.last.text) : '아직 신호가 없어요', badge: d.partner.id === chat?.active ? 0 : d.unread }));
    },
    initial: () => {
      const w = qs.get('with'); if (!w) return null;
      if (!dms.some(d => d.partner.id === w)) {
        AG.users().then(us => { const u = us.find(x => x.id === w); if (u) { pending = u; chat.loadList(u.id); } });
        return null;
      }
      return w;
    },
    loadMessages: uid => AG.dms.messages(uid),
    send: (uid, t) => AG.dms.send(uid, t),
    emptyList: '아직 주고받은 단말 신호가 없어요. + 를 눌러 시작해 보세요',
    emptyMsgs: '첫 단말 신호를 보내 보세요',
    onSelect: uid => { info(uid); if (uid) AG.dms.read(uid).catch(() => {}); clearBadge(uid); },
    afterRender: msgs => { $('iCount').textContent = `${msgs.length}건`; },
    onPlus: async () => {
      users = await AG.users().catch(() => []);
      const p = await AG.pick({ sub: 'NEW DM', title: '누구에게 신호를 보낼까요?', items: users.filter(u => !dms.some(d => d.partner.id === u.id)).map(u => ({ label: u.name, sub: u.sub, u })) });
      if (!p) return;
      pending = p.u; await chat.loadList(p.u.id); chat.select(p.u.id);
    },
  });
  chat.loadList();

  function clearBadge(uid) {
    const row = document.querySelector(`.row[data-id="${CSS.escape(uid || '')}"]`);
    row?.querySelectorAll('.badge, .s23').forEach(x => x.remove());
  }
  function info(uid) {
    const d = dms.find(x => x.partner.id === uid); const p = d ? d.partner : null;
    $('pName').textContent = p ? p.name : '—';
    $('pSub').textContent = p ? (p.sub || '') : '';
    $('pDot').style.background = p && p.online ? '#7ea34a' : '#9a9a9a';
    $('iJob').textContent = p && p.job || '—';
    $('iFaction').textContent = p && p.faction || '—';
    $('iCount').textContent = d ? `${d.count ?? 0}건` : '—';
  }
  $('statsBtn').onclick = () => { if (chat.active) location.href = AG.PAGES.stats + '?user=' + encodeURIComponent(chat.active); };
  $('talkBtn').onclick = () => { if (chat.active) location.href = AG.PAGES.private + '?with=' + encodeURIComponent(chat.active); };
})();
