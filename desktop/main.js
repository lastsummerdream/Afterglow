const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

const START_URL = 'https://lastsummerdream.github.io/Afterglow/app/';
const ALLOWED_HOST = 'lastsummerdream.github.io';

const OFFLINE_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>AFTERGLOW</title>
<style>
  html, body { margin: 0; height: 100%; background: #0c0c0e; color: #e8e8e8; font-family: -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif; display: grid; place-items: center; text-align: center; user-select: none; }
  .box { max-width: 420px; padding: 40px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.14); }
  h1 { margin: 0 0 12px; font-size: 22px; letter-spacing: 0.18em; }
  p { margin: 0 0 24px; font-size: 14px; color: #a8a8a8; line-height: 1.6; }
  button { height: 44px; padding: 0 28px; font: inherit; font-size: 14px; font-weight: 700; color: #111; background: #e8e8e8; border: 0; cursor: pointer; }
  button:hover { filter: brightness(1.1); }
</style>
</head>
<body>
  <div class="box">
    <h1>AFTERGLOW</h1>
    <p>단말 서버에 연결할 수 없어요.<br>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</p>
    <button onclick="location.href='${START_URL}'">다시 연결</button>
  </div>
</body>
</html>`;

function buildMenu(win) {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about', label: 'AFTERGLOW 정보' },
        { type: 'separator' },
        { role: 'hide', label: '숨기기' },
        { role: 'hideOthers', label: '다른 창 숨기기' },
        { role: 'unhide', label: '모두 보기' },
        { type: 'separator' },
        { role: 'quit', label: '종료' }
      ]
    }] : []),
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '오려두기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '전체 선택' }
      ]
    },
    {
      label: '화면',
      submenu: [
        {
          label: '커버 화면으로 이동',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => win && !win.isDestroyed() && win.loadURL(START_URL)
        },
        {
          label: '뒤로',
          accelerator: isMac ? 'Cmd+[' : 'Alt+Left',
          click: () => win && !win.isDestroyed() && win.webContents.canGoBack() && win.webContents.goBack()
        },
        {
          label: '앞으로',
          accelerator: isMac ? 'Cmd+]' : 'Alt+Right',
          click: () => win && !win.isDestroyed() && win.webContents.canGoForward() && win.webContents.goForward()
        },
        { type: 'separator' },
        { role: 'reload', label: '새로고침' },
        { role: 'forceReload', label: '강제 새로고침' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면 전환' }
      ]
    },
    {
      label: '창',
      submenu: [
        { role: 'minimize', label: '최소화' },
        ...(isMac ? [{ role: 'zoom', label: '확대/축소' }, { role: 'front', label: '앞으로 가져오기' }] : [{ role: 'close', label: '닫기' }])
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 810,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#0c0c0e',
    title: 'AFTERGLOW',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  buildMenu(win);
  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.hostname === ALLOWED_HOST) {
        win.loadURL(url);
        return { action: 'deny' };
      }
    } catch {}
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'data:' || u.hostname === ALLOWED_HOST) return;
      e.preventDefault();
      shell.openExternal(url).catch(() => {});
    } catch {}
  });

  win.webContents.on('did-fail-load', (_e, errorCode, _errorDesc, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // -3: ERR_ABORTED
    if (validatedURL && validatedURL.startsWith('data:')) return;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(OFFLINE_HTML));
  });

  win.loadURL(START_URL);
  return win;
}

app.whenReady().then(() => {
  if (session && session.defaultSession) {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      try {
        const u = new URL(webContents.getURL());
        if (u.hostname === ALLOWED_HOST && (permission === 'notifications' || permission === 'media')) {
          return callback(true);
        }
      } catch {}
      callback(false);
    });
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
