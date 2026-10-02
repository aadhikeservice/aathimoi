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
      { id: '1', username: 'admin', password: '1234', role: 'admin', assignedEventIds: [] },
      { id: 'usr_adminuser', username: 'adminuser', password: '1234', role: 'adminuser', assignedEventIds: [] }
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
          if (entry.name.toLowerCase() === 'archive') {
            continue; // Skip Archive folder entirely
          }
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

  if (!Array.isArray(db.deletedEventIds)) db.deletedEventIds = [];
  if (!Array.isArray(db.deletedEventNames)) db.deletedEventNames = [];
  const deletedIdsSet = new Set(db.deletedEventIds.map(x => String(x).trim()));
  const deletedNamesSet = new Set(db.deletedEventNames.map(x => String(x).trim().toLowerCase()));


  const backupDirs = getBackupDirectories();
  const existingBackupDirs = backupDirs.filter(d => fs.existsSync(d));

  const validEvents = [];
  let deletedCount = 0;

  db.events.forEach(ev => {
    const evId = String(ev.id || '').trim();
    const d1 = String(ev.displayName1 || '').trim().toLowerCase();
    const m1 = String(ev.memberName || '').trim().toLowerCase();
    const eName = String(ev.eventName || '').trim().toLowerCase();
    const combo = (d1 && m1) ? `${d1} - ${m1}` : '';

    // Check if explicitly deleted
    if ((evId && deletedIdsSet.has(evId)) ||
        (d1 && deletedNamesSet.has(d1)) ||
        (m1 && deletedNamesSet.has(m1)) ||
        (eName && deletedNamesSet.has(eName)) ||
        (combo && deletedNamesSet.has(combo))) {
      deletedCount++;
      return;
    }


    const possibleNames = getEventFolderNames(ev);

    // Check if event folder exists in Archive directory
    let inArchive = false;
    for (const bDir of existingBackupDirs) {
      const archiveDir = path.join(bDir, 'Archive');
      if (fs.existsSync(archiveDir)) {
        for (const name of possibleNames) {
          if (name && fs.existsSync(path.join(archiveDir, name))) {
            inArchive = true;
            break;
          }
        }
      }
      if (inArchive) break;
    }

    if (inArchive) {
      console.log(`[Drive Sync] Event found in Archive folder: "${ev.displayName1 || ev.memberName || ev.id}". Filtering from Saved Events.`);
      if (evId && !db.deletedEventIds.includes(evId)) db.deletedEventIds.push(evId);
      [d1, m1, eName, combo].filter(Boolean).forEach(nm => {
        if (!db.deletedEventNames.includes(nm)) db.deletedEventNames.push(nm);
      });
      deletedCount++;
      return;
    }

    // Ensure the event folder exists in Backup directory
    const primaryBackupDir = path.join(BASE_DIR, 'Backup');
    if (possibleNames.length > 0) {
      const primaryFolderName = possibleNames[0];
      const targetFolderPath = path.join(primaryBackupDir, primaryFolderName);
      if (!fs.existsSync(targetFolderPath)) {
        try { fs.mkdirSync(targetFolderPath, { recursive: true }); } catch (e) {}
      }
    }

    validEvents.push(ev);
  });

  if (deletedCount > 0) {
    db.events = validEvents;
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

function resolveUserLocalSaveFolder(localSaveFolderPath, localSaveFolderName) {
  try {
    if (localSaveFolderPath && typeof localSaveFolderPath === 'string') {
      const trimmedPath = localSaveFolderPath.trim();
      if (trimmedPath) {
        if (fs.existsSync(trimmedPath) && fs.statSync(trimmedPath).isDirectory()) {
          return trimmedPath;
        }
        if (path.isAbsolute(trimmedPath)) {
          fs.mkdirSync(trimmedPath, { recursive: true });
          return trimmedPath;
        }
      }
    }

    if (localSaveFolderName && typeof localSaveFolderName === 'string') {
      const trimmedName = localSaveFolderName.trim();
      if (!trimmedName) return null;
      if (path.isAbsolute(trimmedName) && fs.existsSync(trimmedName) && fs.statSync(trimmedName).isDirectory()) {
        return trimmedName;
      }

      const userProfile = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\jkish';
      const candidateDirs = [
        path.join(userProfile, 'Downloads', trimmedName),
        path.join(userProfile, 'Desktop', trimmedName),
        path.join(userProfile, 'Documents', trimmedName),
        path.join(userProfile, 'OneDrive', 'Desktop', trimmedName),
        path.join(userProfile, 'OneDrive', 'Documents', trimmedName),
        path.join(BASE_DIR, trimmedName),
        path.join('D:\\', trimmedName),
        path.join('C:\\', trimmedName)
      ];

      for (const candidate of candidateDirs) {
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
            return candidate;
          }
        } catch (e) {}
      }

      const fallbackDir = path.join(userProfile, 'Downloads', sanitizeFolderName(trimmedName));
      fs.mkdirSync(fallbackDir, { recursive: true });
      return fallbackDir;
    }
  } catch (err) {
    console.warn('[Local Folder Resolver] Notice:', err.message);
  }
  return null;
}

function saveReceiptToUserLocalFolder(receiptData, localSaveFolderPath, localSaveFolderName) {
  try {
    const targetDir = resolveUserLocalSaveFolder(localSaveFolderPath, localSaveFolderName);
    if (!targetDir || !receiptData) return null;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const majorName = receiptData.displayName1 || receiptData.memberName || receiptData.eventName || 'Event';
    const name1 = receiptData.displayName1 ? (receiptData.memberName || '') : '';
    const eventTitle = receiptData.eventTitle || '';
    const htmlFileName = `Receipt_${receiptData.billNo || '0'}_${receiptData.name || 'Moi'}.html`.replace(/[\\/:*?"<>|]/g, '_');
    const htmlFilePath = path.join(targetDir, htmlFileName);

    const htmlContent = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ஆதி மொய் - ரசீது #${receiptData.billNo}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background-color: #f4f4f9; display: flex; justify-content: center; }
    .card { border: 2px solid #8B0000; padding: 24px; max-width: 420px; width: 100%; border-radius: 12px; background: #FFF8DC; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    h2 { color: #8B0000; text-align: center; margin-top: 0; margin-bottom: 6px; font-size: 22px; font-weight: bold; }
    .subtitle { text-align: center; font-size: 13px; color: #555; margin-bottom: 16px; border-bottom: 1px solid #8B0000; padding-bottom: 8px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed #d1c7a5; padding-bottom: 6px; font-size: 14px; }
    .bold { font-weight: bold; color: #333; }
    .amount-box { background: #8B0000; color: #FFF; padding: 12px; border-radius: 8px; text-align: center; margin: 16px 0; }
    .amount-title { font-size: 14px; text-transform: uppercase; font-weight: bold; }
    .amount-val { font-size: 26px; font-weight: 900; margin: 4px 0; }
    .amount-words { font-size: 13px; font-style: italic; opacity: 0.9; }
    .footer { text-align: center; margin-top: 16px; font-size: 13px; font-weight: bold; color: #8B0000; }
  </style>
</head>
<body>
  <div class="card">
    <h2>ஆதி மொய் (Aathi Moi)</h2>
    <div class="subtitle">கருணாக்கமுத்தன்பட்டி, கம்பம் (98656 07179)</div>
    <div class="row"><span class="bold">ரசீது எண்:</span> <span>#${receiptData.billNo}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${receiptData.date || ''} ${receiptData.time || ''}</span></div>
    <div class="row"><span class="bold">உறுப்பினர் பெயர்:</span> <span>${majorName}</span></div>
    ${name1 ? `<div class="row"><span class="bold">உறுப்பினர் பெயர் 1:</span> <span>${name1}</span></div>` : ''}
    ${eventTitle ? `<div class="row"><span class="bold">நிகழ்வு தலைப்பு:</span> <span>${eventTitle}</span></div>` : ''}
    <div class="row"><span class="bold">பெயர்:</span> <span>${receiptData.initial ? receiptData.initial + '. ' : ''}${receiptData.name || ''}${receiptData.job ? ' - ' + receiptData.job : ''}${receiptData.name1 ? ' ' + receiptData.name1 : ''}</span></div>
    <div class="row"><span class="bold">இடம்:</span> <span>${receiptData.place || ''}</span></div>
    ${receiptData.relationship ? `<div class="row"><span class="bold">உறவு:</span> <span>${receiptData.relationship}</span></div>` : ''}
    <div class="amount-box">
      <div class="amount-title">தொகை</div>
      <div class="amount-val">₹${parseFloat(receiptData.amount || 0).toLocaleString('en-IN')}</div>
      <div class="amount-words">(${receiptData.amountWords || ''})</div>
    </div>
    <div class="row"><span class="bold">செலுத்திய முறை:</span> <span>${receiptData.mode || 'ரொக்கம்'}</span></div>
    <div class="footer">தங்கள் வருகைக்கு நன்றி</div>
  </div>
</body>
</html>`;

    fs.writeFileSync(htmlFilePath, htmlContent, 'utf-8');
    return { targetDir, htmlFilePath };
  } catch (err) {
    console.warn('[Local Folder Save] Notice:', err.message);
    return null;
  }
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
    <div style="text-align: center; font-size: 11px; font-weight: bold; color: #555; border-bottom: 1px solid #8B0000; padding-bottom: 6px; margin-bottom: 10px;">கருணாக்கமுத்தன்பட்டி, கம்பம் (98656 07179)</div>
    <div class="row"><span class="bold">ரசீது எண்:</span> <span>#${receiptData.billNo}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${receiptData.date || ''} ${receiptData.time || ''}</span></div>
    <div class="row"><span class="bold">உறுப்பினர் பெயர்:</span> <span>${majorName}</span></div>
    ${name1 ? `<div class="row"><span class="bold">உறுப்பினர் பெயர் 1:</span> <span>${name1}</span></div>` : ''}
    ${receiptData.eventTitle ? `<div class="row"><span class="bold">நிகழ்வு தலைப்பு:</span> <span>${receiptData.eventTitle}</span></div>` : ''}
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

      // Also save in offline user receipt path: "Backup/offline/<username>/receipt"
      try {
        const offlineDir = path.join(backupDir, 'offline', username, 'receipt');
        if (!fs.existsSync(offlineDir)) {
          fs.mkdirSync(offlineDir, { recursive: true });
        }
        const offJsonPath = path.join(offlineDir, `${baseFileName}.json`);
        if (!fs.existsSync(offJsonPath)) {
          fs.writeFileSync(offJsonPath, JSON.stringify(receiptData, null, 2), 'utf-8');
        }
        const offHtmlPath = path.join(offlineDir, `${baseFileName}.html`);
        if (!fs.existsSync(offHtmlPath)) {
          fs.writeFileSync(offHtmlPath, htmlContent, 'utf-8');
        }
      } catch (eOff) {}
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
    <div class="sub">கருணாக்கமுத்தன்பட்டி, கம்பம் (98656 07179)</div>
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

function isItemBelongingToActiveEvents(item, events) {
  if (!item || !Array.isArray(events) || events.length === 0) return false;
  return events.some(ev => {
    if (item.eventId && ev.id && item.eventId === ev.id) return true;
    const evD1 = (ev.displayName1 || '').trim().toLowerCase();
    const evM = (ev.memberName || '').trim().toLowerCase();
    const evName = (ev.eventName || '').trim().toLowerCase();
    const evCombo = (evD1 && evM) ? `${evD1} - ${evM}` : '';

    const itD1 = (item.displayName1 || '').trim().toLowerCase();
    const itM = (item.memberName || '').trim().toLowerCase();
    const itName = (item.eventName || '').trim().toLowerCase();

    if (evCombo && (itName === evCombo || (itD1 === evD1 && itM === evM))) return true;
    if (evD1 && (itD1 === evD1 || itName === evD1)) return true;
    if (evM && (itM === evM || itName === evM)) return true;
    if (evName && itName === evName) return true;
    return false;
  });
}

function syncAllDbPayoutsToBackup() {
  try {
    if (!fs.existsSync(DB_PATH)) return;
    const db = readDb();
    const activeEvents = Array.isArray(db.events) ? db.events : [];
    if (Array.isArray(db.payouts) && activeEvents.length > 0) {
      for (const payout of db.payouts) {
        if (isItemBelongingToActiveEvents(payout, activeEvents)) {
          saveSinglePayoutToBackup(payout);
        }
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
    const activeEvents = Array.isArray(db.events) ? db.events : [];
    if (Array.isArray(db.receipts) && activeEvents.length > 0) {
      for (const rcpt of db.receipts) {
        if (isItemBelongingToActiveEvents(rcpt, activeEvents)) {
          saveSingleReceiptToBackup(rcpt);
        }
      }
    }
    syncAllDbPayoutsToBackup();
    syncAllNoteEntriesToBackup();
  } catch (err) {
    console.warn('[Backup Saver] Error syncing db.json receipts to backup:', err.message);
  }
}

function cleanOrphanedBackupFolders(db, cleanGoogleDrive = true) {
  try {
    const validEventTitles = new Set();
    validEventTitles.add('note entry');
    validEventTitles.add('archive');
    validEventTitles.add('.archive');

    if (Array.isArray(db.events)) {
      for (const ev of db.events) {
        const majorName = ev.displayName1 || ev.memberName || ev.eventName;
        const name1 = ev.displayName1 ? (ev.memberName || '') : '';
        const title = (majorName ? (majorName + (name1 ? (' - ' + name1) : '')) : 'Event');
        
        validEventTitles.add(sanitizeFolderName(title).toLowerCase());
        if (majorName) validEventTitles.add(sanitizeFolderName(majorName).toLowerCase());
        if (ev.memberName) validEventTitles.add(sanitizeFolderName(ev.memberName).toLowerCase());
        if (ev.eventName) validEventTitles.add(sanitizeFolderName(ev.eventName).toLowerCase());
      }
    }

    if (Array.isArray(db.noteEvents)) {
      for (const nev of db.noteEvents) {
        if (nev.name) validEventTitles.add(sanitizeFolderName(nev.name).toLowerCase());
      }
    }

    const dirsToClean = [
      path.join(BASE_DIR, 'Backup'),
      path.join(BASE_DIR, 'public', 'Backup')
    ];
    if (cleanGoogleDrive) {
      dirsToClean.push('G:\\My Drive\\moi\\Backup');
      dirsToClean.push('G:\\My Drive\\Backup');
    }

    for (const dirPath of dirsToClean) {
      if (!fs.existsSync(dirPath)) continue;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folderName = entry.name.toLowerCase();
          if (folderName === 'archive' || folderName === '.archive') continue;
          if (!validEventTitles.has(folderName)) {
            const fullPath = path.join(dirPath, entry.name);
            try {
              fs.rmSync(fullPath, { recursive: true, force: true });
              console.log(`[Backup Cleaner] Removed orphaned event folder from ${dirPath}: ${entry.name}`);
            } catch (e) {
              console.warn(`[Backup Cleaner] Could not remove ${fullPath}:`, e.message);
            }
          }
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
    cleanOrphanedBackupFolders(dbData, true);
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
        cleanOrphanedBackupFolders(dbData, true);
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
        try {
          const existingDb = readDb();
          if (existingDb && existingDb.gasWebAppUrl && (!json.gasWebAppUrl || !String(json.gasWebAppUrl).trim())) {
            json.gasWebAppUrl = existingDb.gasWebAppUrl;
          }
        } catch (e) {}
        const formattedJson = JSON.stringify(json, null, 2);
        fs.writeFileSync(DB_PATH, formattedJson, 'utf-8');
        try {
          const gDriveDir = 'G:\\My Drive\\moi';
          if (fs.existsSync(gDriveDir)) {
            fs.writeFileSync(path.join(gDriveDir, 'db.json'), formattedJson, 'utf-8');
          }
        } catch (gErr) {
          console.warn('[DB Sync] Could not sync db.json to Google Drive:', gErr.message);
        }
        cleanOrphanedBackupFolders(json, true);
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
        const majorName = displayName1 || memberName || eventName || '';
        const name1 = (displayName1 && memberName && displayName1 !== memberName) ? memberName : '';
        if (!majorName) {
          throw new Error('Event name is required');
        }
        const folderTitle = majorName + (name1 ? (' - ' + name1) : '');
        const safeName = sanitizeFolderName(folderTitle);
        const targetBackupDirs = getBackupDirectories();
        let createdPath = '';

        targetBackupDirs.forEach(backupDir => {
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }
          const eventFolderPath = path.join(backupDir, safeName);
          if (!createdPath) createdPath = eventFolderPath;
          if (!fs.existsSync(eventFolderPath)) {
            fs.mkdirSync(eventFolderPath, { recursive: true });
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, folderPath: createdPath }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/events/sync-drive' && req.method === 'GET') {
    try {
      const gDriveBackup = 'G:\\My Drive\\moi\\Backup';
      const hasGoogleDrive = fs.existsSync(gDriveBackup);
      let driveFolderNames = [];
      if (hasGoogleDrive) {
        try {
          driveFolderNames = fs.readdirSync(gDriveBackup, { withFileTypes: true })
            .filter(e => e.isDirectory() && e.name.toLowerCase() !== 'note entry')
            .map(e => e.name);
        } catch (e) {}
      }

      if (!fs.existsSync(DB_PATH)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, deletedCount: 0, hasGoogleDrive, driveFolderNames, events: [], receipts: [] }));
      }
      const db = readDb();
      const deletedCount = syncEventsWithDriveFolders(db);
      cleanOrphanedBackupFolders(db, true);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        deletedCount,
        hasGoogleDrive,
        driveFolderNames,
        events: db.events || [],
        receipts: db.receipts || [],
        deletedEventIds: db.deletedEventIds || [],
        deletedEventNames: db.deletedEventNames || [],
        deletedAllBefore: db.deletedAllBefore || ''
      }));
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
        const { eventName, displayName1, memberName, deleteAll } = JSON.parse(body);
        const majorName = displayName1 || memberName || eventName || '';
        const name1 = displayName1 ? (memberName || '') : '';
        const folderTitle = (majorName ? (majorName + (name1 ? (' - ' + name1) : '')) : '');

        const candidateNames = Array.from(new Set([
          folderTitle ? sanitizeFolderName(folderTitle) : '',
          majorName ? sanitizeFolderName(majorName) : '',
          displayName1 ? sanitizeFolderName(displayName1) : '',
          memberName ? sanitizeFolderName(memberName) : '',
          eventName ? sanitizeFolderName(eventName) : '',
          (memberName ? sanitizeFolderName(`${memberName} - ${memberName}`) : ''),
          (displayName1 ? sanitizeFolderName(`${displayName1} - ${displayName1}`) : '')
        ].filter(Boolean)));

        const baseDirs = [
          path.join(BASE_DIR, 'Backup'),
          path.join(BASE_DIR, 'public', 'Backup'),
          'G:\\My Drive\\moi\\Backup',
          'G:\\My Drive\\Backup'
        ];

        for (const dirPath of baseDirs) {
          if (!fs.existsSync(dirPath)) continue;
          const archiveDir = path.join(dirPath, 'Archive');
          try {
            if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
          } catch (e) {}

          for (const cand of candidateNames) {
            const targetPath = path.join(dirPath, cand);
            if (fs.existsSync(targetPath)) {
              try {
                const destPath = path.join(archiveDir, cand);
                if (fs.existsSync(destPath)) {
                  try { fs.rmSync(destPath, { recursive: true, force: true }); } catch (e) {}
                }
                try {
                  fs.renameSync(targetPath, destPath);
                } catch (eRen) {
                  fs.cpSync(targetPath, destPath, { recursive: true });
                  fs.rmSync(targetPath, { recursive: true, force: true });
                }
                console.log(`[Event Archive] Moved event folder ${cand} to ${archiveDir}`);
              } catch (e) {
                console.warn(`[Event Archive] Could not archive ${targetPath}:`, e.message);
              }
            }
          }
          // Also archive any Google Drive conflict folders like "<EventName> (1)"
          try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
              if (!entry.isDirectory() || entry.name.toLowerCase() === 'note entry' || entry.name.toLowerCase() === 'archive') continue;
              const lowerEntry = entry.name.toLowerCase();
              const matchesCandidate = candidateNames.some(c => {
                const lc = c.toLowerCase();
                return lowerEntry === lc || lowerEntry.startsWith(lc + ' (');
              });
              if (matchesCandidate) {
                try {
                  const destPath = path.join(archiveDir, entry.name);
                  if (fs.existsSync(destPath)) {
                    try { fs.rmSync(destPath, { recursive: true, force: true }); } catch (e) {}
                  }
                  try {
                    fs.renameSync(path.join(dirPath, entry.name), destPath);
                  } catch (eRen) {
                    fs.cpSync(path.join(dirPath, entry.name), destPath, { recursive: true });
                    fs.rmSync(path.join(dirPath, entry.name), { recursive: true, force: true });
                  }
                } catch (e) {}
              }
            }
          } catch (e) {}
        }

        if (fs.existsSync(DB_PATH)) {
          const db = readDb();
          cleanOrphanedBackupFolders(db, true);
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
        const { eventName, receiptData, localSaveFolderPath, localSaveFolderName } = JSON.parse(body);
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
    <div style="text-align: center; font-size: 11px; font-weight: bold; color: #555; border-bottom: 1px solid #8B0000; padding-bottom: 6px; margin-bottom: 10px;">கருணாக்கமுத்தன்பட்டி, கம்பம் (98656 07179)</div>
    <div class="row"><span class="bold">ரசீது எண்:</span> <span>#${receiptData.billNo}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${receiptData.date} ${receiptData.time || ''}</span></div>
    <div class="row"><span class="bold">உறுப்பினர் பெயர்:</span> <span>${majorName}</span></div>
    ${name1 ? `<div class="row"><span class="bold">உறுப்பினர் பெயர் 1:</span> <span>${name1}</span></div>` : ''}
    ${receiptData.eventTitle ? `<div class="row"><span class="bold">நிகழ்வு தலைப்பு:</span> <span>${receiptData.eventTitle}</span></div>` : ''}
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

        // Also save to offline user receipt path: "Backup/offline/<username>/receipt"
        try {
          const offlineReceiptDir = path.join(backupDir, 'offline', username, 'receipt');
          if (!fs.existsSync(offlineReceiptDir)) {
            fs.mkdirSync(offlineReceiptDir, { recursive: true });
          }
          fs.writeFileSync(path.join(offlineReceiptDir, `${baseFileName}.json`), JSON.stringify(receiptData, null, 2), 'utf-8');
          fs.writeFileSync(path.join(offlineReceiptDir, `${baseFileName}.html`), htmlContent, 'utf-8');

          // If Google Drive Desktop exists, mirror to G:\My Drive\moi\Backup\offline\<username>\receipt
          const driveOfflineDir = path.join('G:\\My Drive\\moi\\Backup', 'offline', username, 'receipt');
          if (fs.existsSync('G:\\My Drive\\moi\\Backup')) {
            if (!fs.existsSync(driveOfflineDir)) {
              fs.mkdirSync(driveOfflineDir, { recursive: true });
            }
            fs.writeFileSync(path.join(driveOfflineDir, `${baseFileName}.json`), JSON.stringify(receiptData, null, 2), 'utf-8');
            fs.writeFileSync(path.join(driveOfflineDir, `${baseFileName}.html`), htmlContent, 'utf-8');
          }
        } catch (eOff) {}

        // Also save to user's selected Local Disk Folder if configured
        const localResult = saveReceiptToUserLocalFolder(receiptData, localSaveFolderPath, localSaveFolderName);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          filePath,
          localSavedPath: localResult ? localResult.htmlFilePath : null,
          resolvedLocalDir: localResult ? localResult.targetDir : null
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/receipts/sync-local-folder' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { eventId, localSaveFolderPath, localSaveFolderName } = JSON.parse(body || '{}');
        const targetDir = resolveUserLocalSaveFolder(localSaveFolderPath, localSaveFolderName);
        if (!targetDir) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, count: 0 }));
        }
        const db = readDb();
        const receipts = Array.isArray(db.receipts) ? db.receipts : [];
        const filtered = eventId ? receipts.filter(r => r && r.eventId === eventId) : receipts;
        let savedCount = 0;
        filtered.forEach(rcpt => {
          const r = saveReceiptToUserLocalFolder(rcpt, targetDir, localSaveFolderName);
          if (r && r.htmlFilePath) savedCount++;
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, resolvedLocalDir: targetDir, count: savedCount }));
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

        let processedHtml = html;
        if (processedHtml.includes('cover_bg.jpg')) {
          try {
            const coverCandidates = [
              path.join(BASE_DIR, 'assets', 'cover_bg.jpg'),
              path.join(BASE_DIR, 'public', 'assets', 'cover_bg.jpg'),
              path.join(__dirname, 'assets', 'cover_bg.jpg'),
              path.join(__dirname, 'public', 'assets', 'cover_bg.jpg')
            ];
            const coverPath = coverCandidates.find(p => fs.existsSync(p));
            if (coverPath) {
              const b64 = fs.readFileSync(coverPath).toString('base64');
              const dataUri = `data:image/jpeg;base64,${b64}`;
              processedHtml = processedHtml.replace(/(['"(])(?:\.?\/)?assets\/cover_bg\.jpg(['")])/g, `$1${dataUri}$2`);
            }
          } catch (e) {}
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
${processedHtml}
</body>
</html>`;

        fs.writeFileSync(tempHtmlPath, wrappedHtml, 'utf-8');

        const chromeCandidates = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe')
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
          '--no-sandbox',
          '--allow-file-access-from-files',
          '--export-tagged-pdf',
          '--no-pdf-header-footer',
          `--print-to-pdf=${tempPdfPath}`,
          fileUrl
        ], { timeout: 60000 }, (err) => {
          try {
            if (err) throw err;
            if (!fs.existsSync(tempPdfPath)) {
              throw new Error('PDF output file was not created');
            }

            const pdfBuffer = fs.readFileSync(tempPdfPath);

            try { fs.unlinkSync(tempHtmlPath); } catch (e) {}
            try { fs.unlinkSync(tempPdfPath); } catch (e) {}

            if (!pdfBuffer || pdfBuffer.length < 100 || pdfBuffer.slice(0, 4).toString() !== '%PDF') {
              throw new Error('Generated PDF file is empty or invalid');
            }

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
  const headers = { 'Content-Type': isText ? `${contentType}; charset=utf-8` : contentType };
  if (isText) {
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
  }
  res.writeHead(200, headers);
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
