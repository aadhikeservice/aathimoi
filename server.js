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
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function readDbRaw() {
  if (!fs.existsSync(DB_PATH)) return '';
  let str = fs.readFileSync(DB_PATH, 'utf-8');
  if (str.charCodeAt(0) === 0xFEFF) {
    str = str.slice(1);
  }
  return str;
}

function readDb() {
  const raw = readDbRaw();
  if (!raw) return { events: [], receipts: [], payouts: [], users: [], noteEvents: [], noteEntries: [] };
  return JSON.parse(raw);
}

function scanBackupFolder() {
  try {
    if (!fs.existsSync(DB_PATH)) return;

    const db = readDb();
    if (!db.receipts) db.receipts = [];
    if (!db.events) db.events = [];
    if (!db.noteEvents) db.noteEvents = [];
    if (!db.noteEntries) db.noteEntries = [];

    const existingBillNos = new Set(db.receipts.map(r => String(r.billNo || r.id)));
    const existingEventIds = new Set(db.events.map(e => e.id));
    const existingEventNames = new Set(db.events.map(e => (e.displayName1 || e.memberName || e.eventName || '').toLowerCase()));

    let newlyAddedReceipts = 0;
    let newlyAddedEvents = 0;

    const scanDirs = [path.join(BASE_DIR, 'Backup')];
    const driveBase = 'G:\\My Drive\\moi\\Backup';
    try {
      if (fs.existsSync(driveBase)) {
        scanDirs.push(driveBase);
      }
    } catch (e) {}

    function walkDir(dir) {
      if (!fs.existsSync(dir)) return;
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
              // Only associate receipt if its event exists in db
              if (receiptObj.eventId && existingEventIds.has(receiptObj.eventId)) {
                if (!existingBillNos.has(key)) {
                  db.receipts.push(receiptObj);
                  existingBillNos.add(key);
                  newlyAddedReceipts++;
                }
              }
            }
          } catch (e) {
            // Ignore non-receipt JSON files
          }
        }
      }
    }

    scanDirs.forEach(d => walkDir(d));

    // If event master folder was deleted in drive, delete from Saved Events in db.json
    syncEventsWithDriveFolders(db);

    if (newlyAddedReceipts > 0 || newlyAddedEvents > 0) {
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
      console.log(`[Backup Scanner] Merged ${newlyAddedReceipts} receipt(s) and recovered ${newlyAddedEvents} event(s) from Backup/Drive into db.json`);
    }
  } catch (err) {
    console.warn('[Backup Scanner] Error scanning backup folder:', err.message);
  }
}

function getBackupDirectories(subPath = '') {
  const dirs = [path.join(BASE_DIR, 'Backup', subPath)];
  const driveBase = 'G:\\My Drive\\moi';
  try {
    if (fs.existsSync(driveBase)) {
      dirs.push(path.join(driveBase, 'Backup', subPath));
    }
  } catch (e) {}
  return dirs;
}

function sanitizeFolderName(name) {
  if (!name) return 'Event';
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim();
}

function getEventFolderNames(event) {
  if (!event) return [];
  const majorName = event.displayName1 || event.memberName || event.eventName || '';
  const name1 = event.displayName1 ? (event.memberName || '') : '';
  const folderTitle = (majorName ? (majorName + (name1 ? (' - ' + name1) : '')) : '');
  const names = [];
  if (folderTitle) names.push(sanitizeFolderName(folderTitle));
  if (majorName) names.push(sanitizeFolderName(majorName));
  if (event.eventName) names.push(sanitizeFolderName(event.eventName));
  return [...new Set(names.filter(Boolean))];
}

function syncEventsWithDriveFolders(db) {
  if (!db || !Array.isArray(db.events) || db.events.length === 0) return 0;

  const backupDirs = getBackupDirectories();
  const existingBackupDirs = backupDirs.filter(d => fs.existsSync(d));
  if (existingBackupDirs.length === 0) return 0;

  const validEvents = [];
  let deletedCount = 0;

  db.events.forEach(ev => {
    const possibleNames = getEventFolderNames(ev);
    let folderFound = false;
    for (const bDir of existingBackupDirs) {
      for (const name of possibleNames) {
        if (name && fs.existsSync(path.join(bDir, name))) {
          folderFound = true;
          break;
        }
      }
      if (folderFound) break;
    }

    if (folderFound) {
      validEvents.push(ev);
    } else {
      console.log(`[Drive Sync] Event folder deleted in drive: "${ev.displayName1 || ev.memberName || ev.id}". Deleting from Saved Events.`);
      deletedCount++;
    }
  });

  if (deletedCount > 0) {
    db.events = validEvents;
    // NOTE: Preserve all member receipts and member details even when event master is deleted
    // (Per user instruction: "if event master deleted and don't delete the members details")
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
    const gDriveDb = 'G:\\My Drive\\moi\\db.json';
    try {
      if (fs.existsSync('G:\\My Drive\\moi')) {
        fs.writeFileSync(gDriveDb, JSON.stringify(db, null, 2), 'utf-8');
      }
    } catch (e) {}
  }
  return deletedCount;
}

function saveSingleReceiptToBackup(receiptData) {
  try {
    if (!receiptData || !receiptData.billNo) return;
    const baseDirs = getBackupDirectories();

    baseDirs.forEach(backupDir => {
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
    <div class="row"><span class="bold">பெயர்:</span> <span>${receiptData.initial ? receiptData.initial + '. ' : ''}${receiptData.name || ''}${receiptData.job ? ' - ' + receiptData.job : ''}${receiptData.name1 ? ' ' + receiptData.name1 : ''}</span></div>
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
    });
  } catch (err) {
    console.warn('[Backup Saver] Error saving receipt to backup:', err.message);
  }
}

function saveSinglePayoutToBackup(payoutData) {
  try {
    if (!payoutData || !payoutData.id) return;
    const baseDirs = getBackupDirectories();

    baseDirs.forEach(backupDir => {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const majorName = payoutData.displayName1 || payoutData.memberName || payoutData.eventName || 'Event';
      const name1 = payoutData.displayName1 ? (payoutData.memberName || '') : '';
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

      const payoutsSubDir = path.join(eventFolderPath, 'Payouts');
      if (!fs.existsSync(payoutsSubDir)) {
        fs.mkdirSync(payoutsSubDir, { recursive: true });
      }

      const username = sanitizeFolderName(payoutData.createdBy || 'admin');
      const userFolderPath = path.join(payoutsSubDir, username);
      if (!fs.existsSync(userFolderPath)) {
        fs.mkdirSync(userFolderPath, { recursive: true });
      }

      const baseFileName = sanitizeFolderName(payoutData.id);

      // Save JSON data
      const filePath = path.join(userFolderPath, `${baseFileName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(payoutData, null, 2), 'utf-8');

      // Save HTML version
      const htmlPath = path.join(userFolderPath, `${baseFileName}.html`);
      const htmlContent = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <title>ஆதி மொய் - பட்டுவாடா ரசீது</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.6; }
    .card { border: 2px solid #8B0000; padding: 20px; max-width: 400px; border-radius: 8px; background: #FFF8DC; }
    h2 { color: #8B0000; text-align: center; margin-top: 0; margin-bottom: 2px; }
    .sub { text-align: center; font-size: 11px; font-weight: bold; color: #555; border-bottom: 1px solid #8B0000; padding-bottom: 6px; margin-bottom: 10px; }
    .title-banner { text-align: center; font-size: 14px; font-weight: bold; color: #8B0000; margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
    .bold { font-weight: bold; }
    .amount-box { border-top: 2px solid #8B0000; border-bottom: 2px solid #8B0000; padding: 8px 0; margin: 10px 0; text-align: center; }
    .amount-val { font-size: 22px; font-weight: bold; color: #8B0000; }
  </style>
</head>
<body>
  <div class="card">
    <h2>ஆதி மொய் (Aathi Moi)</h2>
    <div class="sub">கருணாக்கமுத்தன்பட்டி (+91 9865607179)</div>
    <div class="title-banner">பட்டுவாடா ரசீது (Payout Receipt)</div>
    <div class="row"><span class="bold">ரசீது எண்:</span> <span>#${String(payoutData.id || '').replace(/^payout_/, '')}</span></div>
    <div class="row"><span class="bold">பதிவு செய்தவர்:</span> <span>${payoutData.createdBy || 'admin'}</span></div>
    <div class="row"><span class="bold">தேதி & நேரம்:</span> <span>${payoutData.date || ''} ${payoutData.time || ''}</span></div>
    <div class="row"><span class="bold">அனுப்புபவர்:</span> <span>${payoutData.sender || payoutData.name || ''}</span></div>
    <div class="row"><span class="bold">பெறுபவர்:</span> <span>${payoutData.receiver || ''}</span></div>
    <div class="row"><span class="bold">காரணம்:</span> <span>${payoutData.reason || ''}</span></div>
    <div class="amount-box">
      <div style="font-size: 13px; font-weight: bold; color: #8B0000;">செலவுத் தொகை</div>
      <div class="amount-val">₹${parseFloat(payoutData.amount || 0).toLocaleString('en-IN')}</div>
    </div>
  </div>
</body>
</html>`;
      fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
    });
  } catch (err) {
    console.warn('[Backup Saver] Error saving payout to backup:', err.message);
  }
}

function syncAllDbPayoutsToBackup() {
  try {
    if (!fs.existsSync(DB_PATH)) return;
    const db = readDb();
    if (Array.isArray(db.payouts)) {
      for (const payout of db.payouts) {
        saveSinglePayoutToBackup(payout);
      }
    }
  } catch (err) {
    console.warn('[Backup Saver] Error syncing db.json payouts to backup:', err.message);
  }
}

function syncAllNoteEntriesToBackup() {
  try {
    if (!fs.existsSync(DB_PATH)) return;
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const noteEvents = db.noteEvents || [];
    const noteEntries = db.noteEntries || [];

    noteEvents.forEach(ev => {
      const eventDirName = sanitizeFolderName(ev.name || 'General');
      const targetDirs = getBackupDirectories(path.join('Note Entry', eventDirName));

      targetDirs.forEach(folderPath => {
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
      });

      const evEntries = noteEntries.filter(e => e.noteEventId === ev.id);
      evEntries.forEach(noteEntry => {
        const baseFileName = sanitizeFolderName(`${noteEntry.name1 || 'Entry'}_${noteEntry.id || Date.now()}`);

        targetDirs.forEach(folderPath => {
          const jsonPath = path.join(folderPath, `${baseFileName}.json`);
          if (!fs.existsSync(jsonPath)) {
            fs.writeFileSync(jsonPath, JSON.stringify(noteEntry, null, 2), 'utf-8');
          }

          const htmlPath = path.join(folderPath, `${baseFileName}.html`);
          if (!fs.existsSync(htmlPath)) {
            const htmlContent = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <title>ஆதி மொய் - குறிப்பு பதிவு (${noteEntry.name1})</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.6; }
    .card { border: 2px solid #D4AF37; padding: 20px; max-width: 450px; border-radius: 10px; background: #FFFDF0; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h2 { color: #8B0000; text-align: center; margin-top: 0; border-bottom: 2px solid #8B0000; padding-bottom: 8px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
    .bold { font-weight: bold; color: #1E293B; }
    .amt { font-size: 14pt; font-weight: bold; color: #059669; }
  </style>
</head>
<body>
  <div class="card">
    <h2>ஆதி மொய் - குறிப்பு பதிவு</h2>
    <div class="row"><span class="bold">நிகழ்ச்சி:</span> <span>${ev.name}</span></div>
    <div class="row"><span class="bold">ஊர் / இடம்:</span> <span>${noteEntry.place}</span></div>
    <div class="row"><span class="bold">பெயர் 1:</span> <span>${noteEntry.name1}</span></div>
    ${noteEntry.name2 ? `<div class="row"><span class="bold">பெயர் 2:</span> <span>${noteEntry.name2}</span></div>` : ''}
    <div class="row"><span class="bold">தொகை:</span> <span class="amt">₹${parseFloat(noteEntry.amount).toLocaleString('en-IN')}</span></div>
    <div class="row"><span class="bold">பதிவு செய்தவர்:</span> <span>${noteEntry.createdBy || 'admin'}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${new Date(noteEntry.createdAt || Date.now()).toLocaleString()}</span></div>
  </div>
</body>
</html>`;
            fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
          }
        });
      });
    });
  } catch (err) {
    console.warn('[Note Backup Saver] Error syncing note entries to backup:', err.message);
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
    syncAllDbPayoutsToBackup();
    syncAllNoteEntriesToBackup();
  } catch (err) {
    console.warn('[Backup Saver] Error syncing db.json receipts to backup:', err.message);
  }
}

function cleanOrphanedBackupFolders(db) {
  try {
    const backupDir = path.join(BASE_DIR, 'Backup');
    if (!fs.existsSync(backupDir)) return;

    const validEventTitles = new Set();
    validEventTitles.add('note entry');

    if (Array.isArray(db.events)) {
      for (const ev of db.events) {
        const majorName = ev.displayName1 || ev.memberName || ev.eventName;
        const name1 = ev.displayName1 ? (ev.memberName || '') : '';
        const title = (majorName ? (majorName + (name1 ? (' - ' + name1) : '')) : 'Event');
        
        validEventTitles.add(sanitizeFolderName(title).toLowerCase());
        if (majorName) validEventTitles.add(sanitizeFolderName(majorName).toLowerCase());
      }
    }

    if (Array.isArray(db.noteEvents)) {
      for (const nev of db.noteEvents) {
        if (nev.name) validEventTitles.add(sanitizeFolderName(nev.name).toLowerCase());
      }
    }

    const entries = fs.readdirSync(backupDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const folderName = entry.name.toLowerCase();
        if (!validEventTitles.has(folderName)) {
          // Double check: if folder contains any files, do not delete it!
          const fullPath = path.join(backupDir, entry.name);
          try {
            const innerFiles = fs.readdirSync(fullPath);
            if (innerFiles.length > 0) {
              // Folder has content, keep it!
              continue;
            }
          } catch(e) {}

          fs.rmSync(fullPath, { recursive: true, force: true });
          
          const publicPath = path.join(BASE_DIR, 'public', 'Backup', entry.name);
          if (fs.existsSync(publicPath)) {
            fs.rmSync(publicPath, { recursive: true, force: true });
          }
          console.log(`[Backup Cleaner] Removed empty unused folder from Backup: ${entry.name}`);
        }
      }
    }
  } catch (err) {
    console.warn('[Backup Cleaner] Error cleaning backup folders:', err.message);
  }
}

// Scan backup folder & ensure all db receipts are saved in Backup folder on server startup
try {
  if (fs.existsSync(DB_PATH)) {
    const dbData = readDb();
    cleanOrphanedBackupFolders(dbData);
  }
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
      if (fs.existsSync(DB_PATH)) {
        const dbData = readDb();
        cleanOrphanedBackupFolders(dbData);
      }
      scanBackupFolder();
      syncAllDbReceiptsToBackup();
      const data = readDbRaw();
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
        cleanOrphanedBackupFolders(json);
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

  if (pathname === '/api/events/sync-drive' && req.method === 'GET') {
    try {
      if (!fs.existsSync(DB_PATH)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, deletedCount: 0, events: [], receipts: [] }));
      }
      const db = readDb();
      const deletedCount = syncEventsWithDriveFolders(db);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, deletedCount, events: db.events, receipts: db.receipts }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/events/delete-folder' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { eventName, displayName1, memberName, deleteDriveFolder } = JSON.parse(body);
        const majorName = displayName1 || memberName || eventName || '';
        const name1 = displayName1 ? (memberName || '') : '';
        const folderTitle = (majorName ? (majorName + (name1 ? (' - ' + name1) : '')) : '');

        if (folderTitle) {
          const backupDir = path.join(BASE_DIR, 'Backup');
          const safeName = sanitizeFolderName(folderTitle);
          const eventFolderPath = path.join(backupDir, safeName);
          if (fs.existsSync(eventFolderPath)) {
            fs.rmSync(eventFolderPath, { recursive: true, force: true });
          }
          const altName = sanitizeFolderName(majorName);
          const altEventPath = path.join(backupDir, altName);
          if (fs.existsSync(altEventPath)) {
            fs.rmSync(altEventPath, { recursive: true, force: true });
          }

          // Public folder cleanup
          const publicBackupDir = path.join(BASE_DIR, 'public', 'Backup');
          const pubEventPath = path.join(publicBackupDir, safeName);
          if (fs.existsSync(pubEventPath)) {
            fs.rmSync(pubEventPath, { recursive: true, force: true });
          }

          // Google Drive folder cleanup if requested
          if (deleteDriveFolder) {
            const gDriveBackup = 'G:\\My Drive\\moi\\Backup';
            if (fs.existsSync(gDriveBackup)) {
              const gEventPath = path.join(gDriveBackup, safeName);
              if (fs.existsSync(gEventPath)) {
                fs.rmSync(gEventPath, { recursive: true, force: true });
              }
              const gAltEventPath = path.join(gDriveBackup, altName);
              if (fs.existsSync(gAltEventPath)) {
                fs.rmSync(gAltEventPath, { recursive: true, force: true });
              }
            }
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
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
    <div class="row"><span class="bold">பெயர்:</span> <span>${receiptData.initial ? receiptData.initial + '. ' : ''}${receiptData.name}${receiptData.job ? ' - ' + receiptData.job : ''}${receiptData.name1 ? ' ' + receiptData.name1 : ''}</span></div>
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

  if (pathname === '/api/payouts/save-file' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { eventName, payoutData } = JSON.parse(body);
        if (!payoutData) {
          throw new Error('Payout data required');
        }
        if (eventName && !payoutData.eventName) {
          payoutData.eventName = eventName;
        }
        saveSinglePayoutToBackup(payoutData);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/note-events/create-folder' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { noteEventName } = JSON.parse(body);
        const eventDirName = sanitizeFolderName(noteEventName || 'General');
        const targetDirs = getBackupDirectories(path.join('Note Entry', eventDirName));

        targetDirs.forEach(folderPath => {
          if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, folderPaths: targetDirs }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/note-entries/save-bulk-files' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { noteEventName, noteEntries } = JSON.parse(body);
        if (!Array.isArray(noteEntries)) throw new Error('Note entries array required');

        const eventDirName = sanitizeFolderName(noteEventName || 'General');
        const targetDirs = getBackupDirectories(path.join('Note Entry', eventDirName));

        targetDirs.forEach(eventFolderPath => {
          if (!fs.existsSync(eventFolderPath)) {
            fs.mkdirSync(eventFolderPath, { recursive: true });
          }

          noteEntries.forEach(noteEntry => {
            const baseFileName = sanitizeFolderName(`${noteEntry.name1 || 'Entry'}_${noteEntry.id || Date.now()}`);
            const jsonPath = path.join(eventFolderPath, `${baseFileName}.json`);
            fs.writeFileSync(jsonPath, JSON.stringify(noteEntry, null, 2), 'utf-8');

            const htmlPath = path.join(eventFolderPath, `${baseFileName}.html`);
            const htmlContent = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <title>ஆதி மொய் - குறிப்பு பதிவு (${noteEntry.name1})</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.6; }
    .card { border: 2px solid #D4AF37; padding: 20px; max-width: 450px; border-radius: 10px; background: #FFFDF0; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h2 { color: #8B0000; text-align: center; margin-top: 0; border-bottom: 2px solid #8B0000; padding-bottom: 8px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
    .bold { font-weight: bold; color: #1E293B; }
    .amt { font-size: 14pt; font-weight: bold; color: #059669; }
  </style>
</head>
<body>
  <div class="card">
    <h2>ஆதி மொய் - குறிப்பு பதிவு</h2>
    <div class="row"><span class="bold">நிகழ்ச்சி:</span> <span>${noteEventName}</span></div>
    <div class="row"><span class="bold">ஊர் / இடம்:</span> <span>${noteEntry.place}</span></div>
    <div class="row"><span class="bold">பெயர் 1:</span> <span>${noteEntry.name1}</span></div>
    ${noteEntry.name2 ? `<div class="row"><span class="bold">பெயர் 2:</span> <span>${noteEntry.name2}</span></div>` : ''}
    <div class="row"><span class="bold">தொகை:</span> <span class="amt">₹${parseFloat(noteEntry.amount).toLocaleString('en-IN')}</span></div>
    <div class="row"><span class="bold">பதிவு செய்தவர்:</span> <span>${noteEntry.createdBy || 'admin'}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${new Date(noteEntry.createdAt || Date.now()).toLocaleString()}</span></div>
  </div>
</body>
</html>`;
            fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
          });
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, count: noteEntries.length, folderPaths: targetDirs }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/note-entries/save-file' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { noteEventName, noteEntry } = JSON.parse(body);
        if (!noteEntry) throw new Error('Note entry data required');

        const eventDirName = sanitizeFolderName(noteEventName || 'General');
        const targetDirs = getBackupDirectories(path.join('Note Entry', eventDirName));

        targetDirs.forEach(eventFolderPath => {
          if (!fs.existsSync(eventFolderPath)) {
            fs.mkdirSync(eventFolderPath, { recursive: true });
          }

          const baseFileName = sanitizeFolderName(`${noteEntry.name1 || 'Entry'}_${noteEntry.id || Date.now()}`);

          // Save JSON
          const jsonPath = path.join(eventFolderPath, `${baseFileName}.json`);
          fs.writeFileSync(jsonPath, JSON.stringify(noteEntry, null, 2), 'utf-8');

          // Save HTML
          const htmlPath = path.join(eventFolderPath, `${baseFileName}.html`);
          const htmlContent = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <title>ஆதி மொய் - குறிப்பு பதிவு (${noteEntry.name1})</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.6; }
    .card { border: 2px solid #D4AF37; padding: 20px; max-width: 450px; border-radius: 10px; background: #FFFDF0; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h2 { color: #8B0000; text-align: center; margin-top: 0; border-bottom: 2px solid #8B0000; padding-bottom: 8px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
    .bold { font-weight: bold; color: #1E293B; }
    .amt { font-size: 14pt; font-weight: bold; color: #059669; }
  </style>
</head>
<body>
  <div class="card">
    <h2>ஆதி மொய் - குறிப்பு பதிவு</h2>
    <div class="row"><span class="bold">நிகழ்ச்சி:</span> <span>${noteEventName}</span></div>
    <div class="row"><span class="bold">ஊர் / இடம்:</span> <span>${noteEntry.place}</span></div>
    <div class="row"><span class="bold">பெயர் 1:</span> <span>${noteEntry.name1}</span></div>
    ${noteEntry.name2 ? `<div class="row"><span class="bold">பெயர் 2:</span> <span>${noteEntry.name2}</span></div>` : ''}
    <div class="row"><span class="bold">தொகை:</span> <span class="amt">₹${parseFloat(noteEntry.amount).toLocaleString('en-IN')}</span></div>
    <div class="row"><span class="bold">பதிவு செய்தவர்:</span> <span>${noteEntry.createdBy || 'admin'}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${new Date(noteEntry.createdAt || Date.now()).toLocaleString()}</span></div>
  </div>
</body>
</html>`;
          fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, folderPaths: targetDirs }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Save Receipt Image to Server & Public Folder
  if (pathname === '/api/save-receipt-image' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { filename, dataUrl } = JSON.parse(body);
        if (!dataUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'dataUrl required' }));
        }
        const safeName = (filename || 'receipt_' + Date.now()).replace(/[\/\\?%*:|"<>]/g, '_') + '.png';
        const receiptsDir = path.join(BASE_DIR, 'public', 'receipts');
        if (!fs.existsSync(receiptsDir)) {
          fs.mkdirSync(receiptsDir, { recursive: true });
        }
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const targetPath = path.join(receiptsDir, safeName);
        fs.writeFileSync(targetPath, buffer);

        // Also save to root receipts folder for backup
        const rootReceiptsDir = path.join(BASE_DIR, 'receipts');
        if (!fs.existsSync(rootReceiptsDir)) {
          fs.mkdirSync(rootReceiptsDir, { recursive: true });
        }
        fs.writeFileSync(path.join(rootReceiptsDir, safeName), buffer);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, filename: safeName, url: `/receipts/${safeName}` }));
      } catch (err) {
        console.error('[Save Receipt Image] Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Native Searchable PDF Generator via Headless Chrome (Skia/PDF)
  if (pathname === '/api/generate-pdf' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { html, filename } = JSON.parse(body);
        if (!html) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'HTML content required' }));
        }

        const outFileName = (filename || 'Report').replace(/[\/\\?%*:|"<>]/g, '_') + '.pdf';
        const tempId = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const tempHtmlPath = path.join(BASE_DIR, 'public', `_temp_${tempId}.html`);
        const tempPdfPath = path.join(BASE_DIR, 'public', `_temp_${tempId}.pdf`);

        const wrappedHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${(filename || 'Report').replace(/[\/\\?%*:|"<>]/g, '_')}</title>
<base href="${'file:///' + path.join(BASE_DIR, 'public').replace(/\\/g, '/')}/">
<link rel="stylesheet" href="css/style.css">
<style>
@font-face {
  font-family: 'Adobe Tamil';
  src: local('Adobe Tamil Regular'),
       local('AdobeTamil-Regular'),
       local('Adobe Tamil'),
       local('AdobeTamil'),
       url('fonts/AdobeTamil-Regular.ttf') format('truetype'),
       url('fonts/AdobeTamil-Regular.otf') format('opentype');
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: 'Adobe Tamil Regular';
  src: local('Adobe Tamil Regular'),
       local('AdobeTamil-Regular'),
       local('Adobe Tamil'),
       local('AdobeTamil'),
       url('fonts/AdobeTamil-Regular.ttf') format('truetype'),
       url('fonts/AdobeTamil-Regular.otf') format('opentype');
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: 'Adobe Tamil';
  src: local('Adobe Tamil Bold'),
       local('AdobeTamil-Bold'),
       url('fonts/AdobeTamil-Bold.ttf') format('truetype'),
       url('fonts/AdobeTamil-Bold.otf') format('opentype');
  font-weight: 700;
  font-style: normal;
}
@font-face {
  font-family: 'Mukta Malar';
  src: url('fonts/MuktaMalar-Bold.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
}
@font-face {
  font-family: 'Mukta Malar';
  src: url('fonts/MuktaMalar-Bold.ttf') format('truetype');
  font-weight: 800;
  font-style: normal;
}
@font-face {
  font-family: 'Mukta Malar';
  src: url('fonts/MuktaMalar-Bold.ttf') format('truetype');
  font-weight: 900;
  font-style: normal;
}
@font-face {
  font-family: 'Mukta Malar';
  src: url('fonts/MuktaMalar-SemiBold.ttf') format('truetype');
  font-weight: 600;
  font-style: normal;
}
@font-face {
  font-family: 'Mukta Malar';
  src: url('fonts/MuktaMalar-Regular.ttf') format('truetype');
  font-weight: 400;
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
${html}
</body>
</html>`;

        fs.writeFileSync(tempHtmlPath, wrappedHtml, 'utf-8');

        const chromeCandidates = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
        ];
        let chromePath = chromeCandidates.find(p => fs.existsSync(p));

        if (!chromePath) {
          try { fs.unlinkSync(tempHtmlPath); } catch (e) {}
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Chrome executable not found on server' }));
        }

        const fileUrl = 'file:///' + tempHtmlPath.replace(/\\/g, '/');
        const { execFile } = require('child_process');

        execFile(chromePath, [
          '--headless=new',
          '--disable-gpu',
          '--allow-file-access-from-files',
          '--export-tagged-pdf',
          '--no-pdf-header-footer',
          `--print-to-pdf=${tempPdfPath}`,
          fileUrl
        ], { timeout: 45000 }, (err) => {
          try {
            if (err) throw err;
            if (!fs.existsSync(tempPdfPath)) {
              throw new Error('PDF output file was not created');
            }

            const pdfBuffer = fs.readFileSync(tempPdfPath);

            try { fs.unlinkSync(tempHtmlPath); } catch (e) {}
            try { fs.unlinkSync(tempPdfPath); } catch (e) {}

            const safeAsciiFilename = outFileName.replace(/[^\x20-\x7E]/g, '_');
            const encodedFilename = encodeURIComponent(outFileName);
            res.writeHead(200, {
              'Content-Type': 'application/pdf',
              'Content-Length': pdfBuffer.length,
              'Content-Disposition': `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodedFilename}`
            });
            res.end(pdfBuffer);
          } catch (genErr) {
            console.error('[PDF Generator] Error during generation:', genErr);
            try { fs.unlinkSync(tempHtmlPath); } catch (e) {}
            try { fs.unlinkSync(tempPdfPath); } catch (e) {}
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: genErr.message }));
          }
        });
      } catch (err) {
        console.error('[PDF Generator] Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Serve static files from __dirname, /public, or process.cwd() with SPA fallback to index.html
  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (e) {
    decodedPath = pathname;
  }
  let cleanPath = (decodedPath === '/' || !decodedPath) ? 'index.html' : decodedPath.replace(/^[\/\\]+/, '');

  const searchLocations = [
    path.join(__dirname, 'public', cleanPath),
    path.join(__dirname, cleanPath),
    path.join(process.cwd(), 'public', cleanPath),
    path.join(process.cwd(), cleanPath)
  ];

  let finalFile = null;
  for (const loc of searchLocations) {
    try {
      if (fs.existsSync(loc) && fs.statSync(loc).isFile()) {
        finalFile = loc;
        break;
      }
    } catch (e) {}
  }

  if (!finalFile) {
    const indexFallbackLocations = [
      path.join(__dirname, 'public', 'index.html'),
      path.join(__dirname, 'index.html'),
      path.join(process.cwd(), 'public', 'index.html'),
      path.join(process.cwd(), 'index.html')
    ];
    for (const idxLoc of indexFallbackLocations) {
      try {
        if (fs.existsSync(idxLoc) && fs.statSync(idxLoc).isFile()) {
          finalFile = idxLoc;
          break;
        }
      } catch (e) {}
    }
  }

  if (!finalFile) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const contentType = getContentType(finalFile);
  const isText = ['.html', '.js', '.css', '.json', '.svg'].includes(path.extname(finalFile).toLowerCase());
  res.writeHead(200, { 'Content-Type': isText ? `${contentType}; charset=utf-8` : contentType });
  fs.createReadStream(finalFile).pipe(res);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[Aathi Moi Server] Port ${PORT} is already running. Using active server instance.`);
  } else {
    console.error('[Aathi Moi Server] Error:', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`==================================================`);
  console.log(`   ஆதி மொய் (Aathi Moi) Server Running!`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   Base Dir: ${BASE_DIR}`);
  console.log(`==================================================`);
});
