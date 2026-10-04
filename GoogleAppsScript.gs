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
function getActiveBackupFolderNames() {
  var activeBackupFolderNames = [];
  try {
    var bFolder = getOrCreateBackupFolder();
    // 1. Direct folders in Backup (e.g. Backup/<event>)
    var bIter = bFolder.getFolders();
    while (bIter.hasNext()) {
      var bSub = bIter.next();
      var bName = bSub.getName();
      if (bName !== 'offline' && bName !== 'Offline' && bName !== 'ofline' && bName !== 'Ofline' &&
          bName !== 'online' && bName !== 'Online' && bName !== 'Archive' && bName !== 'archive' && bName !== 'Note Entry') {
        if (activeBackupFolderNames.indexOf(bName) === -1) activeBackupFolderNames.push(bName);
      }
    }
    // 2. Event folders in Backup/offline (and ofline)
    var offIter = bFolder.getFoldersByName('offline');
    if (!offIter.hasNext()) offIter = bFolder.getFoldersByName('Offline');
    if (!offIter.hasNext()) offIter = bFolder.getFoldersByName('ofline');
    if (!offIter.hasNext()) offIter = bFolder.getFoldersByName('Ofline');
    if (offIter.hasNext()) {
      var offF = offIter.next();
      var oSubIter = offF.getFolders();
      while (oSubIter.hasNext()) {
        var oSub = oSubIter.next();
        var oName = oSub.getName();
        if (activeBackupFolderNames.indexOf(oName) === -1) activeBackupFolderNames.push(oName);
      }
    }
    // 3. Event folders in Backup/online
    var onlIter = bFolder.getFoldersByName('online');
    if (!onlIter.hasNext()) onlIter = bFolder.getFoldersByName('Online');
    if (onlIter.hasNext()) {
      var onlF = onlIter.next();
      var onSubIter = onlF.getFolders();
      while (onSubIter.hasNext()) {
        var onSub = onSubIter.next();
        var onName = onSub.getName();
        if (activeBackupFolderNames.indexOf(onName) === -1) activeBackupFolderNames.push(onName);
      }
    }
  } catch (eBf) {}
  return activeBackupFolderNames;
}

function getArchivedFolderNames() {
  var archivedFolderNames = [];
  try {
    var aFolder = getOrCreateArchiveFolder();
    var aIter = aFolder.getFolders();
    while (aIter.hasNext()) {
      var aSub = aIter.next();
      var aName = aSub.getName();
      if (aName !== 'offline' && aName !== 'Offline' && aName !== 'online' && aName !== 'Online') {
        if (archivedFolderNames.indexOf(aName) === -1) archivedFolderNames.push(aName);
      }
    }
    var aOffIter = aFolder.getFoldersByName('offline');
    if (!aOffIter.hasNext()) aOffIter = aFolder.getFoldersByName('Offline');
    if (!aOffIter.hasNext()) aOffIter = aFolder.getFoldersByName('ofline');
    if (aOffIter.hasNext()) {
      var aOffSub = aOffIter.next().getFolders();
      while (aOffSub.hasNext()) {
        var aOffName = aOffSub.next().getName();
        if (archivedFolderNames.indexOf(aOffName) === -1) archivedFolderNames.push(aOffName);
      }
    }
    var aOnlIter = aFolder.getFoldersByName('online');
    if (!aOnlIter.hasNext()) aOnlIter = aFolder.getFoldersByName('Online');
    if (aOnlIter.hasNext()) {
      var aOnlSub = aOnlIter.next().getFolders();
      while (aOnlSub.hasNext()) {
        var aOnlName = aOnlSub.next().getName();
        if (archivedFolderNames.indexOf(aOnlName) === -1) archivedFolderNames.push(aOnlName);
      }
    }
  } catch (eAf) {}
  return archivedFolderNames;
}

function getFullDatabase(ss) {
  if (!ss) ss = getSs();
  return {
    events: getSheetDataAsJson(ss.getSheetByName('Events')),
    receipts: getSheetDataAsJson(ss.getSheetByName('Receipts')),
    payouts: getSheetDataAsJson(ss.getSheetByName('Payouts')),
    users: getSheetDataAsJson(ss.getSheetByName('Users')),
    noteEvents: getSheetDataAsJson(ss.getSheetByName('Note Events')),
    noteEntries: getSheetDataAsJson(ss.getSheetByName('Note Entries')),
    activeBackupFolderNames: getActiveBackupFolderNames(),
    archivedFolderNames: getArchivedFolderNames()
  };
}

function doGet(e) {
  try {
    var ss = getSs();
    // Auto initialize if empty
    if (!ss.getSheetByName('Receipts')) {
      setupSheets();
    }

    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getDb';

    if (action === 'getDb') {
      var data = getFullDatabase(ss);
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
      if (contents.receipt) {
        if (contents.isOffline !== undefined && contents.receipt.isOffline === undefined) contents.receipt.isOffline = contents.isOffline;
        if (contents.username && !contents.receipt.createdBy) contents.receipt.createdBy = contents.username;
        if (contents.eventName && !contents.receipt.eventName) contents.receipt.eventName = contents.eventName;
      }
      var result = saveMoiReceipt(contents.receipt, contents.receiptHtml);
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

    if (action === 'saveOverallReport') {
      var resultReport = saveOverallReportToDrive(contents.eventName, contents.username, contents.reportHtml);
      return createJsonResponse({ status: 'success', report: resultReport });
    }

    if (action === 'syncBatch') {
      var eventCount = 0;
      var receiptCount = 0;
      var payoutCount = 0;
      var isOffline = (contents.isOffline === true || contents.isOffline === 'true');

      // 1. Process Events in Batch
      if (contents.events && contents.events.length > 0) {
        for (var i = 0; i < contents.events.length; i++) {
          try {
            var evItem = contents.events[i];
            if (evItem) {
              createEventEntry(evItem);
              eventCount++;
            }
          } catch(errEv){}
        }
      }

      // Folder cache to speed up Drive file creation without repeated lookups
      var folderCache = {};
      var getCachedEventFolders = function(evtName, isOff) {
        var key = (evtName || 'Event').toString().trim() + '_' + (isOff ? '1' : '0');
        if (folderCache[key]) return folderCache[key];
        var res = getOrCreateEventReceiptPathFolders(evtName, isOff);
        folderCache[key] = res;
        return res;
      };

      // 2. Process Receipts in Batch
      if (contents.receipts && contents.receipts.length > 0) {
        var rcptSheet = ss.getSheetByName('Receipts');
        if (!rcptSheet) {
          setupSheets();
          rcptSheet = ss.getSheetByName('Receipts');
        }

        var existingBillNos = {};
        if (rcptSheet.getLastRow() > 1) {
          var bData = rcptSheet.getRange(2, 1, rcptSheet.getLastRow() - 1, 1).getValues();
          for (var b = 0; b < bData.length; b++) {
            var bStr = String(bData[b][0] || '').trim();
            if (bStr) existingBillNos[bStr] = true;
          }
        }

        var newRcptRows = [];
        var now = new Date();

        for (var j = 0; j < contents.receipts.length; j++) {
          var rItem = contents.receipts[j];
          if (!rItem) continue;

          var bNo = String(rItem.billNo || '').trim();
          if (!bNo) {
            var nextNo = rcptSheet.getLastRow() + newRcptRows.length + 1;
            bNo = 'AM' + ('000' + nextNo).slice(-4);
            rItem.billNo = bNo;
          }

          if (!rItem.amountWords && rItem.amount) {
            rItem.amountWords = amountToTamilWords(parseFloat(rItem.amount));
          }

          var rDateStr = rItem.date || Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy');
          var rTimeStr = rItem.time || Utilities.formatDate(now, Session.getScriptTimeZone(), 'hh:mm a');

          if (!existingBillNos[bNo]) {
            newRcptRows.push([
              bNo,
              rItem.eventName || '',
              rItem.place || '',
              rItem.initial || '',
              rItem.name || '',
              rItem.job || '',
              rItem.name1 || '',
              rItem.relationship || '',
              rItem.mobile || rItem.phone || '',
              rItem.amount || 0,
              rItem.amountWords || '',
              rItem.mode || 'Cash',
              rItem.upiTxTime || '',
              rItem.createdBy || 'admin',
              rDateStr,
              rTimeStr,
              now.toISOString()
            ]);
            existingBillNos[bNo] = true;
          }

          // Save Drive HTML and JSON files in the exact hierarchy:
          // moi / Backup / (offline or online) / <event folder (Member Name & Member Name 1)> / receipt
          try {
            var rMajor = (rItem.displayName1 || rItem.memberName || rItem.eventName || 'Event').toString().trim();
            var rSub = rItem.displayName1 ? (rItem.memberName || '').toString().trim() : '';
            var rEvtMasterName = (rMajor && rSub && rMajor !== rSub) ? (rMajor + ' - ' + rSub) : rMajor;
            var rIsOffline = (rItem.isOffline !== undefined) ? (rItem.isOffline === true || rItem.isOffline === 'true') : isOffline;

            var pathInfo = getCachedEventFolders(rEvtMasterName, rIsOffline);
            if (pathInfo && pathInfo.receiptFolder) {
              var safeBillNo = bNo.replace(/[\\/:*?"<>|]/g, '_').trim();
              var rHtml = rItem.receiptHtml;
              if (!rHtml) {
                rHtml = '<!DOCTYPE html><html lang="ta"><head><meta charset="UTF-8"><title>ரசீது #' + escapeXml(bNo) + '</title></head><body><h2>ஆதி மொய் - ரசீது #' + escapeXml(bNo) + '</h2><p>தொகை: ₹' + escapeXml(rItem.amount || '0') + '</p></body></html>';
              }
              var htmlBlob = Utilities.newBlob(rHtml, 'text/html', safeBillNo + '.html');
              var jsonBlob = Utilities.newBlob(JSON.stringify(rItem, null, 2), 'application/json', safeBillNo + '.json');
              
              pathInfo.receiptFolder.createFile(htmlBlob);
              pathInfo.receiptFolder.createFile(jsonBlob);

              if (pathInfo.eventFolder) {
                pathInfo.eventFolder.createFile(htmlBlob);
              }
            }
          } catch(eRcptDrive) {
            Logger.log('Drive receipt save notice: ' + eRcptDrive.toString());
          }

          receiptCount++;
        }

        // Batch append all new receipts in a single call
        if (newRcptRows.length > 0) {
          rcptSheet.getRange(rcptSheet.getLastRow() + 1, 1, newRcptRows.length, 17).setValues(newRcptRows);
        }
      }

      // 3. Process Payouts in Batch
      if (contents.payouts && contents.payouts.length > 0) {
        var poSheet = ss.getSheetByName('Payouts');
        if (!poSheet) {
          setupSheets();
          poSheet = ss.getSheetByName('Payouts');
        }

        var existingPoIds = {};
        if (poSheet.getLastRow() > 1) {
          var poData = poSheet.getRange(2, 1, poSheet.getLastRow() - 1, 1).getValues();
          for (var p = 0; p < poData.length; p++) {
            var poStr = String(poData[p][0] || '').trim();
            if (poStr) existingPoIds[poStr] = true;
          }
        }

        var newPoRows = [];
        var nowPo = new Date();
        for (var k = 0; k < contents.payouts.length; k++) {
          var poItem = contents.payouts[k];
          if (!poItem) continue;
          var poId = poItem.id || ('payout_' + Date.now() + '_' + k);
          var poDateStr = poItem.date || Utilities.formatDate(nowPo, Session.getScriptTimeZone(), 'dd/MM/yyyy');
          var poTimeStr = poItem.time || Utilities.formatDate(nowPo, Session.getScriptTimeZone(), 'hh:mm a');

          if (!existingPoIds[poId]) {
            newPoRows.push([
              poId,
              poItem.eventName || '',
              poItem.name || '',
              poItem.reason || poItem.description || '',
              poItem.amount || 0,
              poItem.createdBy || 'admin',
              poDateStr,
              poTimeStr,
              nowPo.toISOString()
            ]);
            existingPoIds[poId] = true;
          }
          try {
            createPayoutHtmlInDrive(poItem);
          } catch(ePo) {}
          payoutCount++;
        }

        if (newPoRows.length > 0) {
          poSheet.getRange(poSheet.getLastRow() + 1, 1, newPoRows.length, 9).setValues(newPoRows);
        }
      }

      // 4. Process Overall Reports
      if (contents.overallReports && contents.overallReports.length > 0) {
        for (var repIdx = 0; repIdx < contents.overallReports.length; repIdx++) {
          var repItem = contents.overallReports[repIdx];
          if (repItem && repItem.eventName && repItem.reportHtml) {
            try {
              saveOverallReportToDrive(repItem.eventName, repItem.username || 'admin', repItem.reportHtml);
            } catch(eRep) {}
          }
        }
      }

      // 5. Process Note Events & Entries
      if (contents.noteEvents && contents.noteEvents.length > 0) {
        for (var nevIdx = 0; nevIdx < contents.noteEvents.length; nevIdx++) {
          try { createNoteEventFolderInDrive(contents.noteEvents[nevIdx]); } catch(eNev){}
        }
      }
      if (contents.noteEntries && contents.noteEntries.length > 0) {
        for (var nentIdx = 0; nentIdx < contents.noteEntries.length; nentIdx++) {
          try {
            var nEnt = contents.noteEntries[nentIdx];
            saveNoteEntryToDrive(nEnt.noteEventName || 'General', nEnt, nEnt.noteEntryHtml);
          } catch(eNent){}
        }
      }

      // 6. Return Complete Updated Database
      var fullData = getFullDatabase(ss);

      return createJsonResponse({
        status: 'success',
        message: 'Batch sync completed successfully',
        counts: { events: eventCount, receipts: receiptCount, payouts: payoutCount },
        data: fullData,
        spreadsheetUrl: ss.getUrl()
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
function saveMoiReceipt(rcpt, receiptHtml) {
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

  // Create HTML Receipt directly in Google Drive Event Master Folder
  try {
    createReceiptHtmlInDrive(rcpt, receiptHtml);
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

  var displayName1 = (event.displayName1 || '').toString().trim();
  var memberName = (event.memberName || '').toString().trim();
  var eventTitle = (event.eventTitle || event.eventName || '').toString().trim();
  if (!displayName1 && memberName) displayName1 = memberName;
  if (!memberName && displayName1) memberName = displayName1;
  var folderTitle = (displayName1 && memberName && displayName1 !== memberName) 
    ? (displayName1 + ' - ' + memberName) 
    : (displayName1 || memberName || eventTitle || 'Event');

  // Create Google Drive Folders in exact paths:
  // 1. moi / Backup / <folderTitle>
  // 2. moi / Backup / offline / <folderTitle> / receipt
  // 3. moi / Backup / online / <folderTitle> / receipt
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

    try { getOrCreateEventReceiptPathFolders(folderTitle, true); } catch(eOff){}
    try { getOrCreateEventReceiptPathFolders(folderTitle, false); } catch(eOnl){}
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
  var folderTitle = (majorName && name1 && majorName !== name1) ? (majorName + ' - ' + name1) : (majorName || '');

  var candidateNames = [];
  if (folderTitle) candidateNames.push(folderTitle);
  if (majorName && !candidateNames.includes(majorName)) candidateNames.push(majorName);
  if (eventName && !candidateNames.includes(eventName)) candidateNames.push(eventName);

  var isMatch = function(val) {
    if (!val) return false;
    var str = val.toString().trim();
    return candidateNames.some(function(c) {
      return c && (str == c || str.toLowerCase() == c.toLowerCase());
    });
  };

  var ss = getSs();
  
  // 1. Move rows in Receipts sheet matching eventId or eventName to Archived Receipts
  var receiptSheet = ss.getSheetByName('Receipts');
  if (receiptSheet) {
    var archReceiptSheet = ss.getSheetByName('Archived Receipts');
    if (!archReceiptSheet) {
      archReceiptSheet = ss.insertSheet('Archived Receipts');
      archReceiptSheet.appendRow([
        'Bill No', 'Event Name', 'Place', 'Initial', 'Name', 'Job', 'Name 1', 
        'Relationship', 'Mobile Number', 'Amount (₹)', 'Amount in Words', 'Mode', 
        'UPI Ref / Time', 'Created By', 'Date', 'Time', 'Timestamp', 'Archived At'
      ]);
      archReceiptSheet.getRange(1, 1, 1, 18).setFontWeight('bold').setBackground('#475569').setFontColor('#FFFFFF');
    }

    var rData = receiptSheet.getDataRange().getValues();
    for (var i = rData.length - 1; i >= 1; i--) {
      var rowEvName = rData[i][1]; // Column 2: Event Name
      if (isMatch(rowEvName)) {
        var rCopy = rData[i].slice();
        rCopy.push(new Date().toISOString());
        archReceiptSheet.appendRow(rCopy);
        receiptSheet.deleteRow(i + 1);
      }
    }
  }

  // 2. Move rows in Payouts sheet matching eventId or eventName to Archived Payouts
  var payoutSheet = ss.getSheetByName('Payouts');
  if (payoutSheet) {
    var archPayoutSheet = ss.getSheetByName('Archived Payouts');
    if (!archPayoutSheet) {
      archPayoutSheet = ss.insertSheet('Archived Payouts');
      archPayoutSheet.appendRow([
        'Payout ID', 'Event Name', 'Name', 'Reason', 'Amount (₹)', 'Created By', 'Date', 'Time', 'Timestamp', 'Archived At'
      ]);
      archPayoutSheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#475569').setFontColor('#FFFFFF');
    }

    var pData = payoutSheet.getDataRange().getValues();
    for (var j = pData.length - 1; j >= 1; j--) {
      var rowEvNameP = pData[j][1]; // Column 2: Event Name
      if (isMatch(rowEvNameP)) {
        var pCopy = pData[j].slice();
        pCopy.push(new Date().toISOString());
        archPayoutSheet.appendRow(pCopy);
        payoutSheet.deleteRow(j + 1);
      }
    }
  }

  // 3. Move deleted event row from Events sheet to Archived Events sheet
  var eventSheet = ss.getSheetByName('Events');
  if (eventSheet) {
    var archiveSheet = ss.getSheetByName('Archived Events');
    if (!archiveSheet) {
      archiveSheet = ss.insertSheet('Archived Events');
      archiveSheet.appendRow([
        'Event ID', 'Member Name', 'Member Name 1', 'Event Title', 'Place', 'Phone', 'Event Date', 'UPI ID', 'Status', 'Assigned User', 'Drive Folder ID', 'Archived At'
      ]);
      archiveSheet.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#475569').setFontColor('#FFFFFF');
    }
    var eData = eventSheet.getDataRange().getValues();
    for (var k = eData.length - 1; k >= 1; k--) {
      var rowEvId = eData[k][0]; // Column 1: Event ID
      var rowMember = eData[k][1]; // Column 2: Member Name
      if ((eventId && rowEvId == eventId) || isMatch(rowMember)) {
        var rowCopy = eData[k].slice();
        rowCopy.push(new Date().toISOString());
        archiveSheet.appendRow(rowCopy);
        eventSheet.deleteRow(k + 1);
      }
    }
  }

  // 4. Move Google Drive Folders for the event (Receipts & Overall Report) into Archive folder
  try {
    var backupFolder = getOrCreateBackupFolder();   // moi/Backup
    var archiveFolder = getOrCreateArchiveFolder(); // moi/Archive

    var moveFolderToArchive = function(folderToMove, destParent, srcParent) {
      try {
        if (!folderToMove || !destParent) return;
        if (typeof folderToMove.moveTo === 'function') {
          folderToMove.moveTo(destParent);
        } else {
          destParent.addFolder(folderToMove);
          if (srcParent) srcParent.removeFolder(folderToMove);
        }
      } catch (eMove) {
        Logger.log('Archive move notice: ' + eMove.toString());
      }
    };

    // 4a. Move main event folder from Backup to Archive
    for (var c = 0; c < candidateNames.length; c++) {
      var cand = candidateNames[c];
      var folders = backupFolder.getFoldersByName(cand);
      while (folders.hasNext()) {
        moveFolderToArchive(folders.next(), archiveFolder, backupFolder);
      }
    }

    // 4b. Move offline receipt folder from Backup/offline/<cand> into Archive/offline/<cand>
    var offFolders = backupFolder.getFoldersByName('offline');
    if (!offFolders.hasNext()) offFolders = backupFolder.getFoldersByName('Offline');
    if (!offFolders.hasNext()) offFolders = backupFolder.getFoldersByName('ofline');
    if (!offFolders.hasNext()) offFolders = backupFolder.getFoldersByName('Ofline');
    if (offFolders.hasNext()) {
      var offlineFolder = offFolders.next();
      
      var archOfflineFolder;
      var aOffFolders = archiveFolder.getFoldersByName('offline');
      if (!aOffFolders.hasNext()) aOffFolders = archiveFolder.getFoldersByName('Offline');
      if (!aOffFolders.hasNext()) aOffFolders = archiveFolder.getFoldersByName('ofline');
      if (aOffFolders.hasNext()) {
        archOfflineFolder = aOffFolders.next();
      } else {
        archOfflineFolder = archiveFolder.createFolder('offline');
      }

      for (var oc = 0; oc < candidateNames.length; oc++) {
        var oCand = candidateNames[oc];
        var oFolders = offlineFolder.getFoldersByName(oCand);
        while (oFolders.hasNext()) {
          moveFolderToArchive(oFolders.next(), archOfflineFolder, offlineFolder);
        }
      }
    }

    // 4c. Move online receipt folder from Backup/online/<cand> into Archive/online/<cand>
    var onlFolders = backupFolder.getFoldersByName('online');
    if (!onlFolders.hasNext()) onlFolders = backupFolder.getFoldersByName('Online');
    if (onlFolders.hasNext()) {
      var onlineFolder = onlFolders.next();
      var archOnlineFolder;
      var aOnlFolders = archiveFolder.getFoldersByName('online');
      if (!aOnlFolders.hasNext()) aOnlFolders = archiveFolder.getFoldersByName('Online');
      if (aOnlFolders.hasNext()) {
        archOnlineFolder = aOnlFolders.next();
      } else {
        archOnlineFolder = archiveFolder.createFolder('online');
      }

      for (var onc = 0; onc < candidateNames.length; onc++) {
        var onCand = candidateNames[onc];
        var oncFolders = onlineFolder.getFoldersByName(onCand);
        while (oncFolders.hasNext()) {
          moveFolderToArchive(oncFolders.next(), archOnlineFolder, onlineFolder);
        }
      }
    }

    // 4d. Move any legacy Backup/Archive folders into moi/Archive
    try {
      var legacyArchFolders = backupFolder.getFoldersByName('Archive');
      if (legacyArchFolders.hasNext()) {
        var legArch = legacyArchFolders.next();
        var legSubFolders = legArch.getFolders();
        while (legSubFolders.hasNext()) {
          moveFolderToArchive(legSubFolders.next(), archiveFolder, legArch);
        }
      }
    } catch (eLeg) {}

  } catch (err) {
    Logger.log('Drive folder archive notice: ' + err.toString());
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

// Helper to locate or create dedicated "Archive" folder inside "moi" folder in Google Drive
function getOrCreateArchiveFolder() {
  try {
    var moiFolder = getOrCreateMoiFolder();
    var folders = moiFolder.getFoldersByName('Archive');
    if (!folders.hasNext()) folders = moiFolder.getFoldersByName('archive');
    if (folders.hasNext()) {
      return folders.next();
    } else {
      return moiFolder.createFolder('Archive');
    }
  } catch (e) {
    return getOrCreateBackupFolder();
  }
}

// Helper to locate or create dedicated Google Drive folder for an event inside Backup folder
function getOrCreateEventDriveFolder(rcpt) {
  var ss = getSs();
  var eventSheet = ss.getSheetByName('Events');
  var backupFolder = getOrCreateBackupFolder();

  var rMajor = rcpt.displayName1 || rcpt.memberName || rcpt.eventName || 'Event';
  var rSub = rcpt.displayName1 ? (rcpt.memberName || '') : '';
  var calcFolderTitle = (rMajor && rSub && rMajor !== rSub) ? (rMajor + ' - ' + rSub) : rMajor;

  if (eventSheet) {
    var data = eventSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rowEventId = row[0];
      var rowDisplayName1 = row[1];
      var rowMemberName = row[2];
      
      if ((rcpt.eventId && rowEventId == rcpt.eventId) || 
          (rcpt.displayName1 && (rowDisplayName1 == rcpt.displayName1 || rowMemberName == rcpt.displayName1)) ||
          (rcpt.memberName && (rowMemberName == rcpt.memberName || rowDisplayName1 == rcpt.memberName)) || 
          (rcpt.eventName && (rowDisplayName1 == rcpt.eventName || rowMemberName == rcpt.eventName || calcFolderTitle == rowDisplayName1))) {
        
        var folderId = row[10]; // Column 11 is Drive Folder ID
        if (folderId && folderId.toString().trim() !== '') {
          try {
            return DriveApp.getFolderById(folderId.toString().trim());
          } catch (e) {}
        }

        // Create folder now inside Backup and save folderId to sheet column 11
        try {
          var major = rowDisplayName1 || rMajor;
          var sub = rowMemberName || rSub;
          var folderTitle = (major && sub && major !== sub) ? (major + ' - ' + sub) : major;
          var newFolder = backupFolder.createFolder(folderTitle);
          eventSheet.getRange(i + 1, 11).setValue(newFolder.getId());
          return newFolder;
        } catch (err) {}
      }
    }
  }

  // Fallback: Create folder by event title inside Backup if not found
  try {
    var existingFolders = backupFolder.getFoldersByName(calcFolderTitle);
    if (existingFolders.hasNext()) {
      return existingFolders.next();
    } else {
      return backupFolder.createFolder(calcFolderTitle);
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

// Helper to locate or create Google Drive folder path:
// "moi folder - backup folder - (ofline or online) folder - event folder (folder name contain event master Member Name & Member Name 1) - receipt"
function getOrCreateEventReceiptPathFolders(eventMasterName, isOffline) {
  var backupFolder = getOrCreateBackupFolder(); // moi/Backup
  var targetSub = isOffline ? 'offline' : 'online';

  // 1. Locate or create (offline or online)
  var envFolder;
  if (isOffline) {
    var offFolders = backupFolder.getFoldersByName('offline');
    if (!offFolders.hasNext()) offFolders = backupFolder.getFoldersByName('Offline');
    if (!offFolders.hasNext()) offFolders = backupFolder.getFoldersByName('ofline');
    if (!offFolders.hasNext()) offFolders = backupFolder.getFoldersByName('Ofline');
    if (offFolders.hasNext()) {
      envFolder = offFolders.next();
    } else {
      envFolder = backupFolder.createFolder('offline');
    }
  } else {
    var onFolders = backupFolder.getFoldersByName('online');
    if (!onFolders.hasNext()) onFolders = backupFolder.getFoldersByName('Online');
    if (onFolders.hasNext()) {
      envFolder = onFolders.next();
    } else {
      envFolder = backupFolder.createFolder('online');
    }
  }

  // 2. Locate or create <event folder> (Member Name & Member Name 1) inside offline/online
  var safeEvent = (eventMasterName || 'Event').toString().trim().replace(/[\\/:*?"<>|]/g, '_') || 'Event';
  var eventFolder;
  var evFolders = envFolder.getFoldersByName(safeEvent);
  if (!evFolders.hasNext()) evFolders = envFolder.getFoldersByName(safeEvent.toLowerCase());
  if (evFolders.hasNext()) {
    eventFolder = evFolders.next();
  } else {
    eventFolder = envFolder.createFolder(safeEvent);
  }

  // 3. Locate or create 'receipt' inside <event folder>
  var receiptFolder;
  var rFolders = eventFolder.getFoldersByName('receipt');
  if (!rFolders.hasNext()) rFolders = eventFolder.getFoldersByName('Receipt');
  if (!rFolders.hasNext()) rFolders = eventFolder.getFoldersByName('receipts');
  if (!rFolders.hasNext()) rFolders = eventFolder.getFoldersByName('Receipts');
  if (rFolders.hasNext()) {
    receiptFolder = rFolders.next();
  } else {
    receiptFolder = eventFolder.createFolder('receipt');
  }

  return {
    envFolder: envFolder,
    eventFolder: eventFolder,
    receiptFolder: receiptFolder
  };
}

// Helper to locate or create Google Drive folder path: "Backup/offline/<event master name>/<username>/receipt"
// Matches 'offline', 'Offline', 'ofline', 'Ofline' and 'receipt', 'Receipt', 'receipts', 'Receipts' case-insensitively
function getOrCreateOfflineUserReceiptFolder(eventMasterName, username) {
  var backupFolder = getOrCreateBackupFolder(); // moi/Backup

  var safeEvent = (eventMasterName || 'Event').toString().trim().replace(/[\\/:*?"<>|]/g, '_') || 'Event';
  var safeUser = (username || 'admin').toString().trim().replace(/[\\/:*?"<>|]/g, '_') || 'admin';
  if (!username && eventMasterName && typeof eventMasterName === 'string') {
    safeUser = safeEvent;
    safeEvent = 'Event';
  }

  // 1. Find or create 'offline' (also accepts 'ofline')
  var offlineFolder;
  var offFolders = backupFolder.getFoldersByName('offline');
  if (!offFolders.hasNext()) offFolders = backupFolder.getFoldersByName('Offline');
  if (!offFolders.hasNext()) offFolders = backupFolder.getFoldersByName('ofline');
  if (!offFolders.hasNext()) offFolders = backupFolder.getFoldersByName('Ofline');
  if (offFolders.hasNext()) {
    offlineFolder = offFolders.next();
  } else {
    offlineFolder = backupFolder.createFolder('offline');
  }

  // 2. Find or create '<event master name>' inside 'offline'
  var eventFolder;
  var evFolders = offlineFolder.getFoldersByName(safeEvent);
  if (!evFolders.hasNext()) evFolders = offlineFolder.getFoldersByName(safeEvent.toLowerCase());
  if (evFolders.hasNext()) {
    eventFolder = evFolders.next();
  } else {
    eventFolder = offlineFolder.createFolder(safeEvent);
  }

  // 3. Find or create '<user name>' inside eventFolder
  var userFolder;
  var uFolders = eventFolder.getFoldersByName(safeUser);
  if (!uFolders.hasNext()) uFolders = eventFolder.getFoldersByName(safeUser.toLowerCase());
  if (uFolders.hasNext()) {
    userFolder = uFolders.next();
  } else {
    userFolder = eventFolder.createFolder(safeUser);
  }

  // 4. Find or create 'receipt' inside userFolder
  var receiptFolder;
  var rFolders = userFolder.getFoldersByName('receipt');
  if (!rFolders.hasNext()) rFolders = userFolder.getFoldersByName('Receipt');
  if (!rFolders.hasNext()) rFolders = userFolder.getFoldersByName('receipts');
  if (!rFolders.hasNext()) rFolders = userFolder.getFoldersByName('Receipts');
  if (rFolders.hasNext()) {
    receiptFolder = rFolders.next();
  } else {
    receiptFolder = userFolder.createFolder('receipt');
  }

  return receiptFolder;
}

// Helper to save Overall Report HTML into the same saved folder:
// "moi / Backup / (offline and online) / <event master folder> / receipt / Overall_Report_<eventName>.html"
function saveOverallReportToDrive(eventName, username, reportHtml) {
  var safeEvent = (eventName || 'Event').toString().trim().replace(/[\\/:*?"<>|]/g, '_') || 'Event';
  var safeUser = (username || 'admin').toString().trim().replace(/[\\/:*?"<>|]/g, '_') || 'admin';
  var fileName = 'Overall_Report_' + safeEvent + '.html';

  if (!reportHtml) {
    reportHtml = '<!DOCTYPE html><html lang="ta"><head><meta charset="UTF-8"><title>Overall Report - ' + escapeXml(safeEvent) + '</title></head><body><h2>Overall Report - ' + escapeXml(safeEvent) + '</h2></body></html>';
  }

  var htmlBlob = Utilities.newBlob(reportHtml, 'text/html', fileName);
  var savedFiles = [];

  var saveIntoFolder = function(folder) {
    if (!folder) return;
    try {
      var ex = folder.getFilesByName(fileName);
      while (ex.hasNext()) {
        ex.next().setTrashed(true);
      }
      var f = folder.createFile(htmlBlob);
      savedFiles.push(f.getUrl());
    } catch (eF) {
      Logger.log('Overall report folder save notice: ' + eF.toString());
    }
  };

  // 1. Save in offline path: Backup/offline/<event folder>/receipt/ and Backup/offline/<event folder>/
  try {
    var offPath = getOrCreateEventReceiptPathFolders(safeEvent, true);
    saveIntoFolder(offPath.receiptFolder);
    saveIntoFolder(offPath.eventFolder);
  } catch (eOff) {}

  // 2. Save in online path: Backup/online/<event folder>/receipt/ and Backup/online/<event folder>/
  try {
    var onlPath = getOrCreateEventReceiptPathFolders(safeEvent, false);
    saveIntoFolder(onlPath.receiptFolder);
    saveIntoFolder(onlPath.eventFolder);
  } catch (eOnl) {}

  // 3. Save in user subfolder path: Backup/offline/<event master name>/<username>/receipt/
  try {
    var offlineUserReceiptFolder = getOrCreateOfflineUserReceiptFolder(safeEvent, safeUser);
    saveIntoFolder(offlineUserReceiptFolder);
  } catch (eU) {}

  // 4. Save in main Event Master folder directly under Backup
  try {
    var eventFolder = getOrCreateEventDriveFolder({ eventName: safeEvent, displayName1: safeEvent });
    saveIntoFolder(eventFolder);
  } catch (eM) {}

  return { success: true, fileName: fileName, urls: savedFiles };
}

// ==========================================
// 4. GOOGLE DRIVE HTML RECEIPT GENERATOR
// ==========================================
function createReceiptHtmlInDrive(rcpt, customHtml) {
  var majorName = rcpt.displayName1 || rcpt.memberName || rcpt.eventName || 'Event';
  var name1 = rcpt.displayName1 ? (rcpt.memberName || '') : '';
  var sanitize = function(str) {
    return (str || '').toString().replace(/[\\/:*?"<>|]/g, '_').trim();
  };

  var fileName = sanitize(rcpt.billNo || ('Receipt_' + Date.now()));

  var htmlText = customHtml;
  if (!htmlText) {
    htmlText = '<!DOCTYPE html>\n' +
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
'      <div class="sub">கருணாக்கமுத்தன் பட்டி, கம்பம்</div>\n' +
'      <div class="sub" style="margin-top: 2px;">(98656 07179)</div>\n' +
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
  }

  var isOffline = (rcpt.isOffline === true || rcpt.isOffline === 'true' || rcpt.source === 'offline' || rcpt.source === 'offline_sync');
  var htmlBlob = Utilities.newBlob(htmlText, 'text/html', fileName + '.html');
  var jsonBlob = Utilities.newBlob(JSON.stringify(rcpt, null, 2), 'application/json', fileName + '.json');

  var rMajor = (rcpt.displayName1 || rcpt.memberName || rcpt.eventName || 'Event').toString().trim();
  var rSub = rcpt.displayName1 ? (rcpt.memberName || '').toString().trim() : '';
  var eventMasterName = (rMajor && rSub && rMajor !== rSub) ? (rMajor + ' - ' + rSub) : rMajor;

  // 1. Save in the user-specified exact path:
  // "moi folder - backup folder - (offline or online) folder - event folder (Member Name & Member Name 1) - receipt"
  try {
    var pathInfo = getOrCreateEventReceiptPathFolders(eventMasterName, isOffline);
    if (pathInfo && pathInfo.receiptFolder) {
      pathInfo.receiptFolder.createFile(htmlBlob);
      pathInfo.receiptFolder.createFile(jsonBlob);
    }
    if (pathInfo && pathInfo.eventFolder) {
      pathInfo.eventFolder.createFile(htmlBlob);
    }
  } catch (ePath) {
    Logger.log('Standard path receipt save notice: ' + ePath.toString());
  }

  // 2. Also save directly in main Backup Event Master folder
  try {
    var eventFolder = getOrCreateEventDriveFolder(rcpt);
    if (eventFolder) {
      eventFolder.createFile(htmlBlob);
    }
  } catch (eMain) {}

  // 3. Also save in user subfolder if available
  try {
    var username = (rcpt.createdBy || 'admin').toString().trim();
    var userReceiptFolder = getOrCreateOfflineUserReceiptFolder(eventMasterName, username);
    if (userReceiptFolder) {
      userReceiptFolder.createFile(htmlBlob);
      userReceiptFolder.createFile(jsonBlob);
    }
  } catch (eOff) {
    Logger.log('Offline user receipt path save notice: ' + eOff.toString());
  }
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
  var name1 = payout.displayName1 ? (payout.memberName || '') : '';
  var evTitle = payout.eventTitle || '';
  var evPlace = payout.place || payout.eventPlace || '';
  var sanitize = function(str) {
    return (str || '').toString().replace(/[\\/:*?"<>|]/g, '_').trim();
  };

  var fileName = sanitize(payout.id || ('Payout_' + Date.now()));
  var voucherNo = payout.id ? String(payout.id).replace(/^payout_/, '') : '';
  var payoutWords = amountToTamilWords(payout.amount || 0);

  var htmlText = '<!DOCTYPE html>\n' +
    '<html lang="ta">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <title>ஆதி மொய் - பட்டுவாடா ரசீது' + (voucherNo ? (' #' + escapeXml(voucherNo)) : '') + '</title>\n' +
    '  <style>\n' +
    '    @page {\n' +
    '      size: 80mm auto;\n' +
    '      margin: 0mm !important;\n' +
    '    }\n' +
    '    * {\n' +
    '      box-sizing: border-box;\n' +
    '      -webkit-print-color-adjust: exact !important;\n' +
    '      print-color-adjust: exact !important;\n' +
    '    }\n' +
    '    html, body {\n' +
    '      width: 80mm !important;\n' +
    '      max-width: 80mm !important;\n' +
    '      margin: 0 auto !important;\n' +
    '      padding: 0 !important;\n' +
    '      background: #fff !important;\n' +
    '      color: #000 !important;\n' +
    '      font-family: monospace, "Noto Sans Tamil", sans-serif !important;\n' +
    '      font-weight: bold;\n' +
    '    }\n' +
    '    .thermal-receipt-container {\n' +
    '      width: 80mm !important;\n' +
    '      max-width: 80mm !important;\n' +
    '      margin: 0 auto !important;\n' +
    '      padding: 4mm 2.5mm;\n' +
    '      page-break-inside: avoid !important;\n' +
    '      break-inside: avoid !important;\n' +
    '    }\n' +
    '    .header { text-align: center; padding-bottom: 4px; margin-bottom: 6px; }\n' +
    '    h2 { font-size: 15.5pt; font-weight: 900; margin: 0; color: #000; line-height: 1.1; }\n' +
    '    .sub { font-size: 8.5pt; font-weight: bold; margin: 2px 0 1px 0; color: #000; line-height: 1.2; }\n' +
    '    .phone { font-size: 8.5pt; font-weight: bold; margin: 0 0 5px 0; color: #000; border-bottom: 1px solid #000; padding-bottom: 3px; line-height: 1.2; font-family: monospace, sans-serif; }\n' +
    '    .disp1 { font-size: 12.5pt; font-weight: 900; margin: 2px 0 1px 0; color: #000; line-height: 1.2; }\n' +
    '    .mem-name { font-size: 11.5pt; font-weight: 900; margin: 2px 0; color: #000; line-height: 1.2; }\n' +
    '    .ev-title { font-size: 10.5pt; font-weight: 900; margin: 2px 0 1px 0; color: #000; line-height: 1.2; }\n' +
    '    .ev-place { font-size: 9pt; font-weight: bold; margin: 1px 0 0 0; color: #000; line-height: 1.2; }\n' +
    '    .badge { text-align: center; font-size: 10.5pt; font-weight: 900; margin-bottom: 4px; border-bottom: 1px dashed #000; padding-bottom: 3px; }\n' +
    '    .body-section { font-size: 9.5pt; line-height: 1.45; color: #000; border-top: 1px solid #000; padding-top: 5px; }\n' +
    '    .row { display: flex; justify-content: space-between; }\n' +
    '    .amount-box { display: flex; justify-content: space-between; align-items: center; margin-top: 5px; border-top: 2px solid #000; padding-top: 5px; }\n' +
    '    .amount-val { font-size: 18pt; font-weight: 900; font-family: sans-serif; }\n' +
    '    .amount-words { font-size: 9.5pt; font-weight: bold; font-style: italic; margin-top: 2px; text-align: center; color: #000; }\n' +
    '    .footer { text-align: center; margin-top: 8px; font-size: 8.5pt; border-top: 1px solid #000; padding-top: 4px; color: #000; font-weight: bold; }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <div class="thermal-receipt-container">\n' +
    '    <div class="header">\n' +
    '      <h2>ஆதி மொய்</h2>\n' +
    '      <p class="sub">கருணாக்கமுத்தன் பட்டி, கம்பம்</p>\n' +
    '      <p class="phone">(98656 07179)</p>\n' +
    (majorName ? ('      <div class="disp1">' + escapeXml(majorName) + '</div>\n') : '') +
    (name1 ? ('      <div class="mem-name">' + escapeXml(name1) + '</div>\n') : '') +
    (evTitle ? ('      <div class="ev-title">' + escapeXml(evTitle) + '</div>\n') : '') +
    (evPlace ? ('      <div class="ev-place">' + escapeXml(evPlace) + '</div>\n') : '') +
    '    </div>\n' +
    '    <div class="body-section">\n' +
    '      <div class="badge">பட்டுவாடா ரசீது (Payout Receipt)</div>\n' +
    (voucherNo ? ('      <div class="row"><span>ரசீது எண்:</span> <span>#' + escapeXml(voucherNo) + '</span></div>\n') : '') +
    '      <div class="row"><span>தேதி & நேரம்:</span> <span>' + escapeXml((payout.date || '') + ' ' + (payout.time || '')) + '</span></div>\n' +
    '      <div class="row"><span>பதிவு செய்தவர்:</span> <span>' + escapeXml(payout.createdBy || 'admin') + '</span></div>\n' +
    '      <div class="row" style="border-top: 1px dashed #000; margin-top: 4px; padding-top: 4px;"><span>அனுப்புபவர்:</span> <span style="font-weight: 900;">' + escapeXml(payout.sender || payout.name || '-') + '</span></div>\n' +
    '      <div class="row"><span>பெறுபவர்:</span> <span style="font-weight: 900;">' + escapeXml(payout.receiver || '-') + '</span></div>\n' +
    '      <div class="row"><span>காரணம்:</span> <span>' + escapeXml(payout.reason || '-') + '</span></div>\n' +
    '      <div class="amount-box">\n' +
    '        <span style="font-size: 13pt; font-weight: 900;">செலவுத் தொகை:</span>\n' +
    '        <span class="amount-val">₹' + escapeXml(parseFloat(payout.amount || 0).toLocaleString('en-IN')) + '</span>\n' +
    '      </div>\n' +
    (payoutWords ? ('      <div class="amount-words">(' + escapeXml(payoutWords) + ')</div>\n') : '') +
    '    </div>\n' +
    '    <div class="footer">பட்டுவாடா பதிவு செய்யப்பட்டது</div>\n' +
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
      var cellVal = values[i][j];

      // Format Date objects returned by Google Sheets
      if (cellVal instanceof Date) {
        if (headerKey === 'time' || headerKey === 'upitxtime') {
          cellVal = Utilities.formatDate(cellVal, 'Asia/Kolkata', 'hh:mm a');
        } else if (headerKey === 'date' || headerKey === 'eventdate') {
          if (cellVal.getFullYear() < 1970) {
            cellVal = '';
          } else {
            cellVal = Utilities.formatDate(cellVal, 'Asia/Kolkata', 'dd/MM/yyyy');
          }
        }
      }
      row[headerKey] = cellVal;
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
