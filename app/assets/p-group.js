/* 단체 단말 · 단체채팅 */
AG.boot();
(function () {
  const qs = new URLSearchParams(location.search);
  const flat = s => String(s || '').replace(/\s+/g, ' ');
  const chat = AGChat({
    listItems: async () => (await AG.channels.list()).map(c => ({
      id: c.id, title: '# ' + c.name,
      sub: `${c.members ?? 0}명` + (c.last ? ` · ${c.last.name}: ${flat(c.last.text)}` : ''),
    })),
    initial: () => qs.get('c'),
    loadMessages: id => AG.channels.messages(id),
    send: (id, t) => AG.channels.send(id, t),
    urimDeleted: true,
    emptyList: '채널이 없어요. + 를 눌러 만들어 보세요',
    emptyMsgs: '아직 조용해요. 첫 메시지를 남겨 보세요',
    onPlus: async () => {
      const n = await AG.ask({ sub: 'NEW CHANNEL', title: '새 채널 만들기', label: '채널 이름', placeholder: '예: 잔광 광장', ok: '만들기' });
      if (!n) return;
      try { const c = await AG.channels.create(n.replace(/^#\s*/, '').slice(0, 30)); await chat.loadList(c.id); chat.select(c.id); AG.toast(`# ${n} 채널을 만들었어요`); }
      catch (e) { AG.toast(AG.errMsg(e)); }
    },
  });
  chat.loadList();

  /* 접속자 */
  let shown = false;
  async function members() {
    let us = [];
    try { us = await AG.users(); } catch {}
    const all = us.map(u => ({ ...u })).concat([{ id: 'me', name: '나', online: true, me: true }]);
    all.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    document.getElementById('onlineTitle').textContent = `ONLINE · ${all.filter(u => u.online).length}`;
    const box = document.getElementById('members');
    box.innerHTML = all.map((u, i) => `<${u.me ? 'div' : 'button'} class="mem ${u.online ? 'on' : ''} ${shown ? '' : 'pop'}" ${u.me ? '' : `data-u="${AG.esc(u.id)}" title="${AG.esc(u.name)}에게 DM 보내기"`} style="display:block;width:480px;text-align:left;${shown ? '' : `animation-delay:${0.7 + i * 0.06}s`}">
      <span class="dot"></span><span class="t s8 nm">${AG.esc(u.name)}</span><span class="t ${u.online ? 's9' : 's10'} st">${u.online ? '접속 중' : '자리 비움'}</span></${u.me ? 'div' : 'button'}>`).join('');
    box.querySelectorAll('[data-u]').forEach(b => b.onclick = () => location.href = AG.PAGES.dm + '?with=' + encodeURIComponent(b.dataset.u));
    shown = true;
  }
  members();
  AG.poll(members, 15000);
})();
