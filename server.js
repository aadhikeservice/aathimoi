const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE_DIR = process.cwd();
const DB_PATH = path.join(BASE_DIR, 'db.json');

// Initialize DB if not present
if (!fs.existsSync(DB_PATH)) {
  const initialDb = {
    users: [
      { id: '1', username: 'admin', password: '1234', role: 'admin', assignedEventIds: [] }
    ],
    events: [],
    receipts: [],
    payouts: []
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2), 'utf-8');
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function scanBackupFolder() {
  try {
    const backupDir = path.join(BASE_DIR, 'Backup');
    if (!fs.existsSync(backupDir)) return;
    if (!fs.existsSync(DB_PATH)) return;

    const dbRaw = fs.readFileSync(DB_PATH, 'utf-8');
    const db = JSON.parse(dbRaw);
    if (!db.receipts) db.receipts = [];

    const existingBillNos = new Set(db.receipts.map(r => String(r.billNo || r.id)));
    let newlyAdded = 0;

    function walkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const receiptObj = JSON.parse(content);
            if (receiptObj && receiptObj.billNo) {
              const key = String(receiptObj.billNo);
              if (!existingBillNos.has(key)) {
                db.receipts.push(receiptObj);
                existingBillNos.add(key);
                newlyAdded++;
              }
            }
          } catch (e) {
            // Ignore non-receipt JSON files
          }
        }
      }
    }

    walkDir(backupDir);

    if (newlyAdded > 0) {
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
      console.log(`[Backup Scanner] Merged ${newlyAdded} offline receipt(s) from Backup folder into db.json`);
    }
  } catch (err) {
    console.warn('[Backup Scanner] Error scanning backup folder:', err.message);
  }
}

function sanitizeFolderName(name) {
  if (!name) return 'Event';
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim();
}

function saveSingleReceiptToBackup(receiptData) {
  try {
    if (!receiptData || !receiptData.billNo) return;
    const backupDir = path.join(BASE_DIR, 'Backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const majorName = receiptData.displayName1 || receiptData.memberName || receiptData.eventName || 'Event';
    const name1 = receiptData.displayName1 ? (receiptData.memberName || '') : '';
    const folderTitle = (majorName ? (majorName + (name1 ? (' - ' + name1) : '')) : 'Event');
    
    let safeName = sanitizeFolderName(folderTitle);
    let eventFolderPath = path.join(backupDir, safeName);

    if (!fs.existsSync(eventFolderPath)) {
      const altName = sanitizeFolderName(majorName);
      const altEventPath = path.join(backupDir, altName);
      if (fs.existsSync(altEventPath)) {
        eventFolderPath = altEventPath;
      } else {
        fs.mkdirSync(eventFolderPath, { recursive: true });
      }
    }

    const username = sanitizeFolderName(receiptData.createdBy || 'admin');
    const userFolderPath = path.join(eventFolderPath, username);
    if (!fs.existsSync(userFolderPath)) {
      fs.mkdirSync(userFolderPath, { recursive: true });
    }

    const baseFileName = sanitizeFolderName(receiptData.billNo);

    // Save JSON data
    const filePath = path.join(userFolderPath, `${baseFileName}.json`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(receiptData, null, 2), 'utf-8');
    }

    // Save HTML version
    const htmlPath = path.join(userFolderPath, `${baseFileName}.html`);
    if (!fs.existsSync(htmlPath)) {
      const htmlContent = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <title>ஆதி மொய் - ரசீது #${receiptData.billNo}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.6; }
    .card { border: 2px solid #8B0000; padding: 20px; max-width: 400px; border-radius: 8px; background: #FFF8DC; }
    h2 { color: #8B0000; text-align: center; margin-top: 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
    .bold { font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <h2>ஆதி மொய் (Aathi Moi)</h2>
    <div class="row"><span class="bold">ரசீது எண்:</span> <span>#${receiptData.billNo}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${receiptData.date || ''} ${receiptData.time || ''}</span></div>
    <div class="row"><span class="bold">உறுப்பினர் பெயர்:</span> <span>${majorName}</span></div>
    ${name1 ? `<div class="row"><span class="bold">உறுப்பினர் பெயர் 1:</span> <span>${name1}</span></div>` : ''}
    <div class="row"><span class="bold">பெயர்:</span> <span>${receiptData.name || ''}${receiptData.name1 ? ' ' + receiptData.name1 : ''}</span></div>
    <div class="row"><span class="bold">இடம்:</span> <span>${receiptData.place || ''}</span></div>
    <div class="row"><span class="bold">உறவு:</span> <span>${receiptData.relationship || '-'}</span></div>
    <div class="row"><span class="bold">தொகை:</span> <span>₹${receiptData.amount || 0}</span></div>
    <div class="row"><span class="bold">எழுத்தால்:</span> <span>${receiptData.amountWords || ''}</span></div>
    <div class="row"><span class="bold">செலுத்திய முறை:</span> <span>${receiptData.mode || 'ரொக்கம்'}</span></div>
  </div>
</body>
</html>`;
      fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
    }
  } catch (err) {
    console.warn('[Backup Saver] Error saving receipt to backup:', err.message);
  }
}

function syncAllDbReceiptsToBackup() {
  try {
    if (!fs.existsSync(DB_PATH)) return;
    const dbRaw = fs.readFileSync(DB_PATH, 'utf-8');
    const db = JSON.parse(dbRaw);
    if (Array.isArray(db.receipts)) {
      for (const rcpt of db.receipts) {
        saveSingleReceiptToBackup(rcpt);
      }
    }
  } catch (err) {
    console.warn('[Backup Saver] Error syncing db.json receipts to backup:', err.message);
  }
}

// Scan backup folder & ensure all db receipts are saved in Backup folder on server startup
try {
  scanBackupFolder();
  syncAllDbReceiptsToBackup();
} catch (e) {
  console.warn('[Startup] Backup sync notice:', e.message);
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // API Endpoints
  if (pathname === '/api/db' && req.method === 'GET') {
    try {
      scanBackupFolder();
      syncAllDbReceiptsToBackup();
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/db' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        fs.writeFileSync(DB_PATH, JSON.stringify(json, null, 2), 'utf-8');
        syncAllDbReceiptsToBackup();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/events/create-folder' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { eventName, displayName1, memberName } = JSON.parse(body);
        const targetName = memberName || eventName;
        if (!targetName) {
          throw new Error('Event name is required');
        }
        const backupDir = path.join(BASE_DIR, 'Backup');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        const folderTitle = (displayName1 ? (displayName1 + ' - ') : '') + targetName;
        const safeName = sanitizeFolderName(folderTitle);
        const eventFolderPath = path.join(backupDir, safeName);
        const receiptsFolderPath = path.join(eventFolderPath, 'Receipts');

        if (!fs.existsSync(eventFolderPath)) {
          fs.mkdirSync(eventFolderPath, { recursive: true });
        }
        if (!fs.existsSync(receiptsFolderPath)) {
          fs.mkdirSync(receiptsFolderPath, { recursive: true });
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, folderPath: eventFolderPath }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/receipts/save-file' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { eventName, receiptData } = JSON.parse(body);
        if (!receiptData) {
          throw new Error('Receipt data required');
        }
        const backupDir = path.join(BASE_DIR, 'Backup');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }

        const majorName = receiptData.displayName1 || receiptData.memberName || eventName || 'Event';
        const name1 = receiptData.displayName1 ? (receiptData.memberName || '') : '';
        const folderTitle = (majorName ? (majorName + (name1 ? (' - ' + name1) : '')) : 'Event');
        
        let safeName = sanitizeFolderName(folderTitle);
        let eventFolderPath = path.join(backupDir, safeName);

        if (!fs.existsSync(eventFolderPath)) {
          const altName = sanitizeFolderName(majorName);
          const altEventPath = path.join(backupDir, altName);
          if (fs.existsSync(altEventPath)) {
            eventFolderPath = altEventPath;
          } else {
            fs.mkdirSync(eventFolderPath, { recursive: true });
          }
        }

        const username = sanitizeFolderName(receiptData.createdBy || 'admin');
        const userFolderPath = path.join(eventFolderPath, username);
        if (!fs.existsSync(userFolderPath)) {
          fs.mkdirSync(userFolderPath, { recursive: true });
        }

        const baseFileName = sanitizeFolderName(receiptData.billNo || `Receipt_${Date.now()}`);

        // Save JSON data
        const filePath = path.join(userFolderPath, `${baseFileName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(receiptData, null, 2), 'utf-8');

        // Save HTML version
        const htmlPath = path.join(userFolderPath, `${baseFileName}.html`);
        const htmlContent = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <title>ஆதி மொய் - ரசீது #${receiptData.billNo}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.6; }
    .card { border: 2px solid #8B0000; padding: 20px; max-width: 400px; border-radius: 8px; background: #FFF8DC; }
    h2 { color: #8B0000; text-align: center; margin-top: 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
    .bold { font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <h2>ஆதி மொய் (Aathi Moi)</h2>
    <div class="row"><span class="bold">ரசீது எண்:</span> <span>#${receiptData.billNo}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${receiptData.date} ${receiptData.time || ''}</span></div>
    <div class="row"><span class="bold">உறுப்பினர் பெயர்:</span> <span>${majorName}</span></div>
    ${name1 ? `<div class="row"><span class="bold">உறுப்பினர் பெயர் 1:</span> <span>${name1}</span></div>` : ''}
    <div class="row"><span class="bold">பெயர்:</span> <span>${receiptData.name}${receiptData.name1 ? ' ' + receiptData.name1 : ''}</span></div>
    <div class="row"><span class="bold">இடம்:</span> <span>${receiptData.place}</span></div>
    <div class="row"><span class="bold">உறவு:</span> <span>${receiptData.relationship || '-'}</span></div>
    <div class="row"><span class="bold">தொகை:</span> <span>₹${receiptData.amount}</span></div>
    <div class="row"><span class="bold">எழுத்தால்:</span> <span>${receiptData.amountWords}</span></div>
    <div class="row"><span class="bold">செலுத்திய முறை:</span> <span>${receiptData.mode}</span></div>
  </div>
</body>
</html>`;
        fs.writeFileSync(htmlPath, htmlContent, 'utf-8');

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, filePath }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Serve static files from /public with SPA fallback to index.html
  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (e) {
    decodedPath = pathname;
  }
  let cleanPath = (decodedPath === '/' || !decodedPath) ? 'index.html' : decodedPath.replace(/^[\/\\]+/, '');
  let targetFile = path.join(BASE_DIR, 'public', cleanPath);

  fs.stat(targetFile, (err, stats) => {
    let finalFile = (err || !stats.isFile()) ? path.join(BASE_DIR, 'public', 'index.html') : targetFile;
    fs.stat(finalFile, (finalErr, finalStats) => {
      if (finalErr || !finalStats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      const contentType = getContentType(finalFile);
      res.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8` });
      fs.createReadStream(finalFile).pipe(res);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`==================================================`);
  console.log(`   ஆதி மொய் (Aathi Moi) Server Running!`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   Base Dir: ${BASE_DIR}`);
  console.log(`==================================================`);
});
