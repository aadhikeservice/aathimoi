const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function startInternalServer() {
  try {
    require('./server.js');
    console.log('[Electron Main] Internal server started on port 3000');
  } catch (err) {
    console.error('[Electron Main] Notice starting internal server:', err.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 720,
    title: 'ஆதி மொய் (Aathi Moi) - Offline Desktop Edition',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextBridge: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Clear HTTP cache so UI updates immediately
  mainWindow.webContents.session.clearCache().catch(() => {});

  // Open external links (such as WhatsApp Web/Desktop) in OS default browser
  // Never call shell.openExternal on about:blank or empty popup URLs
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('https://') || url.startsWith('whatsapp://') || (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')))) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    if (!url || url === 'about:blank' || url.startsWith('about:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 420,
          height: 680,
          autoHideMenuBar: true,
          title: 'ஆதி மொய் (Aathi Moi) - Receipt Print'
        }
      };
    }
    return { action: 'allow' };
  });

  // Load local server URL
  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.focus();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.on('refocus-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.blur();
    mainWindow.focus();
    if (mainWindow.webContents) {
      mainWindow.webContents.focus();
    }
  }
});

// Direct Thermal Receipt Print on mainWindow (No popup preview window)
ipcMain.handle('print-thermal-receipt', async (event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  const { waUrl = '', silent = false } = payload || {};
  return new Promise((resolve) => {
    mainWindow.webContents.print({ silent: Boolean(silent), printBackground: true }, (success, failureReason) => {
      if (waUrl && (waUrl.startsWith('https://') || waUrl.startsWith('whatsapp://'))) {
        shell.openExternal(waUrl);
      }
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.focus();
      }
      resolve({ ok: Boolean(success), error: failureReason || '' });
    });
  });
});

ipcMain.handle('print-current-window', async (event, options) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  const printOpts = {
    silent: Boolean(options && options.silent),
    printBackground: true
  };
  return new Promise((resolve) => {
    mainWindow.webContents.print(printOpts, (success, failureReason) => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.focus();
      }
      resolve({ ok: Boolean(success), error: failureReason || '' });
    });
  });
});

// Native Folder Picker for Local Disk Receipt Saving
ipcMain.handle('select-local-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow && !mainWindow.isDestroyed() ? mainWindow : null, {
      title: 'Select Local Folder to Save Moi Receipts (கோப்புறை தேர்வு)',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const folderPath = result.filePaths[0];
    const folderName = path.basename(folderPath) || folderPath;
    return { ok: true, canceled: false, folderPath, folderName };
  } catch (err) {
    return { ok: false, canceled: false, error: err.message };
  }
});

function inlineCoverBgImage(html) {
  if (!html || !html.includes('cover_bg.jpg')) return html;
  try {
    const candidates = [
      path.join(__dirname, 'assets', 'cover_bg.jpg'),
      path.join(__dirname, 'public', 'assets', 'cover_bg.jpg'),
      path.join(process.cwd(), 'assets', 'cover_bg.jpg'),
      path.join(process.cwd(), 'public', 'assets', 'cover_bg.jpg')
    ];
    const imgPath = candidates.find(p => fs.existsSync(p));
    if (imgPath) {
      const b64 = fs.readFileSync(imgPath).toString('base64');
      const dataUri = `data:image/jpeg;base64,${b64}`;
      return html.replace(/(['"(])(?:\.?\/)?assets\/cover_bg\.jpg(['")])/g, `$1${dataUri}$2`);
    }
  } catch (e) {
    console.warn('[Cover Image Inline] Notice:', e.message);
  }
  return html;
}

// Helper to render HTML to PDF Buffer using hidden Electron BrowserWindow
async function renderHtmlToPdfBuffer(html) {
  const baseDir = fs.existsSync(path.join(__dirname, 'fonts')) ? __dirname : process.cwd();
  const tempId = `temp_e_pdf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tempHtmlPath = path.join(baseDir, `${tempId}.html`);
  const baseHref = 'file:///' + baseDir.replace(/\\/g, '/') + '/';
  const processedHtml = inlineCoverBgImage(html);

  const wrappedHtml = `<!DOCTYPE html>
<html lang="ta">
<head>
<meta charset="UTF-8">
<base href="${baseHref}">
<style>
@font-face {
  font-family: 'Adobe Tamil Regular';
  src: url('fonts/AdobeTamil-Regular.otf') format('opentype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'Adobe Tamil';
  src: url('fonts/AdobeTamil-Regular.otf') format('opentype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'Mukta Malar';
  src: url('fonts/MuktaMalar-Bold.ttf') format('truetype');
  font-weight: bold;
  font-style: normal;
}
@font-face {
  font-family: 'Mukta Malar';
  src: url('fonts/MuktaMalar-Regular.ttf') format('truetype');
  font-weight: 500;
  font-style: normal;
}
@page {
  size: A4 portrait;
  margin: 0;
}
* {
  box-sizing: border-box;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
body {
  margin: 0;
  padding: 0;
  background: #fff !important;
  color: #000 !important;
  font-family: 'Adobe Tamil Regular', 'Adobe Tamil', 'AdobeTamil-Regular', 'Mukta Malar', 'Nirmala UI', Arial, sans-serif !important;
}
</style>
</head>
<body>
${processedHtml}
</body>
</html>`;

  fs.writeFileSync(tempHtmlPath, wrappedHtml, 'utf-8');

  let pdfWin = null;
  try {
    pdfWin = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const fileUrl = 'file:///' + tempHtmlPath.replace(/\\/g, '/');
    await pdfWin.loadURL(fileUrl);
    await pdfWin.webContents.executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true').catch(() => {});
    await new Promise(r => setTimeout(r, 150));

    const pdfData = await pdfWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' }
    });
    const buf = Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);
    return buf;
  } finally {
    if (pdfWin && !pdfWin.isDestroyed()) {
      try { pdfWin.destroy(); } catch (e) {}
    }
    try { fs.unlinkSync(tempHtmlPath); } catch (e) {}
  }
}

// Native Save As PDF Dialog + Atomic PDF File Writer (Prevents 0-byte corrupted PDFs)
ipcMain.handle('save-pdf-dialog', async (event, payload) => {
  try {
    const { html, filename, defaultDir } = payload || {};
    if (!html) return { ok: false, error: 'Missing HTML content for PDF' };

    const cleanName = String(filename || 'Report').replace(/[\\/:*?"<>|]/g, '_').trim();
    const suggestedName = cleanName.toLowerCase().endsWith('.pdf') ? cleanName : `${cleanName}.pdf`;
    const defaultPath = (defaultDir && fs.existsSync(defaultDir))
      ? path.join(defaultDir, suggestedName)
      : suggestedName;

    // Start generating PDF buffer in parallel while user chooses save path
    const pdfPromise = renderHtmlToPdfBuffer(html);

    const saveResult = await dialog.showSaveDialog(mainWindow && !mainWindow.isDestroyed() ? mainWindow : null, {
      title: 'Save PDF Report',
      defaultPath,
      filters: [{ name: 'PDF Document (*.pdf)', extensions: ['pdf'] }]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      pdfPromise.catch(() => {});
      return { ok: false, canceled: true };
    }

    let targetPath = saveResult.filePath;
    if (!targetPath.toLowerCase().endsWith('.pdf')) {
      targetPath += '.pdf';
    }

    const pdfBuffer = await pdfPromise;
    if (!pdfBuffer || pdfBuffer.length < 100 || pdfBuffer.slice(0, 4).toString() !== '%PDF') {
      throw new Error('Generated PDF buffer was empty or invalid');
    }

    fs.writeFileSync(targetPath, pdfBuffer);
    return {
      ok: true,
      canceled: false,
      filePath: targetPath,
      fileName: path.basename(targetPath),
      bytes: pdfBuffer.length
    };
  } catch (err) {
    console.error('[Electron Main] save-pdf-dialog error:', err);
    return { ok: false, canceled: false, error: err.message };
  }
});

app.whenReady().then(() => {
  startInternalServer();
  setTimeout(createWindow, 1200);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
