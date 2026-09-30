/**
 * ஆதி மொய் (Aathi Moi) - Google Apps Script (Code.gs)
 * 
 * Features:
 * 1. Web App API (doGet & doPost) for saving & fetching Receipts, Events, and Payouts.
 * 2. Automatic creation of Google Drive Event Folders & PDF Receipts.
 * 3. Native Tamil Number to Words Converter (அமௌன்ட் தமிழ் சொற்கள்).
 * 4. Resilient Google Sheets Connection (Auto-creates spreadsheet if none provided).
 */

// ==========================================
// 1. GLOBAL CONFIGURATION & SETUP
// ==========================================
var SPREADSHEET_ID = ""; // OPTIONAL: Paste your Google Sheet ID here (e.g. "1BxiMVs0XRnt36Su_F52C...")

/**
 * Robust Spreadsheet Connection Helper (Never returns null)
 */
function getSs() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch (e) {
      Logger.log("Notice opening spreadsheet by ID: " + e.toString());
    }
  }

  try {
    var activeSs = SpreadsheetApp.getActiveSpreadsheet();
    if (activeSs) return activeSs;
  } catch (e) {}

  // Fallback for standalone Apps Script projects: Auto-retrieve or Auto-create Google Sheet
  var prop = PropertiesService.getScriptProperties();
  var savedId = prop.getProperty('AATHI_MOI_SS_ID');
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (e) {}
  }

  // Auto-create new Spreadsheet titled "ஆதி மொய் (Aathi Moi) Master Sheet"
  var newSs = SpreadsheetApp.create("ஆதி மொய் (Aathi Moi) Master Sheet");
  prop.setProperty('AATHI_MOI_SS_ID', newSs.getId());
  return newSs;
}

/**
 * Custom Menu inside Google Sheets UI
 */
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('ஆதி மொய் (Aathi Moi)')
      .addItem('⚙️ Initialize Sheets Setup', 'setupSheets')
      .addToUi();
  } catch (e) {}
}

/**
 * Setup Initial Sheets Structure if not present
 */
function setupSheets() {
  var ss = getSs();
  
  // 1. Receipts Sheet
  var receiptSheet = ss.getSheetByName('Receipts');
  if (!receiptSheet) {
    receiptSheet = ss.insertSheet('Receipts');
    receiptSheet.appendRow([
      'Bill No', 'Event Name', 'Place', 'Initial', 'Name', 'Job', 'Name 1', 
      'Relationship', 'Mobile Number', 'Amount (₹)', 'Amount in Words', 'Mode', 
      'UPI Ref / Time', 'Created By', 'Date', 'Time', 'Timestamp'
    ]);
    receiptSheet.getRange(1, 1, 1, 17).setFontWeight('bold').setBackground('#D4AF37').setFontColor('#0F172A');
  }

  // 2. Events Sheet
  var eventSheet = ss.getSheetByName('Events');
  if (!eventSheet) {
    eventSheet = ss.insertSheet('Events');
    eventSheet.appendRow([
      'Event ID', 'Member Name', 'Member Name 1', 'Event Title', 'Place', 'Phone', 'Event Date', 'UPI ID', 'Status', 'Assigned User', 'Drive Folder ID'
    ]);
    eventSheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#8B0000').setFontColor('#FFFFFF');
  }

  // 3. Payouts Sheet
  var payoutSheet = ss.getSheetByName('Payouts');
  if (!payoutSheet) {
    payoutSheet = ss.insertSheet('Payouts');
    payoutSheet.appendRow([
      'Payout ID', 'Event Name', 'Name', 'Reason', 'Amount (₹)', 'Created By', 'Date', 'Time', 'Timestamp'
    ]);
    payoutSheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#E11D48').setFontColor('#FFFFFF');
  }

  // 4. Users Sheet
  var userSheet = ss.getSheetByName('Users');
  if (!userSheet) {
    userSheet = ss.insertSheet('Users');
    userSheet.appendRow(['User ID', 'Username', 'Password', 'Role', 'Assigned Event ID', 'Set Bill No']);
    userSheet.appendRow(['usr_admin', 'admin', '1234', 'admin', '', '']);
    userSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1E293B').setFontColor('#FFFFFF');
  }

  try {
    SpreadsheetApp.getUi().alert('✅ Aathi Moi Google Sheets setup completed successfully!\nSheet ID: ' + ss.getId());
  } catch (e) {}

  return ss;
}

// ==========================================
// 2. WEB APP API (doGet & doPost)
// ==========================================
function doGet(e) {
  try {
    var ss = getSs();
    // Auto initialize if empty
    if (!ss.getSheetByName('Receipts')) {
      setupSheets();
    }

    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getDb';

    if (action === 'getDb') {
      var data = {
        events: getSheetDataAsJson(ss.getSheetByName('Events')),
        receipts: getSheetDataAsJson(ss.getSheetByName('Receipts')),
        payouts: getSheetDataAsJson(ss.getSheetByName('Payouts')),
        users: getSheetDataAsJson(ss.getSheetByName('Users')),
        noteEvents: getSheetDataAsJson(ss.getSheetByName('Note Events')),
        noteEntries: getSheetDataAsJson(ss.getSheetByName('Note Entries'))
      };
      return createJsonResponse({ status: 'success', data: data, spreadsheetUrl: ss.getUrl() });
    }

    return createJsonResponse({ status: 'error', message: 'Unknown action: ' + action });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  try {
    var ss = getSs();
    if (!ss.getSheetByName('Receipts')) {
      setupSheets();
    }

    var contents = {};
    if (e && e.postData && e.postData.contents) {
      contents = JSON.parse(e.postData.contents);
    }
    var action = contents.action || 'saveReceipt';

    if (action === 'saveReceipt') {
      var result = saveMoiReceipt(contents.receipt);
      return createJsonResponse({ status: 'success', receipt: result });
    }

    if (action === 'savePayout') {
      var resultPayout = savePayoutEntry(contents.payout);
      return createJsonResponse({ status: 'success', payout: resultPayout });
    }

    if (action === 'createEvent') {
      var resultEvent = createEventEntry(contents.event);
      return createJsonResponse({ status: 'success', event: resultEvent });
    }

    if (action === 'saveNoteEntry') {
      var resultNote = saveNoteEntryToDrive(contents.noteEventName, contents.noteEntry, contents.noteEntryHtml);
      return createJsonResponse({ status: 'success', noteEntry: resultNote });
    }

    if (action === 'saveBulkNoteEntries') {
      var resultBulk = saveBulkNoteEntriesToDrive(contents.noteEventName, contents.noteEntries);
      return createJsonResponse({ status: 'success', result: resultBulk });
    }

    if (action === 'createNoteEvent') {
      var resultNoteEv = createNoteEventFolderInDrive(contents.noteEvent);
      return createJsonResponse({ status: 'success', noteEvent: resultNoteEv });
    }

    if (action === 'deleteEvent') {
      deleteEventEntry(contents);
      return createJsonResponse({ status: 'success', message: 'Event and associated data deleted' });
    }

    if (action === 'syncBatch') {
      var eventCount = 0;
      var receiptCount = 0;
      var payoutCount = 0;

      if (contents.events && contents.events.length > 0) {
        for (var i = 0; i < contents.events.length; i++) {
          try { createEventEntry(contents.events[i]); eventCount++; } catch(errEv){}
        }
      }

      if (contents.receipts && contents.receipts.length > 0) {
        for (var j = 0; j < contents.receipts.length; j++) {
          try { saveMoiReceipt(contents.receipts[j]); receiptCount++; } catch(errRc){}
        }
      }

      if (contents.payouts && contents.payouts.length > 0) {
        for (var k = 0; k < contents.payouts.length; k++) {
          try { savePayoutEntry(contents.payouts[k]); payoutCount++; } catch(errPo){}
        }
      }

      return createJsonResponse({
        status: 'success',
        message: 'Batch sync completed',
        counts: { events: eventCount, receipts: receiptCount, payouts: payoutCount }
      });
    }

    return createJsonResponse({ status: 'error', message: 'Invalid action: ' + action });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 3. RECEIPT & PAYOUT BUSINESS LOGIC
// ==========================================
function saveMoiReceipt(rcpt) {
  if (!rcpt) throw new Error("Receipt data object missing");
  var ss = getSs();
  var sheet = ss.getSheetByName('Receipts');
  if (!sheet) {
    setupSheets();
    sheet = ss.getSheetByName('Receipts');
  }

  // Auto-generate Bill Number if not provided
  if (!rcpt.billNo) {
    var lastRow = sheet.getLastRow();
    var nextNo = lastRow > 1 ? lastRow : 1;
    rcpt.billNo = 'AM' + ('000' + nextNo).slice(-4);
  }

  // Convert Tamil Words if missing
  if (!rcpt.amountWords && rcpt.amount) {
    rcpt.amountWords = amountToTamilWords(parseFloat(rcpt.amount));
  }

  var now = new Date();
  var dateStr = rcpt.date || Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  var timeStr = rcpt.time || Utilities.formatDate(now, Session.getScriptTimeZone(), 'hh:mm a');

  sheet.appendRow([
    rcpt.billNo,
    rcpt.eventName || '',
    rcpt.place || '',
    rcpt.initial || '',
    rcpt.name || '',
    rcpt.job || '',
    rcpt.name1 || '',
    rcpt.relationship || '',
    rcpt.mobile || rcpt.phone || '',
    rcpt.amount || 0,
    rcpt.amountWords || '',
    rcpt.mode || 'Cash',
    rcpt.upiTxTime || '',
    rcpt.createdBy || 'admin',
    dateStr,
    timeStr,
    now.toISOString()
  ]);

  // Create HTML Receipt in Google Drive Event Folder
  try {
    createReceiptHtmlInDrive(rcpt);
  } catch (err) {
    Logger.log('Drive HTML generation notice: ' + err.toString());
  }

  return rcpt;
}

function savePayoutEntry(payout) {
  if (!payout) throw new Error("Payout data object missing");
  var ss = getSs();
  var sheet = ss.getSheetByName('Payouts');
  if (!sheet) {
    setupSheets();
    sheet = ss.getSheetByName('Payouts');
  }

  var now = new Date();
  var dateStr = payout.date || Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  var timeStr = payout.time || Utilities.formatDate(now, Session.getScriptTimeZone(), 'hh:mm a');

  sheet.appendRow([
    payout.id || ('payout_' + Date.now()),
    payout.eventName || '',
    payout.name || '',
    payout.reason || '',
    payout.amount || 0,
    payout.createdBy || 'admin',
    dateStr,
    timeStr,
    now.toISOString()
  ]);

  try {
    createPayoutHtmlInDrive(payout);
  } catch (err) {
    Logger.log('Drive Payout HTML generation notice: ' + err.toString());
  }

  return payout;
}

function createEventEntry(event) {
  if (!event) throw new Error("Event data object missing");
  var ss = getSs();
  var sheet = ss.getSheetByName('Events');
  if (!sheet) {
    setupSheets();
    sheet = ss.getSheetByName('Events');
  }

  var displayName1 = event.displayName1 || event.memberName || '';
  var memberName = event.memberName || '';
  var eventTitle = event.eventTitle || '';
  var folderTitle = (displayName1 ? displayName1 : '') + (memberName ? (' - ' + memberName) : '');
  if (!folderTitle) folderTitle = 'Event';

  // Create Google Drive Folder for Event inside Backup folder
  var folderId = event.folderId || '';
  try {
    var backupFolder = getOrCreateBackupFolder();
    var existingFolders = backupFolder.getFoldersByName(folderTitle);
    if (existingFolders.hasNext()) {
      folderId = existingFolders.next().getId();
    } else {
      var newFolder = backupFolder.createFolder(folderTitle);
      folderId = newFolder.getId();
    }
  } catch (e) {
    Logger.log('Folder creation notice: ' + e.toString());
  }

  var eventId = event.id || ('ev_' + Date.now());

  // Check if event row already exists (by ID or Member Name) to update instead of duplicating
  var data = sheet.getDataRange().getValues();
  var existingRowIndex = -1;
  for (var r = 1; r < data.length; r++) {
    var rId = data[r][0];
    var rName = data[r][1];
    if ((eventId && rId == eventId) || (displayName1 && rName == displayName1)) {
      existingRowIndex = r + 1;
      break;
    }
  }

  var rowValues = [
    eventId,
    displayName1,
    memberName,
    eventTitle,
    event.place || '',
    event.phone || '',
    event.eventDate || '',
    event.upiId || '',
    event.status || 'pending',
    event.assignedUsername || '',
    folderId
  ];

  if (existingRowIndex > 0) {
    sheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  event.folderId = folderId;
  event.folderUrl = folderId ? ('https://drive.google.com/drive/folders/' + folderId) : '';
  return event;
}

function deleteEventEntry(contents) {
  var eventId = contents.eventId;
  var eventName = contents.eventName || contents.memberName || contents.displayName1 || '';
  var majorName = contents.displayName1 || contents.memberName || contents.eventName || '';
  var name1 = contents.displayName1 ? (contents.memberName || '') : '';
  var folderTitle = (majorName ? (majorName + (name1 ? (' - ' + name1) : '')) : '');

  var ss = getSs();
  
  // 1. Delete rows in Receipts sheet matching eventId or eventName
  var receiptSheet = ss.getSheetByName('Receipts');
  if (receiptSheet) {
    var rData = receiptSheet.getDataRange().getValues();
    for (var i = rData.length - 1; i >= 1; i--) {
      var rowEvName = rData[i][1]; // Column 2: Event Name
      if (rowEvName && (rowEvName == eventName || rowEvName == majorName || rowEvName == folderTitle)) {
        receiptSheet.deleteRow(i + 1);
      }
    }
  }

  // 2. Delete rows in Payouts sheet matching eventId or eventName
  var payoutSheet = ss.getSheetByName('Payouts');
  if (payoutSheet) {
    var pData = payoutSheet.getDataRange().getValues();
    for (var j = pData.length - 1; j >= 1; j--) {
      var rowEvNameP = pData[j][1]; // Column 2: Event Name
      if (rowEvNameP && (rowEvNameP == eventName || rowEvNameP == majorName || rowEvNameP == folderTitle)) {
        payoutSheet.deleteRow(j + 1);
      }
    }
  }

  // 3. Delete rows in Events sheet matching eventId or eventName
  var eventSheet = ss.getSheetByName('Events');
  if (eventSheet) {
    var eData = eventSheet.getDataRange().getValues();
    for (var k = eData.length - 1; k >= 1; k--) {
      var rowEvId = eData[k][0]; // Column 1: Event ID
      var rowMember = eData[k][1]; // Column 2: Member Name
      if ((eventId && rowEvId == eventId) || (rowMember && (rowMember == eventName || rowMember == majorName))) {
        eventSheet.deleteRow(k + 1);
      }
    }
  }

  // 4. Delete Google Drive Folder for the event inside Backup folder
  try {
    var backupFolder = getOrCreateBackupFolder();
    if (folderTitle) {
      var folders = backupFolder.getFoldersByName(folderTitle);
      while (folders.hasNext()) {
        folders.next().setTrashed(true);
      }
    }
    if (majorName && majorName !== folderTitle) {
      var altFolders = backupFolder.getFoldersByName(majorName);
      while (altFolders.hasNext()) {
        altFolders.next().setTrashed(true);
      }
    }
  } catch (err) {
    Logger.log('Drive folder deletion notice: ' + err.toString());
  }
}

// Helper to locate or create top-level "moi" folder in Google Drive
function getOrCreateMoiFolder() {
  try {
    var folders = DriveApp.getFoldersByName('moi');
    if (folders.hasNext()) {
      return folders.next();
    } else {
      return DriveApp.getRootFolder().createFolder('moi');
    }
  } catch (e) {
    return DriveApp.getRootFolder();
  }
}

// Helper to locate or create Backup folder inside "moi" folder
function getOrCreateBackupFolder() {
  try {
    var moiFolder = getOrCreateMoiFolder();
    var folders = moiFolder.getFoldersByName('Backup');
    if (folders.hasNext()) {
      return folders.next();
    } else {
      return moiFolder.createFolder('Backup');
    }
  } catch (e) {
    return DriveApp.getRootFolder();
  }
}

// Helper to locate or create dedicated Google Drive folder for an event inside Backup folder
function getOrCreateEventDriveFolder(rcpt) {
  var ss = getSs();
  var eventSheet = ss.getSheetByName('Events');
  var backupFolder = getOrCreateBackupFolder();

  if (eventSheet) {
    var data = eventSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rowEventId = row[0];
      var rowMemberName = row[1];
      
      if ((rcpt.eventId && rowEventId == rcpt.eventId) || 
          (rcpt.memberName && rowMemberName == rcpt.memberName) || 
          (rcpt.eventName && rowMemberName == rcpt.eventName)) {
        
        var folderId = row[8]; // Column 9 is Drive Folder ID
        if (folderId && folderId.toString().trim() !== '') {
          try {
            return DriveApp.getFolderById(folderId.toString().trim());
          } catch (e) {}
        }

        // Create folder now inside Backup and save folderId to sheet column 9
        try {
          var folderTitle = (rcpt.displayName1 ? (rcpt.displayName1 + ' - ') : '') + (rowMemberName || rcpt.memberName || rcpt.eventName || 'Event');
          var newFolder = backupFolder.createFolder(folderTitle);
          eventSheet.getRange(i + 1, 9).setValue(newFolder.getId());
          return newFolder;
        } catch (err) {}
      }
    }
  }

  // Fallback: Create folder by event title inside Backup if not found
  try {
    var folderTitle = (rcpt.displayName1 ? (rcpt.displayName1 + ' - ') : '') + (rcpt.memberName || rcpt.eventName || 'Event');
    var existingFolders = backupFolder.getFoldersByName(folderTitle);
    if (existingFolders.hasNext()) {
      return existingFolders.next();
    } else {
      return backupFolder.createFolder(folderTitle);
    }
  } catch (e) {
    return backupFolder;
  }
}

// Helper to locate or create User folder inside Event Master folder (e.g. admin, operator1)
function getOrCreateUserDriveFolder(rcpt) {
  var eventFolder = getOrCreateEventDriveFolder(rcpt);
  var username = (rcpt.createdBy || 'admin').toString().trim();
  try {
    var userFolders = eventFolder.getFoldersByName(username);
    if (userFolders.hasNext()) {
      return userFolders.next();
    } else {
      return eventFolder.createFolder(username);
    }
  } catch (e) {
    return eventFolder;
  }
}

// ==========================================
// ==========================================
// 4. GOOGLE DRIVE HTML RECEIPT GENERATOR
// ==========================================
function createReceiptHtmlInDrive(rcpt) {
  var majorName = rcpt.displayName1 || rcpt.memberName || rcpt.eventName || 'Event';
  var name1 = rcpt.displayName1 ? (rcpt.memberName || '') : '';
  var sanitize = function(str) {
    return (str || '').toString().replace(/[\\/:*?"<>|]/g, '_').trim();
  };

  var fileName = sanitize(rcpt.billNo || ('Receipt_' + Date.now()));

  var htmlText = '<!DOCTYPE html>\n' +
    '<html lang="ta">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <title>ஆதி மொய் - ரசீது #' + escapeXml(rcpt.billNo || '') + '</title>\n' +
    '  <style>\n' +
    '    body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.6; background-color: #f8fafc; }\n' +
    '    .card { border: 2px solid #8B0000; padding: 24px; max-width: 450px; margin: 0 auto; border-radius: 12px; background: #FFF8DC; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }\n' +
    '    .header { text-align: center; border-bottom: 2px solid #8B0000; padding-bottom: 10px; margin-bottom: 15px; }\n' +
    '    h2 { color: #8B0000; font-size: 22pt; margin: 0; font-weight: bold; }\n' +
    '    .sub { font-size: 10pt; font-weight: bold; color: #333; margin-top: 4px; }\n' +
    '    .event-title { font-size: 16pt; font-weight: bold; color: #8B0000; margin-top: 8px; }\n' +
    '    .event-sub { font-size: 13pt; font-weight: bold; color: #0F172A; }\n' +
    '    .row { display: flex; justify-content: space-between; font-size: 11pt; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; color: #1E293B; }\n' +
    '    .bold { font-weight: bold; }\n' +
    '    .amount-box { border-top: 2px solid #8B0000; border-bottom: 2px solid #8B0000; padding: 10px 0; margin-top: 15px; text-align: center; }\n' +
    '    .amount-val { font-size: 24pt; font-weight: bold; color: #15803D; }\n' +
    '    .amount-words { font-size: 11pt; font-style: italic; font-weight: bold; color: #334155; margin-top: 4px; }\n' +
    '    .footer { text-align: center; margin-top: 15px; font-size: 10pt; font-weight: bold; color: #8B0000; }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <div class="card">\n' +
    '    <div class="header">\n' +
    '      <h2>ஆதி மொய்</h2>\n' +
    '      <div class="sub">கருணாக்கமுத்தன்பட்டி 9865607179</div>\n' +
    '      <div class="event-title">' + escapeXml(majorName) + '</div>\n' +
    (name1 ? '      <div class="event-sub">' + escapeXml(name1) + '</div>\n' : '') +
    '      <div class="sub">' + escapeXml(rcpt.place || '') + '</div>\n' +
    '    </div>\n' +
    '    <div class="row"><span class="bold">ரசீது எண்:</span> <span class="bold" style="color:#8B0000;">#' + escapeXml(rcpt.billNo || '') + '</span></div>\n' +
    '    <div class="row"><span class="bold">தேதி:</span> <span>' + escapeXml((rcpt.date || '') + ' ' + (rcpt.time || '')) + '</span></div>\n' +
    '    <div class="row"><span class="bold">பெயர்:</span> <span>' + escapeXml((rcpt.name || '') + (rcpt.name1 ? ' ' + rcpt.name1 : '')) + '</span></div>\n' +
    '    <div class="row"><span class="bold">இடம்:</span> <span>' + escapeXml(rcpt.place || '') + '</span></div>\n' +
    (rcpt.relationship ? '    <div class="row"><span class="bold">உறவு:</span> <span>' + escapeXml(rcpt.relationship) + '</span></div>\n' : '') +
    '    <div class="amount-box">\n' +
    '      <div style="font-size: 14pt; font-weight: bold; color: #8B0000;">தொகை:</div>\n' +
    '      <div class="amount-val">₹' + escapeXml(rcpt.amount || '0') + '</div>\n' +
    '      <div class="amount-words">(' + escapeXml(rcpt.amountWords || '') + ')</div>\n' +
    '    </div>\n' +
    '    <div class="row" style="margin-top: 10px;"><span class="bold">செலுத்திய முறை:</span> <span>' + escapeXml(rcpt.mode || 'Cash') + '</span></div>\n' +
    '    <div class="footer">தங்கள் வருகைக்கு நன்றி</div>\n' +
    '  </div>\n' +
    '</body>\n' +
    '</html>';

  var targetFolder = getOrCreateUserDriveFolder(rcpt);
  var htmlBlob = Utilities.newBlob(htmlText, 'text/html', fileName + '.html');
  targetFolder.createFile(htmlBlob);
}

function getOrCreatePayoutUserDriveFolder(payout) {
  var eventFolder = getOrCreateEventDriveFolder(payout);
  var payoutsFolder;
  try {
    var pFolders = eventFolder.getFoldersByName('Payouts');
    if (pFolders.hasNext()) {
      payoutsFolder = pFolders.next();
    } else {
      payoutsFolder = eventFolder.createFolder('Payouts');
    }
  } catch (e) {
    payoutsFolder = eventFolder;
  }

  var username = (payout.createdBy || 'admin').toString().trim();
  try {
    var userFolders = payoutsFolder.getFoldersByName(username);
    if (userFolders.hasNext()) {
      return userFolders.next();
    } else {
      return payoutsFolder.createFolder(username);
    }
  } catch (e) {
    return payoutsFolder;
  }
}

function createPayoutHtmlInDrive(payout) {
  var majorName = payout.displayName1 || payout.memberName || payout.eventName || 'Event';
  var sanitize = function(str) {
    return (str || '').toString().replace(/[\\/:*?"<>|]/g, '_').trim();
  };

  var fileName = sanitize(payout.id || ('Payout_' + Date.now()));

  var htmlText = '<!DOCTYPE html>\n' +
    '<html lang="ta">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <title>ஆதி மொய் - பட்டுவாடா ரசீது</title>\n' +
    '  <style>\n' +
    '    body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.6; background-color: #f8fafc; }\n' +
    '    .card { border: 2px solid #8B0000; padding: 24px; max-width: 450px; margin: 0 auto; border-radius: 12px; background: #FFF8DC; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }\n' +
    '    .header { text-align: center; border-bottom: 2px solid #8B0000; padding-bottom: 10px; margin-bottom: 15px; }\n' +
    '    h2 { color: #8B0000; font-size: 22pt; margin: 0; font-weight: bold; }\n' +
    '    .sub { font-size: 11pt; font-weight: bold; color: #555; margin-top: 4px; }\n' +
    '    .event-title { font-size: 16pt; font-weight: bold; color: #8B0000; margin-top: 8px; }\n' +
    '    .row { display: flex; justify-content: space-between; font-size: 11pt; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; color: #1E293B; }\n' +
    '    .bold { font-weight: bold; }\n' +
    '    .amount-box { border-top: 2px solid #8B0000; border-bottom: 2px solid #8B0000; padding: 10px 0; margin-top: 15px; text-align: center; }\n' +
    '    .amount-val { font-size: 24pt; font-weight: bold; color: #E11D48; }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <div class="card">\n' +
    '    <div class="header">\n' +
    '      <h2>ஆதி மொய்</h2>\n' +
    '      <div class="sub">பட்டுவாடா ரசீது (Payout Expense Receipt)</div>\n' +
    '      <div class="event-title">' + escapeXml(majorName) + '</div>\n' +
    '    </div>\n' +
    '    <div class="row"><span class="bold">பதிவு செய்தவர்:</span> <span>' + escapeXml(payout.createdBy || 'admin') + '</span></div>\n' +
    '    <div class="row"><span class="bold">தேதி & நேரம்:</span> <span>' + escapeXml((payout.date || '') + ' ' + (payout.time || '')) + '</span></div>\n' +
    '    <div class="row"><span class="bold">பெயர்:</span> <span>' + escapeXml(payout.name || '') + '</span></div>\n' +
    '    <div class="row"><span class="bold">காரணம்:</span> <span>' + escapeXml(payout.reason || '') + '</span></div>\n' +
    '    <div class="amount-box">\n' +
    '      <div style="font-size: 14pt; font-weight: bold; color: #8B0000;">செலவுத் தொகை:</div>\n' +
    '      <div class="amount-val">₹' + escapeXml(payout.amount || '0') + '</div>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '</body>\n' +
    '</html>';

  var targetFolder = getOrCreatePayoutUserDriveFolder(payout);
  var htmlBlob = Utilities.newBlob(htmlText, 'text/html', fileName + '.html');
  targetFolder.createFile(htmlBlob);
}

function escapeXml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ==========================================
// 5. TAMIL NUMBER TO WORDS CONVERTER
// ==========================================
function amountToTamilWords(num) {
  var words = numberToTamilWords(num);
  if (!words) return "";
  return words + " ரூபாய் மட்டும்";
}

function numberToTamilWords(num) {
  if (isNaN(num) || num === null || num === undefined) return "";
  var n = Math.floor(Math.abs(num));
  if (n === 0) return "பூஜ்யம்";

  var units = ["", "ஒன்று", "இரண்டு", "மூன்று", "நான்கு", "ஐந்து", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது"];
  var teens = ["பத்து", "பதினொன்று", "பன்னிரண்டு", "பதிமூன்று", "பதினான்கு", "பதினைந்து", "பதினாறு", "பதினேழு", "பதினெட்டு", "பத்தொன்பது"];
  var tensBase = ["", "", "இருபது", "முப்பது", "நாற்பது", "ஐம்பது", "அறுபது", "எழுபது", "எண்பது", "தொண்ணூறு"];
  var tensPrefix = ["", "", "இருபத்து ", "முப்பத்து ", "நாற்பத்து ", "ஐம்பத்து ", "அறுபத்து ", "எழுபத்து ", "எண்பத்து ", "தொண்ணூற்று "];
  var hundredsBase = ["", "நூறு", "இருநூறு", "முந்நூறு", "நானூறு", "ஐந்நூறு", "அறுநூறு", "எழுநூறு", "எண்நூறு", "தொள்ளாயிரம்"];
  var hundredsPrefix = ["", "நூற்று ", "இருநூற்று ", "முந்நூற்று ", "நானூற்று ", "ஐந்நூற்று ", "அறுநூற்று ", "எழுநூற்று ", "எண்நூற்று ", "தொள்ளாயிரத்து "];

  function convertLessThanThousand(val) {
    if (val === 0) return "";
    var str = "";
    var h = Math.floor(val / 100);
    var rem = val % 100;

    if (h > 0) {
      if (rem === 0) return hundredsBase[h];
      else str += hundredsPrefix[h];
    }

    if (rem > 0) {
      if (rem < 10) str += units[rem];
      else if (rem < 20) str += teens[rem - 10];
      else {
        var t = Math.floor(rem / 10);
        var u = rem % 10;
        if (u === 0) str += tensBase[t];
        else str += tensPrefix[t] + units[u];
      }
    }

    return str;
  }

  var result = "";
  var crore = Math.floor(n / 10000000);
  var rem = n % 10000000;

  var lakh = Math.floor(rem / 100000);
  rem = rem % 100000;

  var thousand = Math.floor(rem / 1000);
  rem = rem % 1000;

  if (crore > 0) result += convertLessThanThousand(crore) + " கோடி ";
  if (lakh > 0) result += convertLessThanThousand(lakh) + " லட்சம் ";
  if (thousand > 0) result += convertLessThanThousand(thousand) + " ஆயிரம் ";
  if (rem > 0) result += convertLessThanThousand(rem);

  return result.trim();
}

// ==========================================
// 6. HELPER FUNCTIONS
// ==========================================
function getSheetDataAsJson(sheet) {
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  var headers = values[0];
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var headerKey = headers[j].toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      row[headerKey] = values[i][j];
    }
    rows.push(row);
  }
  return rows;
}

// Note Entry Drive & Sheets Sync Helpers
function sanitizeFolderName(name) {
  if (!name) return 'Folder';
  return name.toString().replace(/[\\/:*?"<>|]/g, '_').trim();
}

function getOrCreateChildFolder(parentFolder, childName) {
  var safeName = sanitizeFolderName(childName);
  var folders = parentFolder.getFoldersByName(safeName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(safeName);
  }
}

function getNoteEntryBackupFolder() {
  var rootFolder = DriveApp.getRootFolder();
  var moiFolder = getOrCreateChildFolder(rootFolder, 'moi');
  var backupFolder = getOrCreateChildFolder(moiFolder, 'Backup');
  return getOrCreateChildFolder(backupFolder, 'Note Entry');
}

function createNoteEventFolderInDrive(noteEvent) {
  if (!noteEvent) return null;
  var rootNoteFolder = getNoteEntryBackupFolder();
  var safeName = sanitizeFolderName(noteEvent.name || 'Event');
  var eventFolder = getOrCreateChildFolder(rootNoteFolder, safeName);

  try {
    var ss = getSs();
    var noteEventSheet = ss.getSheetByName('Note Events');
    if (!noteEventSheet) {
      noteEventSheet = ss.insertSheet('Note Events');
      noteEventSheet.appendRow(['Note Event ID', 'Event Name', 'Event Title', 'Place', 'Date', 'Drive Folder ID', 'Timestamp']);
      noteEventSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#8B0000').setFontColor('#FFFFFF');
    }
    
    var existingData = noteEventSheet.getDataRange().getValues();
    var exists = false;
    for (var i = 1; i < existingData.length; i++) {
      if (existingData[i][0] === noteEvent.id || existingData[i][1] === noteEvent.name) {
        exists = true;
        noteEventSheet.getRange(i + 1, 6).setValue(eventFolder.getId());
        break;
      }
    }
    if (!exists) {
      noteEventSheet.appendRow([
        noteEvent.id || ('nev_' + Date.now()),
        noteEvent.name || '',
        noteEvent.title || '',
        noteEvent.place || '',
        noteEvent.date || '',
        eventFolder.getId(),
        new Date().toISOString()
      ]);
    }
  } catch (e) {}

  return { id: eventFolder.getId(), name: safeName, url: eventFolder.getUrl() };
}

function saveNoteEntryToDrive(noteEventName, noteEntry, noteEntryHtml) {
  if (!noteEntry) return null;
  var rootNoteFolder = getNoteEntryBackupFolder();
  var safeEventName = sanitizeFolderName(noteEventName || 'General');
  var eventFolder = getOrCreateChildFolder(rootNoteFolder, safeEventName);

  var baseName = sanitizeFolderName((noteEntry.name1 || 'Entry') + '_' + (noteEntry.id || Date.now()));

  var htmlContent = noteEntryHtml;
  if (!htmlContent) {
    htmlContent = '<!DOCTYPE html><html lang="ta"><head><meta charset="UTF-8"><title>ஆதி மொய் - குறிப்பு பதிவு (' + escapeXml(noteEntry.name1) + ')</title><style>body { font-family: sans-serif; padding: 20px; } .card { border: 2px solid #D4AF37; padding: 20px; max-width: 450px; border-radius: 10px; background: #FFFDF0; } h2 { color: #8B0000; text-align: center; border-bottom: 2px solid #8B0000; padding-bottom: 8px; } .row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; } .bold { font-weight: bold; } .amt { font-size: 14pt; font-weight: bold; color: #059669; }</style></head><body><div class="card"><h2>ஆதி மொய் - குறிப்பு பதிவு</h2><div class="row"><span class="bold">நிகழ்ச்சி:</span> <span>' + escapeXml(noteEventName) + '</span></div><div class="row"><span class="bold">ஊர் / இடம்:</span> <span>' + escapeXml(noteEntry.place) + '</span></div><div class="row"><span class="bold">பெயர் 1:</span> <span>' + escapeXml(noteEntry.name1) + '</span></div>' + (noteEntry.name2 ? '<div class="row"><span class="bold">பெயர் 2:</span> <span>' + escapeXml(noteEntry.name2) + '</span></div>' : '') + '<div class="row"><span class="bold">தொகை:</span> <span class="amt">₹' + escapeXml(noteEntry.amount) + '</span></div><div class="row"><span class="bold">பதிவு செய்தவர்:</span> <span>' + escapeXml(noteEntry.createdBy || 'admin') + '</span></div></div></body></html>';
  }

  var htmlFile = eventFolder.createFile(baseName + '.html', htmlContent, MimeType.HTML);

  try {
    var ss = getSs();
    var noteSheet = ss.getSheetByName('Note Entries');
    if (!noteSheet) {
      noteSheet = ss.insertSheet('Note Entries');
      noteSheet.appendRow(['Note Event Name', 'Place', 'Name 1', 'Name 2', 'Amount (₹)', 'Created By', 'Timestamp']);
      noteSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#D4AF37').setFontColor('#0F172A');
    }
    noteSheet.appendRow([
      noteEventName, noteEntry.place, noteEntry.name1, noteEntry.name2 || '',
      noteEntry.amount, noteEntry.createdBy || 'admin', noteEntry.createdAt || new Date().toISOString()
    ]);
  } catch (err) {}

  return { fileId: htmlFile.getId(), url: htmlFile.getUrl() };
}

function saveBulkNoteEntriesToDrive(noteEventName, noteEntries) {
  if (!Array.isArray(noteEntries)) return null;
  var rootNoteFolder = getNoteEntryBackupFolder();
  var safeEventName = sanitizeFolderName(noteEventName || 'General');
  var eventFolder = getOrCreateChildFolder(rootNoteFolder, safeEventName);

  var ss = getSs();
  var noteSheet = ss.getSheetByName('Note Entries');
  if (!noteSheet) {
    noteSheet = ss.insertSheet('Note Entries');
    noteSheet.appendRow(['Note Event Name', 'Place', 'Name 1', 'Name 2', 'Amount (₹)', 'Created By', 'Timestamp']);
    noteSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#D4AF37').setFontColor('#0F172A');
  }

  var savedCount = 0;
  for (var i = 0; i < noteEntries.length; i++) {
    var noteEntry = noteEntries[i];
    if (!noteEntry) continue;
    var baseName = sanitizeFolderName((noteEntry.name1 || 'Entry') + '_' + (noteEntry.id || Date.now()));

    var htmlContent = '<!DOCTYPE html><html lang="ta"><head><meta charset="UTF-8"><title>ஆதி மொய் - குறிப்பு பதிவு (' + escapeXml(noteEntry.name1) + ')</title><style>body { font-family: sans-serif; padding: 20px; } .card { border: 2px solid #D4AF37; padding: 20px; max-width: 450px; border-radius: 10px; background: #FFFDF0; } h2 { color: #8B0000; text-align: center; border-bottom: 2px solid #8B0000; padding-bottom: 8px; } .row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; } .bold { font-weight: bold; } .amt { font-size: 14pt; font-weight: bold; color: #059669; }</style></head><body><div class="card"><h2>ஆதி மொய் - குறிப்பு பதிவு</h2><div class="row"><span class="bold">நிகழ்ச்சி:</span> <span>' + escapeXml(noteEventName) + '</span></div><div class="row"><span class="bold">ஊர் / இடம்:</span> <span>' + escapeXml(noteEntry.place) + '</span></div><div class="row"><span class="bold">பெயர் 1:</span> <span>' + escapeXml(noteEntry.name1) + '</span></div>' + (noteEntry.name2 ? '<div class="row"><span class="bold">பெயர் 2:</span> <span>' + escapeXml(noteEntry.name2) + '</span></div>' : '') + '<div class="row"><span class="bold">தொகை:</span> <span class="amt">₹' + escapeXml(noteEntry.amount) + '</span></div><div class="row"><span class="bold">பதிவு செய்தவர்:</span> <span>' + escapeXml(noteEntry.createdBy || 'admin') + '</span></div></div></body></html>';

    try {
      eventFolder.createFile(baseName + '.html', htmlContent, MimeType.HTML);
    } catch (eFile) {}

    try {
      noteSheet.appendRow([
        noteEventName, noteEntry.place, noteEntry.name1, noteEntry.name2 || '',
        noteEntry.amount, noteEntry.createdBy || 'admin', noteEntry.createdAt || new Date().toISOString()
      ]);
      savedCount++;
    } catch (errSheet) {}
  }

  return { count: savedCount };
}
