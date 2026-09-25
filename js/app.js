// ஆதி மொய் (Aathi Moi) Main Application Script

(function () {
  // Global Application State
  const state = {
    currentUser: null, // { username, role, assignedEventId }
    activePanel: 'login',
    activeEventId: null,
    events: [],
    receipts: [],
    members: [], // Permanent member/donor directory (preserved even if events are deleted)
    payouts: [],
    users: [],
    noteEvents: [],
    noteEntries: [],
    activeNoteTab: 'event-master',
    activeNoteEventId: null,
    editingNoteEntryId: null,
    notePlaceFilter: 'ALL',
    notePlacePriority: { p1: '', p2: '', p3: '' },
    reportPlacePriority: { p1: '', p2: '', p3: '' },
    reportPlaceOrderMap: {},
    notePlaceOrderMap: {},
    editingReceiptId: null,
    lastFocusedFieldId: 'moi-place',
    eventMasterTab: 'active',
    currentTheme: 'dark',
    localSaveDirHandle: null,
    localSaveFolderName: localStorage.getItem('aathi_moi_local_folder_name') || '',
    eventDenominations: JSON.parse(localStorage.getItem('aathi_event_denominations') || '{}')
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }

  // Universal mobile number formatter to prefix +91
  // e.g. 9865607179 -> +91 9865607179
  function formatPhoneWithCountryCode(phone) {
    if (!phone) return '';
    const str = String(phone).trim();
    const digits = str.replace(/\D/g, '');
    if (!digits) return str;
    if (digits.length === 10) {
      return `+91 ${digits}`;
    } else if (digits.length === 12 && digits.startsWith('91')) {
      return `+91 ${digits.substring(2)}`;
    } else if (digits.length === 11 && digits.startsWith('0')) {
      return `+91 ${digits.substring(1)}`;
    } else if (str.startsWith('+91')) {
      return str;
    }
    return `+91 ${digits}`;
  }

  // Format Moi person name for displays and reports: Initial.Name - Name 1 - Job
  // e.g. Initial: M, Name: kumar, Name 1: mari, Job: farmer -> M.kumar - mari - farmer
  function formatMoiPersonNameWithJob(r) {
    if (!r) return '';
    let namePart = '';
    const initial = (r.initial || '').trim().replace(/\.+$/, '');
    const name = (r.name || '').trim();
    if (initial && name) {
      namePart = `${initial}.${name}`;
    } else {
      namePart = name || initial;
    }

    const parts = [];
    if (namePart) parts.push(namePart);
    if (r.name1 && r.name1.trim()) parts.push(r.name1.trim());
    if (r.job && r.job.trim()) parts.push(r.job.trim());
    if (r.relationship && r.relationship.trim()) parts.push(r.relationship.trim());

    return parts.join(' - ');
  }

  // Format Note Entry person name: Initial.Name 1 - Job - Name 2
  // e.g. Initial: m, Name 1: a, Job: 1, Name 2: b -> m.a - 1 - b
  function formatNoteEntryPersonName(e) {
    if (!e) return '';
    let namePart = '';
    const initial = (e.initial || '').trim().replace(/\.+$/, '');
    const name1 = (e.name1 || '').trim();
    if (initial && name1) {
      namePart = `${initial}.${name1}`;
    } else {
      namePart = name1 || initial;
    }

    const parts = [];
    if (namePart) parts.push(namePart);
    if (e.job && e.job.trim()) parts.push(e.job.trim());
    if (e.name2 && e.name2.trim()) parts.push(e.name2.trim());

    return parts.join(' - ');
  }

  // Place Priority Sorting Helper
  function sortEntriesByPlacePriority(entries, p1, p2, p3) {
    const priorityOrder = [p1, p2, p3].map(s => (s || '').trim()).filter(Boolean);
    if (priorityOrder.length === 0 || !Array.isArray(entries)) return entries;

    return [...entries].sort((a, b) => {
      const placeA = String(a.place || '').trim();
      const placeB = String(b.place || '').trim();

      const indexA = priorityOrder.indexOf(placeA);
      const indexB = priorityOrder.indexOf(placeB);

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;

      return 0;
    });
  }

  // Custom Manual Place Number Sorting Helper
  function sortEntriesByCustomPlaceNumbers(entries, placeOrderMap) {
    if (!placeOrderMap || Object.keys(placeOrderMap).length === 0 || !Array.isArray(entries)) return entries;

    return [...entries].sort((a, b) => {
      const placeA = String(a.place || '').trim();
      const placeB = String(b.place || '').trim();

      const numA = placeOrderMap[placeA] !== undefined ? parseInt(placeOrderMap[placeA], 10) : 999;
      const numB = placeOrderMap[placeB] !== undefined ? parseInt(placeOrderMap[placeB], 10) : 999;

      if (numA !== numB) {
        return numA - numB;
      }
      return 0;
    });
  }

  /**
   * Shared Overall Ledger Report HTML Generator
   * Matches the uploaded reference PDF layout:
   *  - Portrait A4 (7-column ledger without duplicate ஊர் column)
   *  - Top table row: பக்கம்.எண் : X (full-width boxed header)
   *  - 15 to 20 entries per page on A4 Portrait
   *  - Searchable Tamil Text in PDF with standard TrueType fonts:
   *    'Mukta Malar', 'Nirmala UI', 'Latha', 'Vijaya', 'Noto Sans Tamil'
   *  - Letter-spacing normal (preserves PDF text-stream ligature/character codes for Ctrl+F search)
   *  - All strings normalized to canonical Unicode NFC form
   *  - Col 1: வ.எண் (top) / ர.எண் (bottom) vertically stacked
   *  - Col 2: பெயர் மற்றும் தொழில் (Line 1: Initial. Name - Name 1 [no wrap], Line 2: Job, Line 3: Phone)
   *  - Col 3: செய்த மொய்
   *  - Col 4: வந்த மொய் (bold amount with commas)
   *  - Cols 5, 6, 7: விஷேசத்திற்கு பின் (black background, white text)
   *  - Place rows: Centered bold header across all 7 columns with count
   *  - Place continuation: If town entries continue onto the next page, town header is repeated
   *  - Subtotal row on every page: பக்கத்தின் மொத்தத்தொகை
   *  - Grand total row on last data page: மொத்தத்தொகை
   *  - Summary page at end: பக்கவாரியான தொகை
   */
  function buildOverallReportHtml(cfg) {
    // 10 to 13 entries per page on A4 portrait (default 12 for clean A4 fit without spill)
    const TARGET_RPP = (cfg.ROWS_PER_PAGE && cfg.ROWS_PER_PAGE >= 10 && cfg.ROWS_PER_PAGE <= 13) ? cfg.ROWS_PER_PAGE : 12;
    const MAX_PAGE_UNITS = TARGET_RPP;

    // Helper for canonical Unicode NFC normalization (ensures exact Ctrl+F search matches in PDF)
    function toSearchableUnicode(str) {
      if (!str) return '';
      return String(str)
        .normalize('NFC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
    }

    // Helper to identify தாய்மாமன் (Maternal Uncles)
    const isThaimaman = r => {
      const rel = (r.relationship || '').trim().toLowerCase();
      return /தாய்மாமன்|தாய்\s*மாமன்|மாமன்|thaimaman|thai\s*maman|maternal\s*uncle/i.test(rel);
    };

    const thaimamanEntries = cfg.entries.filter(isThaimaman);
    const regularEntries = cfg.entries.filter(r => !isThaimaman(r));

    // Group regular entries by place in order of appearance
    const placeOrder = [];
    const byPlace = {};
    regularEntries.forEach(r => {
      const pl = toSearchableUnicode(cfg.getPlace(r) || '-');
      if (!byPlace[pl]) { byPlace[pl] = []; placeOrder.push(pl); }
      byPlace[pl].push(r);
    });

    // Paginate: 15 - 20 entries per page (default 16)
    // Place / தாய்மாமன் headers count as 1 unit, data rows count as 1 unit.
    const pages = [];
    let curPage = [];
    let currentUnits = 0;

    if (cfg.keepFlatOrder) {
      cfg.entries.forEach(r => {
        if (currentUnits + 1 > MAX_PAGE_UNITS && curPage.length > 0) {
          pages.push(curPage);
          curPage = [];
          currentUnits = 0;
        }
        curPage.push({ type: 'data', r, sectionPlace: cfg.getPlace(r) || '-', isThaimaman: isThaimaman(r) });
        currentUnits++;
      });
    } else {
      // 1. Paginate தாய்மாமன்கள் section first if present
      if (thaimamanEntries.length > 0) {
        const count = thaimamanEntries.length;
        let isFirstInThai = true;

        thaimamanEntries.forEach(r => {
          if (isFirstInThai) {
            if (currentUnits + 2 > MAX_PAGE_UNITS && curPage.length > 0) {
              pages.push(curPage);
              curPage = [];
              currentUnits = 0;
            }
            curPage.push({ type: 'thaimaman', count: count, isContinuation: false });
            currentUnits++;
            isFirstInThai = false;
          } else {
            if (currentUnits + 1 > MAX_PAGE_UNITS) {
              pages.push(curPage);
              curPage = [];
              currentUnits = 0;
              curPage.push({ type: 'thaimaman', count: count, isContinuation: true });
              currentUnits++;
            }
          }

          curPage.push({ type: 'data', r, isThaimaman: true });
          currentUnits++;
        });
      }

      // 2. Paginate regular place entries
      placeOrder.forEach(pl => {
        const entries = byPlace[pl];
        const count = entries.length;
        let isFirstInTown = true;

        entries.forEach(r => {
          if (isFirstInTown) {
            if (currentUnits + 2 > MAX_PAGE_UNITS && curPage.length > 0) {
              pages.push(curPage);
              curPage = [];
              currentUnits = 0;
            }
            curPage.push({ type: 'place', place: pl, count: count, isContinuation: false });
            currentUnits++;
            isFirstInTown = false;
          } else {
            if (currentUnits + 1 > MAX_PAGE_UNITS) {
              pages.push(curPage);
              curPage = [];
              currentUnits = 0;
              curPage.push({ type: 'place', place: pl, count: count, isContinuation: true });
              currentUnits++;
            }
          }

          curPage.push({ type: 'data', r, sectionPlace: pl, isThaimaman: false });
          currentUnits++;
        });
      });
    }

    if (curPage.length > 0) {
      pages.push(curPage);
    }
    const totalPages = pages.length;

    // Per-page totals for subtotal row & summary page
    const pageTotals = pages.map(rows =>
      rows.filter(r => r.type === 'data').reduce((s, r) => s + (cfg.getAmount(r.r) || 0), 0)
    );

    // Shared print CSS with Adobe Tamil Regular / PDF-acceptable Tamil TrueType fonts, pure black text, spiral binding margin, and strict normal letter-spacing
    const css = `<style>
      @font-face {
        font-family: 'Adobe Tamil';
        src: local('Adobe Tamil Regular'),
             local('AdobeTamil-Regular'),
             local('Adobe Tamil'),
             local('AdobeTamil'),
             url('/fonts/AdobeTamil-Regular.ttf') format('truetype'),
             url('/fonts/AdobeTamil-Regular.otf') format('opentype'),
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
             url('/fonts/AdobeTamil-Regular.ttf') format('truetype'),
             url('/fonts/AdobeTamil-Regular.otf') format('opentype'),
             url('fonts/AdobeTamil-Regular.ttf') format('truetype'),
             url('fonts/AdobeTamil-Regular.otf') format('opentype');
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: 'Adobe Tamil';
        src: local('Adobe Tamil Bold'),
             local('AdobeTamil-Bold'),
             url('/fonts/AdobeTamil-Bold.ttf') format('truetype'),
             url('/fonts/AdobeTamil-Bold.otf') format('opentype'),
             url('fonts/AdobeTamil-Bold.ttf') format('truetype'),
             url('fonts/AdobeTamil-Bold.otf') format('opentype');
        font-weight: 700;
        font-style: normal;
      }
      @font-face {
        font-family: 'Mukta Malar';
        src: url('/fonts/MuktaMalar-Bold.ttf') format('truetype'),
             url('fonts/MuktaMalar-Bold.ttf') format('truetype');
        font-weight: 700;
        font-style: normal;
      }
      @font-face {
        font-family: 'Mukta Malar';
        src: url('/fonts/MuktaMalar-Bold.ttf') format('truetype'),
             url('fonts/MuktaMalar-Bold.ttf') format('truetype');
        font-weight: 800;
        font-style: normal;
      }
      @font-face {
        font-family: 'Mukta Malar';
        src: url('/fonts/MuktaMalar-Bold.ttf') format('truetype'),
             url('fonts/MuktaMalar-Bold.ttf') format('truetype');
        font-weight: 900;
        font-style: normal;
      }
      @font-face {
        font-family: 'Mukta Malar';
        src: url('/fonts/MuktaMalar-SemiBold.ttf') format('truetype'),
             url('fonts/MuktaMalar-SemiBold.ttf') format('truetype');
        font-weight: 600;
        font-style: normal;
      }
      @font-face {
        font-family: 'Mukta Malar';
        src: url('/fonts/MuktaMalar-Regular.ttf') format('truetype'),
             url('fonts/MuktaMalar-Regular.ttf') format('truetype');
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: 'Mukta Malar';
        src: url('/fonts/MuktaMalar-Regular.ttf') format('truetype'),
             url('fonts/MuktaMalar-Regular.ttf') format('truetype');
        font-weight: 500;
        font-style: normal;
      }
      @page {
        size: A4 portrait;
        margin: 6mm 4mm 6mm 14mm;
      }
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body {
        font-family: 'Mukta Malar', 'MuktaMalar-Bold', 'Adobe Tamil Regular', 'Adobe Tamil', 'AdobeTamil-Regular', 'Nirmala UI', Arial, sans-serif !important;
        color: #000;
        background: #fff;
        margin: 0;
        padding: 0;
        -webkit-font-smoothing: antialiased;
        letter-spacing: normal !important;
        word-spacing: normal !important;
        text-rendering: auto !important;
        font-feature-settings: normal !important;
        font-variant-ligatures: normal !important;
        user-select: text !important;
        -webkit-user-select: text !important;
      }
      .a4-page {
        width: 100%;
        box-sizing: border-box;
        padding: 0 0 0 2px;
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
        font-family: 'Mukta Malar', 'MuktaMalar-Bold', 'Adobe Tamil Regular', 'Adobe Tamil', 'AdobeTamil-Regular', 'Nirmala UI', Arial, sans-serif !important;
        letter-spacing: normal !important;
        word-spacing: normal !important;
      }
      .a4-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }

      /* Event Header Bar (compact) */
      .rpt-header {
        text-align: center;
        border-bottom: 2px solid #8B0000;
        padding-bottom: 3px;
        margin-bottom: 4px;
      }
      .rpt-header .org-title {
        font-size: 18pt;
        font-weight: 900;
        color: #8B0000;
        line-height: 1.15;
        margin: 0;
        letter-spacing: 0.5px !important;
      }
      .rpt-header .org-subtitle {
        font-size: 12pt;
        font-weight: 800;
        color: #8B0000;
        margin-top: 2px;
        letter-spacing: normal !important;
      }
      .rpt-header .header-divider {
        border-top: 1.5px solid #8B0000;
        margin: 4px 0 3px 0;
        width: 100%;
      }
      .rpt-header .ev-title {
        font-size: 13.5pt;
        font-weight: 800;
        color: #0F172A;
        margin: 2px 0 1px 0;
        letter-spacing: normal !important;
      }
      .rpt-header .ev-meta {
        font-size: 11pt;
        font-weight: 700;
        color: #334155;
        letter-spacing: normal !important;
      }

      /* Main Ledger Table matching Reference PDF */
      table.ledger-table {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        font-size: 9.5pt;
        border: 2px solid #000;
        letter-spacing: normal !important;
      }
      table.ledger-table th,
      table.ledger-table td {
        border: 1px solid #000;
        padding: 2px 3px !important;
        vertical-align: middle;
        letter-spacing: normal !important;
      }

      /* Top Box: பக்கம்.எண் : X */
      .th-page-box {
        border: 1.5px solid #000 !important;
        font-size: 11pt;
        font-weight: 800;
        text-align: center;
        padding: 3px 6px !important;
        background: #fff;
        color: #000;
        letter-spacing: normal !important;
      }

      /* Header styling */
      table.ledger-table thead th {
        background: #fff;
        color: #000;
        font-weight: 800;
        text-align: center;
        font-size: 8.8pt;
        line-height: 1.15;
        letter-spacing: normal !important;
      }
      table.ledger-table thead th.th-vishesham {
        background: #000 !important;
        color: #fff !important;
        font-size: 8.8pt;
        font-weight: 800;
        text-align: center;
        padding: 3px 2px !important;
        letter-spacing: normal !important;
      }

      /* Column Widths & Layout (8 Columns including Place) */
      .col-sno-rno {
        width: 7.5%;
        text-align: center;
        padding: 0 !important;
        vertical-align: middle;
      }
      .col-sno-rno .sno-hdr {
        font-size: 8pt;
        font-weight: 800;
        line-height: 1.1;
        padding: 2px 1px 1px 1px;
      }
      .col-sno-rno .hdr-sep {
        border-top: 1px solid #000;
        margin: 0;
      }
      .col-sno-rno .rno-hdr {
        font-size: 7.5pt;
        font-weight: 800;
        line-height: 1.1;
        padding: 1px 1px 2px 1px;
      }

      .col-sno-rno .sno-val {
        font-size: 13pt;
        font-weight: 900;
        line-height: 1.1;
        color: #000;
        padding: 3px 1px 2px 1px;
      }
      .col-sno-rno .cell-sep {
        border-top: 1px solid #000;
        margin: 0;
      }
      .col-sno-rno .rno-val {
        font-size: 10pt;
        font-weight: 800;
        line-height: 1.1;
        color: #000;
        padding: 1px 1px 2px 1px;
      }

      /* ஊர் (Place data) column width - wrap text enabled */
      .col-place {
        width: 13.5%;
        text-align: center;
        font-weight: 800;
        font-size: 9.5pt;
        padding: 3px 2px !important;
        vertical-align: middle;
        white-space: normal !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
        line-height: 1.25 !important;
        letter-spacing: normal !important;
        color: #000;
      }

      /* பெயர் மற்றும் தொழில் */
      .col-name {
        width: 38.0%;
        text-align: left;
        padding: 3px 6px !important;
        letter-spacing: normal !important;
        vertical-align: middle;
        white-space: normal !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
      .col-name .name-entry-primary {
        font-weight: 800;
        font-size: 11pt;
        line-height: 1.25;
        color: #000000 !important;
        white-space: normal !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
      .col-name .name-entry-job {
        font-weight: 600;
        font-size: 9pt;
        line-height: 1.2;
        color: #1e293b !important;
        margin-top: 1px;
        white-space: normal !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
      .col-name .name-entry-phone {
        font-weight: 600;
        font-size: 8.5pt;
        line-height: 1.2;
        color: #1e293b !important;
        margin-top: 1px;
        white-space: normal !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }

      /* செய்த மொய் column width */
      .col-seitha {
        width: 7.5%;
        text-align: right;
        font-weight: 800;
        font-size: 8.8pt;
        padding: 3px 4px !important;
        vertical-align: middle;
      }

      /* வந்த மொய் column width */
      .col-vantha {
        width: 11.5%;
        text-align: right;
        font-weight: 900;
        font-size: 11pt;
        padding: 3px 5px !important;
        line-height: 1.15;
        vertical-align: middle;
      }
      .col-vantha .amt-val {
        font-weight: 900;
        font-size: 11.5pt;
        color: #000000;
      }
      .col-vantha .col-mode-val, .col-vantha .upi-tag, .col-vantha .mode-tag {
        font-size: 8pt;
        font-weight: 700;
        display: block;
        line-height: 1.15;
        margin-top: 2px;
        text-align: right;
        color: #1e3a8a;
      }
      @media print {
        .col-vantha .col-mode-val, .col-vantha .upi-tag, .col-vantha .mode-tag {
          color: #000000 !important;
          display: block !important;
          visibility: visible !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }

      /* விஷேசத்திற்கு பின் columns (அவர் இருப்பு, நாம் செய்தது, நமது இருப்பு) */
      .col-vishesha-sub {
        text-align: center;
        font-size: 7.5pt;
        font-weight: 800;
        line-height: 1.1;
        padding: 2px 1px !important;
        letter-spacing: normal !important;
      }
      .col-vishesha-1 {
        width: 7.3%;
      }
      .col-vishesha-2 {
        width: 7.4%;
      }
      .col-vishesha-3 {
        width: 7.3%;
      }
      .col-vishesha-cell {
        padding: 1px 0 !important;
        vertical-align: middle;
      }

      /* Place Row: Full-width centered bold */
      tr.place-row td {
        background: #ffffff;
        font-weight: 800;
        font-size: 11pt;
        text-align: center;
        padding: 4px 6px !important;
        border-top: 1.5px solid #000;
        border-bottom: 1.5px solid #000;
        letter-spacing: normal !important;
      }

      /* Maternal Uncles Header (தாய்மாமன்கள்) */
      tr.thaimaman-row td {
        background: #ffffff !important;
        color: #000000 !important;
        font-weight: 900 !important;
        font-size: 11pt !important;
        letter-spacing: normal !important;
        border-top: 1.5px solid #000 !important;
        border-bottom: 1.5px solid #000 !important;
        text-align: center !important;
      }

      /* Compact header for pages 2+ (Event master data in first page alone) */
      .rpt-header-subsequent {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1.5px solid #8B0000;
        padding-bottom: 2px;
        margin-bottom: 3px;
      }
      .rpt-header-subsequent .org-title-sm {
        font-size: 13pt;
        font-weight: 900;
        color: #8B0000;
      }
      .rpt-header-subsequent .org-subtitle-sm {
        font-size: 10pt;
        font-weight: 800;
        color: #8B0000;
      }

      /* Compact Data Rows for clean A4 fit */
      tr.data-row {
        min-height: 28px;
        height: auto;
      }

      /* Subtotal Row */
      tr.subtotal-row td {
        background: #fff;
        font-weight: 800;
        font-size: 9.5pt;
        border-top: 1.5px solid #000;
        border-bottom: 1.5px solid #000;
        padding: 3px 4px !important;
        letter-spacing: normal !important;
      }
      tr.subtotal-row td.subtotal-label {
        text-align: left;
      }
      tr.subtotal-row td.subtotal-amt {
        text-align: right;
      }

      /* Grand Total Row */
      tr.grand-total-row td {
        background: #f0f0f0;
        font-weight: 700;
        font-size: 9pt;
        border-top: 2px solid #000;
        border-bottom: 2px solid #000;
        padding: 3px 4px !important;
        letter-spacing: normal !important;
      }
      tr.grand-total-row td.grand-label {
        text-align: left;
      }
      tr.grand-total-row td.grand-amt {
        text-align: right;
      }

      /* UPI & Mode tags */
      .upi-tag {
        font-size: 7pt;
        font-weight: 700;
        color: #1e3a8a;
        display: block;
        line-height: 1;
        margin-top: 1px;
      }

      /* Summary Page: பக்கவாரியான தொகை matching Uploaded Template */
      .summary-title {
        text-align: center;
        font-size: 15pt;
        font-weight: 700;
        margin: 15px 0 22px 0;
        letter-spacing: normal !important;
        font-family: 'Adobe Tamil Regular', 'Adobe Tamil', 'AdobeTamil-Regular', 'Mukta Malar', 'Nirmala UI', Arial, sans-serif !important;
      }
      .summary-tables-wrap {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        gap: 26px;
        width: 100%;
        margin: 0 auto;
      }
      table.summary-col-table {
        width: 195px;
        border-collapse: collapse;
        font-size: 9pt;
        border: 1.5px solid #000;
        background: #fff;
        letter-spacing: normal !important;
      }
      table.summary-col-table th {
        border: 1.2px solid #000;
        padding: 5px 4px !important;
        text-align: center;
        font-size: 8.5pt;
        font-weight: 700;
        background: #fff;
        color: #000;
        line-height: 1.2;
        letter-spacing: normal !important;
      }
      table.summary-col-table td {
        border: 1px solid #000;
        padding: 4px 6px !important;
        vertical-align: middle;
        letter-spacing: normal !important;
      }
      table.summary-col-table td.col-sno-td {
        width: 50px;
        text-align: center;
        font-weight: 700;
        font-size: 9.5pt;
        padding: 4px 2px !important;
      }
      table.summary-col-table td.col-amt-td {
        width: 145px;
        text-align: right;
        font-weight: 700;
        font-size: 9.5pt;
        padding: 4px 8px !important;
        white-space: nowrap;
      }
      table.summary-col-table tr {
        height: 28px;
      }
      @media print {
        .a4-page { border: none !important; }
      }
    </style>`;

    let globalSno = 0;
    let htmlPages = '';

    // Build data pages
    pages.forEach((pageRows, pi) => {
      const pageNo = pi + 1;
      const isLastPage = (pi === totalPages - 1);
      const pageAmt = pageTotals[pi];

      // Page 1 displays full Event Master data; subsequent pages display compact brand bar alone
      const isFirstDataPage = (pi === 0);
      const pageHeaderHtml = isFirstDataPage ? `
        <div class="rpt-header">
          <div class="org-title">${toSearchableUnicode('ஆதி மொய்')}</div>
          <div class="org-subtitle">${toSearchableUnicode('கருணாக்கமுத்தன் பட்டி')} &nbsp;📞 (+91 9865607179)</div>
          <div class="header-divider"></div>
          ${cfg.eventTitle ? `<div class="ev-title">${toSearchableUnicode(cfg.eventTitle)}</div>` : ''}
          ${cfg.eventSubtitle ? `<div class="ev-meta">${toSearchableUnicode(cfg.eventSubtitle)}</div>` : ''}
        </div>
      ` : `
        <div class="rpt-header rpt-header-subsequent">
          <div class="org-title-sm">${toSearchableUnicode('ஆதி மொய்')}</div>
          <div class="org-subtitle-sm">${toSearchableUnicode('கருணாக்கமுத்தன் பட்டி')} &nbsp;📞 (+91 9865607179)</div>
        </div>
      `;

      let tbody = '';
      pageRows.forEach(row => {
        if (row.type === 'thaimaman') {
          tbody += `
            <tr class="place-row thaimaman-row">
              <td colspan="8">${toSearchableUnicode('தாய்மாமன்கள்')} (${row.count})${row.isContinuation ? ' - ' + toSearchableUnicode('தொடர்ச்சி') : ''}</td>
            </tr>`;
        } else if (row.type === 'place') {
          tbody += `
            <tr class="place-row">
              <td colspan="8">${toSearchableUnicode(row.place)} (${row.count})${row.isContinuation ? ' - ' + toSearchableUnicode('தொடர்ச்சி') : ''}</td>
            </tr>`;
        } else {
          globalSno++;
          const r = row.r;
          const amt = cfg.getAmount(r) || 0;
          const billNo = toSearchableUnicode(cfg.getBillNo(r) || '');
          const itemPlace = toSearchableUnicode(cfg.getPlace ? cfg.getPlace(r) : (r.place || ''));

          // Extract Initial and Clean Name
          const rawInitial = cfg.getInitial ? cfg.getInitial(r) : (r.initial || '');
          const rawName = cfg.getNameOnly ? cfg.getNameOnly(r) : (r.name || r.name1 || '');
          let initial = toSearchableUnicode(rawInitial).replace(/\.+$/, '');
          let cleanName = toSearchableUnicode(rawName);

          // If no initial was explicitly provided, attempt extracting from name e.g. "M. Kumar"
          if (!initial && cleanName) {
            const initMatch = cleanName.match(/^([A-Za-z\u0B80-\u0BFF]{1,4})\s*[\.\-]\s*(.+)$/);
            if (initMatch) {
              initial = initMatch[1].toUpperCase();
              cleanName = initMatch[2].trim();
            }
          }

          const job = toSearchableUnicode(cfg.getJob ? cfg.getJob(r) : r.job);
          const subName = toSearchableUnicode(cfg.getSubName ? cfg.getSubName(r) : (r.name1 || r.name2));
          const phone = (r.phone || r.mobile || '').trim();
          let rawMode = cfg.getMode ? cfg.getMode(r) : (r.mode || '');
          if (typeof rawMode !== 'string') rawMode = String(rawMode || '');
          rawMode = rawMode.trim();
          let displayMode = rawMode;
          if (!displayMode || displayMode.toLowerCase() === 'cash' || displayMode === 'ரொக்கம்') {
            displayMode = 'ரொக்கம்';
          } else if (displayMode.toUpperCase() === 'UPI' || displayMode === 'யூ.பி.ஐ') {
            displayMode = 'யூ.பி.ஐ';
          }
          const mode = toSearchableUnicode(displayMode || 'ரொக்கம்');

          // Format Primary Name Line: Initial + Name + Secondary Name (Name 1) + Mobile (as per image)
          // Text should not wrap for Initial, Name, Name1 per user request
          const nameGroup = [];
          if (initial) {
            nameGroup.push(initial.length <= 2 ? initial + '.' : initial);
          }
          if (cleanName) {
            nameGroup.push(cleanName);
          }
          let mainNameStr = nameGroup.join(' ');
          const hasSubName = !!(subName && subName !== cleanName);
          const fullDisplayName = hasSubName ? `${mainNameStr} - ${subName}` : mainNameStr;

          tbody += `
            <tr class="data-row">
              <td class="col-sno-rno">
                <div class="sno-val">${globalSno}</div>
                <div class="cell-sep"></div>
                <div class="rno-val">${billNo}</div>
              </td>
              <td class="col-place" style="white-space: normal !important; word-break: break-word !important; overflow-wrap: break-word !important;">${escapeHtml(itemPlace)}</td>
              <td class="col-name" style="white-space: normal !important; word-break: break-word !important; overflow-wrap: break-word !important;">
                <div class="name-entry-primary" style="white-space: normal !important; word-break: break-word !important; overflow-wrap: break-word !important;">
                  <span class="name-data" style="white-space: normal !important; word-break: break-word !important; overflow-wrap: break-word !important;">${escapeHtml(fullDisplayName)}</span>
                </div>
                ${job ? `<div class="name-entry-job" style="white-space: normal !important; word-break: break-word !important; overflow-wrap: break-word !important;">${escapeHtml(job)}</div>` : ''}
                ${phone ? `<div class="name-entry-phone" style="white-space: normal !important; word-break: break-word !important; overflow-wrap: break-word !important;">${escapeHtml(phone.replace(/[📞📱☎️]/g, '').trim())}</div>` : ''}
              </td>
              <td class="col-seitha"></td>
              <td class="col-vantha">
                <div class="amt-val">${amt.toLocaleString('en-IN')}</div>
                <div class="col-mode-val" style="font-size: 8pt; font-weight: 700; line-height: 1.15; margin-top: 2px; text-align: right; color: ${mode === 'யூ.பி.ஐ' ? '#1e3a8a' : '#334155'};">${escapeHtml(mode)}</div>
              </td>
              <td class="col-vishesha-cell col-vishesha-1"></td>
              <td class="col-vishesha-cell col-vishesha-2"></td>
              <td class="col-vishesha-cell col-vishesha-3"></td>
            </tr>`;
        }
      });

      // Subtotal row at bottom of every page (covers S.No/R.No, Place, and Name = 3 columns, Seitha Moi = 1 column, Vantha Moi = 1 column, Vishesham = 3 columns)
      tbody += `
        <tr class="subtotal-row">
          <td colspan="3" class="subtotal-label">${toSearchableUnicode('பக்கத்தின் மொத்தத்தொகை')}</td>
          <td class="col-seitha"></td>
          <td class="subtotal-amt col-vantha">${pageAmt.toLocaleString('en-IN')}</td>
          <td colspan="3"></td>
        </tr>`;

      // Grand total row on the last data page
      if (isLastPage) {
        tbody += `
          <tr class="grand-total-row">
            <td colspan="3" class="grand-label">${toSearchableUnicode('மொத்தத்தொகை')}</td>
            <td class="col-seitha"></td>
            <td class="grand-amt col-vantha">${cfg.totalMoi.toLocaleString('en-IN')}</td>
            <td colspan="3" style="text-align: center; font-size: 8.5pt;">
              (ரொக்கம்: ₹${cfg.totalCash.toLocaleString('en-IN')} | UPI: ₹${cfg.totalUpi.toLocaleString('en-IN')})
            </td>
          </tr>`;
        if (cfg.totalPayout > 0) {
          tbody += `
            <tr class="grand-total-row" style="color: #b91c1c;">
              <td colspan="3" class="grand-label" style="color: #b91c1c;">${toSearchableUnicode('மொத்த செலவு')}</td>
              <td class="col-seitha"></td>
              <td class="grand-amt col-vantha" style="color: #b91c1c;">₹${cfg.totalPayout.toLocaleString('en-IN')}</td>
              <td colspan="3" style="text-align: center; font-size: 8.5pt; color: #15803d;">
                ${toSearchableUnicode('நிகர இருப்பு')}: ₹${(cfg.totalMoi - cfg.totalPayout).toLocaleString('en-IN')}
              </td>
            </tr>`;
        }
      }

      // Complete table for this page (8 columns with Place data)
      htmlPages += `
        <div class="a4-page">
          ${pageHeaderHtml}
          <table class="ledger-table">
            <colgroup>
              <col class="col-sno-rno">
              <col class="col-place">
              <col class="col-name">
              <col class="col-seitha">
              <col class="col-vantha">
              <col class="col-vishesha-1">
              <col class="col-vishesha-2">
              <col class="col-vishesha-3">
            </colgroup>
            <thead>
              <tr>
                <th colspan="8" class="th-page-box">${toSearchableUnicode('பக்கம்.எண்')} : ${pageNo}</th>
              </tr>
              <tr>
                <th rowspan="2" class="col-sno-rno">
                  <div class="sno-hdr">${toSearchableUnicode('வ.எண்')}</div>
                  <div class="hdr-sep"></div>
                  <div class="rno-hdr">${toSearchableUnicode('ர.எண்')}</div>
                </th>
                <th rowspan="2" class="col-place">${toSearchableUnicode('ஊர்')}</th>
                <th rowspan="2" class="col-name">${toSearchableUnicode('பெயர் மற்றும் தொழில்')}</th>
                <th rowspan="2" class="col-seitha">${toSearchableUnicode('செய்த')}<br>${toSearchableUnicode('மொய்')}</th>
                <th rowspan="2" class="col-vantha">${toSearchableUnicode('வந்த')}<br>${toSearchableUnicode('மொய்')}</th>
                <th colspan="3" class="th-vishesham">${toSearchableUnicode('விஷேசத்திற்கு பின்')}</th>
              </tr>
              <tr>
                <th class="col-vishesha-sub col-vishesha-1">${toSearchableUnicode('அவர்')}<br>${toSearchableUnicode('இருப்பு')}</th>
                <th class="col-vishesha-sub col-vishesha-2">${toSearchableUnicode('நாம்')}<br>${toSearchableUnicode('செய்தது')}</th>
                <th class="col-vishesha-sub col-vishesha-3">${toSearchableUnicode('நமது')}<br>${toSearchableUnicode('இருப்பு')}</th>
              </tr>
            </thead>
            <tbody>
              ${tbody}
            </tbody>
          </table>
        </div>`;
    });

    // Summary Pages: பக்கவாரியான தொகை (matching the Uploaded Template exactly)
    const numPages = pageTotals.length;
    if (numPages > 1) {
      const ROWS_PER_TABLE = 16;
      const TABLES_PER_SHEET = 3;
      const PAGES_PER_SHEET = ROWS_PER_TABLE * TABLES_PER_SHEET; // 48 pages per sheet

      for (let s = 0; s < numPages; s += PAGES_PER_SHEET) {
        let tablesHtml = '';

        for (let t = 0; t < TABLES_PER_SHEET; t++) {
          const tableStartPage = s + (t * ROWS_PER_TABLE);
          if (tableStartPage >= numPages) break;

          let tbodyRows = '';
          for (let r = 0; r < ROWS_PER_TABLE; r++) {
            const pageIndex = tableStartPage + r;
            if (pageIndex < numPages) {
              const pNo = pageIndex + 1;
              const pAmt = pageTotals[pageIndex] || 0;
              tbodyRows += `
                <tr>
                  <td class="col-sno-td">${pNo}</td>
                  <td class="col-amt-td">₹ ${pAmt.toLocaleString('en-IN')}</td>
                </tr>`;
            }
          }

          tablesHtml += `
            <table class="summary-col-table">
              <thead>
                <tr>
                  <th style="width: 50px;">${toSearchableUnicode('பக்கம்')}<br>${toSearchableUnicode('எண்')}</th>
                  <th style="width: 145px;">${toSearchableUnicode('பக்கத்தின்')}<br>${toSearchableUnicode('தொகை')}</th>
                </tr>
              </thead>
              <tbody>
                ${tbodyRows}
              </tbody>
            </table>`;
        }

        htmlPages += `
          <div class="a4-page" style="padding-top: 15px;">
            <div class="summary-title">${toSearchableUnicode('பக்கவாரியான தொகை')}</div>
            <div class="summary-tables-wrap">
              ${tablesHtml}
            </div>
          </div>`;
      }
    }

    // Generate accurate index records from actual pages
    const sectionMap = {};
    const sectionOrder = [];
    pages.forEach((pageRows, pi) => {
      const pageNo = pi + 1;
      pageRows.forEach(row => {
        let secKey = null;
        let secLabel = null;
        let secCount = 0;
        if (row.type === 'thaimaman') {
          secKey = '__thaimaman__';
          secLabel = `தாய்மாமன்கள் (${row.count})`;
          secCount = row.count;
        } else if (row.type === 'place') {
          secKey = row.place;
          secLabel = `${row.place} (${row.count})`;
          secCount = row.count;
        }
        if (secKey) {
          if (!sectionMap[secKey]) {
            sectionMap[secKey] = { label: secLabel, count: secCount, startPage: pageNo, endPage: pageNo };
            sectionOrder.push(secKey);
          } else {
            sectionMap[secKey].endPage = pageNo;
          }
        }
      });
    });

    const indexRecords = sectionOrder.map((key, idx) => {
      const s = sectionMap[key];
      const pageStr = (s.startPage === s.endPage) ? `${s.startPage}` : `${s.startPage}-${s.endPage}`;
      return {
        sno: idx + 1,
        placeName: s.label,
        pageStr,
        count: s.count
      };
    });

    if (cfg.returnMeta) {
      return {
        html: css + htmlPages,
        indexRecords,
        totalPages: pages.length
      };
    }

    return css + htmlPages;
  }

  // ==========================================
  // First Page / Cover Page Generator
  // ==========================================
  function buildFirstPageHtml(ev) {
    function toSearchableUnicode(str) {
      if (!str) return '';
      return String(str).normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    }
    const memberName = (ev && (ev.memberName || ev.name)) || '';
    const memberName1 = (ev && (ev.displayName1 || ev.memberName1)) || '';
    const eventTitle = (ev && (ev.eventTitle || ev.title)) || '';
    const place = (ev && ev.place) || '-';
    const rawDate = (ev && (ev.eventDate || ev.date)) || '';
    const dateFormatted = rawDate ? formatDateDMY(rawDate) : '';

    return `
      <div class="a4-page a4-cover-page" style="page-break-after: always !important; break-after: page !important; page-break-inside: avoid !important; break-inside: avoid !important; position: relative; box-sizing: border-box; width: 100%; min-height: 275mm; padding: 25px; font-family: 'Adobe Tamil Regular', 'Adobe Tamil', 'AdobeTamil-Regular', 'Mukta Malar', 'Nirmala UI', Arial, sans-serif; background: url('assets/cover_bg.jpg') no-repeat center center; background-size: cover; text-align: center; color: #451a03; display: flex; flex-direction: column; justify-content: space-between; align-items: center; border: 1.5px solid #d97706;">
        
        <!-- Unified Event Master Data Card Centered Under Ganesha -->
        <div style="margin: auto 0; width: 100%; padding-top: 130px;">
          <div style="background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(4px); padding: 28px 24px; border-radius: 22px; border: 2.5px solid #b45309; margin: 0 auto; max-width: 86%; box-shadow: 0 8px 25px rgba(180, 83, 9, 0.2);">
            
            <!-- 1. Member Name & Member Name 1 -->
            <div style="font-size: 30pt; font-weight: 900; color: #78350f; line-height: 1.25;">
              ${toSearchableUnicode(memberName)}
            </div>
            ${memberName1 ? `
              <div style="font-size: 24pt; font-weight: 800; color: #92400e; margin-top: 6px; line-height: 1.25;">
                ${toSearchableUnicode(memberName1)}
              </div>
            ` : ''}

            <!-- 2. Event Title -->
            ${eventTitle ? `
              <div style="font-size: 20pt; font-weight: 900; color: #b45309; margin-top: 14px; letter-spacing: 0.5px;">
                ${toSearchableUnicode(eventTitle)}
              </div>
            ` : ''}

            <!-- Divider Line -->
            <div style="width: 60%; height: 2px; background: linear-gradient(to right, transparent, #b45309, transparent); margin: 16px auto;"></div>

            <!-- 3. Place & 4. Event Date -->
            <div style="font-size: 20pt; font-weight: 900; color: #78350f; margin-bottom: 4px;">
              <span style="color: #92400e;">${toSearchableUnicode('இடம்:')}</span> ${toSearchableUnicode(place)}
            </div>
            ${dateFormatted ? `
              <div style="font-size: 18pt; font-weight: 800; color: #78350f; margin-top: 4px;">
                <span style="color: #92400e;">${toSearchableUnicode('தேதி:')}</span> ${dateFormatted}
              </div>
            ` : ''}

          </div>
        </div>

        <!-- Bottom Footer (Stacked 3 Lines as Requested) -->
        <div style="margin-bottom: 25px; width: 100%;">
          <div style="background: rgba(255, 255, 255, 0.94); padding: 10px 28px; border-radius: 20px; border: 2.5px solid #b45309; display: inline-block; box-shadow: 0 4px 10px rgba(0,0,0,0.12); text-align: center;">
            <div style="font-size: 18pt; font-weight: 900; color: #78350f; line-height: 1.2;">${toSearchableUnicode('ஆதி மொய்')}</div>
            <div style="font-size: 14.5pt; font-weight: 800; color: #92400e; margin-top: 3px; line-height: 1.2;">${toSearchableUnicode('கருணாக்கமுத்தன் பட்டி')}</div>
            <div style="font-size: 14.5pt; font-weight: 800; color: #78350f; font-family: monospace, sans-serif; margin-top: 3px; line-height: 1.2;">+91-9865607179</div>
          </div>
        </div>

      </div>
    `;
  }

  // ==========================================
  // Index Page Generator
  // ==========================================
  function buildIndexPageHtml(activeEv, receipts, totalReportPages = 1, precomputedIndexRecords = null) {
    function toSearchableUnicode(str) {
      if (!str) return '';
      return String(str).normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    }

    let indexRows = [];
    if (precomputedIndexRecords && precomputedIndexRecords.length > 0) {
      indexRows = precomputedIndexRecords;
    } else {
      const itemsPerPage = 16;
      const isThaimaman = r => {
        const rel = (r.relationship || '').trim().toLowerCase();
        return /தாய்மாமன்|தாய்\s*மாமன்|மாமன்|thaimaman|thai\s*maman|maternal\s*uncle/i.test(rel);
      };

      const thaiReceipts = (receipts || []).filter(isThaimaman);
      const regularReceipts = (receipts || []).filter(r => !isThaimaman(r));

      let curRowIdx = 0;
      let sno = 1;

      if (thaiReceipts.length > 0) {
        const count = thaiReceipts.length;
        const startPage = Math.floor(curRowIdx / itemsPerPage) + 1;
        const endPage = Math.floor((curRowIdx + count - 1) / itemsPerPage) + 1;
        const pageStr = (startPage === endPage) ? `${startPage}` : `${startPage}-${endPage}`;
        indexRows.push({
          sno: sno++,
          placeName: `தாய்மாமன்கள் (${count})`,
          pageStr,
          count
        });
        curRowIdx += count;
      }

      const placeMap = {};
      const orderedPlaces = [];
      regularReceipts.forEach(r => {
        const pl = (r.place || '-').trim();
        if (!placeMap[pl]) {
          placeMap[pl] = [];
          orderedPlaces.push(pl);
        }
        placeMap[pl].push(r);
      });

      orderedPlaces.forEach(pl => {
        const count = placeMap[pl].length;
        const startPage = Math.floor(curRowIdx / itemsPerPage) + 1;
        const endPage = Math.floor((curRowIdx + count - 1) / itemsPerPage) + 1;
        const pageStr = (startPage === endPage) ? `${startPage}` : `${startPage}-${endPage}`;
        indexRows.push({
          sno: sno++,
          placeName: `${pl} (${count})`,
          pageStr,
          count
        });
        curRowIdx += count;
      });
    }

    const hostHeader = (activeEv && activeEv.displayName1)
      ? `${activeEv.displayName1}${activeEv.memberName ? ' - ' + activeEv.memberName : ''}`
      : ((activeEv && activeEv.memberName) || 'Aathi Moi');

    return `
      <div class="a4-page" style="page-break-after: always !important; break-after: page !important; page-break-inside: avoid !important; break-inside: avoid !important; position: relative; box-sizing: border-box; padding: 25px; margin-bottom: 20px; font-family: 'Adobe Tamil Regular', 'Adobe Tamil', 'AdobeTamil-Regular', 'Mukta Malar', 'Nirmala UI', Arial, sans-serif; background: #fff; color: #000;">
        <!-- Header -->
        <div style="text-align: center; border-bottom: 2px solid #8B0000; padding-bottom: 10px; margin-bottom: 16px;">
          <h1 style="font-size: 22pt; font-weight: 900; color: #8B0000; margin: 0;">${toSearchableUnicode('ஆதி மொய்')}</h1>
          <div style="font-size: 11.5pt; font-weight: 800; color: #8B0000; margin-top: 3px;">
            ${toSearchableUnicode('கருணாக்கமுத்தன் பட்டி')} &nbsp;📞 (+91 9865607179)
          </div>
          <h2 style="font-size: 15pt; font-weight: 800; color: #0F172A; margin: 6px 0 2px 0;">
            ${toSearchableUnicode(hostHeader)}
          </h2>
          <div style="font-size: 10.5pt; font-weight: 700; color: #334155; margin-top: 4px;">
            <span>${toSearchableUnicode((activeEv && activeEv.place) || '')}</span> ${activeEv && activeEv.place && activeEv.phone ? '&nbsp;|&nbsp;' : ''}
            <span>${activeEv && activeEv.phone ? (formatPhoneWithCountryCode(activeEv.phone) || activeEv.phone) : ''}</span> ${(activeEv && (activeEv.place || activeEv.phone)) && activeEv.eventDate ? '&nbsp;|&nbsp;' : ''}
            <span>${formatDateDMY(activeEv && activeEv.eventDate)}</span>
          </div>
        </div>

        <!-- Index Page Title -->
        <div style="text-align: center; margin-bottom: 18px;">
          <h3 style="font-size: 18pt; font-weight: 900; text-decoration: underline; color: #000; margin: 0; letter-spacing: 0.5px;">Index Page</h3>
        </div>

        <!-- Table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 11pt; border: 1.5px solid #000;">
          <thead>
            <tr style="background: #ffffff; border-bottom: 1.5px solid #000;">
              <th style="padding: 8px 12px; text-align: center; border: 1px solid #000; width: 70px; font-weight: 900; font-size: 11.5pt;">${toSearchableUnicode('வ. எண்')}</th>
              <th style="padding: 8px 14px; text-align: left; border: 1px solid #000; font-weight: 900; font-size: 11.5pt;">${toSearchableUnicode('ஊர் பெயர் (எண்ணிக்கை)')}</th>
              <th style="padding: 8px 12px; text-align: center; border: 1px solid #000; width: 130px; font-weight: 900; font-size: 11.5pt;">${toSearchableUnicode('பக்க எண்')}</th>
            </tr>
          </thead>
          <tbody>
            ${indexRows.map(row => `
              <tr style="border-bottom: 1px solid #000;">
                <td style="padding: 7px 12px; text-align: center; border: 1px solid #000;">${row.sno}</td>
                <td style="padding: 7px 14px; text-align: left; border: 1px solid #000; font-weight: 800;">${toSearchableUnicode(row.placeName)}</td>
                <td style="padding: 7px 12px; text-align: center; border: 1px solid #000; font-weight: 800;">${row.pageStr}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Summary Footer -->
        <div style="margin-top: 20px; border-top: 1.5px solid #000; padding-top: 10px; font-size: 11pt; font-weight: 800; display: flex; justify-content: space-between; color: #000;">
          <span>${toSearchableUnicode('மொத்த பிரிவுகள் / ஊர்கள்: ' + indexRows.length)}</span>
          <span>${toSearchableUnicode('மொத்த பதிவுகள்: ' + (receipts ? receipts.length : 0))}</span>
          <span>${toSearchableUnicode('மொத்த பக்கங்கள்: ' + (totalReportPages || 1))}</span>
        </div>
      </div>
    `;
  }

  // ==========================================
  // Extra Ruled Blank Ledger Pages Generator
  // 4 Columns: வ.எண் | ஊர் | பெயர் | தொகை with 35 blank rows (matching media_1790097755829.pdf)
  // ==========================================
  function buildExtraBlankPagesHtml(pageCount = 2) {
    function toSearchableUnicode(str) {
      if (!str) return '';
      return String(str).normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    }

    let pagesHtml = '';
    const TOTAL_ROWS = 35;

    for (let p = 0; p < pageCount; p++) {
      let rowsHtml = '';
      for (let i = 1; i <= TOTAL_ROWS; i++) {
        rowsHtml += `
          <tr style="height: 23px; border-bottom: 1px solid #000;">
            <td style="border: 1px solid #000; width: 60px; text-align: center; font-size: 10pt; font-weight: 700; padding: 2px 4px;">&nbsp;</td>
            <td style="border: 1px solid #000; width: 150px; text-align: center; font-size: 10pt; font-weight: 700; padding: 2px 4px;">&nbsp;</td>
            <td style="border: 1px solid #000; text-align: left; font-size: 10pt; font-weight: 700; padding: 2px 6px;">&nbsp;</td>
            <td style="border: 1px solid #000; width: 115px; text-align: right; font-size: 10pt; font-weight: 700; padding: 2px 6px;">&nbsp;</td>
          </tr>
        `;
      }

      pagesHtml += `
        <div class="a4-page extra-blank-page" style="page-break-after: ${p < pageCount - 1 ? 'always' : 'auto'} !important; break-after: ${p < pageCount - 1 ? 'page' : 'auto'} !important; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 100%; margin: 0 auto; padding: 8px 0 0 2px; font-family: 'Adobe Tamil Regular', 'Adobe Tamil', 'AdobeTamil-Regular', 'Mukta Malar', 'Noto Sans Tamil', 'Latha', 'Vijaya', Arial, sans-serif !important; background: #fff; color: #000;">
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; table-layout: fixed; font-family: inherit;">
            <thead>
              <tr style="height: 32px; border-bottom: 2px solid #000; background: #fff;">
                <th style="border: 1px solid #000; width: 60px; text-align: center; font-size: 11pt; font-weight: 900; color: #000; padding: 4px 2px;">
                  ${toSearchableUnicode('வ.எண்')}
                </th>
                <th style="border: 1px solid #000; width: 150px; text-align: center; font-size: 11pt; font-weight: 900; color: #000; padding: 4px 2px;">
                  ${toSearchableUnicode('ஊர்')}
                </th>
                <th style="border: 1px solid #000; text-align: center; font-size: 11pt; font-weight: 900; color: #000; padding: 4px 4px;">
                  ${toSearchableUnicode('பெயர்')}
                </th>
                <th style="border: 1px solid #000; width: 115px; text-align: center; font-size: 11pt; font-weight: 900; color: #000; padding: 4px 2px;">
                  ${toSearchableUnicode('தொகை')}
                </th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    }

    return pagesHtml;
  }

  // ==========================================
  // Cash Denomination Report Generator (பணத்தாள் விவர அறிக்கை)
  // Printable A4 template with searchable Tamil text
  // ==========================================
  function buildDenominationReportHtml(cfg) {
    function toSearchableUnicode(str) {
      if (!str) return '';
      return String(str)
        .normalize('NFC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
    }

    const ev = cfg.activeEv || {};
    const evHost = ev.displayName1 ? (ev.displayName1 + (ev.memberName ? ' - ' + ev.memberName : '')) : (ev.memberName || ev.eventName || 'Aathi Moi');
    const evTitle = ev.eventTitle || ev.eventName || 'வசந்த விழா';
    const evPlace = ev.place || '';
    const evPhone = ev.phone ? (formatPhoneWithCountryCode(ev.phone) || ev.phone) : '';
    const evDate = formatDateDMY(ev.eventDate || ev.date || new Date().toISOString());
    const contributorCount = cfg.contributorCount || 0;
    const computerTotal = cfg.computerTotal || 0;

    const c500 = parseInt(cfg.c500, 10) || 0;
    const c200 = parseInt(cfg.c200, 10) || 0;
    const c100 = parseInt(cfg.c100, 10) || 0;
    const c50  = parseInt(cfg.c50, 10) || 0;
    const c20  = parseInt(cfg.c20, 10) || 0;
    const c10  = parseInt(cfg.c10, 10) || 0;
    const c1   = parseInt(cfg.c1, 10) || 0;

    const a500 = c500 * 500;
    const a200 = c200 * 200;
    const a100 = c100 * 100;
    const a50  = c50 * 50;
    const a20  = c20 * 20;
    const a10  = c10 * 10;
    const a1   = c1 * 1;

    const cashInHand = a500 + a200 + a100 + a50 + a20 + a10 + a1;
    const gpay = parseFloat(cfg.gpay) || 0;
    const hostCash = parseFloat(cfg.hostCash) || 0;
    const totalInHand = cashInHand + gpay + hostCash;
    const diff = totalInHand - computerTotal;

    // Split place into mandapam and town if comma/dash separated
    let placeLine1 = evPlace;
    let placeLine2 = '';
    if (evPlace.includes(',')) {
      const parts = evPlace.split(',');
      placeLine1 = parts[0].trim();
      placeLine2 = parts.slice(1).join(',').trim();
    } else if (evPlace.includes(' - ')) {
      const parts = evPlace.split(' - ');
      placeLine1 = parts[0].trim();
      placeLine2 = parts.slice(1).join(' - ').trim();
    }

    return `
      <div class="a4-page denomination-page" style="page-break-after: always !important; break-after: page !important; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 100%; max-width: 680px; margin: 0 auto; padding: 12px 16px; font-family: 'Adobe Tamil Regular', 'Adobe Tamil', 'AdobeTamil-Regular', 'Mukta Malar', 'Nirmala UI', 'Latha', 'Vijaya', Arial, sans-serif !important; color: #000; background: #fff;">
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 15mm 10mm 15mm;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .denomination-page {
              box-shadow: none !important;
              margin: 0 auto !important;
              padding: 8px 12px !important;
              width: 100% !important;
              max-width: 680px !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        </style>

        <!-- Main Box with 2px solid black border -->
        <div style="border: 2px solid #000; box-sizing: border-box; background: #fff; width: 100%;">
          <!-- Header: Title, Subtitle -->
          <div style="padding: 12px 14px 8px 14px; text-align: center;">
            <h1 style="margin: 0; font-size: 24pt; font-weight: 900; letter-spacing: 1px; line-height: 1.15; color: #000;">
              ${toSearchableUnicode('ஆதி மொய்')}
            </h1>
            <div style="font-size: 13pt; font-weight: 700; margin-top: 3px; color: #111;">
              ${toSearchableUnicode('கருணாக்கமுத்தன் பட்டி')}
            </div>
          </div>

          <!-- Divider line -->
          <div style="border-top: 1.5px solid #000;"></div>

          <!-- Event Details Box -->
          <div style="padding: 8px 14px; text-align: center; line-height: 1.4;">
            <div style="font-size: 13.5pt; font-weight: 800; color: #000; margin-bottom: 2px;">
              ${toSearchableUnicode(evHost)}
            </div>
            <div style="font-size: 12pt; font-weight: 700; color: #000; margin-bottom: 2px;">
              ${toSearchableUnicode(evTitle)}
            </div>
            ${placeLine1 ? `
              <div style="font-size: 11.5pt; font-weight: 700; color: #000; margin-bottom: 2px;">
                ${toSearchableUnicode('இடம்: ' + placeLine1)}
              </div>
            ` : ''}
            ${placeLine2 ? `
              <div style="font-size: 11.5pt; font-weight: 700; color: #000; margin-bottom: 2px;">
                ${toSearchableUnicode(placeLine2)}
              </div>
            ` : ''}
            ${evPhone ? `
              <div style="font-size: 11.5pt; font-weight: 700; color: #000;">
                ${toSearchableUnicode('Mobile: ' + evPhone)}
              </div>
            ` : ''}
          </div>

          <!-- Divider line -->
          <div style="border-top: 1.5px solid #000;"></div>

          <!-- Date & Contributor Count -->
          <div style="padding: 6px 14px; text-align: center; line-height: 1.4;">
            <div style="font-size: 12pt; font-weight: 800; color: #000;">
              ${toSearchableUnicode('தேதி: ' + evDate)}
            </div>
            <div style="font-size: 12pt; font-weight: 800; color: #000; margin-top: 2px;">
              ${toSearchableUnicode('மொய் செய்தவர்கள்: ' + contributorCount)}
            </div>
          </div>

          <!-- Divider line -->
          <div style="border-top: 1.5px solid #000;"></div>

          <!-- Denomination Table -->
          <table style="width: 100%; border-collapse: collapse; font-family: inherit;">
            <thead>
              <tr style="border-bottom: 1.5px solid #000;">
                <th style="border-right: 1px solid #000; width: 33%; padding: 6px 10px; font-size: 12.5pt; font-weight: 800; text-align: center; color: #000;">
                  ${toSearchableUnicode('நோட்டு')}
                </th>
                <th style="border-right: 1px solid #000; width: 34%; padding: 6px 10px; font-size: 12.5pt; font-weight: 800; text-align: center; color: #000;">
                  ${toSearchableUnicode('எண்ணிக்கை')}
                </th>
                <th style="width: 33%; padding: 6px 14px; font-size: 12.5pt; font-weight: 800; text-align: center; color: #000;">
                  ${toSearchableUnicode('தொகை')}
                </th>
              </tr>
            </thead>
            <tbody>
              <!-- 500 X -->
              <tr style="border-bottom: 1px solid #000;">
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">500 X</td>
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">${c500}</td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">${a500.toLocaleString('en-IN')}</td>
              </tr>
              <!-- 200 X -->
              <tr style="border-bottom: 1px solid #000;">
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">200 X</td>
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">${c200}</td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">${a200.toLocaleString('en-IN')}</td>
              </tr>
              <!-- 100 X -->
              <tr style="border-bottom: 1px solid #000;">
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">100 X</td>
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">${c100}</td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">${a100.toLocaleString('en-IN')}</td>
              </tr>
              <!-- 50 X -->
              <tr style="border-bottom: 1px solid #000;">
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">50 X</td>
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">${c50}</td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">${a50.toLocaleString('en-IN')}</td>
              </tr>
              <!-- 20 X -->
              <tr style="border-bottom: 1px solid #000;">
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">20 X</td>
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">${c20}</td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">${a20.toLocaleString('en-IN')}</td>
              </tr>
              <!-- 10 X -->
              <tr style="border-bottom: 1px solid #000;">
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">10 X</td>
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">${c10}</td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">${a10.toLocaleString('en-IN')}</td>
              </tr>
              <!-- 1 X -->
              <tr style="border-bottom: 1.5px solid #000;">
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">1 X</td>
                <td style="border-right: 1px solid #000; padding: 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: center;">${c1}</td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">${a1.toLocaleString('en-IN')}</td>
              </tr>

              <!-- கையிருப்பு -->
              <tr style="border-bottom: 1px solid #000;">
                <td colspan="2" style="border-right: 1px solid #000; padding: 4.5px 24px 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${toSearchableUnicode('கையிருப்பு')}
                </td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${cashInHand.toLocaleString('en-IN')}
                </td>
              </tr>

              <!-- கூகுள் பே -->
              <tr style="border-bottom: 1px solid #000;">
                <td colspan="2" style="border-right: 1px solid #000; padding: 4.5px 24px 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${toSearchableUnicode('கூகுள் பே / UPI')}
                </td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${gpay.toLocaleString('en-IN')}
                </td>
              </tr>

              <!-- விஷேசதாரர் கைவசம் -->
              <tr style="border-bottom: 1px solid #000;">
                <td colspan="2" style="border-right: 1px solid #000; padding: 4.5px 24px 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${toSearchableUnicode('விஷேசதாரர் கைவசம்')}
                </td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${hostCash.toLocaleString('en-IN')}
                </td>
              </tr>

              <!-- மொத்த கையிருப்பு -->
              <tr style="border-bottom: 1px solid #000;">
                <td colspan="2" style="border-right: 1px solid #000; padding: 4.5px 24px 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${toSearchableUnicode('மொத்த கையிருப்பு')}
                </td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${totalInHand.toLocaleString('en-IN')}
                </td>
              </tr>

              <!-- கம்ப்யூட்டர் இருப்பு -->
              <tr style="border-bottom: 1px solid #000;">
                <td colspan="2" style="border-right: 1px solid #000; padding: 4.5px 24px 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${toSearchableUnicode('கம்ப்யூட்டர் இருப்பு')}
                </td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${computerTotal.toLocaleString('en-IN')}
                </td>
              </tr>

              <!-- வேறுபாடு -->
              <tr>
                <td colspan="2" style="border-right: 1px solid #000; padding: 4.5px 24px 4.5px 10px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${toSearchableUnicode('வேறுபாடு')}
                </td>
                <td style="padding: 4.5px 16px; font-size: 12pt; font-weight: 800; text-align: right;">
                  ${diff.toLocaleString('en-IN')}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Divider line -->
          <div style="border-top: 1.5px solid #000;"></div>

          <!-- Contact Footer Inside Main Box -->
          <div style="padding: 7px 12px; text-align: center;">
            <div style="font-size: 12pt; font-weight: 800; color: #000; margin-bottom: 2px;">
              ${toSearchableUnicode('எங்களை தொடர்புகொள்ள')}
            </div>
            <div style="font-size: 13pt; font-weight: 900; letter-spacing: 0.5px; color: #000;">
              (+91 9865607179)
            </div>
          </div>
        </div>

        <!-- Bottom Separate Summary Box -->
        <div style="margin-top: 22px; border: 2px solid #000; box-sizing: border-box; text-align: center; background: #fff; width: 100%;">
          <div style="padding: 8px 12px; font-size: 14pt; font-weight: 900; border-bottom: 1.5px solid #000; color: #000;">
            ${toSearchableUnicode('மொய் செய்தவர்கள் எண்ணிக்கை : ' + contributorCount)}
          </div>
          <div style="padding: 8px 12px; font-size: 14.5pt; font-weight: 900; color: #000;">
            ${toSearchableUnicode('மொய் வரவு : ரூ. ' + computerTotal.toLocaleString('en-IN'))}
          </div>
        </div>
      </div>
    `;
  }

  // Live Recalculate Cash Denominations
  window.appRecalculateDenominations = function () {
    const c500 = parseInt(document.getElementById('denom-cnt-500')?.value, 10) || 0;
    const c200 = parseInt(document.getElementById('denom-cnt-200')?.value, 10) || 0;
    const c100 = parseInt(document.getElementById('denom-cnt-100')?.value, 10) || 0;
    const c50  = parseInt(document.getElementById('denom-cnt-50')?.value, 10) || 0;
    const c20  = parseInt(document.getElementById('denom-cnt-20')?.value, 10) || 0;
    const c10  = parseInt(document.getElementById('denom-cnt-10')?.value, 10) || 0;
    const c1   = parseInt(document.getElementById('denom-cnt-1')?.value, 10) || 0;

    const a500 = c500 * 500;
    const a200 = c200 * 200;
    const a100 = c100 * 100;
    const a50  = c50 * 50;
    const a20  = c20 * 20;
    const a10  = c10 * 10;
    const a1   = c1 * 1;

    const setRowAmt = (id, amt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '₹' + amt.toLocaleString('en-IN');
    };

    setRowAmt('denom-row-amt-500', a500);
    setRowAmt('denom-row-amt-200', a200);
    setRowAmt('denom-row-amt-100', a100);
    setRowAmt('denom-row-amt-50', a50);
    setRowAmt('denom-row-amt-20', a20);
    setRowAmt('denom-row-amt-10', a10);
    setRowAmt('denom-row-amt-1', a1);

    const cashInHand = a500 + a200 + a100 + a50 + a20 + a10 + a1;
    const gpay = parseFloat(document.getElementById('denom-input-gpay')?.value) || 0;
    const hostCash = parseFloat(document.getElementById('denom-input-hostcash')?.value) || 0;
    const totalInHand = cashInHand + gpay + hostCash;

    const allReceipts = state.receipts.filter(r => !state.activeEventId || r.eventId === state.activeEventId);
    const computerTotal = allReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const diff = totalInHand - computerTotal;

    const elCash = document.getElementById('denom-calc-cash-in-hand');
    if (elCash) elCash.textContent = '₹' + cashInHand.toLocaleString('en-IN');

    const elTotal = document.getElementById('denom-calc-total-in-hand');
    if (elTotal) elTotal.textContent = '₹' + totalInHand.toLocaleString('en-IN');

    const elComp = document.getElementById('denom-calc-computer-total');
    if (elComp) elComp.textContent = '₹' + computerTotal.toLocaleString('en-IN');

    const diffEl = document.getElementById('denom-calc-diff');
    if (diffEl) {
      if (diff === 0) {
        diffEl.textContent = '₹0 (Matched)';
        diffEl.className = 'font-black font-mono text-base text-emerald-400';
      } else if (diff > 0) {
        diffEl.textContent = '+₹' + diff.toLocaleString('en-IN') + ' (Excess)';
        diffEl.className = 'font-black font-mono text-base text-amber-400';
      } else {
        diffEl.textContent = '-₹' + Math.abs(diff).toLocaleString('en-IN') + ' (Shortage)';
        diffEl.className = 'font-black font-mono text-base text-rose-400';
      }
    }
  };

  // Save Cash Denomination Report for Active Event
  window.appSaveDenominationReport = async function () {
    const activeKey = state.activeEventId || 'default';
    const c500 = parseInt(document.getElementById('denom-cnt-500')?.value, 10) || 0;
    const c200 = parseInt(document.getElementById('denom-cnt-200')?.value, 10) || 0;
    const c100 = parseInt(document.getElementById('denom-cnt-100')?.value, 10) || 0;
    const c50  = parseInt(document.getElementById('denom-cnt-50')?.value, 10) || 0;
    const c20  = parseInt(document.getElementById('denom-cnt-20')?.value, 10) || 0;
    const c10  = parseInt(document.getElementById('denom-cnt-10')?.value, 10) || 0;
    const c1   = parseInt(document.getElementById('denom-cnt-1')?.value, 10) || 0;

    const gpay = parseFloat(document.getElementById('denom-input-gpay')?.value) || 0;
    const hostCash = parseFloat(document.getElementById('denom-input-hostcash')?.value) || 0;

    if (!state.eventDenominations) state.eventDenominations = {};
    state.eventDenominations[activeKey] = {
      c500, c200, c100, c50, c20, c10, c1,
      gpay, hostCash,
      savedAt: new Date().toISOString()
    };

    localStorage.setItem('aathi_event_denominations', JSON.stringify(state.eventDenominations));
    await saveDb();

    const badge = document.getElementById('denom-saved-badge');
    if (badge) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      badge.innerHTML = `<span class="text-emerald-400 font-bold flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5 inline"></i> Saved: ${timeStr}</span>`;
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    if (typeof window.showToast === 'function') {
      window.showToast('✓ Cash Denomination Report saved successfully!', 'success');
    } else {
      alert('✓ Cash Denomination Report saved successfully!');
    }
  };

  // ==========================================
  // Universal High-Speed Searchable Native PDF Generator & Direct Downloader
  // Supports native Windows "Save As" file picker dialog window
  // ==========================================
  async function downloadOrPrintPdf({ html, filename, fallbackPrintFn }) {
    const cleanFilename = (filename || 'Report').replace(/[\\/:*?"<>|]/g, '_').trim();
    const suggestedFileName = cleanFilename.toLowerCase().endsWith('.pdf') ? cleanFilename : `${cleanFilename}.pdf`;

    // Ensure print area is completely hidden and empty so no preview is shown below the panel
    const printArea = document.getElementById('a4-report-print-area');
    if (printArea) {
      printArea.classList.add('hidden');
      printArea.innerHTML = '';
    }

    // 1. Popup native "Save As" window to choose file location
    let fileHandle = null;
    if ('showSaveFilePicker' in window) {
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: suggestedFileName,
          types: [{
            description: 'PDF Document (*.pdf)',
            accept: { 'application/pdf': ['.pdf'] }
          }]
        });
      } catch (pickerErr) {
        if (pickerErr.name === 'AbortError') {
          if (typeof window.showToast === 'function') {
            window.showToast('Download cancelled by user.', 'info');
          }
          return false;
        }
        console.warn('showSaveFilePicker notice:', pickerErr);
        fileHandle = null;
      }
    }

    if (typeof window.showToast === 'function') {
      window.showToast('Generating 100% searchable Tamil PDF...', 'info');
    }

    try {
      const resp = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, filename: cleanFilename })
      });
      if (!resp.ok) {
        throw new Error(`Server returned status ${resp.status}`);
      }
      const blob = await resp.blob();

      // If user selected location via "Save As" window, write directly
      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        if (typeof window.showToast === 'function') {
          window.showToast(`✓ File saved successfully as "${fileHandle.name || suggestedFileName}"`, 'success');
        }
        return true;
      }

      // Fallback: Anchor download
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = suggestedFileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(blobUrl);
      }, 1000);
      if (typeof window.showToast === 'function') {
        window.showToast('✓ PDF downloaded successfully! All Tamil text is findable in Adobe Acrobat.', 'success');
      }
      return true;
    } catch (err) {
      console.warn('Direct PDF generation failed, falling back to browser print:', err);
      if (typeof window.showToast === 'function') {
        window.showToast('Opening print dialog. Set Destination to "Save as PDF" for searchable text.', 'warning');
      }
      if (typeof fallbackPrintFn === 'function') {
        fallbackPrintFn();
      }
      return false;
    }
  }

  // Universal Helper to save Blobs with native "Save As" file picker popup window
  async function saveBlobWithSaveAsDialog(blob, defaultFileName, fileTypes = null) {
    if ('showSaveFilePicker' in window) {
      try {
        const pickerOptions = {
          suggestedName: defaultFileName
        };
        if (fileTypes && Array.isArray(fileTypes)) {
          pickerOptions.types = fileTypes;
        } else if (defaultFileName.toLowerCase().endsWith('.xls')) {
          pickerOptions.types = [{
            description: 'Excel Spreadsheet (*.xls)',
            accept: { 'application/vnd.ms-excel': ['.xls'] }
          }];
        } else if (defaultFileName.toLowerCase().endsWith('.csv')) {
          pickerOptions.types = [{
            description: 'CSV File (*.csv)',
            accept: { 'text/csv': ['.csv'] }
          }];
        } else if (defaultFileName.toLowerCase().endsWith('.pdf')) {
          pickerOptions.types = [{
            description: 'PDF Document (*.pdf)',
            accept: { 'application/pdf': ['.pdf'] }
          }];
        }
        const handle = await window.showSaveFilePicker(pickerOptions);
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        if (typeof window.showToast === 'function') {
          window.showToast(`✓ File saved successfully as "${handle.name || defaultFileName}"`, 'success');
        }
        return true;
      } catch (err) {
        if (err.name === 'AbortError') {
          if (typeof window.showToast === 'function') {
            window.showToast('Download cancelled by user.', 'info');
          }
          return false;
        }
        console.warn('showSaveFilePicker notice, falling back to download:', err);
      }
    }

    // Fallback: Anchor download
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', defaultFileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (typeof window.showToast === 'function') {
      window.showToast(`✓ File downloaded: ${defaultFileName}`, 'success');
    }
    return true;
  }

  // Print / Download Cash Denomination Report
  window.appPrintDenominationReport = function () {
    const activeEv = getActiveEvent() || { memberName: 'Aathi Moi', place: '-' };
    const allReceipts = state.receipts.filter(r => !state.activeEventId || r.eventId === state.activeEventId);
    const totalMoi = allReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const totalUpi = allReceipts.filter(r => r.mode === 'UPI' || r.mode === 'யூ.பி.ஐ').reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const allPayouts = state.payouts.filter(p => !state.activeEventId || p.eventId === state.activeEventId);
    const totalPayout = allPayouts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const activeKey = state.activeEventId || 'default';
    const saved = (state.eventDenominations && state.eventDenominations[activeKey]) || {};

    const c500 = document.getElementById('denom-cnt-500') ? (parseInt(document.getElementById('denom-cnt-500').value, 10) || 0) : (saved.c500 || 0);
    const c200 = document.getElementById('denom-cnt-200') ? (parseInt(document.getElementById('denom-cnt-200').value, 10) || 0) : (saved.c200 || 0);
    const c100 = document.getElementById('denom-cnt-100') ? (parseInt(document.getElementById('denom-cnt-100').value, 10) || 0) : (saved.c100 || 0);
    const c50  = document.getElementById('denom-cnt-50') ? (parseInt(document.getElementById('denom-cnt-50').value, 10) || 0) : (saved.c50 || 0);
    const c20  = document.getElementById('denom-cnt-20') ? (parseInt(document.getElementById('denom-cnt-20').value, 10) || 0) : (saved.c20 || 0);
    const c10  = document.getElementById('denom-cnt-10') ? (parseInt(document.getElementById('denom-cnt-10').value, 10) || 0) : (saved.c10 || 0);
    const c1   = document.getElementById('denom-cnt-1') ? (parseInt(document.getElementById('denom-cnt-1').value, 10) || 0) : (saved.c1 || 0);

    const gpay = document.getElementById('denom-input-gpay') ? (parseFloat(document.getElementById('denom-input-gpay').value) || 0) : (saved.gpay !== undefined ? saved.gpay : totalUpi);
    const hostCash = document.getElementById('denom-input-hostcash') ? (parseFloat(document.getElementById('denom-input-hostcash').value) || 0) : (totalPayout > 0 ? totalPayout : (saved.hostCash !== undefined ? saved.hostCash : 0));

    const html = buildDenominationReportHtml({
      activeEv,
      contributorCount: allReceipts.length,
      computerTotal: totalMoi,
      c500, c200, c100, c50, c20, c10, c1,
      gpay, hostCash
    });

    const printArea = document.getElementById('a4-report-print-area');

    const triggerPrint = () => {
      if (printArea) {
        printArea.classList.remove('hidden');
        printArea.innerHTML = html;
      }
      window.print();
      setTimeout(() => {
        if (printArea) {
          printArea.classList.add('hidden');
          printArea.innerHTML = '';
        }
      }, 1000);
    };

    const evFileTitle = [activeEv.displayName1, activeEv.memberName].filter(Boolean).join(' - ') || activeEv.eventName || 'Aathi_Moi_Report';
    downloadOrPrintPdf({
      html,
      filename: `${evFileTitle} - Cash Denomination`,
      fallbackPrintFn: triggerPrint
    });
  };

  window.appSaveReportPlaceNumbers = function () {

    if (!state.reportPlaceOrderMap) state.reportPlaceOrderMap = {};
    const inputs = document.querySelectorAll('.place-seq-input');
    inputs.forEach(inp => {
      const pl = inp.getAttribute('data-place');
      const val = parseInt(inp.value, 10);
      if (pl) {
        if (!isNaN(val) && val > 0) {
          state.reportPlaceOrderMap[pl] = val;
        } else {
          delete state.reportPlaceOrderMap[pl];
        }
      }
    });
    const storageKey = 'aathi_moi_place_seq_' + (state.activeEventId || 'all');
    localStorage.setItem(storageKey, JSON.stringify(state.reportPlaceOrderMap));
    if (typeof window.showToast === 'function') {
      window.showToast('✓ Saved place sequence numbers saved successfully! (ஊர் வரிசை எண்கள் சேமிக்கப்பட்டது)', 'success');
    } else {
      alert('✓ Saved place sequence numbers saved successfully! (ஊர் வரிசை எண்கள் சேமிக்கப்பட்டது)');
    }
    renderApp();
  };

  window.appResetReportPlaceNumbers = function () {
    state.reportPlaceOrderMap = {};
    const storageKey = 'aathi_moi_place_seq_' + (state.activeEventId || 'all');
    localStorage.removeItem(storageKey);
    renderApp();
  };

  window.appSaveNotePlaceNumbers = function () {
    if (!state.notePlaceOrderMap) state.notePlaceOrderMap = {};
    const inputs = document.querySelectorAll('.note-place-seq-input');
    inputs.forEach(inp => {
      const pl = inp.getAttribute('data-place');
      const val = parseInt(inp.value, 10);
      if (pl) {
        if (!isNaN(val) && val > 0) {
          state.notePlaceOrderMap[pl] = val;
        } else {
          delete state.notePlaceOrderMap[pl];
        }
      }
    });
    const storageKey = 'aathi_note_place_seq_' + (state.activeNoteEventId || 'all');
    localStorage.setItem(storageKey, JSON.stringify(state.notePlaceOrderMap));
    if (typeof window.showToast === 'function') {
      window.showToast('✓ Saved place sequence numbers saved successfully! (ஊர் வரிசை எண்கள் சேமிக்கப்பட்டது)', 'success');
    } else {
      alert('✓ Saved place sequence numbers saved successfully! (ஊர் வரிசை எண்கள் சேமிக்கப்பட்டது)');
    }
    renderApp();
  };

  window.appResetNotePlaceNumbers = function () {
    state.notePlaceOrderMap = {};
    const storageKey = 'aathi_note_place_seq_' + (state.activeNoteEventId || 'all');
    localStorage.removeItem(storageKey);
    renderApp();
  };

  // Date format helper: DD-MM-YYYY (date - month - year)
  function formatDateDMY(dateStr) {
    if (!dateStr) return '-';
    const str = String(dateStr).trim();
    if (!str || str === '-') return '-';
    if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const parts = str.split('-');
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
    return str;
  }

  // Theme Management
  function initTheme() {
    const savedTheme = localStorage.getItem('aathi_moi_theme') || 'dark';
    applyTheme(savedTheme);
  }

  function applyTheme(theme) {
    state.currentTheme = theme;
    localStorage.setItem('aathi_moi_theme', theme);
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.body.classList.remove('light-theme');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateThemeButtons();
  }

  function updateThemeButtons() {
    const current = state.currentTheme || 'dark';
    const isLight = current === 'light';
    const label = isLight ? 'Light Theme' : 'Dark Theme';
    
    document.querySelectorAll('.theme-toggle-label').forEach(el => el.textContent = label);
    document.querySelectorAll('.theme-icon-sun').forEach(el => {
      if (isLight) el.classList.remove('hidden'); else el.classList.add('hidden');
    });
    document.querySelectorAll('.theme-icon-moon').forEach(el => {
      if (isLight) el.classList.add('hidden'); else el.classList.remove('hidden');
    });
  }

  window.appToggleTheme = function () {
    const nextTheme = state.currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
  };

  // Helper API functions
  async function fetchDb() {
    try {
      const res = await fetch('/api/db');
      if (res.ok) {
        const data = await res.json();
        state.events = data.events || [];
        state.receipts = data.receipts || [];
        state.members = data.members || [];
        state.payouts = data.payouts || [];
        state.users = data.users || [];
        state.noteEvents = data.noteEvents || [];
        state.noteEntries = data.noteEntries || [];
        if (data.eventDenominations) {
          state.eventDenominations = { ...(state.eventDenominations || {}), ...data.eventDenominations };
        }
      } else {
        throw new Error('Local API unavailable');
      }
    } catch (e) {
      // GitHub Pages / Static Hosting localStorage fallback
      const localDb = localStorage.getItem('aathi_moi_db');
      if (localDb) {
        try {
          const data = JSON.parse(localDb);
          state.events = data.events || [];
          state.receipts = data.receipts || [];
          state.members = data.members || [];
          state.payouts = data.payouts || [];
          state.users = data.users || [];
          state.noteEvents = data.noteEvents || [];
          state.noteEntries = data.noteEntries || [];
          if (data.eventDenominations) {
            state.eventDenominations = { ...(state.eventDenominations || {}), ...data.eventDenominations };
          }
        } catch (err) {}
      }
    }

    // Auto-migrate/populate member registry from existing receipts if empty
    if ((!state.members || state.members.length === 0) && state.receipts && state.receipts.length > 0) {
      state.members = [];
      state.receipts.forEach(r => upsertMemberRecord(r));
    }

    if (!state.users || state.users.length === 0) {
      state.users = [{ id: 'usr_admin', username: 'admin', password: '1234', role: 'admin' }];
    }

    // Auto-select first event if none active
    if (!state.activeEventId && state.events.length > 0) {
      state.activeEventId = state.events[0].id;
    }

    // Auto-select first note event if none active
    if (!state.activeNoteEventId && state.noteEvents.length > 0) {
      state.activeNoteEventId = state.noteEvents[0].id;
    }
  }

  // Persistent Member Details Registry (Upsert member profile)
  function upsertMemberRecord(mem) {
    if (!mem) return;
    if (!state.members) state.members = [];
    const phone = String(mem.mobile || mem.phone || '').trim();
    const phoneDigits = phone.replace(/\D/g, '');
    const name = String(mem.name || '').trim();
    const place = String(mem.place || '').trim();
    if (!phone && !name && !place) return;

    let existingIndex = -1;
    if (phoneDigits && phoneDigits.length >= 10) {
      const last10 = phoneDigits.slice(-10);
      existingIndex = state.members.findIndex(m => {
        const mDigits = String(m.mobile || m.phone || '').replace(/\D/g, '');
        return mDigits && mDigits.slice(-10) === last10;
      });
    } else if (name && place) {
      existingIndex = state.members.findIndex(m => {
        return (m.name || '').trim().toLowerCase() === name.toLowerCase() &&
               (m.place || '').trim().toLowerCase() === place.toLowerCase();
      });
    }

    const record = {
      id: existingIndex >= 0 ? state.members[existingIndex].id : ('mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
      mobile: phone || (existingIndex >= 0 ? state.members[existingIndex].mobile : ''),
      initial: mem.initial !== undefined ? mem.initial : (existingIndex >= 0 ? state.members[existingIndex].initial : ''),
      name: name || (existingIndex >= 0 ? state.members[existingIndex].name : ''),
      job: mem.job !== undefined ? mem.job : (existingIndex >= 0 ? state.members[existingIndex].job : ''),
      name1: mem.name1 !== undefined ? mem.name1 : (existingIndex >= 0 ? state.members[existingIndex].name1 : ''),
      relationship: mem.relationship !== undefined ? mem.relationship : (existingIndex >= 0 ? state.members[existingIndex].relationship : ''),
      place: place || (existingIndex >= 0 ? state.members[existingIndex].place : ''),
      eventName: mem.eventName || (existingIndex >= 0 ? state.members[existingIndex].eventName : ''),
      lastUpdated: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      state.members[existingIndex] = { ...state.members[existingIndex], ...record };
    } else {
      state.members.push(record);
    }
  }

  async function saveDb() {
    const payload = {
      events: state.events,
      receipts: state.receipts,
      members: state.members || [],
      payouts: state.payouts,
      users: state.users,
      noteEvents: state.noteEvents || [],
      noteEntries: state.noteEntries || [],
      eventDenominations: state.eventDenominations || {}
    };

    // Always save to localStorage for instant offline & GitHub Pages support
    localStorage.setItem('aathi_moi_db', JSON.stringify(payload));
    localStorage.setItem('aathi_event_denominations', JSON.stringify(state.eventDenominations || {}));

    try {
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('Saved to local storage fallback', e);
    }
  }

  async function savePayoutFileToDrive(eventName, payoutData) {
    try {
      await fetch('/api/payouts/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName, payoutData })
      });
    } catch (e) {
      console.warn('Local payout file save notice:', e);
    }
  }

  // Google Apps Script Drive Backup Sync Configuration (aadhikeservice@gmail.com)
  function getGasUrl() {
    return localStorage.getItem('aathi_moi_gas_url') || '';
  }

  function setGasUrl(url) {
    if (url) {
      localStorage.setItem('aathi_moi_gas_url', url.trim());
    }
  }

  async function syncToGas(action, payload) {
    const gasUrl = getGasUrl();
    if (!gasUrl) {
      console.log(`GAS Web App URL not configured. (Action: ${action})`);
      return;
    }

    try {
      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: action,
          ...payload
        })
      });
      console.log(`Google Drive Sync (${action}) sent successfully.`);
    } catch (err) {
      console.warn(`Google Drive Sync (${action}) notice:`, err);
    }
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  window.appSyncAllToDrive = async function () {
    const gasUrl = getGasUrl();
    if (!gasUrl) {
      if (typeof window.showToast === 'function') {
        window.showToast('Please configure Google Apps Script Web App URL in Cloud Settings', 'error');
      } else {
        alert('Please configure Google Apps Script Web App URL in Cloud Settings');
      }
      window.appOpenGasSettingsModal();
      return;
    }

    const btn = document.getElementById('btn-sync-drive');
    const originalContent = btn ? btn.innerHTML : '';

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-emerald-400"></i><span class="hidden sm:inline">Scanning Local...</span>`;
        if (window.lucide) lucide.createIcons();
      }

      // 1. Fetch latest DB to trigger scanBackupFolder() on server
      await fetchDb();

      // Refresh UI if available
      if (typeof renderCurrentPanel === 'function') {
        renderCurrentPanel();
      }

      const totalEvents = state.events ? state.events.length : 0;
      const totalReceipts = state.receipts ? state.receipts.length : 0;
      const totalPayouts = state.payouts ? state.payouts.length : 0;
      const totalNoteEvents = state.noteEvents ? state.noteEvents.length : 0;
      const totalNoteEntries = state.noteEntries ? state.noteEntries.length : 0;
      const totalItems = totalEvents + totalReceipts + totalPayouts + totalNoteEvents + totalNoteEntries;

      if (totalItems === 0) {
        if (typeof window.showToast === 'function') {
          window.showToast('No entries found to sync to Drive.', 'info');
        } else {
          alert('No entries found to sync to Drive.');
        }
        return;
      }

      // 2. Sync Events
      if (state.events && state.events.length > 0) {
        for (let i = 0; i < state.events.length; i++) {
          if (btn) {
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-emerald-400"></i><span class="hidden sm:inline">Sync Event ${i + 1}/${state.events.length}...</span>`;
            if (window.lucide) lucide.createIcons();
          }
          await syncToGas('createEvent', { event: state.events[i] });
          await delay(250);
        }
      }

      // 3. Sync Receipts (Creates HTML file in Drive & Appends row in Sheets)
      if (state.receipts && state.receipts.length > 0) {
        for (let j = 0; j < state.receipts.length; j++) {
          if (btn) {
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-emerald-400"></i><span class="hidden sm:inline">Sync Receipt ${j + 1}/${state.receipts.length}...</span>`;
            if (window.lucide) lucide.createIcons();
          }
          await syncToGas('saveReceipt', { receipt: state.receipts[j] });
          await delay(250);
        }
      }

      // 4. Sync Payouts
      if (state.payouts && state.payouts.length > 0) {
        for (let k = 0; k < state.payouts.length; k++) {
          if (btn) {
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-emerald-400"></i><span class="hidden sm:inline">Sync Payout ${k + 1}/${state.payouts.length}...</span>`;
            if (window.lucide) lucide.createIcons();
          }
          await syncToGas('savePayout', { payout: state.payouts[k] });
          await delay(250);
        }
      }

      // 5. Sync Note Events
      if (state.noteEvents && state.noteEvents.length > 0) {
        for (let m = 0; m < state.noteEvents.length; m++) {
          if (btn) {
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-emerald-400"></i><span class="hidden sm:inline">Sync Note Event ${m + 1}/${state.noteEvents.length}...</span>`;
            if (window.lucide) lucide.createIcons();
          }
          await syncToGas('createNoteEvent', { noteEvent: state.noteEvents[m] });
          await delay(250);
        }
      }

      // 6. Sync Note Entries
      if (state.noteEntries && state.noteEntries.length > 0) {
        for (let n = 0; n < state.noteEntries.length; n++) {
          if (btn) {
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-emerald-400"></i><span class="hidden sm:inline">Sync Note Entry ${n + 1}/${state.noteEntries.length}...</span>`;
            if (window.lucide) lucide.createIcons();
          }
          const ne = state.noteEntries[n];
          const activeNev = state.noteEvents.find(ev => ev.id === ne.noteEventId);
          const nevName = activeNev ? activeNev.name : 'General';
          await saveNoteEntryFileToDrive(nevName, ne);
          await delay(250);
        }
      }

      if (typeof window.showToast === 'function') {
        window.showToast(`Successfully synced ${totalItems} item(s) to Google Drive & Sheets!`, 'success');
      } else {
        alert(`Successfully synced ${totalItems} item(s) to Google Drive & Sheets!`);
      }
    } catch (err) {
      console.error('Error during Google Drive sync:', err);
      if (typeof window.showToast === 'function') {
        window.showToast('Sync completed with warnings or offline status.', 'warning');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalContent;
        if (window.lucide) lucide.createIcons();
      }
    }
  };

  window.appOpenTamilDictModal = function () {
    let modalEl = document.getElementById('tamil-dict-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'tamil-dict-modal';
      modalEl.className = 'modal-overlay z-50';
      document.body.appendChild(modalEl);
    }

    renderTamilDictModalContent(modalEl);
  };

  function renderTamilDictModalContent(modalEl) {
    modalEl.classList.remove('hidden');
    const allWords = window.TamilTransliterate ? window.TamilTransliterate.getAllDictionaryWords() : [];

    modalEl.innerHTML = `
      <div class="glass-card w-full max-w-2xl p-6 relative overflow-hidden shadow-2xl border border-amber-500/40 max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-700/50">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl crimson-gradient-bg border border-amber-500/30 flex items-center justify-center text-amber-300">
              <i data-lucide="book-open" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-lg font-bold text-amber-300">Google Tamil Dictionary (தமிழ் அகராதி)</h3>
              <p class="text-xs text-slate-400">Add, Search, or Edit Custom Tamil Transliteration Mappings</p>
            </div>
          </div>
          <button onclick="document.getElementById('tamil-dict-modal').classList.add('hidden')" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Add New Word Form -->
        <form id="add-tamil-word-form" class="bg-slate-900/90 p-4 rounded-xl border border-amber-500/30 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">English Word / Spelled *</label>
            <input type="text" id="dict-input-en" class="input-styled text-xs" placeholder="e.g. perumu" required autocomplete="off">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Tamil Translation *</label>
            <input type="text" id="dict-input-ta" class="input-styled text-xs font-bold text-amber-300" placeholder="e.g. பெருமு" required autocomplete="off">
          </div>
          <div>
            <button type="submit" class="gold-button w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-2">
              <i data-lucide="plus-circle" class="w-4 h-4"></i>
              <span>Add Word</span>
            </button>
          </div>
        </form>

        <!-- Search Box -->
        <div class="mb-3">
          <input type="text" id="dict-search-input" onkeyup="window.appFilterTamilDictWords()" class="input-styled text-xs" placeholder="🔍 Search dictionary words (English or Tamil)...">
        </div>

        <!-- Word List Table -->
        <div class="overflow-y-auto flex-1 max-h-[300px] border border-slate-800 rounded-xl bg-slate-950/60">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-900 text-amber-400 font-bold sticky top-0 border-b border-slate-800">
              <tr>
                <th class="px-4 py-2.5">English (Type)</th>
                <th class="px-4 py-2.5">Tamil Output</th>
                <th class="px-4 py-2.5">Type</th>
                <th class="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody id="tamil-dict-table-body" class="divide-y divide-slate-800/60">
              ${renderDictTableRows(allWords)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    document.getElementById('add-tamil-word-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const en = document.getElementById('dict-input-en').value;
      const ta = document.getElementById('dict-input-ta').value;
      if (window.TamilTransliterate && window.TamilTransliterate.addCustomWord(en, ta)) {
        if (typeof window.showToast === 'function') {
          window.showToast(`Added word: ${en} ➔ ${ta}`, 'success');
        } else {
          alert(`Added word: ${en} ➔ ${ta}`);
        }
        renderTamilDictModalContent(modalEl);
      }
    });
  }

  function renderDictTableRows(words) {
    if (!words || words.length === 0) {
      return `<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500">No dictionary words found.</td></tr>`;
    }
    return words.map(w => `
      <tr class="hover:bg-slate-900/50 dict-row" data-en="${w.en.toLowerCase()}" data-ta="${w.ta}">
        <td class="px-4 py-2 font-mono text-slate-200">${w.en}</td>
        <td class="px-4 py-2 font-bold text-amber-300 text-sm">${w.ta}</td>
        <td class="px-4 py-2">
          ${w.isCustom ? '<span class="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 font-bold rounded">CUSTOM</span>' : '<span class="px-2 py-0.5 text-[10px] bg-slate-800 text-slate-400 rounded">SYSTEM</span>'}
        </td>
        <td class="px-4 py-2 text-right">
          ${w.isCustom ? `
            <button type="button" onclick="window.appRemoveTamilDictWord('${w.en}')" class="text-rose-400 hover:text-rose-300 font-bold px-2.5 py-1 bg-rose-950/40 rounded border border-rose-800/40 text-[11px] cursor-pointer">Delete</button>
          ` : `<span class="text-slate-600 text-[10px]">Built-in</span>`}
        </td>
      </tr>
    `).join('');
  }

  window.appFilterTamilDictWords = function () {
    const q = (document.getElementById('dict-search-input')?.value || '').toLowerCase().trim();
    const rows = document.querySelectorAll('.dict-row');
    rows.forEach(r => {
      const en = r.getAttribute('data-en') || '';
      const ta = r.getAttribute('data-ta') || '';
      if (!q || en.includes(q) || ta.includes(q)) {
        r.classList.remove('hidden');
      } else {
        r.classList.add('hidden');
      }
    });
  };

  window.appRemoveTamilDictWord = function (en) {
    if (confirm(`Remove custom Tamil dictionary mapping for "${en}"?`)) {
      if (window.TamilTransliterate && window.TamilTransliterate.removeCustomWord(en)) {
        const modalEl = document.getElementById('tamil-dict-modal');
        if (modalEl) renderTamilDictModalContent(modalEl);
      }
    }
  };

  window.appOpenGasSettingsModal = function () {
    let modalEl = document.getElementById('gas-settings-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'gas-settings-modal';
      modalEl.className = 'modal-overlay z-50';
      document.body.appendChild(modalEl);
    }

    const currentUrl = getGasUrl();

    modalEl.innerHTML = `
      <div class="glass-card w-full max-w-lg p-6 relative overflow-hidden shadow-2xl border border-amber-500/40">
        <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-700/50">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl crimson-gradient-bg border border-amber-500/30 flex items-center justify-center text-amber-300">
              <i data-lucide="cloud" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-lg font-bold text-amber-300">Google Drive Backup Settings</h3>
              <p class="text-xs text-slate-400">Google Apps Script Web App URL (aadhikeservice@gmail.com)</p>
            </div>
          </div>
          <button onclick="document.getElementById('gas-settings-modal').classList.add('hidden')" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="gas-url-form" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Google Apps Script Web App URL</label>
            <input type="url" id="gas-url-input" class="input-styled text-xs font-mono" value="${currentUrl}" placeholder="https://script.google.com/macros/s/.../exec" required>
            <p class="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              When saving a receipt in Moi Entry, it is automatically saved to Google Drive (<em>aadhikeservice@gmail.com</em>) under <strong>moi ➔ Backup ➔ &lt;Event Master&gt; ➔ &lt;User&gt; ➔ &lt;Bill No&gt;.html</strong>.
            </p>
          </div>

          <div class="pt-2 flex items-center space-x-3">
            <button type="submit" class="gold-button flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-2">
              <i data-lucide="save" class="w-4 h-4"></i>
              <span>Save & Enable Drive Backup</span>
            </button>
          </div>
        </form>
      </div>
    `;

    modalEl.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();

    document.getElementById('gas-url-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const newUrl = document.getElementById('gas-url-input').value.trim();
      setGasUrl(newUrl);
      alert('Google Drive Backup Web App URL saved successfully!');
      modalEl.classList.add('hidden');
    });
  };

  async function createDriveFolder(eventData) {
    try {
      const payload = typeof eventData === 'object' ? {
        eventName: eventData.memberName,
        displayName1: eventData.displayName1,
        memberName: eventData.memberName
      } : { eventName: eventData };
      await fetch('/api/events/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('Local drive folder creation notice', e);
    }

    // Sync event folder to Google Apps Script
    await syncToGas('createEvent', { event: typeof eventData === 'object' ? eventData : { memberName: eventData } });
  }

  async function saveReceiptFileToDrive(eventName, receiptData) {
    let savedLocally = false;
    try {
      const res = await fetch('/api/receipts/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName, receiptData })
      });
      if (res.ok) {
        savedLocally = true;
      }
    } catch (e) {
      console.warn('Local Node API unavailable:', e);
    }

    const ev = state.events.find(e => e.id === receiptData.eventId);
    const majorName = receiptData.displayName1 || (ev ? ev.displayName1 : '') || receiptData.memberName || (ev ? ev.memberName : '') || eventName || 'Event';
    const name1 = receiptData.displayName1 ? (receiptData.memberName || (ev ? ev.memberName : '')) : '';

    const receiptHtml = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
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
    <div class="subtitle">கருணாக்கமுத்தன்பட்டி 📞 (+91 9865607179)</div>
    <div class="row"><span class="bold">ரசீது எண்:</span> <span>#${receiptData.billNo}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${receiptData.date || ''} ${receiptData.time || ''}</span></div>
    <div class="row"><span class="bold">உறுப்பினர் பெயர்:</span> <span>${majorName}</span></div>
    ${name1 ? `<div class="row"><span class="bold">உறுப்பினர் பெயர் 1:</span> <span>${name1}</span></div>` : ''}
    <div class="row"><span class="bold">பெயர்:</span> <span>${receiptData.initial ? receiptData.initial + '. ' : ''}${receiptData.name || ''}${receiptData.name1 ? ' ' + receiptData.name1 : ''}${receiptData.job ? ' - ' + receiptData.job : ''}</span></div>
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

    // Sync receipt HTML & row to Google Apps Script (Google Drive)
    await syncToGas('saveReceipt', { eventName: majorName, receipt: receiptData, receiptHtml });
  }

  // Visible Events Helper (Strictly filter assigned event for non-admin users)
  function getVisibleEvents() {
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    if (isAdmin) {
      return state.events || [];
    }
    if (state.currentUser && state.currentUser.assignedEventId) {
      return (state.events || []).filter(e => e.id === state.currentUser.assignedEventId);
    }
    return [];
  }

  // Active Event Helper
  function getActiveEvent() {
    if (state.currentUser && state.currentUser.role !== 'admin') {
      if (state.currentUser.assignedEventId) {
        state.activeEventId = state.currentUser.assignedEventId;
      } else {
        return null;
      }
    }
    return state.events.find(e => e.id === state.activeEventId) || null;
  }

  // Bill Number Generator per Event & User (starts at AM0001 or user's set bill no)
  function getNextBillNoForEvent(eventId) {
    if (!eventId) return 'AM0001';

    let userObj = null;
    if (state.currentUser) {
      userObj = state.users.find(u => u.username.toLowerCase() === state.currentUser.username.toLowerCase());
    }

    if (userObj && userObj.startingBillNo && !isNaN(parseInt(userObj.startingBillNo, 10))) {
      const startNum = parseInt(userObj.startingBillNo, 10);
      const userReceipts = state.receipts.filter(r => r.eventId === eventId && (r.createdBy === userObj.username || (!r.createdBy && userObj.role === 'admin')));
      const nextNum = startNum + userReceipts.length;
      return 'AM' + String(nextNum).padStart(4, '0');
    }

    const eventReceipts = state.receipts.filter(r => r.eventId === eventId);
    const nextCount = eventReceipts.length + 1;
    return 'AM' + String(nextCount).padStart(4, '0');
  }

  // License Activation Modal Handler
  window.appOpenActivationModal = function (isMandatory = false) {
    let modalEl = document.getElementById('activation-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'activation-modal';
      modalEl.className = 'modal-overlay z-[100]';
      document.body.appendChild(modalEl);
    }

    const isActivated = window.ActivationSystem ? window.ActivationSystem.isActivated() : false;
    const license = window.ActivationSystem ? window.ActivationSystem.getLicense() : null;

    modalEl.innerHTML = `
      <div class="glass-card w-full max-w-lg p-6 relative overflow-hidden shadow-2xl border border-amber-500/50 bg-slate-950/95">
        <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-700/50">
          <div class="flex items-center space-x-3">
            <div class="w-12 h-12 rounded-xl crimson-gradient-bg border border-amber-500/40 flex items-center justify-center font-bold text-2xl text-amber-300 shadow-lg">
              ஆ
            </div>
            <div>
              <h3 class="text-xl font-extrabold text-amber-300 gold-gradient-text">ஆதி மொய் (Aathi Moi)</h3>
              <p class="text-xs text-slate-300 font-medium">Software License & Online Activation</p>
            </div>
          </div>
          ${!isMandatory && isActivated ? `
            <button onclick="document.getElementById('activation-modal').classList.add('hidden')" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          ` : ''}
        </div>

        ${isActivated ? `
          <div class="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-4 text-xs space-y-2 mb-4">
            <div class="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
              <i data-lucide="check-circle-2" class="w-5 h-5"></i>
              <span>Software Activated & Offline Ready!</span>
            </div>
            <p class="text-slate-300">License Key: <strong class="font-mono text-amber-300">${license ? license.key : 'ACTIVATED'}</strong></p>
            <p class="text-slate-400">Machine ID: <span class="font-mono text-slate-200">${license ? license.machineId : '-'}</span></p>
            <p class="text-emerald-300 font-semibold">Mode: 100% Perpetual Offline Desktop License</p>
          </div>

          <div class="flex justify-end space-x-3">
            <button type="button" onclick="if(confirm('Deactivate software on this computer?')){ window.ActivationSystem.deactivate(); location.reload(); }" class="px-4 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-700/50 text-rose-300 text-xs font-bold transition cursor-pointer">
              Deactivate License
            </button>
            <button type="button" onclick="document.getElementById('activation-modal').classList.add('hidden')" class="gold-button px-5 py-2 rounded-xl text-xs font-bold cursor-pointer">
              Close
            </button>
          </div>
        ` : `
          <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-200 mb-4 flex items-start space-x-3">
            <i data-lucide="wifi" class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5"></i>
            <div>
              <strong class="font-bold text-amber-300">Online Activation Required (First Time Only)</strong>
              <p class="mt-1 text-slate-300 text-[11.5px] leading-relaxed">
                Connect to the internet once to activate your license. After activation, <strong>ஆதி மொய்</strong> will work 100% offline permanently on this computer!
              </p>
            </div>
          </div>

          <form id="activation-form" class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-200 mb-1">Enter Activation Key / உரிம சாவி *</label>
              <input type="text" id="activation-key-input" class="input-styled text-sm font-mono tracking-wider font-bold text-amber-300 uppercase" placeholder="Enter key (or leave default)" required autocomplete="off">
            </div>

            <div id="activation-error-msg" class="text-xs text-rose-400 font-semibold hidden"></div>

            <button type="submit" id="btn-activate-submit" class="gold-button w-full py-3 rounded-xl font-extrabold text-sm flex items-center justify-center space-x-2 shadow-lg cursor-pointer">
              <i data-lucide="shield-check" class="w-5 h-5"></i>
              <span>Activate Software Now</span>
            </button>
          </form>
        `}
      </div>
    `;

    modalEl.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();

    document.getElementById('activation-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inputKey = document.getElementById('activation-key-input').value.trim();
      const errorEl = document.getElementById('activation-error-msg');
      const btn = document.getElementById('btn-activate-submit');

      try {
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i><span>Activating License...</span>`;
          if (window.lucide) lucide.createIcons();
        }
        if (errorEl) errorEl.classList.add('hidden');

        await window.ActivationSystem.activateOnline(inputKey);

        if (typeof window.showToast === 'function') {
          window.showToast('Software activated successfully! Ready for 100% offline usage.', 'success');
        } else {
          alert('Software activated successfully! Ready for 100% offline usage.');
        }

        modalEl.classList.add('hidden');
        renderApp();
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message || 'Activation failed!';
          errorEl.classList.remove('hidden');
        } else {
          alert(err.message || 'Activation failed!');
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `<i data-lucide="shield-check" class="w-5 h-5"></i><span>Activate Software Now</span>`;
          if (window.lucide) lucide.createIcons();
        }
      }
    });
  };

  // Init App
  document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await fetchDb();

    // Check License Activation First
    if (window.ActivationSystem && !window.ActivationSystem.isActivated()) {
      window.appOpenActivationModal(true);
    }

    // Check saved session
    const savedUser = localStorage.getItem('aathi_moi_user');
    if (savedUser) {
      try {
        state.currentUser = JSON.parse(savedUser);
        
        // If user has an assigned event, lock to it
        if (state.currentUser.role !== 'admin' && state.currentUser.assignedEventId) {
          state.activeEventId = state.currentUser.assignedEventId;
        }
        
        state.activePanel = 'dashboard';
      } catch (e) {}
    }

    renderApp();
    setupGlobalListeners();
  });

  function setupGlobalListeners() {
    // Navigation listeners
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.getAttribute('data-panel');
        if (panel) {
          switchPanel(panel);
        }
      });
    });

    document.getElementById('btn-logout')?.addEventListener('click', () => {
      state.currentUser = null;
      localStorage.removeItem('aathi_moi_user');
      switchPanel('login');
    });

    // Settings Dropdown Toggle & Click-Outside Handler
    const btnSettings = document.getElementById('btn-header-settings');
    const menuSettings = document.getElementById('header-settings-dropdown');
    btnSettings?.addEventListener('click', (e) => {
      e.stopPropagation();
      menuSettings?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (menuSettings && !menuSettings.contains(e.target) && e.target !== btnSettings) {
        menuSettings.classList.add('hidden');
      }
    });
  }

  function switchPanel(panelName) {
    // Restrict non-admin users from Event Master and Users Master
    if (state.currentUser && state.currentUser.role !== 'admin') {
      if (panelName === 'event-master' || panelName === 'users-master') {
        alert('Access Restricted: Only Admin can access Event Master and Users Master.');
        return;
      }
    }
    state.activePanel = panelName;
    if (panelName === 'event-master') {
      fetch('/api/events/sync-drive').then(r => r.json()).then(data => {
        if (data && data.success) {
          state.events = data.events || [];
          state.receipts = data.receipts || [];
          renderApp();
        }
      }).catch(() => {});
    }
    renderApp();
  }

  // Core Render Switch
  function renderApp() {
    const headerUserSec = document.getElementById('header-user-section');
    const sidebarNav = document.getElementById('sidebar-nav');
    const mainContent = document.getElementById('main-content');
    const navUsersMaster = document.getElementById('nav-users-master');
    const navEventMaster = document.getElementById('nav-event-master');

    if (!state.currentUser) {
      // Show Login Panel
      headerUserSec.classList.add('hidden');
      sidebarNav.classList.add('hidden');
      mainContent.innerHTML = renderLoginPanel();
      bindLoginEvents();
      return;
    }

    // Logged in UI
    headerUserSec.classList.remove('hidden');
    sidebarNav.classList.remove('hidden');
    sidebarNav.classList.add('flex');

    // Update Header badges
    document.getElementById('user-display-name').textContent = state.currentUser.username;
    document.getElementById('user-role-badge').textContent = state.currentUser.role.toUpperCase();

    const activeEv = getActiveEvent();
    const activeEvElem = document.getElementById('active-event-name');
    if (activeEvElem) {
      activeEvElem.textContent = state.currentUser.role === 'admin' ? '-' : (activeEv ? activeEv.memberName : 'No Event Selected');
    }

    // Show/hide Admin only menu items
    if (state.currentUser.role === 'admin') {
      navUsersMaster?.classList.remove('hidden');
      navEventMaster?.classList.remove('hidden');
    } else {
      navUsersMaster?.classList.add('hidden');
      navEventMaster?.classList.add('hidden');
    }

    // Highlight active nav item
    document.querySelectorAll('.nav-btn').forEach(btn => {
      if (btn.getAttribute('data-panel') === state.activePanel) {
        btn.classList.add('bg-amber-500/20', 'text-amber-300', 'border', 'border-amber-500/30');
      } else {
        btn.classList.remove('bg-amber-500/20', 'text-amber-300', 'border', 'border-amber-500/30');
      }
    });

    // Render Panel Content
    switch (state.activePanel) {
      case 'dashboard':
        mainContent.innerHTML = renderDashboardPanel();
        bindDashboardEvents();
        break;
      case 'event-master':
        if (state.currentUser.role !== 'admin') {
          mainContent.innerHTML = '<div class="p-6 text-rose-400 font-semibold">Access Restricted: Only Admin can access Event Master.</div>';
        } else {
          mainContent.innerHTML = renderEventMasterPanel();
          bindEventMasterEvents();
        }
        break;
      case 'users-master':
        if (state.currentUser.role !== 'admin') {
          mainContent.innerHTML = '<div class="p-6 text-rose-400 font-semibold">Access Restricted: Only Admin can access Users Master.</div>';
        } else {
          mainContent.innerHTML = renderUserMasterPanel();
          bindUserMasterEvents();
        }
        break;
      case 'moi-entry':
        mainContent.innerHTML = renderMoiEntryPanel();
        bindMoiEntryEvents();
        break;
      case 'receipt':
        mainContent.innerHTML = renderReceiptPanel();
        bindReceiptEvents();
        break;
      case 'payout':
        mainContent.innerHTML = renderPayoutPanel();
        bindPayoutEvents();
        break;
      case 'cash-denomination':
        mainContent.innerHTML = renderCashDenominationPanel();
        bindCashDenominationEvents();
        break;
      case 'report':
        mainContent.innerHTML = renderReportPanel();
        bindReportEvents();
        break;
      case 'note-entry':
        mainContent.innerHTML = renderNoteEntryPanel();
        bindNoteEntryEvents();
        break;
      case 'cloud-settings':
        mainContent.innerHTML = renderCloudSettingsPanel();
        bindCloudSettingsEvents();
        break;
      default:
        mainContent.innerHTML = renderDashboardPanel();
        bindDashboardEvents();
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Sync All Offline Data to Google Drive & Google Sheets
  window.appSyncAllToDrive = async function () {
    const gasUrl = getGasUrl();
    if (!gasUrl) {
      alert("Google Drive Backup Web App URL not configured!\n\nPlease click 'Cloud Settings' and paste your Google Apps Script Web App URL first.");
      window.appOpenGasSettingsModal();
      return;
    }

    if (!navigator.onLine) {
      alert("Offline Mode Notice:\n\nYour internet connection is currently offline. Please connect to the internet and click 'Sync Drive' again to upload your offline entries to Google Drive.");
      return;
    }

    const syncBtn = document.getElementById('btn-sync-drive');
    const originalContent = syncBtn ? syncBtn.innerHTML : '';

    const setSyncStatus = (msg) => {
      if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = `
          <i data-lucide="loader-2" class="w-4 h-4 text-emerald-400 animate-spin"></i>
          <span class="hidden sm:inline">${msg}</span>
        `;
        if (window.lucide) window.lucide.createIcons();
      }
    };

    setSyncStatus("Starting Sync...");

    try {
      const events = state.events || [];
      const receipts = state.receipts || [];
      const payouts = state.payouts || [];

      // 1. Sync Events first to ensure Google Drive folders exist
      for (let i = 0; i < events.length; i++) {
        setSyncStatus(`Syncing Event ${i + 1}/${events.length}...`);
        await syncToGas('createEvent', { event: events[i] });
      }

      // 2. Sync Receipts (creates rows in Sheets + HTML files in Drive)
      for (let j = 0; j < receipts.length; j++) {
        setSyncStatus(`Syncing Receipt ${j + 1}/${receipts.length}...`);
        const rcpt = receipts[j];
        const ev = events.find(e => e.id === rcpt.eventId);
        await syncToGas('saveReceipt', { receipt: rcpt });
        saveReceiptFileToDrive(ev ? ev.memberName : '', rcpt).catch(() => {});
      }

      // 3. Sync Payouts
      for (let k = 0; k < payouts.length; k++) {
        setSyncStatus(`Syncing Payout ${k + 1}/${payouts.length}...`);
        await syncToGas('savePayout', { payout: payouts[k] });
      }

      // Save database state
      await saveDb();

      alert(`✅ Google Drive Sync Completed Successfully!\n\nAll offline entries have been uploaded to Google Drive & Sheets:\n• ${events.length} Event Folder(s)\n• ${receipts.length} Saved Receipt File(s) (.html)\n• ${payouts.length} Payout Expense Entry(ies)\n\nGoogle Sheets and Google Drive folders (moi ➔ Backup) are up-to-date!`);
    } catch (err) {
      alert('Notice syncing to Google Drive: ' + err.message);
    } finally {
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = originalContent;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  };

  // ==========================================
  // CLOUD SETTINGS PANEL
  // ==========================================
  function renderCloudSettingsPanel() {
    const currentUrl = getGasUrl();
    return `
      <div class="max-w-4xl mx-auto space-y-6">
        <div class="glass-card p-6 border-l-4 border-amber-500">
          <div class="flex items-center space-x-4 mb-4 pb-4 border-b border-slate-800">
            <div class="w-12 h-12 rounded-xl crimson-gradient-bg border border-amber-500/30 flex items-center justify-center text-amber-300">
              <i data-lucide="cloud" class="w-6 h-6"></i>
            </div>
            <div>
              <h2 class="text-2xl font-extrabold gold-gradient-text">Google Drive Cloud Settings</h2>
              <p class="text-xs text-slate-400">Configure Google Apps Script Web App Backup Sync (aadhikeservice@gmail.com)</p>
            </div>
          </div>

          <form id="panel-gas-url-form" class="space-y-5">
            <div>
              <label class="block text-xs font-semibold text-amber-300 mb-2">Google Apps Script Web App URL *</label>
              <input type="url" id="panel-gas-url-input" class="input-styled font-mono text-xs" value="${currentUrl}" placeholder="https://script.google.com/macros/s/.../exec" required>
              <p class="text-xs text-slate-400 mt-2 leading-relaxed">
                When saving receipts in <strong>Moi Entry</strong>, formatted receipt files will automatically sync to Google Drive (<em>aadhikeservice@gmail.com</em>) under:
                <br>
                <code class="text-amber-400 font-mono text-[11px]">moi ➔ Backup ➔ &lt;Event Master&gt; ➔ &lt;User&gt; ➔ &lt;Bill No&gt;.html</code>
              </p>
            </div>

            <div class="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button type="submit" class="gold-button w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 shadow-lg">
                <i data-lucide="save" class="w-4 h-4"></i>
                <span>Save Google Drive URL</span>
              </button>

              <button type="button" onclick="window.appSyncAllToDrive()" class="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900 transition shadow-lg">
                <i data-lucide="refresh-cw" class="w-4 h-4 text-emerald-400"></i>
                <span>Sync Offline Data to Google Drive Now</span>
              </button>
            </div>
          </form>
        </div>

        <div class="glass-card p-6 space-y-3 border border-rose-500/30">
          <h3 class="text-lg font-bold text-rose-400 flex items-center space-x-2">
            <i data-lucide="trash-2" class="w-5 h-5 text-rose-400"></i>
            <span>Database Reset (Admin Only)</span>
          </h3>
          <p class="text-xs text-slate-400">Permanently clear all recorded Events, Receipts, Payouts, and Backup files.</p>
          <button type="button" onclick="window.appClearAllData()" class="px-5 py-2.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/40 text-xs font-bold transition flex items-center space-x-2 cursor-pointer">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-rose-400"></i>
            <span>Clear All Entered Data</span>
          </button>
        </div>

        <div class="glass-card p-6 space-y-3">
          <h3 class="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <i data-lucide="folder-tree" class="w-5 h-5 text-amber-400"></i>
            <span>Google Drive Hierarchy Structure</span>
          </h3>
          <div class="bg-slate-900/90 p-4 rounded-xl border border-slate-800 text-xs font-mono space-y-2 text-slate-300">
            <p class="text-amber-300 font-bold">📁 My Drive (Google Drive)</p>
            <p class="pl-4 text-amber-400">└── 📁 moi</p>
            <p class="pl-8 text-amber-400/90">└── 📁 Backup</p>
            <p class="pl-12 text-indigo-300">└── 📁 கார்த்திக் - பிரியா (Event Master Folder)</p>
            <p class="pl-16 text-emerald-300">└── 📁 user / admin (User Folder)</p>
            <p class="pl-20 text-rose-300">└── 📄 AM0001.html (Saved HTML Receipt File)</p>
          </div>
        </div>
      </div>
    `;
  }

  function bindCloudSettingsEvents() {
    document.getElementById('panel-gas-url-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const newUrl = document.getElementById('panel-gas-url-input').value.trim();
      setGasUrl(newUrl);
      alert('Google Drive Backup Web App URL saved successfully!');
      renderApp();
    });
  }

  window.appClearAllData = async function () {
    if (!state.currentUser || state.currentUser.role !== 'admin') {
      alert('Access Restricted: Only Admin can clear all database data!');
      return;
    }

    if (confirm('DANGER WARNING: Are you sure you want to CLEAR ALL ENTERED DATA?\n\nThis will permanently delete:\n- All Events\n- All Moi Receipts\n- All Payout Expenses\n- All Backup Files')) {
      state.events = [];
      state.receipts = [];
      state.payouts = [];
      state.activeEventId = null;

      await saveDb();

      try {
        await fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            users: state.users,
            events: [],
            receipts: [],
            payouts: []
          })
        });
      } catch (e) {}

      alert('All entered data has been completely cleared!');
      renderApp();
    }
  };

  // ==========================================
  // 1. LOGIN PANEL
  // ==========================================
  function renderLoginPanel() {
    const isLight = state.currentTheme === 'light';
    return `
      <div class="flex items-center justify-center min-h-[80vh]">
        <div class="glass-card w-full max-w-md p-8 relative overflow-hidden">
          <div class="absolute -top-10 -right-10 w-40 h-40 crimson-gradient-bg rounded-full blur-3xl opacity-40"></div>

          <div class="flex justify-between items-center mb-6 pb-3 border-b border-slate-700/40">
            <span class="text-xs font-semibold text-slate-400">Appearance Theme</span>
            <button type="button" onclick="window.appToggleTheme()" class="theme-toggle-btn flex items-center space-x-2 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-slate-900/80 text-amber-300 hover:bg-slate-800 transition text-xs font-bold shadow-md cursor-pointer">
              <i data-lucide="${isLight ? 'sun' : 'moon'}" class="w-4 h-4 text-amber-400"></i>
              <span class="theme-toggle-label">${isLight ? 'Light Theme' : 'Dark Theme'}</span>
            </button>
          </div>

          <div class="text-center mb-8">
            <div class="w-16 h-16 mx-auto mb-4 rounded-2xl crimson-gradient-bg border border-amber-500/40 flex items-center justify-center font-black text-3xl text-amber-300 shadow-xl">
              ஆ
            </div>
            <h2 class="text-3xl font-extrabold gold-gradient-text">ஆதி மொய்</h2>
            <p class="text-xs text-slate-400 mt-1">Aadhi Moi Collection & Management</p>
            <p class="text-xs font-semibold text-amber-400/90 mt-0.5">Group of Perumu</p>
          </div>

          <form id="login-form" class="space-y-5">
            <div id="login-error" class="hidden p-3 rounded-lg bg-rose-900/40 border border-rose-700/50 text-rose-300 text-xs font-medium"></div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-2">Username</label>
              <input type="text" id="login-username" class="input-styled" placeholder="Enter Username" required>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-2">Password</label>
              <input type="password" id="login-password" class="input-styled" placeholder="Enter Password" required>
            </div>

            <button type="submit" class="gold-button w-full py-3 rounded-xl text-sm uppercase tracking-wider font-bold">
              Login
            </button>
          </form>
        </div>
      </div>
    `;
  }

  function bindLoginEvents() {
    const form = document.getElementById('login-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const errDiv = document.getElementById('login-error');
      const u = document.getElementById('login-username').value.trim();
      const p = document.getElementById('login-password').value.trim();

      // Check admin
      let adminUsr = state.users.find(usr => usr.username.toLowerCase() === 'admin' || usr.role === 'admin');
      const adminPass = adminUsr ? adminUsr.password : '1234';

      if (u === 'admin' && p === adminPass) {
        state.currentUser = { id: 'admin', username: 'admin', role: 'admin' };
        localStorage.setItem('aathi_moi_user', JSON.stringify(state.currentUser));
        switchPanel('dashboard');
        return;
      }

      // Check users master
      const foundUser = state.users.find(usr => usr.username.toLowerCase() === u.toLowerCase() && usr.password === p);
      if (foundUser) {
        state.currentUser = foundUser;
        if (foundUser.assignedEventId) {
          state.activeEventId = foundUser.assignedEventId;
        }
        localStorage.setItem('aathi_moi_user', JSON.stringify(state.currentUser));
        switchPanel('dashboard');
        return;
      }

      errDiv.textContent = 'Invalid Username or Password!';
      errDiv.classList.remove('hidden');
    });
  }

  // ==========================================
  // 2. DASHBOARD PANEL
  // ==========================================
  function renderDashboardPanel() {
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    const activeEv = getActiveEvent();
    const eventReceipts = state.receipts.filter(r => !state.activeEventId || r.eventId === state.activeEventId);

    const totalAmount = eventReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const cashAmount = eventReceipts.filter(r => r.mode === 'Cash' || r.mode === 'ரொக்கம்').reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const upiAmount = eventReceipts.filter(r => r.mode === 'UPI' || r.mode === 'யூ.பி.ஐ').reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const totalCount = eventReceipts.length;

    const savedEvents = state.events.filter(e => e.status !== 'completed');

    return `
      <div class="space-y-6 max-w-6xl mx-auto">
        <!-- Dashboard Header -->
        <div class="glass-card p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold text-slate-100">Welcome, ${state.currentUser.username}!</h2>
            <p class="text-xs text-slate-400 mt-1">Aathi Moi Collection Dashboard Overview</p>
          </div>
        </div>

        <!-- Metric Cards (HIDDEN FOR ADMIN) -->
        ${!isAdmin ? `
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div class="glass-card p-6 border-l-4 border-amber-500 flex items-center justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Moi Collection</p>
                <h3 class="text-3xl font-black text-amber-400 mt-2">₹${totalAmount.toLocaleString('en-IN')}</h3>
              </div>
              <div class="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                <i data-lucide="indian-rupee" class="w-6 h-6"></i>
              </div>
            </div>

            <div class="glass-card p-6 border-l-4 border-emerald-500 flex items-center justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">Cash Amount</p>
                <h3 class="text-3xl font-black text-emerald-400 mt-2">₹${cashAmount.toLocaleString('en-IN')}</h3>
              </div>
              <div class="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <i data-lucide="banknote" class="w-6 h-6"></i>
              </div>
            </div>

            <div class="glass-card p-6 border-l-4 border-indigo-500 flex items-center justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">UPI Amount</p>
                <h3 class="text-3xl font-black text-indigo-400 mt-2">₹${upiAmount.toLocaleString('en-IN')}</h3>
              </div>
              <div class="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <i data-lucide="qr-code" class="w-6 h-6"></i>
              </div>
            </div>

            <div class="glass-card p-6 border-l-4 border-cyan-500 flex items-center justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Entries</p>
                <h3 class="text-3xl font-black text-cyan-400 mt-2">${totalCount} Donors</h3>
              </div>
              <div class="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                <i data-lucide="users" class="w-6 h-6"></i>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Saved Events & Status Section in Dashboard for Admin -->
        ${isAdmin ? `
          <div class="glass-card p-6 border border-slate-800">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-amber-300 flex items-center space-x-2">
                <i data-lucide="calendar" class="w-5 h-5 text-amber-400"></i>
                <span>Saved Events & Status</span>
              </h3>
              <button onclick="window.appSwitchPanel('event-master')" class="text-xs font-semibold text-amber-400 underline">
                Manage Events
              </button>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm text-slate-300">
                <thead class="text-xs uppercase bg-slate-900/60 text-amber-400 border-b border-slate-800">
                  <tr>
                    <th class="px-4 py-3">Member Name / Member Name 1</th>
                    <th class="px-4 py-3">Place</th>
                    <th class="px-4 py-3">Event Date</th>
                    <th class="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800">
                  ${savedEvents.length === 0 ? '<tr><td colspan="4" class="px-4 py-4 text-xs text-slate-500">No active saved events found.</td></tr>' : ''}
                  ${savedEvents.map(ev => `
                    <tr>
                      <td class="px-4 py-3 font-bold text-amber-300">${ev.displayName1 || ev.memberName || ''}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''}</td>
                      <td class="px-4 py-3">${ev.place}</td>
                      <td class="px-4 py-3 font-mono text-emerald-400 font-semibold">${ev.eventDate || '-'}</td>
                      <td class="px-4 py-3">
                        <span class="px-2.5 py-1 text-xs font-bold rounded-md border ${
                          ev.status === 'assigned' ? 'bg-indigo-950/80 text-indigo-300 border-indigo-500/50' :
                          ev.status === 'confirmed' || ev.status === 'conformed' ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50' :
                          'bg-amber-950/80 text-amber-300 border-amber-500/50'
                        }">
                          ${ev.status === 'assigned' ? 'assigned ' + (ev.assignedUsername ? '(' + ev.assignedUsername + ')' : '') : ev.status === 'confirmed' ? 'conformed' : (ev.status || 'pending')}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Saved Users & Assigned Events Section in Dashboard (ADMIN ONLY) -->
        ${isAdmin ? `
          <div class="glass-card p-6 border border-slate-800">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-amber-300 flex items-center space-x-2">
                <i data-lucide="users" class="w-5 h-5 text-amber-400"></i>
                <span>Saved Users & Assigned Events</span>
              </h3>
              <button onclick="window.appSwitchPanel('users-master')" class="text-xs font-semibold text-amber-400 underline">
                Manage Users
              </button>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm text-slate-300">
                <thead class="text-xs uppercase bg-slate-900/60 text-amber-400 border-b border-slate-800">
                  <tr>
                    <th class="px-4 py-3">Username</th>
                    <th class="px-4 py-3">Role</th>
                    <th class="px-4 py-3">Assigned Event</th>
                    <th class="px-4 py-3">Event Booking Date</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800">
                  <tr class="bg-slate-900/40">
                    <td class="px-4 py-3 font-bold text-amber-400">admin</td>
                    <td class="px-4 py-3"><span class="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-300 rounded font-bold">ADMIN</span></td>
                    <td class="px-4 py-3 text-slate-400">All Events</td>
                    <td class="px-4 py-3 text-slate-400 font-mono">-</td>
                  </tr>
                  ${state.users.length === 0 ? '<tr><td colspan="4" class="px-4 py-4 text-xs text-slate-500">No additional users created yet.</td></tr>' : ''}
                  ${state.users.map(u => {
                    const ev = state.events.find(e => e.id === u.assignedEventId);
                    const evName = ev ? (ev.displayName1 || ev.memberName || '') + (ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : '') : '';
                    return `
                      <tr>
                        <td class="px-4 py-3 font-medium text-slate-100">${u.username}</td>
                        <td class="px-4 py-3"><span class="px-2 py-0.5 text-xs bg-slate-800 text-slate-300 rounded">USER</span></td>
                        <td class="px-4 py-3 font-semibold text-amber-300">${ev ? evName + ' (' + ev.place + ')' : 'Not Assigned'}</td>
                        <td class="px-4 py-3 font-mono text-emerald-400 font-semibold">${ev && ev.eventDate ? ev.eventDate : '-'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function bindDashboardEvents() {
    const sel = document.getElementById('dash-event-select');
    sel?.addEventListener('change', (e) => {
      state.activeEventId = e.target.value;
      renderApp();
    });
  }

  // ==========================================
  // 3. EVENT MASTER PANEL
  // ==========================================
  function renderEventMasterPanel() {
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    const activeEvents = state.events.filter(e => e.status !== 'completed');
    const completedEvents = state.events.filter(e => e.status === 'completed');
    const currentTab = state.eventMasterTab || 'active';
    const todayStr = new Date().toISOString().split('T')[0];

    return `
      <div class="max-w-4xl mx-auto space-y-6">
        <div class="glass-card p-6">
          <h2 class="text-xl font-extrabold gold-gradient-text flex items-center space-x-3 mb-6">
            <i data-lucide="calendar-plus" class="w-6 h-6 text-amber-400"></i>
            <span>Event Master</span>
          </h2>

          <form id="event-form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Saving Locations (சேமிக்கும் முறைமை) at Top -->
            <div class="md:col-span-2 space-y-3">
              <div class="bg-slate-900/90 p-4 rounded-xl border border-amber-500/30 space-y-3 text-xs">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <p class="font-bold text-amber-300 flex items-center space-x-2">
                    <i data-lucide="hard-drive" class="w-4 h-4 text-emerald-400"></i>
                    <span>Saving Locations (சேமிக்கும் முறைமை):</span>
                  </p>
                  <span class="text-[10.5px] text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-0.5 rounded font-bold">
                    ✓ Google Drive Auto Sync (Mandatory / கட்டாயம்)
                  </span>
                </div>

                <div class="space-y-2 pt-1">
                  <p class="font-bold text-slate-200">Save to Local Disk in Computer (Optional / விருப்பப்பட்டால்):</p>
                  
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <!-- Option A: Not Applicable -->
                    <div onclick="window.appClearLocalSaveDirectory()" class="flex items-start space-x-3 bg-slate-950/70 hover:bg-slate-950 p-3 rounded-xl border ${!state.localSaveFolderName ? 'border-amber-500/60 bg-amber-950/20' : 'border-slate-800'} cursor-pointer transition">
                      <input type="radio" name="local-disk-option" ${!state.localSaveFolderName ? 'checked' : ''} class="mt-0.5 w-4 h-4 text-amber-500 pointer-events-none">
                      <div>
                        <p class="font-bold text-slate-200">1. Not Applicable (தேவையில்லை)</p>
                        <p class="text-[11px] text-slate-400 mt-0.5">Do not save to local disk. Only save automatically to Google Drive.</p>
                      </div>
                    </div>

                    <!-- Option B: Select Local Disk Folder -->
                    <div onclick="window.appChooseLocalSaveDirectory()" class="flex items-start space-x-3 bg-slate-950/70 hover:bg-slate-950 p-3 rounded-xl border ${state.localSaveFolderName ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-slate-800'} cursor-pointer transition">
                      <input type="radio" name="local-disk-option" ${state.localSaveFolderName ? 'checked' : ''} class="mt-0.5 w-4 h-4 text-emerald-500 pointer-events-none">
                      <div>
                        <p class="font-bold text-emerald-300 flex items-center space-x-1">
                          <i data-lucide="folder-plus" class="w-3.5 h-3.5 text-emerald-400"></i>
                          <span>2. Select Local Disk Folder (கோப்புறை தேர்வு)</span>
                        </p>
                        <p class="text-[11px] text-slate-400 mt-0.5">
                          ${state.localSaveFolderName ? `<span class="text-emerald-400 font-bold">📁 Folder: ${state.localSaveFolderName}</span> (Moi data will auto-save here)` : 'Opens Save As window to choose a computer folder.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-amber-300 mb-1">Member Name *</label>
              <input type="text" id="ev-display-name1" class="input-styled text-base font-bold text-amber-300 border-amber-500/50" placeholder="Ex: கார்த்திக்" required autocomplete="off">
              <div id="ev-display-name1-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Member Name 1</label>
              <input type="text" id="ev-member-name" class="input-styled" placeholder="Ex: பிரியா (Optional)" autocomplete="off">
              <div id="ev-member-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative md:col-span-2">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Event Title (Optional / நிகழ்ச்சித் தலைப்பு)</label>
              <input type="text" id="ev-title" class="input-styled text-amber-300 font-semibold" placeholder="Ex: திருமண வரவேற்பு / காதுகுத்து / கிருஹப்ரவேசம்" autocomplete="off">
              <div id="ev-title-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Place *</label>
              <input type="text" id="ev-place" class="input-styled" placeholder="Ex: Madurai" required autocomplete="off">
              <div id="ev-place-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Phone Number *</label>
              <input type="tel" id="ev-phone" class="input-styled" placeholder="9876543210" required>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Event Date *</label>
              <input type="date" id="ev-date" class="input-styled" required value="${todayStr}">
            </div>

            <div class="md:col-span-2">
              <label class="block text-xs font-semibold text-slate-300 mb-1">UPI ID (for Payment QR Code) (Optional)</label>
              <input type="text" id="ev-upi" class="input-styled font-mono" placeholder="Ex: 9876543210@upi">
            </div>

            <div class="md:col-span-2 pt-2">
              <button type="submit" class="gold-button w-full py-3 rounded-xl font-bold flex items-center justify-center space-x-2 shadow-xl">
                <i data-lucide="save" class="w-5 h-5"></i>
                <span>Save Event Master</span>
              </button>
            </div>
          </form>
        </div>

        <div class="glass-card p-6">
          <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
            <h3 class="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <i data-lucide="calendar" class="w-5 h-5 text-amber-400"></i>
              <span>${currentTab === 'completed' ? 'Completed Events' : 'Saved Events'}</span>
            </h3>
            <div class="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
              <button onclick="window.appFetchEventsFromDrive()" class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300 shadow cursor-pointer" title="Fetch & show all events from Google Drive">
                <i data-lucide="cloud-download" class="w-4 h-4 text-emerald-400"></i>
                <span>Sync from Drive</span>
              </button>
              <button onclick="window.appSetEventMasterTab('active')" class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${currentTab !== 'completed' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-md' : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200'}">
                <span>Saved Events</span>
                <span class="px-2 py-0.5 bg-amber-500/30 text-amber-300 rounded-md text-[10px] font-black">${activeEvents.length}</span>
              </button>
              <button onclick="window.appSetEventMasterTab('completed')" class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${currentTab === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-md' : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200'}">
                <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-400"></i>
                <span>Completed Events</span>
                <span class="px-2 py-0.5 bg-emerald-500/30 text-emerald-300 rounded-md text-[10px] font-black">${completedEvents.length}</span>
              </button>
              ${activeEvents.length > 0 && currentTab !== 'completed' && isAdmin ? `
                <button onclick="window.appDeleteAllSavedEvents()" class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-300 shadow cursor-pointer" title="Delete all saved events">
                  <i data-lucide="trash-2" class="w-4 h-4 text-rose-400"></i>
                  <span>Delete All Saved Events</span>
                </button>
              ` : ''}
            </div>
          </div>

          ${currentTab !== 'completed' ? `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${activeEvents.length === 0 ? '<p class="text-slate-500 text-sm md:col-span-2">No active events found.</p>' : ''}
              ${activeEvents.map(ev => `
                <div class="p-4 rounded-xl bg-slate-900/70 border ${ev.id === state.activeEventId ? 'border-amber-500' : 'border-slate-800'} space-y-3">
                  <div class="flex justify-between items-start">
                    <div>
                      <h4 class="font-bold text-amber-300 text-base">${ev.displayName1 || ev.memberName || ''}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''}</h4>
                      <p class="text-xs text-emerald-400 font-semibold mt-0.5"><i data-lucide="calendar" class="w-3.5 h-3.5 inline mr-1"></i> Date: ${ev.eventDate || '-'}</p>
                    </div>
                    ${ev.id === state.activeEventId ? '<span class="px-2 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded-md font-bold border border-amber-500/40">Active</span>' : ''}
                  </div>
                  <div class="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                    <p><i data-lucide="map-pin" class="w-3.5 h-3.5 inline mr-1 text-slate-400"></i> ${ev.place}</p>
                    <p><i data-lucide="phone" class="w-3.5 h-3.5 inline mr-1 text-slate-400"></i> ${ev.phone}</p>
                    ${ev.upiId ? `<p class="font-mono text-indigo-300"><i data-lucide="qr-code" class="w-3.5 h-3.5 inline mr-1"></i> ${ev.upiId}</p>` : ''}
                  </div>

                  <div class="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <span class="text-xs font-semibold text-slate-300">Status:</span>
                    <select onchange="window.appUpdateEventStatus('${ev.id}', this.value)" class="input-styled text-xs py-1 px-2 font-bold max-w-[170px] ${ev.status === 'assigned' ? 'text-indigo-300 bg-indigo-950/60 border-indigo-500/50' : ev.status === 'confirmed' || ev.status === 'conformed' ? 'text-emerald-300 bg-emerald-950/60 border-emerald-500/50' : 'text-amber-300 bg-amber-950/60 border-amber-500/50'}">
                      <option value="pending" ${ev.status === 'pending' ? 'selected' : ''}>pending</option>
                      <option value="confirmed" ${ev.status === 'confirmed' || ev.status === 'conformed' ? 'selected' : ''}>conformed</option>
                      <option value="assigned" ${ev.status === 'assigned' ? 'selected' : ''}>assigned ${ev.assignedUsername ? '(' + ev.assignedUsername + ')' : ''}</option>
                      <option value="completed" ${ev.status === 'completed' ? 'selected' : ''}>completed</option>
                    </select>
                  </div>

                  <div class="flex items-center space-x-2 pt-2 border-t border-slate-800/60">
                    <button onclick="window.appSelectActiveEvent('${ev.id}')" class="flex-1 py-1.5 rounded-lg ${ev.id === state.activeEventId ? 'bg-amber-500 text-slate-950 font-black shadow-md' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'} text-xs font-bold transition">
                      ${ev.id === state.activeEventId ? 'Active Event' : 'Select Event'}
                    </button>
                    <button onclick="window.appEditEvent('${ev.id}')" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition">
                      Edit
                    </button>
                    <button onclick="window.appDeleteEvent('${ev.id}')" class="px-3 py-1.5 rounded-lg bg-rose-900/40 hover:bg-rose-800/60 text-xs font-semibold text-rose-300 transition border border-rose-700/40">
                      Delete All
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${completedEvents.length === 0 ? '<p class="text-slate-500 text-sm md:col-span-2">No completed events found.</p>' : ''}
              ${completedEvents.map(ev => `
                <div class="p-4 rounded-xl bg-slate-900/80 border border-emerald-500/40 space-y-3">
                  <div class="flex justify-between items-start">
                    <div>
                      <h4 class="font-bold text-amber-300 text-base">${ev.displayName1 || ev.memberName || ''}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''}</h4>
                      <p class="text-xs text-emerald-400 font-semibold mt-0.5"><i data-lucide="calendar" class="w-3.5 h-3.5 inline mr-1"></i> Date: ${ev.eventDate || '-'}</p>
                    </div>
                    <span class="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 rounded-md font-extrabold border border-emerald-500/40">Completed</span>
                  </div>
                  <div class="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                    <p><i data-lucide="map-pin" class="w-3.5 h-3.5 inline mr-1 text-slate-400"></i> ${ev.place}</p>
                    <p><i data-lucide="phone" class="w-3.5 h-3.5 inline mr-1 text-slate-400"></i> ${ev.phone}</p>
                  </div>

                  <div class="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <span class="text-xs font-semibold text-slate-300">Change Status:</span>
                    <select onchange="window.appUpdateEventStatus('${ev.id}', this.value)" class="input-styled text-xs py-1 px-2 font-bold max-w-[170px] text-emerald-300 bg-emerald-950/60 border-emerald-500/50">
                      <option value="pending">pending</option>
                      <option value="confirmed">conformed</option>
                      <option value="assigned">assigned</option>
                      <option value="completed" selected>completed</option>
                    </select>
                  </div>

                  <div class="pt-2 border-t border-slate-800/60 flex space-x-2">
                    <button onclick="window.appDownloadEventOverallReport('${ev.id}')" class="gold-button w-1/2 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 shadow-lg">
                      <i data-lucide="download" class="w-4 h-4"></i>
                      <span>Overall Download</span>
                    </button>
                    <button onclick="window.appDeleteEvent('${ev.id}')" class="w-1/2 py-2.5 rounded-xl bg-rose-900/40 hover:bg-rose-800/60 text-xs font-semibold text-rose-300 transition border border-rose-700/40 flex items-center justify-center space-x-1">
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                      <span>Delete All</span>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>

      <div id="event-edit-modal-root"></div>
    `;
  }

  function bindEventMasterEvents() {
    const displayName1Input = document.getElementById('ev-display-name1');
    const displayName1Sugg = document.getElementById('ev-display-name1-suggestions');
    const memberInput = document.getElementById('ev-member-name');
    const memberSugg = document.getElementById('ev-member-suggestions');
    const placeInput = document.getElementById('ev-place');
    const placeSugg = document.getElementById('ev-place-suggestions');

    // Google Tamil Transliteration for Display Name 1, Member Name, Event Title & Place in Event Master
    bindGoogleTamilTransliteration('ev-display-name1', 'ev-display-name1-suggestions');
    bindGoogleTamilTransliteration('ev-member-name', 'ev-member-suggestions');
    bindGoogleTamilTransliteration('ev-title', 'ev-title-suggestions');
    bindGoogleTamilTransliteration('ev-place', 'ev-place-suggestions');

    // Auto-sync events with Drive folders on Event Master load
    if (!window._hasSyncedEventsFromDrive) {
      window._hasSyncedEventsFromDrive = true;
      setTimeout(() => {
        fetch('/api/events/sync-drive').then(r => r.json()).then(data => {
          if (data && data.success) {
            state.events = data.events || [];
            state.receipts = data.receipts || [];
            renderApp();
          }
        }).catch(() => {});
      }, 300);
    }

    const form = document.getElementById('event-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName1 = document.getElementById('ev-display-name1')?.value.trim() || '';
      const memberName = document.getElementById('ev-member-name')?.value.trim() || '';
      const eventTitle = document.getElementById('ev-title')?.value.trim() || '';
      const eventName = displayName1 || memberName || 'Event';
      const place = document.getElementById('ev-place')?.value.trim() || '';
      const phone = document.getElementById('ev-phone')?.value.trim() || '';
      const eventDate = document.getElementById('ev-date')?.value.trim() || '';
      const upiId = document.getElementById('ev-upi')?.value.trim() || '';

      const candFull = (displayName1 && memberName) ? `${displayName1} - ${memberName}` : (displayName1 || memberName || eventTitle || 'Event');
      const candNorm = candFull.toLowerCase().replace(/\s+/g, ' ').trim();

      // Duplicate Check: Don't save duplicate event in Event Master
      const isDuplicate = state.events.some(e => {
        const eD1 = (e.displayName1 || '').trim();
        const eM = (e.memberName || '').trim();
        const eFull = (eD1 && eM) ? `${eD1} - ${eM}` : (eD1 || eM || e.eventName || '');
        const eNorm = eFull.toLowerCase().replace(/\s+/g, ' ').trim();
        const eLegacyNorm = (e.eventName || '').toLowerCase().replace(/\s+/g, ' ').trim();

        if (eNorm && eNorm === candNorm) return true;
        if (eLegacyNorm && eLegacyNorm === candNorm) return true;
        if (eD1 && eM && eD1.toLowerCase() === displayName1.toLowerCase() && eM.toLowerCase() === memberName.toLowerCase()) return true;
        return false;
      });

      if (isDuplicate) {
        alert(`Already saved! (ஏற்கனவே சேமிக்கப்பட்டுள்ளது)\nEvent "${candFull}" is already saved in Event Master.`);
        return;
      }

      const newEv = {
        id: 'ev_' + Date.now(),
        displayName1,
        memberName,
        eventTitle,
        eventName,
        place,
        phone,
        eventDate,
        upiId,
        status: 'pending',
        assignedUsername: '',
        createdAt: new Date().toISOString()
      };

      state.events.push(newEv);
      state.activeEventId = newEv.id;

      await saveDb();
      try {
        await createDriveFolder(newEv);
      } catch (err) {
        console.warn('Drive folder creation notice:', err);
      }

      const savedName = displayName1 || memberName || 'Event';
      if (typeof window.showToast === 'function') {
        window.showToast(`Event "${savedName}" saved successfully!`, 'success');
      } else {
        alert(`Event "${savedName}" saved successfully!`);
      }
      renderApp();
    });
  }

  // Helper function to bind Google Tamil Input Tool for any input field
  function bindGoogleTamilTransliteration(inputId, suggId) {
    const input = document.getElementById(inputId);
    const sugg = document.getElementById(suggId);
    if (!input) return;

    input.addEventListener('input', async (e) => {
      const val = e.target.value;
      if (!val) {
        sugg?.classList.add('hidden');
        return;
      }
      const googleSuggestions = await window.TamilTransliterate.fetchGoogleInputToolsTamil(val);
      const dictSuggestions = window.TamilTransliterate.getDictionarySuggestions(val);
      const combined = [...googleSuggestions];
      dictSuggestions.forEach(d => {
        if (!combined.some(c => c.ta === d.ta)) combined.push(d);
      });
      if (combined.length > 0 && sugg) {
        sugg.innerHTML = combined.map(s => {
          const safeTa = s.ta.replace(/'/g, "\\'");
          return `
            <div class="translit-item" onmousedown="event.preventDefault(); window.appPickTranslit('${inputId}', '${safeTa}')">
              <span class="font-semibold text-amber-300">${s.ta}</span>
              <span class="text-xs ${s.isGoogle ? 'text-indigo-400 font-semibold' : 'text-slate-400'}">${s.isGoogle ? 'Google Tamil' : s.en}</span>
            </div>
          `;
        }).join('');
        sugg.classList.remove('hidden');
      } else {
        sugg?.classList.add('hidden');
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(async () => {
        if (input.value && !/[\u0B80-\u0BFF]/.test(input.value)) {
          const goog = await window.TamilTransliterate.fetchGoogleInputToolsTamil(input.value);
          if (goog && goog.length > 0) {
            input.value = goog[0].ta;
          } else {
            input.value = window.TamilTransliterate.transliterateText(input.value);
          }
        }
        sugg?.classList.add('hidden');
      }, 200);
    });
  }

  // Fetch and show all events from Google Drive
  window.appFetchEventsFromDrive = async function (silent = false) {
    const gasUrl = getGasUrl();
    if (!gasUrl) {
      if (!silent) {
        if (typeof window.showToast === 'function') {
          window.showToast('Google Apps Script Web App URL not configured in Cloud Settings', 'warning');
        } else {
          alert('Google Apps Script Web App URL not configured in Cloud Settings');
        }
      }
      return 0;
    }

    try {
      const fetchUrl = gasUrl + (gasUrl.includes('?') ? '&' : '?') + 'action=getDb';
      const res = await fetch(fetchUrl);
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'success' && json.data && Array.isArray(json.data.events)) {
          const driveEvents = json.data.events;
          let addedCount = 0;
          let updatedCount = 0;

          driveEvents.forEach(dev => {
            const devId = String(dev.id || dev.eventid || dev['Event ID'] || '').trim();
            const devName = String(dev.displayName1 || dev.membername || dev['Member Name'] || '').trim();
            const devName1 = String(dev.memberName || dev.membername1 || dev['Member Name 1'] || '').trim();
            const devTitle = String(dev.eventTitle || dev.eventtitle || dev['Event Title'] || '').trim();
            const devPlace = String(dev.place || dev['Place'] || '').trim();
            const devPhone = String(dev.phone || dev['Phone'] || '').trim();
            const devDate = String(dev.eventDate || dev.eventdate || dev['Event Date'] || '').trim();
            const devUpi = String(dev.upiId || dev.upiid || dev['UPI ID'] || '').trim();
            const devStatus = String(dev.status || dev['Status'] || 'pending').trim();
            const devAssigned = String(dev.assignedUsername || dev.assigneduser || dev['Assigned User'] || '').trim();
            const devFolder = String(dev.folderId || dev.drivefolderid || dev['Drive Folder ID'] || '').trim();

            if (!devName && !devId) return;

            const existing = state.events.find(ev => 
              (devId && ev.id === devId) || 
              (devName && (ev.displayName1 || ev.memberName || '').trim().toLowerCase() === devName.toLowerCase())
            );

            if (existing) {
              if (devName && !existing.displayName1) existing.displayName1 = devName;
              if (devName1 && !existing.memberName) existing.memberName = devName1;
              if (devTitle && !existing.eventTitle) existing.eventTitle = devTitle;
              if (devPlace && !existing.place) existing.place = devPlace;
              if (devPhone && !existing.phone) existing.phone = devPhone;
              if (devDate && !existing.eventDate) existing.eventDate = devDate;
              if (devUpi && !existing.upiId) existing.upiId = devUpi;
              if (devFolder && !existing.folderId) existing.folderId = devFolder;
              updatedCount++;
            } else {
              state.events.push({
                id: devId || ('ev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
                displayName1: devName,
                memberName: devName1,
                eventTitle: devTitle,
                place: devPlace,
                phone: devPhone,
                eventDate: devDate || new Date().toISOString().split('T')[0],
                upiId: devUpi,
                status: devStatus || 'pending',
                assignedUsername: devAssigned,
                folderId: devFolder
              });
              addedCount++;
            }
          });

          // Also merge any receipts from Drive to empower cross-event suggestions
          if (Array.isArray(json.data.receipts)) {
            let rcptAdded = 0;
            json.data.receipts.forEach(drcpt => {
              const bNo = String(drcpt.billNo || drcpt.billno || drcpt['Bill No'] || '').trim();
              if (!bNo) return;
              const exists = state.receipts.some(r => String(r.billNo).trim() === bNo);
              if (!exists) {
                state.receipts.push({
                  id: 'rcpt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                  billNo: bNo,
                  eventId: drcpt.eventId || drcpt.eventid || '',
                  eventName: drcpt.eventName || drcpt.eventname || drcpt['Event Name'] || '',
                  place: drcpt.place || drcpt['Place'] || '',
                  initial: drcpt.initial || drcpt['Initial'] || '',
                  name: drcpt.name || drcpt['Name'] || '',
                  job: drcpt.job || drcpt['Job'] || '',
                  name1: drcpt.name1 || drcpt['Name 1'] || '',
                  relationship: drcpt.relationship || drcpt['Relationship'] || '',
                  mobile: drcpt.mobile || drcpt.mobilenumber || drcpt.phone || drcpt['Mobile Number'] || '',
                  amount: drcpt.amount || drcpt['Amount (₹)'] || 0,
                  amountWords: drcpt.amountWords || drcpt.amountwords || drcpt['Amount in Words'] || '',
                  mode: drcpt.mode || drcpt['Mode'] || 'Cash',
                  upiTxTime: drcpt.upiTxTime || drcpt.upitxtime || '',
                  createdBy: drcpt.createdBy || drcpt.createdby || 'admin',
                  date: drcpt.date || drcpt['Date'] || '',
                  time: drcpt.time || drcpt['Time'] || '',
                  createdAt: drcpt.timestamp || drcpt['Timestamp'] || new Date().toISOString()
                });
                rcptAdded++;
              }
            });
            if (rcptAdded > 0) {
              addedCount += rcptAdded;
            }
          }

          if (addedCount > 0 || updatedCount > 0) {
            await saveDb();
            renderApp();
          }

          if (!silent) {
            if (typeof window.showToast === 'function') {
              window.showToast(`Fetched events from Google Drive: ${addedCount} new, ${updatedCount} updated`, 'success');
            } else {
              alert(`Fetched from Google Drive:\n• ${addedCount} new event(s) added\n• ${updatedCount} event(s) updated`);
            }
          }
          return addedCount;
        }
      }
    } catch (e) {
      if (!silent) console.warn('Fetch from Drive notice:', e);
    }
    return 0;
  };

  window.appSelectActiveEvent = function (eventId) {
    state.activeEventId = eventId;
    const ev = state.events.find(e => e.id === eventId);
    alert(`Active Event selected: ${ev ? ev.memberName : ''}`);
    renderApp();
  };

  window.appSetEventMasterTab = async function (tabName) {
    state.eventMasterTab = tabName;
    try {
      const resp = await fetch('/api/events/sync-drive');
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success) {
          state.events = data.events || [];
          state.receipts = data.receipts || [];
        }
      }
    } catch (e) {}
    renderApp();
  };

  window.appUpdateEventStatus = async function (eventId, newStatus) {
    const ev = state.events.find(e => e.id === eventId);
    if (ev) {
      ev.status = newStatus;
      if (newStatus !== 'assigned') {
        ev.assignedUsername = '';
      }
      await saveDb();
      renderApp();
    }
  };

  window.appDownloadEventOverallReport = function (eventId) {
    const ev = state.events.find(e => e.id === eventId);
    if (!ev) return;

    // Apply custom sequence order if set
    let receipts = state.receipts.filter(r => r.eventId === eventId);
    const eventPayouts = state.payouts.filter(p => p.eventId === eventId);

    if (receipts.length === 0) {
      alert('No data available to download!');
      return;
    }

    // Sort by custom place order map if configured
    if (state.reportPlaceOrderMap && Object.keys(state.reportPlaceOrderMap).length > 0) {
      receipts = sortEntriesByCustomPlaceNumbers(receipts, state.reportPlaceOrderMap);
    }

    const totalCash = receipts.filter(r => r.mode !== 'UPI' && r.mode !== 'யூ.பி.ஐ').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const totalUpi  = receipts.filter(r => r.mode === 'UPI' || r.mode === 'யூ.பி.ஐ').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const totalMoi  = totalCash + totalUpi;
    const totalPayout = eventPayouts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

    const evName = `${ev.displayName1 || ev.memberName || ''}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''}`;
    const evMeta = [ev.place, ev.phone, formatDateDMY(ev.eventDate)].filter(Boolean).join(' | ');

    const html = buildOverallReportHtml({
      entries:      receipts,
      getPlace:     r => r.place || '-',
      getName:      r => formatMoiPersonNameWithJob(r),
      getInitial:   r => (r.initial || '').trim(),
      getNameOnly:  r => (r.name || '').trim(),
      getJob:       r => (r.job || '').trim(),
      getSubName:   r => (r.name1 || '').trim(),
      getBillNo:    r => r.billNo || '',
      getAmount:    r => parseFloat(r.amount) || 0,
      getMode:      r => r.mode || '',
      eventTitle:   evName,
      eventSubtitle: evMeta,
      totalCash, totalUpi, totalMoi, totalPayout,
      ROWS_PER_PAGE: 12
    });

    const printArea = document.getElementById('a4-report-print-area');
    if (!printArea) return;
    printArea.classList.remove('hidden');
    printArea.innerHTML = html;

    const triggerPrint = () => {
      const origTitle = document.title;
      const evFileTitle = [ev.displayName1, ev.memberName].filter(Boolean).join(' - ') || ev.eventName || 'Aathi_Moi_Report';
      document.title = `${evFileTitle} - Overall`;
      window.print();
      setTimeout(() => {
        document.title = origTitle;
        printArea.classList.add('hidden');
        printArea.innerHTML = '';
      }, 1000);
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => setTimeout(triggerPrint, 200));
    } else {
      setTimeout(triggerPrint, 200);
    }
  };


  window.appEditEvent = function (eventId) {
    const ev = state.events.find(e => e.id === eventId);
    if (!ev) return;

    const modalRoot = document.getElementById('event-edit-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-overlay flex items-center justify-center p-4">
        <div class="glass-card w-full max-w-2xl max-h-[90vh] flex flex-col p-5 overflow-hidden shadow-2xl relative border border-slate-700/60">
          
          <!-- Header -->
          <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <h3 class="text-base font-bold gold-gradient-text flex items-center space-x-2">
              <i data-lucide="edit-3" class="w-4 h-4 text-amber-400"></i>
              <span>Edit Event (நிகழ்ச்சி விவரம் திருத்துதல்)</span>
            </h3>
            <button type="button" onclick="document.getElementById('event-edit-modal-root').innerHTML=''" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form id="edit-event-form" class="flex-1 overflow-y-auto pr-1 space-y-3">
            <!-- 2-Column Grid for Fields -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="relative">
                <label class="block text-[11px] font-semibold text-amber-300 mb-1">Member Name *</label>
                <input type="text" id="edit-ev-display-name1" class="input-styled font-bold text-amber-300 border-amber-500/50 text-xs py-1.5" value="${ev.displayName1 || ''}" required autocomplete="off">
                <div id="edit-ev-display-name1-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <div class="relative">
                <label class="block text-[11px] font-semibold text-slate-300 mb-1">Member Name 1</label>
                <input type="text" id="edit-ev-member" class="input-styled text-xs py-1.5" value="${ev.memberName || ''}" placeholder="Optional" autocomplete="off">
                <div id="edit-ev-member-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <div class="relative sm:col-span-2">
                <label class="block text-[11px] font-semibold text-slate-300 mb-1">Event Title (Optional / நிகழ்ச்சித் தலைப்பு)</label>
                <input type="text" id="edit-ev-title" class="input-styled text-xs py-1.5 text-amber-300 font-semibold" value="${ev.eventTitle || ''}" placeholder="Ex: திருமண வரவேற்பு / காதுகுத்து" autocomplete="off">
                <div id="edit-ev-title-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <div class="relative">
                <label class="block text-[11px] font-semibold text-slate-300 mb-1">Place *</label>
                <input type="text" id="edit-ev-place" class="input-styled text-xs py-1.5" value="${ev.place}" required autocomplete="off">
                <div id="edit-ev-place-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <div>
                <label class="block text-[11px] font-semibold text-slate-300 mb-1">Phone Number *</label>
                <input type="tel" id="edit-ev-phone" class="input-styled text-xs py-1.5" value="${ev.phone}" required>
              </div>

              <div>
                <label class="block text-[11px] font-semibold text-slate-300 mb-1">Event Date *</label>
                <input type="date" id="edit-ev-date" class="input-styled text-xs py-1.5" value="${ev.eventDate || ''}" required>
              </div>

              <div>
                <label class="block text-[11px] font-semibold text-slate-300 mb-1">Status</label>
                <select id="edit-ev-status" class="input-styled font-bold text-xs py-1.5">
                  <option value="pending" ${ev.status === 'pending' ? 'selected' : ''}>pending</option>
                  <option value="confirmed" ${ev.status === 'confirmed' || ev.status === 'conformed' ? 'selected' : ''}>conformed</option>
                  <option value="assigned" ${ev.status === 'assigned' ? 'selected' : ''}>assigned ${ev.assignedUsername ? '(' + ev.assignedUsername + ')' : ''}</option>
                  <option value="completed" ${ev.status === 'completed' ? 'selected' : ''}>completed</option>
                </select>
              </div>

              <div class="sm:col-span-2">
                <label class="block text-[11px] font-semibold text-slate-300 mb-1">UPI ID (Optional)</label>
                <input type="text" id="edit-ev-upi" class="input-styled font-mono text-xs py-1.5" value="${ev.upiId || ''}">
              </div>
            </div>

            <!-- Saving Locations Section -->
            <div class="bg-slate-900/90 p-3 rounded-xl border border-amber-500/30 space-y-2 text-xs mt-2">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800 pb-1.5">
                <p class="font-bold text-amber-300 flex items-center space-x-1.5 text-[11px]">
                  <i data-lucide="hard-drive" class="w-3.5 h-3.5 text-emerald-400"></i>
                  <span>Saving Locations (சேமிக்கும் முறைமை):</span>
                </p>
                <span class="text-[10px] text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded font-bold">
                  ✓ Google Drive Auto Sync (Mandatory)
                </span>
              </div>

              <div class="space-y-1.5 pt-0.5">
                <p class="font-bold text-slate-200 text-[11px]">Save to Local Disk in Computer (Optional / விருப்பப்பட்டால்):</p>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <!-- Option 1: Not Applicable -->
                  <div onclick="window.appClearLocalSaveDirectory()" class="flex items-start space-x-2 bg-slate-950/70 hover:bg-slate-950 p-2 rounded-lg border ${!state.localSaveFolderName ? 'border-amber-500/60 bg-amber-950/20' : 'border-slate-800'} cursor-pointer transition">
                    <input type="radio" name="edit-local-disk-option" ${!state.localSaveFolderName ? 'checked' : ''} class="mt-0.5 w-3.5 h-3.5 text-amber-500 pointer-events-none">
                    <div>
                      <p class="font-bold text-slate-200 text-[11px]">1. Not Applicable (தேவையில்லை)</p>
                      <p class="text-[10px] text-slate-400">Only save automatically to Google Drive.</p>
                    </div>
                  </div>

                  <!-- Option 2: Select Local Disk Folder -->
                  <div onclick="window.appChooseLocalSaveDirectory()" class="flex items-start space-x-2 bg-slate-950/70 hover:bg-slate-950 p-2 rounded-lg border ${state.localSaveFolderName ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-slate-800'} cursor-pointer transition">
                    <input type="radio" name="edit-local-disk-option" ${state.localSaveFolderName ? 'checked' : ''} class="mt-0.5 w-3.5 h-3.5 text-emerald-500 pointer-events-none">
                    <div>
                      <p class="font-bold text-emerald-300 flex items-center space-x-1 text-[11px]">
                        <i data-lucide="folder-plus" class="w-3 h-3 text-emerald-400"></i>
                        <span>2. Select Local Folder (கோப்புறை தேர்வு)</span>
                      </p>
                      <p class="text-[10px] text-slate-400">
                        ${state.localSaveFolderName ? `<span class="text-emerald-400 font-bold">📁 Folder: ${state.localSaveFolderName}</span>` : 'Opens Save As window to choose a computer folder.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex space-x-3 pt-2">
              <button type="button" onclick="document.getElementById('event-edit-modal-root').innerHTML=''" class="w-1/2 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl">
                Cancel
              </button>
              <button type="submit" class="w-1/2 gold-button py-2 text-xs font-bold rounded-xl">
                Save Edits
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    // Google Tamil Transliteration for Edit Event modal
    bindGoogleTamilTransliteration('edit-ev-display-name1', 'edit-ev-display-name1-suggestions');
    bindGoogleTamilTransliteration('edit-ev-member', 'edit-ev-member-suggestions');
    bindGoogleTamilTransliteration('edit-ev-title', 'edit-ev-title-suggestions');
    bindGoogleTamilTransliteration('edit-ev-place', 'edit-ev-place-suggestions');

    document.getElementById('edit-event-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newD1 = document.getElementById('edit-ev-display-name1').value.trim();
      const newM = document.getElementById('edit-ev-member').value.trim();
      const candFull = (newD1 && newM) ? `${newD1} - ${newM}` : (newD1 || newM || 'Event');
      const candNorm = candFull.toLowerCase().replace(/\s+/g, ' ').trim();

      // Duplicate Check: Don't save if another event has same name
      const isDuplicate = state.events.some(other => {
        if (other.id === ev.id) return false;
        const oD1 = (other.displayName1 || '').trim();
        const oM = (other.memberName || '').trim();
        const oFull = (oD1 && oM) ? `${oD1} - ${oM}` : (oD1 || oM || other.eventName || '');
        const oNorm = oFull.toLowerCase().replace(/\s+/g, ' ').trim();
        const oLegacyNorm = (other.eventName || '').toLowerCase().replace(/\s+/g, ' ').trim();

        if (oNorm && oNorm === candNorm) return true;
        if (oLegacyNorm && oLegacyNorm === candNorm) return true;
        if (oD1 && oM && oD1.toLowerCase() === newD1.toLowerCase() && oM.toLowerCase() === newM.toLowerCase()) return true;
        return false;
      });

      if (isDuplicate) {
        alert(`Already saved! (ஏற்கனவே சேமிக்கப்பட்டுள்ளது)\nEvent "${candFull}" is already saved in Event Master.`);
        return;
      }

      ev.displayName1 = newD1;
      ev.memberName = newM;
      ev.eventTitle = document.getElementById('edit-ev-title').value.trim();
      ev.eventName = ev.displayName1 || ev.memberName;
      ev.place = document.getElementById('edit-ev-place').value.trim();
      ev.phone = document.getElementById('edit-ev-phone').value.trim();
      ev.eventDate = document.getElementById('edit-ev-date').value.trim();
      ev.status = document.getElementById('edit-ev-status').value;
      ev.upiId = document.getElementById('edit-ev-upi').value.trim();

      await saveDb();
      await createDriveFolder(ev);
      document.getElementById('event-edit-modal-root').innerHTML = '';
      renderApp();
    });
  };

  // DELETING EVENT DELETES ALL DATA BELONGING TO THE EVENT (RECEIPTS, PAYOUTS, REPORTS, BACKUP FOLDERS)
  window.appDeleteEvent = function (eventId) {
    if (!state.currentUser || state.currentUser.role !== 'admin') {
      alert('Access Restricted: Only Admin can delete events!');
      return;
    }

    const ev = state.events.find(e => e.id === eventId);
    if (!ev) return;

    const isMatchingEvent = (item) => {
      if (!item) return false;
      if (item.eventId && item.eventId === eventId) return true;
      if (ev.eventName && item.eventName === ev.eventName) return true;
      if (ev.memberName && item.memberName === ev.memberName) return true;
      if (ev.displayName1 && item.displayName1 === ev.displayName1) return true;
      return false;
    };

    const countReceipts = state.receipts.filter(isMatchingEvent).length;
    const countPayouts = state.payouts.filter(isMatchingEvent).length;
    const eventTitle = ev.displayName1 ? (ev.displayName1 + (ev.memberName ? ' - ' + ev.memberName : '')) : (ev.memberName || ev.eventName || 'Event');

    let modalRoot = document.getElementById('event-delete-modal-root');
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'event-delete-modal-root';
      document.body.appendChild(modalRoot);
    }

    modalRoot.innerHTML = `
      <div class="modal-overlay flex items-center justify-center p-4 fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]">
        <div class="glass-card w-full max-w-md p-6 space-y-4 shadow-2xl relative border border-rose-500/50 bg-slate-900/95 rounded-2xl animate-in fade-in zoom-in duration-150">
          
          <!-- Header -->
          <div class="flex items-center justify-between pb-3 border-b border-rose-500/30">
            <h3 class="text-base font-bold text-rose-400 flex items-center space-x-2">
              <i data-lucide="alert-triangle" class="w-5 h-5 text-rose-400"></i>
              <span>Delete Event (நிகழ்ச்சி நீக்குதல்)</span>
            </h3>
            <button type="button" onclick="document.getElementById('event-delete-modal-root').innerHTML=''" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Content / Warnings -->
          <div class="space-y-3 text-xs text-slate-300">
            <p class="font-bold text-sm text-slate-100">
              Are you sure you want to delete event:
              <span class="text-amber-400 block text-base mt-1 font-extrabold">${escapeHtml(eventTitle)}</span>
            </p>

            <div class="bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 space-y-1.5 text-slate-300">
              <div class="font-bold text-rose-300 text-[11px] uppercase tracking-wider mb-1">Permanent Local Deletion:</div>
              <div>• Event Master Record: <strong class="text-white">${escapeHtml(eventTitle)}</strong></div>
              <div>• Saved Moi Receipts: <strong class="text-amber-400 font-mono">${countReceipts}</strong> receipt(s)</div>
              <div>• Payout Expense Entries: <strong class="text-amber-400 font-mono">${countPayouts}</strong> record(s)</div>
              <div>• Overall Reports & Local Computer Backup Folders</div>
            </div>

            <!-- Checkbox for Google Drive Deletion -->
            <div class="bg-slate-800/90 border border-amber-500/30 rounded-xl p-3.5 hover:border-amber-400 transition">
              <label class="flex items-start space-x-3 cursor-pointer select-none">
                <input type="checkbox" id="chk-delete-from-drive" class="mt-0.5 w-4 h-4 rounded text-rose-500 focus:ring-rose-400 border-slate-600 bg-slate-700 cursor-pointer">
                <div class="space-y-0.5">
                  <span class="font-bold text-amber-300 text-xs block">
                    Delete event datas from Google Drive also
                  </span>
                  <span class="text-[11px] text-slate-400 block leading-tight">
                    (கூகுள் டிரைவிலிருந்தும் நிகழ்வு, ரசீது கோப்புகள் & கூகுள் ஷீட்ஸ் பதிவுகளையும் நிரந்தரமாக நீக்குக)
                  </span>
                </div>
              </label>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex space-x-3 pt-3 border-t border-slate-800">
            <button type="button" onclick="document.getElementById('event-delete-modal-root').innerHTML=''" class="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300 transition cursor-pointer">
              Cancel (ரத்து செய்)
            </button>
            <button type="button" id="btn-confirm-event-delete" class="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-xs font-bold rounded-xl text-white shadow-lg shadow-rose-900/40 transition flex items-center justify-center space-x-1.5 cursor-pointer">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
              <span>Delete Event</span>
            </button>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    document.getElementById('btn-confirm-event-delete')?.addEventListener('click', async () => {
      const deleteFromDrive = document.getElementById('chk-delete-from-drive')?.checked || false;
      
      const btn = document.getElementById('btn-confirm-event-delete');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Deleting...';
      }

      try {
        // Guarantee all member details are permanently preserved in state.members
        // (Per user instruction: "if event master deleted and don't delete the members details")
        (state.receipts || []).forEach(r => {
          upsertMemberRecord(r);
        });

        // 1. Delete all receipts belonging to this event
        state.receipts = state.receipts.filter(r => !isMatchingEvent(r));

        // 2. Delete all payout entries belonging to this event
        state.payouts = state.payouts.filter(p => !isMatchingEvent(p));

        // 3. Unassign event from users
        state.users.forEach(u => {
          if (u.assignedEventId === eventId) {
            u.assignedEventId = '';
          }
        });

        // 4. Remove event itself
        state.events = state.events.filter(e => e.id !== eventId);
        if (state.activeEventId === eventId) {
          state.activeEventId = state.events.length > 0 ? state.events[0].id : null;
        }

        // 5. Delete backup folder from disk on server (and local Google Drive folder if requested)
        try {
          await fetch('/api/events/delete-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventName: ev.eventName,
              displayName1: ev.displayName1,
              memberName: ev.memberName,
              deleteDriveFolder: deleteFromDrive
            })
          });
        } catch (e) {
          console.warn('Local event folder deletion notice:', e);
        }

        // 6. Sync deletion to Google Apps Script / Drive if user opted in
        if (deleteFromDrive) {
          try {
            await syncToGas('deleteEvent', {
              eventId,
              eventName: ev.eventName,
              displayName1: ev.displayName1,
              memberName: ev.memberName,
              deleteFromDrive: true
            });
          } catch (e) {
            console.warn('Drive deletion sync notice:', e);
          }
        }

        // 7. Save DB & Re-render all panels
        await saveDb();

        document.getElementById('event-delete-modal-root').innerHTML = '';
        renderApp();

        const successMsg = `Event "${eventTitle}" deleted locally${deleteFromDrive ? ' and from Google Drive' : ''} (${countReceipts} receipts, ${countPayouts} payouts cleared).`;
        if (typeof window.showToast === 'function') {
          window.showToast(successMsg, 'success');
        } else {
          alert(successMsg);
        }
      } catch (err) {
        console.error('Delete Event Error:', err);
        alert('Error during event deletion: ' + err.message);
        document.getElementById('event-delete-modal-root').innerHTML = '';
      }
    });
  };

  // DELETE ALL SAVED EVENTS (WITH CONFIRMATION & MEMBER PRESERVATION)
  window.appDeleteAllSavedEvents = function () {
    if (!state.currentUser || state.currentUser.role !== 'admin') {
      alert('Access Restricted: Only Admin can delete events!');
      return;
    }

    const savedEvents = state.events.filter(e => e.status !== 'completed');
    if (savedEvents.length === 0) {
      if (typeof window.showToast === 'function') {
        window.showToast('No saved events to delete', 'info');
      } else {
        alert('No saved events to delete');
      }
      return;
    }

    let modalRoot = document.getElementById('event-delete-modal-root');
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'event-delete-modal-root';
      document.body.appendChild(modalRoot);
    }

    modalRoot.innerHTML = `
      <div class="modal-overlay flex items-center justify-center p-4 fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]">
        <div class="glass-card w-full max-w-md p-6 space-y-4 shadow-2xl relative border border-rose-500/50 bg-slate-900/95 rounded-2xl animate-in fade-in zoom-in duration-150">
          
          <!-- Header -->
          <div class="flex items-center justify-between pb-3 border-b border-rose-500/30">
            <h3 class="text-base font-bold text-rose-400 flex items-center space-x-2">
              <i data-lucide="alert-triangle" class="w-5 h-5 text-rose-400"></i>
              <span>Delete All Saved Events (அனைத்து நிகழ்வுகளையும் நீக்குதல்)</span>
            </h3>
            <button type="button" onclick="document.getElementById('event-delete-modal-root').innerHTML=''" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Content / Warnings -->
          <div class="space-y-3 text-xs text-slate-300">
            <p class="font-bold text-sm text-slate-100">
              Are you sure you want to delete <span class="text-rose-400 font-mono text-base font-extrabold">ALL ${savedEvents.length} Saved Events</span>?
            </p>

            <div class="bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 space-y-1.5 text-slate-300">
              <div class="font-bold text-rose-300 text-[11px] uppercase tracking-wider mb-1">Permanent Local Deletion:</div>
              <div>• All <strong class="text-white font-mono">${savedEvents.length}</strong> Saved Event Master Records</div>
              <div>• Associated Event Receipts & Payouts</div>
              <div>• Local Computer Backup Folders</div>
              <div class="text-emerald-400 font-semibold pt-1">✓ Member profiles and donor contact details will be safely preserved.</div>
            </div>

            <!-- Checkbox for Google Drive Deletion -->
            <div class="bg-slate-800/90 border border-amber-500/30 rounded-xl p-3.5 hover:border-amber-400 transition">
              <label class="flex items-start space-x-3 cursor-pointer select-none">
                <input type="checkbox" id="chk-delete-all-from-drive" class="mt-0.5 w-4 h-4 rounded text-rose-500 focus:ring-rose-400 border-slate-600 bg-slate-700 cursor-pointer">
                <div class="space-y-0.5">
                  <span class="font-bold text-amber-300 text-xs block">
                    Delete event datas from Google Drive also
                  </span>
                  <span class="text-[11px] text-slate-400 block leading-tight">
                    (கூகுள் டிரைவிலிருந்தும் நிகழ்வு கோப்புகள் & கூகுள் ஷீட்ஸ் பதிவுகளையும் நிரந்தரமாக நீக்குக)
                  </span>
                </div>
              </label>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex space-x-3 pt-3 border-t border-slate-800">
            <button type="button" onclick="document.getElementById('event-delete-modal-root').innerHTML=''" class="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300 transition cursor-pointer">
              Cancel (ரத்து செய்)
            </button>
            <button type="button" id="btn-confirm-all-events-delete" class="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-xs font-bold rounded-xl text-white shadow-lg shadow-rose-900/40 transition flex items-center justify-center space-x-1.5 cursor-pointer">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
              <span>Delete All (${savedEvents.length})</span>
            </button>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    document.getElementById('btn-confirm-all-events-delete')?.addEventListener('click', async () => {
      const deleteFromDrive = document.getElementById('chk-delete-all-from-drive')?.checked || false;
      const btn = document.getElementById('btn-confirm-all-events-delete');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Deleting...';
      }

      try {
        // Guarantee all member details are permanently preserved in state.members
        (state.receipts || []).forEach(r => {
          upsertMemberRecord(r);
        });

        const deletedIds = new Set(savedEvents.map(e => e.id));
        const isMatchingDeletedEvent = (item) => {
          if (!item) return false;
          if (item.eventId && deletedIds.has(item.eventId)) return true;
          return savedEvents.some(ev => {
            if (ev.eventName && item.eventName === ev.eventName) return true;
            if (ev.memberName && item.memberName === ev.memberName) return true;
            if (ev.displayName1 && item.displayName1 === ev.displayName1) return true;
            return false;
          });
        };

        // 1. Delete matching receipts
        state.receipts = state.receipts.filter(r => !isMatchingDeletedEvent(r));

        // 2. Delete matching payouts
        state.payouts = state.payouts.filter(p => !isMatchingDeletedEvent(p));

        // 3. Unassign events from users
        state.users.forEach(u => {
          if (deletedIds.has(u.assignedEventId)) {
            u.assignedEventId = '';
          }
        });

        // 4. Delete event folders on server
        for (const ev of savedEvents) {
          try {
            await fetch('/api/events/delete-folder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventName: ev.eventName,
                displayName1: ev.displayName1,
                memberName: ev.memberName,
                deleteDriveFolder: deleteFromDrive
              })
            });
          } catch (e) {
            console.warn('Folder deletion notice:', e);
          }

          if (deleteFromDrive) {
            try {
              await syncToGas('deleteEvent', {
                eventId: ev.id,
                eventName: ev.eventName,
                displayName1: ev.displayName1,
                memberName: ev.memberName,
                deleteDriveFolder: true
              });
            } catch (e) {
              console.warn('Drive deletion sync notice:', e);
            }
          }
        }

        // 5. Remove events from state
        state.events = state.events.filter(e => !deletedIds.has(e.id));
        if (deletedIds.has(state.activeEventId)) {
          state.activeEventId = state.events.length > 0 ? state.events[0].id : null;
        }

        // 6. Save DB & Re-render
        await saveDb();

        document.getElementById('event-delete-modal-root').innerHTML = '';
        renderApp();

        const successMsg = `All ${savedEvents.length} saved events successfully deleted.`;
        if (typeof window.showToast === 'function') {
          window.showToast(successMsg, 'success');
        } else {
          alert(successMsg);
        }
      } catch (err) {
        console.error('Delete All Events Error:', err);
        alert('Error during events deletion: ' + err.message);
        document.getElementById('event-delete-modal-root').innerHTML = '';
      }
    });
  };

  // ==========================================
  // 4. USERS MASTER PANEL
  // ==========================================
  function renderUserMasterPanel() {
    const assignableEvents = state.events.filter(ev => ev.status !== 'completed');

    return `
      <div class="max-w-4xl mx-auto space-y-6">
        <div class="glass-card p-6">
          <h2 class="text-xl font-extrabold gold-gradient-text flex items-center space-x-3 mb-6">
            <i data-lucide="user-plus" class="w-6 h-6 text-amber-400"></i>
            <span>Users Master (Admin Only)</span>
          </h2>

          <form id="user-form" class="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Username *</label>
              <input type="text" id="usr-username" class="input-styled" placeholder="operator1" required>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Password *</label>
              <input type="password" id="usr-password" class="input-styled" placeholder="••••••" required>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Assign Event *</label>
              <select id="usr-event-assign" class="input-styled" required>
                <option value="">Select Event to Assign</option>
                ${assignableEvents.map(ev => `<option value="${ev.id}">${ev.displayName1 || ev.memberName}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''} (${ev.place})</option>`).join('')}
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Set Bill No (Optional)</label>
              <input type="number" id="usr-bill-no" class="input-styled font-mono" placeholder="Ex: 1001" min="1">
            </div>

            <div class="md:col-span-4 pt-2">
              <button type="submit" class="gold-button w-full py-3 rounded-xl font-bold flex items-center justify-center space-x-2">
                <i data-lucide="user-check" class="w-5 h-5"></i>
                <span>Save User</span>
              </button>
            </div>
          </form>
        </div>

        <div class="glass-card p-6">
          <h3 class="text-lg font-bold text-slate-100 mb-4">Saved Users & Assigned Events (${state.users.filter(u => u.username !== 'admin').length + 1})</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm text-slate-300">
              <thead class="text-xs uppercase bg-slate-900/60 text-amber-400 border-b border-slate-800">
                <tr>
                  <th class="px-4 py-3">Username</th>
                  <th class="px-4 py-3">Role</th>
                  <th class="px-4 py-3">Assigned Event</th>
                  <th class="px-4 py-3">Event Booking Date</th>
                  <th class="px-4 py-3">Set Bill No</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                <tr class="bg-slate-900/40">
                  <td class="px-4 py-3 font-bold text-amber-400">admin</td>
                  <td class="px-4 py-3"><span class="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-300 rounded font-bold">ADMIN</span></td>
                  <td class="px-4 py-3 text-slate-400">All Events</td>
                  <td class="px-4 py-3 text-slate-400 font-mono">-</td>
                  <td class="px-4 py-3 font-mono text-amber-300 font-bold">${state.users.find(u => u.username === 'admin')?.startingBillNo || '-'}</td>
                  <td class="px-4 py-3 text-right text-xs text-slate-500">Default</td>
                </tr>
                ${state.users.filter(u => u.username !== 'admin').map(u => {
                  const ev = state.events.find(e => e.id === u.assignedEventId);
                  return `
                    <tr>
                      <td class="px-4 py-3 font-medium text-slate-100">${u.username}</td>
                      <td class="px-4 py-3"><span class="px-2 py-0.5 text-xs bg-slate-800 text-slate-300 rounded">USER</span></td>
                      <td class="px-4 py-3 text-amber-300 font-medium">${ev ? ev.memberName + ' (' + ev.place + ')' : 'Not Assigned'}</td>
                      <td class="px-4 py-3 font-mono text-emerald-400 font-semibold">${ev && ev.eventDate ? ev.eventDate : '-'}</td>
                      <td class="px-4 py-3 font-mono text-amber-300 font-bold">${u.startingBillNo || '-'}</td>
                      <td class="px-4 py-3 text-right space-x-3">
                        <button onclick="window.appEditUser('${u.id}')" class="text-amber-400 hover:text-amber-300 text-xs font-semibold">Edit</button>
                        <button onclick="window.appDeleteUser('${u.id}')" class="text-rose-400 hover:text-rose-300 text-xs font-semibold">Delete</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Change Admin Password Section -->
        <div class="glass-card p-6 border border-amber-500/30">
          <h3 class="text-lg font-bold text-amber-300 flex items-center space-x-2 mb-4">
            <i data-lucide="key-round" class="w-5 h-5 text-amber-400"></i>
            <span>Change Admin Password</span>
          </h3>

          <form id="admin-pass-form" class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Current Password *</label>
              <input type="password" id="admin-curr-pass" class="input-styled" placeholder="••••••" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">New Admin Password *</label>
              <input type="password" id="admin-new-pass" class="input-styled" placeholder="••••••" required>
            </div>
            <div>
              <button type="submit" class="gold-button w-full py-2.5 rounded-xl font-bold flex items-center justify-center space-x-2">
                <i data-lucide="shield-check" class="w-4 h-4"></i>
                <span>Update Admin Password</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <div id="user-edit-modal-root"></div>
    `;
  }

  function bindUserMasterEvents() {
    const adminPassForm = document.getElementById('admin-pass-form');
    adminPassForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currPass = document.getElementById('admin-curr-pass').value.trim();
      const newPass = document.getElementById('admin-new-pass').value.trim();

      let adminUsr = state.users.find(u => u.username.toLowerCase() === 'admin' || u.role === 'admin');
      const actualCurrPass = adminUsr ? adminUsr.password : '1234';

      if (currPass !== actualCurrPass) {
        alert('Current Admin password is incorrect!');
        return;
      }

      if (adminUsr) {
        adminUsr.password = newPass;
      } else {
        adminUsr = { id: 'admin', username: 'admin', password: newPass, role: 'admin' };
        state.users.push(adminUsr);
      }

      await saveDb();
      alert('Admin Password updated successfully!');
      renderApp();
    });

    const form = document.getElementById('user-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('usr-username').value.trim();
      const password = document.getElementById('usr-password').value.trim();
      const assignedEventId = document.getElementById('usr-event-assign').value;
      const startingBillNo = document.getElementById('usr-bill-no').value.trim();

      if (state.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        alert('This username already exists!');
        return;
      }

      const newUser = {
        id: 'usr_' + Date.now(),
        username,
        password,
        role: 'user',
        assignedEventId,
        startingBillNo
      };

      state.users.push(newUser);

      // Automatically set event status to assigned & record username
      if (assignedEventId) {
        const ev = state.events.find(e => e.id === assignedEventId);
        if (ev) {
          ev.status = 'assigned';
          ev.assignedUsername = username;
        }
      }

      await saveDb();

      alert(`User "${username}" created and event assigned!`);
      renderApp();
    });
  }

  window.appEditUser = function (userId) {
    const user = state.users.find(u => u.id === userId);
    if (!user) return;

    const assignableEvents = state.events.filter(ev => ev.status !== 'completed' || ev.id === user.assignedEventId);

    const modalRoot = document.getElementById('user-edit-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-overlay">
        <div class="glass-card w-full max-w-md p-6 space-y-4">
          <h3 class="text-lg font-bold gold-gradient-text flex items-center space-x-2">
            <i data-lucide="user-cog" class="w-5 h-5 text-amber-400"></i>
            <span>Edit User</span>
          </h3>

          <form id="edit-user-form" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Username</label>
              <input type="text" id="edit-usr-name" class="input-styled" value="${user.username}" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Password</label>
              <input type="password" id="edit-usr-pass" class="input-styled" value="${user.password}" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Assign Event</label>
              <select id="edit-usr-event" class="input-styled" required>
                <option value="">Select Event to Assign</option>
                ${assignableEvents.map(ev => `<option value="${ev.id}" ${ev.id === user.assignedEventId ? 'selected' : ''}>${ev.displayName1 || ev.memberName}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''} (${ev.place})</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Set Bill No (Optional)</label>
              <input type="number" id="edit-usr-bill-no" class="input-styled font-mono" value="${user.startingBillNo || ''}" placeholder="Ex: 1001" min="1">
            </div>

            <div class="flex space-x-3 pt-3">
              <button type="button" onclick="document.getElementById('user-edit-modal-root').innerHTML=''" class="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl">
                Cancel
              </button>
              <button type="submit" class="w-1/2 gold-button py-2.5 text-xs font-bold rounded-xl">
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newUsername = document.getElementById('edit-usr-name').value.trim();
      const newPassword = document.getElementById('edit-usr-pass').value.trim();
      const newAssignedId = document.getElementById('edit-usr-event').value;
      const newStartingBillNo = document.getElementById('edit-usr-bill-no').value.trim();

      const oldAssignedId = user.assignedEventId;
      user.username = newUsername;
      user.password = newPassword;
      user.assignedEventId = newAssignedId;
      user.startingBillNo = newStartingBillNo;

      // Handle status reset for old event
      if (oldAssignedId && oldAssignedId !== newAssignedId) {
        const standardOtherAssigned = state.users.some(u => u.id !== user.id && u.assignedEventId === oldAssignedId);
        if (!standardOtherAssigned) {
          const oldEv = state.events.find(e => e.id === oldAssignedId);
          if (oldEv && oldEv.status === 'assigned') {
            oldEv.status = 'confirmed';
            oldEv.assignedUsername = '';
          }
        }
      }

      // Handle status update for new event
      if (newAssignedId) {
        const newEv = state.events.find(e => e.id === newAssignedId);
        if (newEv) {
          newEv.status = 'assigned';
          newEv.assignedUsername = newUsername;
        }
      }

      await saveDb();
      document.getElementById('user-edit-modal-root').innerHTML = '';
      renderApp();
    });
  };

  // ==========================================
  // 5. MOI ENTRY PANEL
  // ==========================================
  function renderMoiEntryPanel() {
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    const activeEv = getActiveEvent();
    if (!activeEv) {
      return `
        <div class="glass-card p-8 text-center max-w-lg mx-auto">
          <i data-lucide="alert-circle" class="w-12 h-12 text-amber-400 mx-auto mb-3"></i>
          <h3 class="text-lg font-bold text-slate-100">No Active Event Selected</h3>
          <p class="text-xs text-slate-400 mt-2 mb-4">Please select or create an event in Event Master first.</p>
        </div>
      `;
    }

    const nextBillNo = getNextBillNoForEvent(activeEv.id);

    return `
      <div class="max-w-6xl mx-auto space-y-6">
        <div class="glass-card p-6">
          <div class="flex flex-col sm:flex-row items-center justify-between mb-4 pb-4 border-b border-slate-800 gap-4">
            <h2 class="text-xl font-extrabold gold-gradient-text flex items-center space-x-3 shrink-0">
              <i data-lucide="file-plus-2" class="w-6 h-6 text-amber-400"></i>
              <span>Moi Entry</span>
            </h2>

            <div class="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap sm:flex-nowrap">
              <button type="button" onclick="window.appSwitchToReceiptsPanel()" class="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 font-bold text-xs shadow-md transition cursor-pointer shrink-0">
                <i data-lucide="receipt" class="w-4 h-4 text-amber-400"></i>
                <span>View Receipts</span>
              </button>

              <!-- Select Event & Bill No in a single nowrap flex row so Bill No is ALWAYS directly after Select Event -->
              <div class="flex items-center space-x-2 flex-nowrap shrink-0">
                <label class="text-xs font-semibold text-amber-400 whitespace-nowrap">Select Event:</label>
                <select id="moi-event-select" class="input-styled text-sm py-1.5 min-w-[170px] max-w-[240px]" ${!isAdmin ? 'disabled' : ''}>
                  ${getVisibleEvents().length === 0 ? '<option value="">No Assigned Event Available</option>' : ''}
                  ${getVisibleEvents().map(ev => `
                    <option value="${ev.id}" ${ev.id === state.activeEventId ? 'selected' : ''}>
                      ${ev.displayName1 || ev.memberName}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''} (${ev.place})
                    </option>
                  `).join('')}
                </select>
                <div class="flex items-center space-x-1.5 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-amber-500/40 whitespace-nowrap shrink-0">
                  <span class="text-xs font-semibold text-slate-400 whitespace-nowrap">Bill No:</span>
                  <span id="moi-bill-no-display" class="text-sm font-black font-mono text-amber-400 tracking-wider">#${nextBillNo}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Saving Locations (சேமிக்கும் முறைமை) Section right after Select Event -->
          <div class="bg-slate-900/90 p-3.5 rounded-2xl border border-amber-500/30 mb-5 space-y-2 text-xs">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p class="font-bold text-amber-300 flex items-center space-x-2 text-xs">
                <i data-lucide="hard-drive" class="w-4 h-4 text-emerald-400"></i>
                <span>Saving Locations (சேமிக்கும் முறைமை):</span>
              </p>
              <div class="flex items-center space-x-2">
                <span class="text-[11px] text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-1 rounded-lg font-bold flex items-center space-x-1">
                  <i data-lucide="file-code" class="w-3.5 h-3.5 text-emerald-400"></i>
                  <span>✓ Google Drive HTML Auto Sync (.html)</span>
                </span>
              </div>
            </div>

            <!-- Save to Local Disk in Computer in Drop Down Arrow -->
            <details class="group pt-1 border-t border-slate-800/80">
              <summary class="flex items-center justify-between cursor-pointer list-none select-none py-1.5 hover:text-amber-300 transition">
                <span class="font-bold text-slate-200 flex items-center space-x-2">
                  <i data-lucide="folder-cog" class="w-3.5 h-3.5 text-amber-400"></i>
                  <span>Save to Local Disk in Computer (Optional / விருப்பப்பட்டால்)</span>
                  ${state.localSaveFolderName ? `<span class="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-md">📁 ${state.localSaveFolderName}</span>` : ''}
                </span>
                <div class="flex items-center space-x-1 text-slate-400 group-open:text-amber-400">
                  <span class="text-[11px] font-medium hidden sm:inline group-open:hidden">விரிவாக்க ▼</span>
                  <span class="text-[11px] font-medium hidden sm:group-open:inline">சுருக்க ▲</span>
                  <i data-lucide="chevron-down" class="w-4 h-4 group-open:rotate-180 transition-transform duration-200"></i>
                </div>
              </summary>
              
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5">
                <!-- Option 1: Not Applicable -->
                <div onclick="window.appClearLocalSaveDirectory()" class="flex items-start space-x-2.5 bg-slate-950/70 hover:bg-slate-950 p-3 rounded-xl border ${!state.localSaveFolderName ? 'border-amber-500/60 bg-amber-950/20' : 'border-slate-800'} cursor-pointer transition">
                  <input type="radio" name="moi-local-disk-option" ${!state.localSaveFolderName ? 'checked' : ''} class="mt-0.5 w-4 h-4 text-amber-500 pointer-events-none">
                  <div>
                    <p class="font-bold text-slate-200">1. Not Applicable (தேவையில்லை)</p>
                    <p class="text-[11px] text-slate-400 mt-0.5">Do not save to local disk. Only auto-save HTML receipt files to Google Drive.</p>
                  </div>
                </div>

                <!-- Option 2: Select Local Disk Folder -->
                <div onclick="window.appChooseLocalSaveDirectory()" class="flex items-start space-x-2.5 bg-slate-950/70 hover:bg-slate-950 p-3 rounded-xl border ${state.localSaveFolderName ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-slate-800'} cursor-pointer transition">
                  <input type="radio" name="moi-local-disk-option" ${state.localSaveFolderName ? 'checked' : ''} class="mt-0.5 w-4 h-4 text-emerald-500 pointer-events-none">
                  <div>
                    <p class="font-bold text-emerald-300 flex items-center space-x-1">
                      <i data-lucide="folder-plus" class="w-3.5 h-3.5 text-emerald-400"></i>
                      <span>2. Select Local Folder (கோப்புறை தேர்வு)</span>
                    </p>
                    <p class="text-[11px] text-slate-400 mt-0.5">
                      ${state.localSaveFolderName ? `<span class="text-emerald-400 font-bold">📁 Folder: ${state.localSaveFolderName}</span>` : 'Opens Save As window to choose a computer folder.'}
                    </p>
                  </div>
                </div>
              </div>
            </details>
          </div>

          <form id="moi-entry-form" onsubmit="event.preventDefault(); window.appSubmitMoiEntry(false);" class="grid grid-cols-1 lg:grid-cols-12 gap-5 relative">
            <!-- Left Side: Main Data Entry Fields (8 columns on lg) -->
            <div class="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <!-- Row 1: Mobile Number (Left) | Place (Right) -->
              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Mobile Number (Optional)</label>
                <div class="relative flex items-center">
                  <input type="tel" id="moi-mobile" class="input-styled py-2 px-3 text-sm pr-9 font-mono" placeholder="Ex: 9876543210" autocomplete="off" maxlength="15">
                  <button type="button" tabindex="-1" onclick="window.appStartSpeechToText('moi-mobile', 'en-IN')" id="btn-speech-moi-mobile" title="Voice Input" class="speech-mic-btn absolute right-2 text-amber-400 hover:text-amber-300 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
                <div id="moi-mobile-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Place *</label>
                <div class="relative flex items-center">
                  <input type="text" id="moi-place" class="input-styled py-2 px-3 text-sm pr-9" placeholder="Type in English (e.g. Madurai) or Tamil" required autocomplete="off">
                  <button type="button" tabindex="-1" onclick="window.appStartSpeechToText('moi-place')" id="btn-speech-moi-place" title="Tamil Voice Input (தமிழில் பேசி பதிவு செய்ய அழுத்தவும்)" class="speech-mic-btn absolute right-2 text-amber-400 hover:text-amber-300 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
                <div id="moi-place-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <!-- Row 2: Initial (Left) | Name (Right) -->
              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Initial (Optional)</label>
                <div class="relative flex items-center">
                  <input type="text" id="moi-initial" class="input-styled py-2 px-3 text-sm uppercase font-bold pr-9" placeholder="Ex: K, S.M, V" autocomplete="off">
                  <button type="button" tabindex="-1" onclick="window.appStartSpeechToText('moi-initial')" id="btn-speech-moi-initial" title="Voice Input" class="speech-mic-btn absolute right-2 text-amber-400 hover:text-amber-300 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>

              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Name *</label>
                <div class="relative flex items-center">
                  <input type="text" id="moi-name" class="input-styled py-2 px-3 text-sm pr-9" placeholder="Type in English (e.g. Kumar) or Tamil" required autocomplete="off">
                  <button type="button" tabindex="-1" onclick="window.appStartSpeechToText('moi-name')" id="btn-speech-moi-name" title="Tamil Voice Input (தமிழில் பேசி பதிவு செய்ய அழுத்தவும்)" class="speech-mic-btn absolute right-2 text-amber-400 hover:text-amber-300 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
                <div id="moi-name-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <!-- Row 3: Name 1 (Left) | Job (Right) - Job rearranged after Name 1 per user request -->
              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Name 1 (Optional)</label>
                <div class="relative flex items-center">
                  <input type="text" id="moi-name1" class="input-styled py-2 px-3 text-sm pr-9" placeholder="Type in English (e.g. Priya) or Tamil (Optional)" autocomplete="off">
                  <button type="button" tabindex="-1" onclick="window.appStartSpeechToText('moi-name1')" id="btn-speech-moi-name1" title="Tamil Voice Input (தமிழில் பேசி பதிவு செய்ய அழுத்தவும்)" class="speech-mic-btn absolute right-2 text-amber-400 hover:text-amber-300 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
                <div id="moi-name1-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Job (Optional)</label>
                <div class="relative flex items-center">
                  <input type="text" id="moi-job" class="input-styled py-2 px-3 text-sm pr-9" placeholder="Ex: Farmer, Teacher, Army" autocomplete="off">
                  <button type="button" tabindex="-1" onclick="window.appStartSpeechToText('moi-job')" id="btn-speech-moi-job" title="Voice Input" class="speech-mic-btn absolute right-2 text-amber-400 hover:text-amber-300 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>

              <!-- Row 4: Relationship (Optional) - Full width in left column -->
              <div class="md:col-span-2 relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Relationship (Optional)</label>
                <input type="text" id="moi-relationship" class="input-styled py-2 px-3 text-sm" placeholder="Ex: தாய்மாமன், நண்பர், பங்காளி" autocomplete="off">
                <div id="moi-relationship-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <!-- Row 5: Amount (Left) | Amount in Tamil Words (Right) -->
              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Amount (₹) *</label>
                <div class="relative flex items-center">
                  <input type="number" id="moi-amount" class="input-styled py-2 px-3 font-mono text-base font-bold text-emerald-400 pr-9" placeholder="500" min="1" required>
                  <button type="button" tabindex="-1" onclick="window.appStartSpeechToText('moi-amount')" id="btn-speech-moi-amount" title="Tamil Voice Input (தமிழில் பேசி பதிவு செய்ய அழுத்தவும்)" class="speech-mic-btn absolute right-2 text-emerald-400 hover:text-emerald-300 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>

              <div class="bg-slate-900/80 p-2.5 rounded-xl border border-amber-500/30 space-y-1">
                <label class="block text-xs font-semibold text-amber-400">
                  Amount in Tamil Words:
                </label>
                <input type="text" id="moi-amount-words" class="input-styled py-1.5 px-3 text-sm font-bold text-amber-300" placeholder="பூஜ்யம் ரூபாய் மட்டும்">
              </div>

              <!-- Tamil Character Palette & Dictionary (Full width) -->
              <div class="md:col-span-2 flex flex-wrap items-center gap-3">
                <button type="button" onclick="window.appToggleTamilKeyboard()" class="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-300 border border-slate-700 flex items-center space-x-2 cursor-pointer">
                  <i data-lucide="keyboard" class="w-4 h-4 text-amber-400"></i>
                  <span>தமிழ் எழுத்துக்கள் விசைப்பலகை (Tamil Character Palette)</span>
                </button>

                <button type="button" onclick="window.appOpenTamilDictModal()" class="py-2 px-4 rounded-xl bg-amber-950/80 hover:bg-amber-900/90 text-xs font-bold text-amber-300 border border-amber-500/40 flex items-center space-x-2 cursor-pointer shadow-md">
                  <i data-lucide="book-open" class="w-4 h-4 text-amber-400"></i>
                  <span>📖 Edit Tamil Dictionary (தமிழ் அகராதி)</span>
                </button>

                <div id="tamil-keyboard-wrapper" class="hidden tamil-keyboard-container w-full">
                  <p class="text-xs text-amber-300 font-semibold mb-2">எழுத்துக்களை சொடுக்கி விரும்பிய இடத்தில் நேரடியாக சேர்க்கவும்:</p>
                  <div class="flex flex-wrap gap-1.5 mb-2">
                    <span class="text-[11px] text-slate-400 w-full font-bold">உயிரெழுத்துக்கள்:</span>
                    ${['அ', 'ஆ', 'இ', 'ஈ', 'உ', 'ஊ', 'எ', 'ஏ', 'ஐ', 'ஒ', 'ஓ', 'ஔ', 'ஃ'].map(char => `
                      <button type="button" class="tamil-key-btn" onclick="window.appInsertTamilChar('${char}')">${char}</button>
                    `).join('')}
                  </div>

                  <div class="flex flex-wrap gap-1.5 mb-2">
                    <span class="text-[11px] text-slate-400 w-full font-bold">மெய்யெழுத்துக்கள் & உயிர்மெய்:</span>
                    ${['க', 'ச', 'ட', 'த', 'ப', 'ற', 'ங', 'ஞ', 'ண', 'ந', 'ம', 'ன', 'ய', 'ர', 'ல', 'வ', 'ழ', 'ள', 'ஜ', 'ஷ', 'ஸ', 'ஹ'].map(char => `
                      <button type="button" class="tamil-key-btn" onclick="window.appInsertTamilChar('${char}')">${char}</button>
                    `).join('')}
                  </div>

                  <div class="flex flex-wrap gap-1.5">
                    <span class="text-[11px] text-slate-400 w-full font-bold">குறியீடுகள்:</span>
                    ${['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ', '்'].map(char => `
                      <button type="button" class="tamil-key-btn font-bold text-amber-400" onclick="window.appInsertTamilChar('${char}')">${char}</button>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Side: Payment Mode Separately on Right Side of Window (4 columns on lg) -->
            <div class="lg:col-span-4 flex flex-col space-y-4">
              <div class="bg-slate-900/95 border border-amber-500/40 p-4 rounded-2xl shadow-xl space-y-4 sticky top-4">
                <div class="border-b border-slate-800 pb-2 flex items-center justify-between">
                  <label class="block text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <i data-lucide="credit-card" class="w-4 h-4 text-amber-400"></i>
                    <span>Payment Mode *</span>
                  </label>
                </div>

                <!-- Payment Mode Selectable Cards -->
                <div class="grid grid-cols-2 lg:grid-cols-1 gap-2.5">
                  <label class="flex items-center space-x-3 p-3 rounded-xl border border-slate-700/80 bg-slate-800/90 hover:bg-slate-800 cursor-pointer transition select-none">
                    <input type="radio" name="moi-mode" value="Cash" checked class="w-4 h-4 text-amber-500">
                    <div>
                      <span class="text-sm font-bold text-slate-100 flex items-center space-x-1.5">
                        <span>💵 Cash</span>
                      </span>
                      <span class="text-[11px] text-slate-400 block font-semibold">(ரொக்கம்)</span>
                    </div>
                  </label>

                  <label class="flex items-center justify-between p-3 rounded-xl border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-950/60 cursor-pointer transition select-none">
                    <div class="flex items-center space-x-3">
                      <input type="radio" name="moi-mode" value="UPI" class="w-4 h-4 text-amber-500">
                      <div>
                        <span class="text-sm font-bold text-slate-100 flex items-center space-x-1.5">
                          <span>📱 UPI QR</span>
                        </span>
                        <span class="text-[11px] text-indigo-300 block font-semibold">(யூ.பி.ஐ க்யூஆர்)</span>
                      </div>
                    </div>
                    <button type="button" id="btn-open-upi-qr" onclick="window.appOpenUpiQrModal()" title="Open UPI QR Popup" class="text-[11px] bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/50 px-2 py-1 rounded-lg font-bold transition flex items-center space-x-1 cursor-pointer">
                      <i data-lucide="qr-code" class="w-3.5 h-3.5 text-indigo-300"></i>
                      <span>View QR</span>
                    </button>
                  </label>
                </div>

                <!-- UPI Ref / Time field (if selected) -->
                <div id="moi-upi-tx-time-box" class="hidden bg-indigo-950/50 p-3 rounded-xl border border-indigo-500/40 space-y-1">
                  <label class="block text-[11px] font-semibold text-indigo-300">UPI Ref No / Time *</label>
                  <input type="text" id="moi-upi-tx-time" class="input-styled font-mono text-xs py-1.5" placeholder="Ex: 11:45 AM / Ref: 987654321012">
                </div>

                <!-- WhatsApp Receipt Sending Option -->
                <div id="moi-whatsapp-option-box" class="bg-slate-950/90 border border-slate-700/80 p-2.5 rounded-xl shadow-sm">
                  <label class="flex items-start space-x-2.5 cursor-pointer select-none">
                    <input type="checkbox" id="moi-chk-send-whatsapp" class="mt-0.5 w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 border-slate-600 bg-slate-800 cursor-pointer" ${localStorage.getItem('aathi_auto_send_whatsapp') !== 'false' ? 'checked' : ''}>
                    <div class="flex flex-col">
                      <span class="text-xs font-bold text-slate-100 flex items-center space-x-1.5">
                        <i data-lucide="message-circle" class="w-3.5 h-3.5 text-emerald-400"></i>
                        <span>Send to WhatsApp</span>
                      </span>
                      <span class="text-[11px] text-amber-300 font-semibold">(வாட்ஸ்அப் ரசீது அனுப்பவும்)</span>
                    </div>
                  </label>
                </div>

                <!-- Single Submit Button: Save and Print (English only) -->
                <div class="pt-1" id="moi-entry-buttons-container">
                  <button type="button" id="btn-save-print-thermal" onclick="window.appSubmitMoiEntry()" class="gold-button w-full py-3.5 rounded-xl font-extrabold text-sm sm:text-base flex items-center justify-center space-x-2 shadow-xl cursor-pointer">
                    <i data-lucide="printer" class="w-5 h-5"></i>
                    <span>Save and Print</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>

        <!-- UPI QR Code Modal Popup Window -->
        <div id="moi-upi-qr-modal" class="hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div class="bg-slate-900 border-2 border-indigo-500/60 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <!-- Close button -->
            <button type="button" onclick="window.appCloseUpiQrModal()" class="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition cursor-pointer">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>

            <div>
              <div class="inline-flex p-3 rounded-2xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-400 mb-2">
                <i data-lucide="qr-code" class="w-8 h-8"></i>
              </div>
              <h3 class="text-base font-extrabold text-slate-100">Scan QR Code to Pay via UPI</h3>
              <p class="text-xs text-indigo-300 font-semibold">(யூ.பி.ஐ மூலம் செலுத்த ஸ்கேன் செய்யவும்)</p>
            </div>

            <div class="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl text-xs space-y-1">
              <p class="text-slate-300 font-medium">${activeEv.displayName1 || activeEv.memberName}</p>
              ${activeEv.upiId ? `<p class="font-mono text-indigo-300 font-bold">${activeEv.upiId}</p>` : ''}
              <p id="modal-upi-amount-display" class="text-emerald-400 font-mono font-black text-lg">₹0</p>
            </div>

            <!-- QR code image/canvas container -->
            <div class="flex justify-center my-2">
              <div id="modal-qrcode-container" class="p-3 bg-white rounded-2xl shadow-xl inline-block"></div>
            </div>

            <p id="modal-upi-string-display" class="text-[10px] font-mono text-slate-400 break-all select-all px-2"></p>

            <!-- UPI Ref No entry inside modal -->
            <div class="text-left space-y-1 bg-indigo-950/30 p-2.5 rounded-xl border border-indigo-500/30">
              <label class="block text-[11px] font-semibold text-indigo-300">UPI Ref No / Time (விருப்பப்பட்டால்):</label>
              <input type="text" id="modal-upi-tx-time" class="input-styled font-mono text-xs py-1.5" placeholder="Ex: 11:45 AM / Ref: 987654321012">
            </div>

            <!-- Done / Close Button -->
            <button type="button" onclick="window.appCloseUpiQrModal()" class="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg transition cursor-pointer">
              Done / Close (சரி / முடிந்தது)
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function bindMoiEntryEvents() {
    const placeInput = document.getElementById('moi-place');
    const initialInput = document.getElementById('moi-initial');
    const nameInput = document.getElementById('moi-name');
    const jobInput = document.getElementById('moi-job');
    const name1Input = document.getElementById('moi-name1');
    const relInput = document.getElementById('moi-relationship');
    const mobileInput = document.getElementById('moi-mobile');
    const mobileSuggDiv = document.getElementById('moi-mobile-suggestions');
    const amountInput = document.getElementById('moi-amount');
    const wordsInput = document.getElementById('moi-amount-words');
    const modeRadios = document.getElementsByName('moi-mode');
    const upiQrBox = document.getElementById('moi-upi-qr-box');
    const upiTxTimeBox = document.getElementById('moi-upi-tx-time-box');
    const qrContainer = document.getElementById('qrcode-container');
    const upiStringDisplay = document.getElementById('upi-string-display');
    const evSelect = document.getElementById('moi-event-select');

    evSelect?.addEventListener('change', (e) => {
      state.activeEventId = e.target.value;
      renderApp();
    });

    [placeInput, initialInput, nameInput, jobInput, name1Input, relInput, mobileInput, wordsInput].forEach(elem => {
      elem?.addEventListener('focus', () => {
        state.lastFocusedFieldId = elem.id;
      });
    });

    // Google Tamil Transliteration bindings for Name1, Relationship ONLY (Place and Name have enhanced saved data suggestions + transliteration below)
    bindGoogleTamilTransliteration('moi-name1', 'moi-name1-suggestions');
    bindGoogleTamilTransliteration('moi-relationship', 'moi-relationship-suggestions');

    // -------------------------------------------------------------
    // Enhanced Place Input with Saved Places Suggestions + Transliteration
    // -------------------------------------------------------------
    const placeSuggDiv = document.getElementById('moi-place-suggestions');
    let activePlaceIndex = -1;
    let currentPlaceMatches = [];

    const getSavedPlaces = () => {
      const counts = new Map();
      const add = (p) => {
        if (!p) return;
        const str = String(p).trim();
        if (!str || str === '-' || str === 'Unspecified') return;
        counts.set(str, (counts.get(str) || 0) + 1);
      };
      (state.receipts || []).forEach(r => add(r.place));
      (state.events || []).forEach(ev => add(ev.place));
      (state.members || []).forEach(m => add(m.place));
      (state.noteEntries || []).forEach(e => add(e.place));
      (state.noteEvents || []).forEach(e => add(e.place));

      return Array.from(counts.entries())
        .map(([place, count]) => ({ place, count }))
        .sort((a, b) => b.count - a.count || a.place.localeCompare(b.place, 'ta'));
    };

    const selectPlaceItem = (placeName) => {
      if (!placeName) return;
      placeInput.value = placeName;
      if (placeSuggDiv) {
        placeSuggDiv.innerHTML = '';
        placeSuggDiv.classList.add('hidden');
      }
      activePlaceIndex = -1;
      currentPlaceMatches = [];
      initialInput?.focus();
      if (initialInput?.select) initialInput.select();
    };

    const updatePlaceActiveHighlight = (items) => {
      items.forEach((it, idx) => {
        if (idx === activePlaceIndex) {
          it.classList.add('active-sugg');
          it.scrollIntoView({ block: 'nearest' });
        } else {
          it.classList.remove('active-sugg');
        }
      });
    };

    const renderPlaceSuggestions = async () => {
      if (!placeInput || !placeSuggDiv) return;
      const rawVal = (placeInput.value || '').trim();
      const allSaved = getSavedPlaces();

      if (!rawVal) {
        // If empty, show top 6 saved places as quick 1-click options
        if (allSaved.length === 0) {
          placeSuggDiv.innerHTML = '';
          placeSuggDiv.classList.add('hidden');
          currentPlaceMatches = [];
          activePlaceIndex = -1;
          return;
        }
        activePlaceIndex = -1;
        currentPlaceMatches = allSaved.slice(0, 6).map(s => ({ type: 'place', value: s.place, count: s.count }));
        let html = `
          <div class="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-400 bg-slate-900/90 border-b border-amber-500/20 flex items-center justify-between">
            <span class="flex items-center space-x-1.5">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 text-amber-400"></i>
              <span>சேமிக்கப்பட்ட ஊர்கள் (Saved Places)</span>
            </span>
            <span class="text-slate-400 font-mono text-[9px]">Top ${currentPlaceMatches.length}</span>
          </div>
        `;
        currentPlaceMatches.forEach((m, idx) => {
          html += `
            <div class="place-sugg-item translit-item px-3 py-2 hover:bg-amber-500/20 cursor-pointer flex items-center justify-between border-b border-slate-800/60" data-idx="${idx}">
              <div class="flex items-center space-x-2">
                <span class="font-bold text-amber-300 text-sm">${escapeHtml(m.value)}</span>
              </div>
              <span class="text-[10px] font-mono font-bold text-amber-300/80 bg-slate-800/90 px-1.5 py-0.5 rounded border border-slate-700/60">${m.count} முறை</span>
            </div>
          `;
        });
        placeSuggDiv.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
        placeSuggDiv.classList.remove('hidden');

        placeSuggDiv.querySelectorAll('.place-sugg-item').forEach(el => {
          el.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            const idx = parseInt(el.getAttribute('data-idx'), 10);
            selectPlaceItem(currentPlaceMatches[idx].value);
          });
        });
        return;
      }

      // If user typed:
      const valLower = rawVal.toLowerCase();
      const isTamil = /[\u0B80-\u0BFF]/.test(rawVal);
      let possibleTas = [];
      if (!isTamil && window.TamilTransliterate) {
        const taDirect = window.TamilTransliterate.transliterateText(rawVal);
        if (taDirect) possibleTas.push(taDirect);
      }
      const goog = (!isTamil && window.TamilTransliterate) ? await window.TamilTransliterate.fetchGoogleInputToolsTamil(rawVal) : [];
      goog.forEach(g => {
        if (g.ta && !possibleTas.includes(g.ta)) possibleTas.push(g.ta);
      });

      // Matching saved places
      const matchedPlaces = allSaved.filter(sp => {
        const pLower = sp.place.toLowerCase();
        if (pLower.includes(valLower)) return true;
        if (possibleTas.some(ta => sp.place.includes(ta))) return true;
        return false;
      }).slice(0, 6);

      // Transliteration items if typing in English
      const dictSuggestions = (!isTamil && window.TamilTransliterate) ? window.TamilTransliterate.getDictionarySuggestions(rawVal) : [];
      const translitList = [...goog];
      dictSuggestions.forEach(d => {
        if (!translitList.some(c => c.ta === d.ta)) translitList.push(d);
      });

      if (matchedPlaces.length === 0 && translitList.length === 0) {
        placeSuggDiv.innerHTML = '';
        placeSuggDiv.classList.add('hidden');
        currentPlaceMatches = [];
        activePlaceIndex = -1;
        return;
      }

      currentPlaceMatches = [];
      let html = '';

      if (matchedPlaces.length > 0) {
        html += `
          <div class="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-400 bg-slate-900/90 border-b border-amber-500/20 flex items-center justify-between">
            <span class="flex items-center space-x-1.5">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 text-amber-400"></i>
              <span>சேமிக்கப்பட்ட ஊர்கள் (Saved Places)</span>
            </span>
            <span class="text-slate-400 font-mono text-[9px]">${matchedPlaces.length}</span>
          </div>
        `;
        matchedPlaces.forEach(p => {
          const itemIdx = currentPlaceMatches.length;
          currentPlaceMatches.push({ type: 'place', value: p.place, count: p.count });
          html += `
            <div class="place-sugg-item translit-item px-3 py-2 hover:bg-amber-500/20 cursor-pointer flex items-center justify-between border-b border-slate-800/60" data-idx="${itemIdx}">
              <div class="flex items-center space-x-2">
                <span class="font-bold text-amber-300 text-sm">${escapeHtml(p.place)}</span>
              </div>
              <span class="text-[10px] font-mono font-bold text-amber-300/80 bg-slate-800/90 px-1.5 py-0.5 rounded border border-slate-700/60">${p.count} முறை</span>
            </div>
          `;
        });
      }

      if (translitList.length > 0) {
        html += `
          <div class="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-400 bg-slate-900/90 border-b border-indigo-500/20 flex items-center space-x-1.5">
            <i data-lucide="languages" class="w-3 h-3 text-indigo-400"></i>
            <span>தமிழ் எழுத்துப்பெயர்ப்பு (Transliteration)</span>
          </div>
        `;
        translitList.forEach(t => {
          const itemIdx = currentPlaceMatches.length;
          currentPlaceMatches.push({ type: 'translit', value: t.ta });
          html += `
            <div class="place-sugg-item translit-item px-3 py-1.5 hover:bg-indigo-500/20 cursor-pointer flex items-center justify-between border-b border-slate-800/60" data-idx="${itemIdx}">
              <span class="font-semibold text-slate-100 text-sm">${escapeHtml(t.ta)}</span>
              <span class="text-[10px] text-indigo-400 font-mono">${t.isGoogle ? 'Google' : 'Tamil'}</span>
            </div>
          `;
        });
      }

      placeSuggDiv.innerHTML = html;
      if (window.lucide) window.lucide.createIcons();
      placeSuggDiv.classList.remove('hidden');
      activePlaceIndex = -1;

      placeSuggDiv.querySelectorAll('.place-sugg-item').forEach(el => {
        el.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          const idx = parseInt(el.getAttribute('data-idx'), 10);
          selectPlaceItem(currentPlaceMatches[idx].value);
        });
      });
    };

    placeInput?.addEventListener('input', renderPlaceSuggestions);
    placeInput?.addEventListener('focus', renderPlaceSuggestions);

    placeInput?.addEventListener('keydown', async (e) => {
      const items = placeSuggDiv?.querySelectorAll('.place-sugg-item');
      const isVisible = placeSuggDiv && !placeSuggDiv.classList.contains('hidden') && items && items.length > 0;

      if (e.key === 'ArrowDown') {
        if (isVisible) {
          e.preventDefault();
          activePlaceIndex = (activePlaceIndex + 1) % items.length;
          updatePlaceActiveHighlight(items);
        }
      } else if (e.key === 'ArrowUp') {
        if (isVisible) {
          e.preventDefault();
          activePlaceIndex = (activePlaceIndex - 1 + items.length) % items.length;
          updatePlaceActiveHighlight(items);
        }
      } else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        if (isVisible) {
          e.preventDefault();
          const chosenIdx = activePlaceIndex >= 0 ? activePlaceIndex : 0;
          if (currentPlaceMatches[chosenIdx]) {
            selectPlaceItem(currentPlaceMatches[chosenIdx].value);
          } else {
            placeSuggDiv.classList.add('hidden');
            initialInput?.focus();
          }
        } else {
          e.preventDefault();
          if (placeInput.value && !/[\u0B80-\u0BFF]/.test(placeInput.value)) {
            const goog = await window.TamilTransliterate?.fetchGoogleInputToolsTamil(placeInput.value);
            if (goog && goog.length > 0) {
              placeInput.value = goog[0].ta;
            } else if (window.TamilTransliterate) {
              placeInput.value = window.TamilTransliterate.transliterateText(placeInput.value);
            }
          }
          initialInput?.focus();
          if (initialInput?.select) initialInput.select();
        }
      } else if (e.key === 'Escape') {
        placeSuggDiv?.classList.add('hidden');
      }
    });

    placeInput?.addEventListener('blur', () => {
      setTimeout(() => {
        placeSuggDiv?.classList.add('hidden');
      }, 250);
    });

    // -------------------------------------------------------------
    // Enhanced Name Input with Saved Donor Suggestions + Transliteration
    // -------------------------------------------------------------
    const nameSuggDiv = document.getElementById('moi-name-suggestions');
    let activeNameIndex = -1;
    let currentNameMatches = [];

    const getSavedDonorsPool = () => {
      const seen = new Set();
      const pool = [];
      const add = (r) => {
        if (!r) return;
        const name = String(r.name || '').trim();
        if (!name || name === '-' || name.length < 2) return;
        const initial = String(r.initial || '').trim();
        const place = String(r.place || '').trim();
        const name1 = String(r.name1 || '').trim();
        const job = String(r.job || '').trim();
        const rel = String(r.relationship || '').trim();
        const mobile = String(r.mobile || r.phone || '').trim();
        const key = `${name.toLowerCase()}___${initial.toLowerCase()}___${place.toLowerCase()}___${name1.toLowerCase()}___${mobile}`;
        if (!seen.has(key)) {
          seen.add(key);
          pool.push({
            name,
            initial,
            name1,
            job,
            place,
            relationship: rel,
            mobile,
            amount: r.amount || '',
            eventName: r.eventName || r.displayName1 || r.memberName || ''
          });
        }
      };

      (state.members || []).slice().reverse().forEach(add);
      (state.receipts || []).slice().reverse().forEach(add);
      return pool;
    };

    const selectNameDonor = (donor) => {
      if (!donor) return;
      nameInput.value = donor.name || '';
      if (donor.initial && initialInput && !initialInput.value) initialInput.value = donor.initial;
      if (donor.place && placeInput && (!placeInput.value || placeInput.value === '-')) {
        placeInput.value = donor.place;
      }
      if (donor.name1 && name1Input) name1Input.value = donor.name1;
      if (donor.job && jobInput) jobInput.value = donor.job;
      if (donor.relationship && relInput) relInput.value = donor.relationship;
      if (donor.mobile && mobileInput && !mobileInput.value) mobileInput.value = donor.mobile;

      // Visual pulse
      [placeInput, initialInput, nameInput, jobInput, name1Input, relInput, mobileInput].forEach(inp => {
        if (inp && inp.value) {
          inp.classList.add('ring-2', 'ring-amber-400');
          setTimeout(() => inp.classList.remove('ring-2', 'ring-amber-400'), 800);
        }
      });

      if (typeof window.showToast === 'function') {
        window.showToast(`Saved donor details loaded: ${donor.name} (${donor.place || '-'})`, 'success');
      }

      if (nameSuggDiv) {
        nameSuggDiv.innerHTML = '';
        nameSuggDiv.classList.add('hidden');
      }
      activeNameIndex = -1;
      currentNameMatches = [];

      // Advance focus to next unfilled field: jobInput or amountInput
      if (name1Input && !name1Input.value && !donor.name1) {
        name1Input.focus();
      } else if (jobInput && !jobInput.value && !donor.job) {
        jobInput.focus();
      } else if (amountInput) {
        amountInput.focus();
        if (amountInput.select) amountInput.select();
      }
    };

    const selectNameTranslit = (tamilText) => {
      if (!tamilText) return;
      nameInput.value = tamilText;
      if (nameSuggDiv) {
        nameSuggDiv.innerHTML = '';
        nameSuggDiv.classList.add('hidden');
      }
      activeNameIndex = -1;
      currentNameMatches = [];
      name1Input?.focus();
      if (name1Input?.select) name1Input.select();
    };

    const updateNameActiveHighlight = (items) => {
      items.forEach((it, idx) => {
        if (idx === activeNameIndex) {
          it.classList.add('active-sugg');
          it.scrollIntoView({ block: 'nearest' });
        } else {
          it.classList.remove('active-sugg');
        }
      });
    };

    const renderNameSuggestions = async () => {
      if (!nameInput || !nameSuggDiv) return;
      const rawVal = (nameInput.value || '').trim();
      if (!rawVal || rawVal.length < 2) {
        nameSuggDiv.innerHTML = '';
        nameSuggDiv.classList.add('hidden');
        currentNameMatches = [];
        activeNameIndex = -1;
        return;
      }

      const valLower = rawVal.toLowerCase();
      const isTamil = /[\u0B80-\u0BFF]/.test(rawVal);
      let possibleTas = [];
      if (!isTamil && window.TamilTransliterate) {
        const taDirect = window.TamilTransliterate.transliterateText(rawVal);
        if (taDirect) possibleTas.push(taDirect);
      }
      const goog = (!isTamil && window.TamilTransliterate) ? await window.TamilTransliterate.fetchGoogleInputToolsTamil(rawVal) : [];
      goog.forEach(g => {
        if (g.ta && !possibleTas.includes(g.ta)) possibleTas.push(g.ta);
      });

      // Filter donors
      const donorsPool = getSavedDonorsPool();
      const matchedDonors = [];
      for (const d of donorsPool) {
        const nLower = d.name.toLowerCase();
        const fullLower = (d.initial ? d.initial.toLowerCase() + ' ' : '') + nLower;
        const n1Lower = (d.name1 || '').toLowerCase();
        let matches = false;
        if (nLower.includes(valLower) || fullLower.includes(valLower) || n1Lower.includes(valLower)) {
          matches = true;
        } else if (possibleTas.some(ta => d.name.includes(ta) || fullLower.includes(ta) || (d.name1 && d.name1.includes(ta)))) {
          matches = true;
        }
        if (matches) {
          matchedDonors.push(d);
          if (matchedDonors.length >= 8) break;
        }
      }

      // Transliteration items if typing in English
      const dictSuggestions = (!isTamil && window.TamilTransliterate) ? window.TamilTransliterate.getDictionarySuggestions(rawVal) : [];
      const translitList = [...goog];
      dictSuggestions.forEach(d => {
        if (!translitList.some(c => c.ta === d.ta)) translitList.push(d);
      });

      if (matchedDonors.length === 0 && translitList.length === 0) {
        nameSuggDiv.innerHTML = '';
        nameSuggDiv.classList.add('hidden');
        currentNameMatches = [];
        activeNameIndex = -1;
        return;
      }

      currentNameMatches = [];
      let html = '';

      if (matchedDonors.length > 0) {
        html += `
          <div class="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-400 bg-slate-900/90 border-b border-amber-500/20 flex items-center justify-between">
            <span class="flex items-center space-x-1.5">
              <i data-lucide="users" class="w-3.5 h-3.5 text-amber-400"></i>
              <span>சேமிக்கப்பட்ட பெயர்கள் (Saved Donors)</span>
            </span>
            <span class="text-slate-400 font-mono text-[9px]">${matchedDonors.length}</span>
          </div>
        `;
        matchedDonors.forEach(d => {
          const itemIdx = currentNameMatches.length;
          currentNameMatches.push({ type: 'donor', data: d });
          html += `
            <div class="name-sugg-item translit-item p-2.5 hover:bg-amber-500/20 cursor-pointer border-b border-slate-700/50 flex flex-col items-start gap-1" data-idx="${itemIdx}">
              <div class="flex items-center justify-between w-full">
                <div class="flex items-center space-x-1.5">
                  <span class="font-bold text-amber-300 text-sm">
                    ${d.initial ? `<span class="text-amber-400 font-mono">${escapeHtml(d.initial)}.</span> ` : ''}${escapeHtml(d.name)}
                  </span>
                  ${d.name1 ? `<span class="text-xs text-slate-300 font-normal"> - ${escapeHtml(d.name1)}</span>` : ''}
                </div>
                ${d.place ? `<span class="text-[11px] text-amber-200/90 bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700/80 font-medium">📍 ${escapeHtml(d.place)}</span>` : ''}
              </div>
              <div class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-400">
                ${d.job ? `<span>💼 <strong class="text-slate-300 font-normal">${escapeHtml(d.job)}</strong></span>` : ''}
                ${d.mobile ? `<span>📞 <strong class="text-amber-400 font-mono font-normal">${escapeHtml(d.mobile)}</strong></span>` : ''}
                ${d.relationship ? `<span>👥 <strong class="text-slate-300 font-normal">${escapeHtml(d.relationship)}</strong></span>` : ''}
                ${d.amount ? `<span class="text-emerald-400 font-bold">₹${parseFloat(d.amount).toLocaleString('en-IN')}</span>` : ''}
              </div>
            </div>
          `;
        });
      }

      if (translitList.length > 0) {
        html += `
          <div class="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-400 bg-slate-900/90 border-b border-indigo-500/20 flex items-center space-x-1.5">
            <i data-lucide="languages" class="w-3 h-3 text-indigo-400"></i>
            <span>தமிழ் எழுத்துப்பெயர்ப்பு (Transliteration)</span>
          </div>
        `;
        translitList.forEach(t => {
          const itemIdx = currentNameMatches.length;
          currentNameMatches.push({ type: 'translit', value: t.ta });
          html += `
            <div class="name-sugg-item translit-item px-3 py-1.5 hover:bg-indigo-500/20 cursor-pointer flex items-center justify-between border-b border-slate-800/60" data-idx="${itemIdx}">
              <span class="font-semibold text-slate-100 text-sm">${escapeHtml(t.ta)}</span>
              <span class="text-[10px] text-indigo-400 font-mono">${t.isGoogle ? 'Google' : 'Tamil'}</span>
            </div>
          `;
        });
      }

      nameSuggDiv.innerHTML = html;
      if (window.lucide) window.lucide.createIcons();
      nameSuggDiv.classList.remove('hidden');
      activeNameIndex = -1;

      nameSuggDiv.querySelectorAll('.name-sugg-item').forEach(el => {
        el.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          const idx = parseInt(el.getAttribute('data-idx'), 10);
          const match = currentNameMatches[idx];
          if (match.type === 'donor') {
            selectNameDonor(match.data);
          } else {
            selectNameTranslit(match.value);
          }
        });
      });
    };

    nameInput?.addEventListener('input', renderNameSuggestions);

    nameInput?.addEventListener('keydown', async (e) => {
      const items = nameSuggDiv?.querySelectorAll('.name-sugg-item');
      const isVisible = nameSuggDiv && !nameSuggDiv.classList.contains('hidden') && items && items.length > 0;

      if (e.key === 'ArrowDown') {
        if (isVisible) {
          e.preventDefault();
          activeNameIndex = (activeNameIndex + 1) % items.length;
          updateNameActiveHighlight(items);
        }
      } else if (e.key === 'ArrowUp') {
        if (isVisible) {
          e.preventDefault();
          activeNameIndex = (activeNameIndex - 1 + items.length) % items.length;
          updateNameActiveHighlight(items);
        }
      } else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        if (isVisible) {
          e.preventDefault();
          const chosenIdx = activeNameIndex >= 0 ? activeNameIndex : 0;
          const match = currentNameMatches[chosenIdx];
          if (match) {
            if (match.type === 'donor') {
              selectNameDonor(match.data);
            } else {
              selectNameTranslit(match.value);
            }
          } else {
            nameSuggDiv.classList.add('hidden');
            name1Input?.focus();
          }
        } else {
          e.preventDefault();
          if (nameInput.value && !/[\u0B80-\u0BFF]/.test(nameInput.value)) {
            const goog = await window.TamilTransliterate?.fetchGoogleInputToolsTamil(nameInput.value);
            if (goog && goog.length > 0) {
              nameInput.value = goog[0].ta;
            } else if (window.TamilTransliterate) {
              nameInput.value = window.TamilTransliterate.transliterateText(nameInput.value);
            }
          }
          name1Input?.focus();
          if (name1Input?.select) name1Input.select();
        }
      } else if (e.key === 'Escape') {
        nameSuggDiv?.classList.add('hidden');
      }
    });

    nameInput?.addEventListener('blur', () => {
      setTimeout(() => {
        nameSuggDiv?.classList.add('hidden');
      }, 250);
    });

    // Enter & Tab Navigation for Remaining Fields: Initial -> Name1 -> Job -> Rel -> Amount
    const setupFieldNavigation = (currentInput, nextInput, suggId) => {
      currentInput?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
          e.preventDefault();
          const suggDiv = document.getElementById(suggId);
          // If suggestion dropdown is open, pick top suggestion first
          if (suggDiv && !suggDiv.classList.contains('hidden')) {
            const firstOption = suggDiv.querySelector('.translit-item span.font-semibold');
            if (firstOption && firstOption.textContent) {
              currentInput.value = firstOption.textContent;
            }
            suggDiv.classList.add('hidden');
          } else if (currentInput.value && !/[\u0B80-\u0BFF]/.test(currentInput.value)) {
            // Auto transliterate if typed in English
            const goog = await window.TamilTransliterate.fetchGoogleInputToolsTamil(currentInput.value);
            if (goog && goog.length > 0) {
              currentInput.value = goog[0].ta;
            } else {
              currentInput.value = window.TamilTransliterate.transliterateText(currentInput.value);
            }
          }
          if (nextInput) {
            nextInput.focus();
            if (nextInput.select) nextInput.select();
          }
        }
      });
    };

    const setupSimpleNavigation = (currentInput, nextInput) => {
      currentInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
          e.preventDefault();
          nextInput?.focus();
          if (nextInput?.select) nextInput.select();
        }
      });
    };

    setupSimpleNavigation(initialInput, nameInput);
    setupFieldNavigation(name1Input, jobInput, 'moi-name1-suggestions');
    setupSimpleNavigation(jobInput, relInput);
    setupFieldNavigation(relInput, amountInput, 'moi-relationship-suggestions');

    const updateWhatsAppButtonVisibility = () => {};

    // Cross-Event Mobile Number Autocomplete & Suggestion Dropdown
    let activeMobileIndex = -1;
    let currentMobileMatches = [];

    const selectMobileSuggestion = (item) => {
      if (!item) return;
      if (placeInput) placeInput.value = item.place || '';
      if (initialInput) initialInput.value = item.initial || '';
      if (nameInput) nameInput.value = item.name || '';
      if (jobInput) jobInput.value = item.job || '';
      if (name1Input) name1Input.value = item.name1 || '';
      if (relInput) relInput.value = item.relationship || '';
      if (mobileInput) mobileInput.value = item.mobile || '';

      updateWhatsAppButtonVisibility();

      if (mobileSuggDiv) {
        mobileSuggDiv.innerHTML = '';
        mobileSuggDiv.classList.add('hidden');
      }

      // Visual pulse feedback on autofilled fields
      [placeInput, initialInput, nameInput, jobInput, name1Input, relInput, mobileInput].forEach(inp => {
        if (inp && inp.value) {
          inp.classList.add('ring-2', 'ring-amber-400');
          setTimeout(() => inp.classList.remove('ring-2', 'ring-amber-400'), 800);
        }
      });

      if (typeof window.showToast === 'function') {
        window.showToast(`Saved donor details loaded: ${item.name} (${item.mobile})`, 'success');
      }

      if (amountInput) {
        amountInput.focus();
        if (amountInput.select) amountInput.select();
      }
    };

    const updateMobileActiveHighlight = (items) => {
      items.forEach((it, idx) => {
        if (idx === activeMobileIndex) {
          it.classList.add('bg-amber-500/30', 'border-amber-400');
          it.scrollIntoView({ block: 'nearest' });
        } else {
          it.classList.remove('bg-amber-500/30', 'border-amber-400');
        }
      });
    };

    mobileInput?.addEventListener('input', (e) => {
      updateWhatsAppButtonVisibility();
      const rawVal = e.target.value;
      const cleanVal = rawVal.replace(/\D/g, '');
      if (!cleanVal || cleanVal.length < 3) {
        if (mobileSuggDiv) {
          mobileSuggDiv.innerHTML = '';
          mobileSuggDiv.classList.add('hidden');
        }
        activeMobileIndex = -1;
        currentMobileMatches = [];
        return;
      }

      // Search both state.members (permanent registry) and state.receipts across all events
      const matches = [];
      const seenKeys = new Set();
      const combinedPool = [
        ...(state.members || []).slice().reverse(),
        ...(state.receipts || []).slice().reverse()
      ];

      for (const r of combinedPool) {
        const phone = String(r.mobile || r.phone || '').trim();
        const phoneDigits = phone.replace(/\D/g, '');
        if (phoneDigits && phoneDigits.includes(cleanVal)) {
          const profileKey = `${phoneDigits}_${(r.name || '').trim().toLowerCase()}_${(r.place || '').trim().toLowerCase()}`;
          if (!seenKeys.has(profileKey)) {
            seenKeys.add(profileKey);
            matches.push({
              mobile: phone,
              initial: r.initial || '',
              name: r.name || '',
              job: r.job || '',
              name1: r.name1 || '',
              relationship: r.relationship || '',
              place: r.place || '',
              eventName: r.eventName || r.displayName1 || r.memberName || '',
              date: r.date || ''
            });
            if (matches.length >= 8) break;
          }
        }
      }

      currentMobileMatches = matches;
      if (matches.length === 0) {
        if (mobileSuggDiv) {
          mobileSuggDiv.innerHTML = '';
          mobileSuggDiv.classList.add('hidden');
        }
        activeMobileIndex = -1;
        return;
      }

      activeMobileIndex = -1;
      let html = '';
      matches.forEach((m, idx) => {
        const nameDisplay = formatMoiPersonNameWithJob(m);
        html += `
          <div class="mobile-sugg-item translit-item p-2.5 hover:bg-amber-500/20 cursor-pointer border-b border-slate-700/50 flex flex-col items-start gap-0.5" data-idx="${idx}">
            <div class="flex items-center justify-between w-full">
              <span class="font-mono font-bold text-amber-400 text-sm">📞 ${escapeHtml(m.mobile)}</span>
              <span class="text-xs text-amber-200/90 bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700/80 font-medium">${escapeHtml(m.place || '-')}</span>
            </div>
            <div class="text-xs font-semibold text-slate-100 mt-0.5">
              👤 ${escapeHtml(nameDisplay)}
            </div>
            ${m.eventName ? `<div class="text-[10px] text-slate-400">முந்தைய நிகழ்வு: ${escapeHtml(m.eventName)} ${m.date ? `(${escapeHtml(m.date)})` : ''}</div>` : ''}
          </div>
        `;
      });

      mobileSuggDiv.innerHTML = html;
      mobileSuggDiv.classList.remove('hidden');

      mobileSuggDiv.querySelectorAll('.mobile-sugg-item').forEach((itemElem) => {
        itemElem.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          const idx = parseInt(itemElem.getAttribute('data-idx'), 10);
          selectMobileSuggestion(matches[idx]);
        });
      });
    });

    mobileInput?.addEventListener('keydown', (e) => {
      const items = mobileSuggDiv?.querySelectorAll('.mobile-sugg-item');
      const isVisible = mobileSuggDiv && !mobileSuggDiv.classList.contains('hidden') && items && items.length > 0;

      if (e.key === 'ArrowDown') {
        if (isVisible) {
          e.preventDefault();
          activeMobileIndex = (activeMobileIndex + 1) % items.length;
          updateMobileActiveHighlight(items);
        }
      } else if (e.key === 'ArrowUp') {
        if (isVisible) {
          e.preventDefault();
          activeMobileIndex = (activeMobileIndex - 1 + items.length) % items.length;
          updateMobileActiveHighlight(items);
        }
      } else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        if (isVisible) {
          e.preventDefault();
          const targetIdx = activeMobileIndex >= 0 ? activeMobileIndex : 0;
          selectMobileSuggestion(currentMobileMatches[targetIdx]);
        } else {
          e.preventDefault();
          placeInput?.focus();
          if (placeInput?.select) placeInput.select();
        }
      } else if (e.key === 'Escape') {
        if (mobileSuggDiv) {
          mobileSuggDiv.classList.add('hidden');
        }
        activeMobileIndex = -1;
      }
    });

    mobileInput?.addEventListener('blur', () => {
      setTimeout(() => {
        if (mobileSuggDiv) mobileSuggDiv.classList.add('hidden');
      }, 200);
    });



    // Pressing Enter on Amount field submits the receipt form automatically (Save & Print Thermal)
    amountInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.appSubmitMoiEntry(false);
      }
    });

    // Auto Tamil Words conversion on Amount change
    amountInput?.addEventListener('input', (e) => {
      const valStr = e.target.value.trim();
      const amt = parseFloat(valStr);
      if (!isNaN(amt) && amt > 0 && window.TamilWords) {
        wordsInput.value = window.TamilWords.amountToTamilWords(amt);
      } else {
        wordsInput.value = '';
      }
      if (getSelectedPaymentMode() === 'UPI') {
        const modal = document.getElementById('moi-upi-qr-modal');
        if (modal && !modal.classList.contains('hidden')) {
          window.appOpenUpiQrModal();
        }
      }
    });

    function getSelectedPaymentMode() {
      for (let r of modeRadios) {
        if (r.checked) return r.value;
      }
      return 'Cash';
    }

    function updateUpiQr(autoOpen = true) {
      const mode = getSelectedPaymentMode();
      if (mode === 'UPI') {
        upiTxTimeBox?.classList.remove('hidden');
        if (autoOpen) {
          window.appOpenUpiQrModal();
        }
      } else {
        upiTxTimeBox?.classList.add('hidden');
        window.appCloseUpiQrModal();
      }
    }

    modeRadios.forEach(r => r.addEventListener('change', () => updateUpiQr(true)));

    const mainTx = document.getElementById('moi-upi-tx-time');
    mainTx?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.appSubmitMoiEntry(false);
      }
    });

    const modalTx = document.getElementById('modal-upi-tx-time');
    modalTx?.addEventListener('input', (e) => {
      if (mainTx) mainTx.value = e.target.value;
    });
    modalTx?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.appCloseUpiQrModal();
        window.appSubmitMoiEntry(false);
      }
    });

    const modalEl = document.getElementById('moi-upi-qr-modal');
    modalEl?.addEventListener('click', (e) => {
      if (e.target === modalEl) window.appCloseUpiQrModal();
    });

    const chkWa = document.getElementById('moi-chk-send-whatsapp');
    chkWa?.addEventListener('change', (e) => {
      localStorage.setItem('aathi_auto_send_whatsapp', e.target.checked ? 'true' : 'false');
      if (e.target.checked) {
        const mobInput = document.getElementById('moi-mobile');
        const rawMob = mobInput ? mobInput.value.trim() : '';
        const digits = rawMob.replace(/\D/g, '');
        let waUrl = 'https://web.whatsapp.com';
        if (digits.length === 10) {
          waUrl = `https://api.whatsapp.com/send?phone=91${digits}`;
        } else if (digits.length >= 11) {
          waUrl = `https://api.whatsapp.com/send?phone=${digits}`;
        }
        try {
          window.open(waUrl, '_blank');
        } catch (err) {
          console.warn('WhatsApp popup window notice:', err);
        }
      }
    });

    // Submit Form (Delegates to unified appSubmitMoiEntry)
    const form = document.getElementById('moi-entry-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      window.appSubmitMoiEntry(false);
    });
  }

  // Global helper functions for UPI QR Modal Popup Window
  window.appOpenUpiQrModal = function () {
    const modal = document.getElementById('moi-upi-qr-modal');
    if (!modal) return;
    const activeEv = getActiveEvent();
    const amountInput = document.getElementById('moi-amount');
    const amt = amountInput ? amountInput.value.trim() : '';
    const modalAmt = document.getElementById('modal-upi-amount-display');
    const modalQr = document.getElementById('modal-qrcode-container');
    const modalUpiStr = document.getElementById('modal-upi-string-display');
    const modalTxTime = document.getElementById('modal-upi-tx-time');
    const mainTxTime = document.getElementById('moi-upi-tx-time');

    if (modalAmt) {
      modalAmt.textContent = amt && parseFloat(amt) > 0 ? `₹${parseFloat(amt).toLocaleString('en-IN')}` : '₹0';
    }

    if (modalTxTime && mainTxTime) {
      modalTxTime.value = mainTxTime.value;
    }

    if (activeEv && activeEv.upiId && modalQr) {
      const numAmt = amt && parseFloat(amt) > 0 ? amt : '';
      const upiString = `upi://pay?pa=${encodeURIComponent(activeEv.upiId)}&pn=${encodeURIComponent(activeEv.memberName || activeEv.displayName1 || 'Moi')}${numAmt ? `&am=${numAmt}&cu=INR` : ''}`;
      if (modalUpiStr) modalUpiStr.textContent = upiString;
      modalQr.innerHTML = '';
      if (window.QRCode) {
        new window.QRCode(modalQr, {
          text: upiString,
          width: 170,
          height: 170
        });
      }
    } else if (modalQr) {
      modalQr.innerHTML = `<div class="p-6 text-slate-500 text-xs font-semibold">Please configure Event UPI ID in Event Master</div>`;
    }

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  };

  window.appCloseUpiQrModal = function () {
    const modal = document.getElementById('moi-upi-qr-modal');
    if (modal) modal.classList.add('hidden');
    const modalTxTime = document.getElementById('modal-upi-tx-time');
    const mainTxTime = document.getElementById('moi-upi-tx-time');
    if (modalTxTime && mainTxTime && modalTxTime.value) {
      mainTxTime.value = modalTxTime.value;
    }
  };

  function getThermalLogoSvgHtml() {
    return `
      <div style="text-align: center; margin-bottom: 6px;">
        <svg width="76" height="76" viewBox="0 0 200 200" style="margin: 0 auto; display: block;">
          <circle cx="100" cy="100" r="95" fill="none" stroke="#000" stroke-width="6"/>
          <circle cx="100" cy="100" r="85" fill="none" stroke="#000" stroke-width="3"/>
          <path id="topArcSvg" d="M 28,100 A 72,72 0 1,1 172,100" fill="none"/>
          <text font-size="23" font-weight="900" fill="#000" text-anchor="middle">
            <textPath href="#topArcSvg" startOffset="50%">ஆதி மொய்</textPath>
          </text>
          <g transform="translate(100, 106) scale(0.68)">
            <path d="M -30,20 C -35,-10 -20,-25 0,-25 C 20,-25 35,-10 30,20 C 25,35 -25,35 -30,20 Z" fill="#000"/>
            <path d="M 0,-25 C -15,-45 0,-65 0,-65 C 0,-65 15,-45 0,-25 Z" fill="#000"/>
            <path d="M -10,-25 C -30,-35 -35,-55 -35,-55 C -35,-55 -15,-50 -10,-25 Z" fill="#000"/>
            <path d="M 10,-25 C 30,-35 35,-55 35,-55 C 35,-55 15,-50 10,-25 Z" fill="#000"/>
            <circle cx="0" cy="-65" r="8" fill="#000"/>
          </g>
          <path id="bottomArcSvg" d="M 172,100 A 72,72 0 0,1 28,100" fill="none"/>
          <text font-size="20" font-weight="900" fill="#000" text-anchor="middle">
            <textPath href="#bottomArcSvg" startOffset="50%">(+91 9865607179)</textPath>
          </text>
        </svg>
      </div>
    `;
  }

  // ==========================================
  // Thermal Receipt Printing (2 Copies - 3 Inch / 76mm)
  // ==========================================
  function printThermalReceipt(rcpt, ev, singleCopy = false, onAfterPrintCallback = null, waUrl = null) {
    if (!rcpt) return;

    // First Copy (Customer Copy)
    const copy1Html = `
      <div class="thermal-receipt-container" style="width: 76mm; max-width: 76mm; padding: 4mm 2mm; font-family: monospace, 'Noto Sans Tamil', sans-serif; color: #000; font-weight: bold; border: none; box-sizing: border-box;">
        <div style="text-align: center; padding-bottom: 4px; margin-bottom: 6px;">
          <h2 style="font-size: 15pt; font-weight: bold; margin: 0; color: #000;">ஆதி மொய்</h2>
          <p style="font-size: 8.5pt; font-weight: bold; margin: 2px 0 5px 0; color: #000; border-bottom: 1px solid #000; padding-bottom: 3px;">கருணாக்கமுத்தன்பட்டி (+91 9865607179)</p>
          ${((ev && ev.displayName1) || rcpt.displayName1) ? `<h3 style="font-size: 12.5pt; font-weight: 900; margin: 2px 0 1px 0; color: #000;">${(ev && ev.displayName1) || rcpt.displayName1}</h3>` : ''}
          <h4 style="font-size: 11.5pt; font-weight: 900; margin: 2px 0; color: #000;">${ev ? ev.memberName : (rcpt.memberName || '')}</h4>
          <p style="font-size: 9pt; font-weight: bold; margin: 0; color: #000;">${ev ? ev.place : (rcpt.place || '')}</p>
        </div>

        <div style="font-size: 9.5pt; line-height: 1.45; color: #000; border-top: 1px solid #000; padding-top: 5px;">
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">ரசீது எண்:</span> <span>#${rcpt.billNo}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">தேதி:</span> <span>${rcpt.date} ${rcpt.time}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">பெயர்:</span> <span>${rcpt.initial ? rcpt.initial + '. ' : ''}${rcpt.name}${rcpt.name1 ? ' ' + rcpt.name1 : ''}${rcpt.job ? ' - ' + rcpt.job : ''}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">இடம்:</span> <span>${rcpt.place}</span></div>
          ${rcpt.relationship ? `<div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">உறவு:</span> <span>${rcpt.relationship}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px; border-top: 2px solid #000; padding-top: 5px;"><span style="font-size: 13pt; font-weight: 900;">தொகை:</span> <span style="font-size: 18pt; font-weight: 900; font-family: sans-serif;">₹${parseFloat(rcpt.amount).toLocaleString('en-IN')}</span></div>
          <div style="font-size: 9.5pt; font-weight: bold; font-style: italic; margin-top: 2px; color: #000;">(${rcpt.amountWords})</div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px;"><span style="font-weight: bold;">செலுத்திய முறை:</span> <span>${rcpt.mode}</span></div>
          ${rcpt.upiTxTime ? `<div style="font-size: 8pt; color: #000;"><span>UPI Ref/Time:</span> <span>${rcpt.upiTxTime}</span></div>` : ''}
        </div>

        <div style="text-align: center; margin-top: 8px; font-size: 8.5pt; border-top: 1px solid #000; padding-top: 4px; color: #000;">
          <p style="font-weight: bold; margin: 0;">தங்கள் வருகைக்கு நன்றி</p>
        </div>
      </div>
    `;

    // Second Copy (Office / Created By Copy)
    const copy2Html = `
      <div class="thermal-receipt-container" style="width: 76mm; max-width: 76mm; padding: 4mm 2mm; font-family: monospace, 'Noto Sans Tamil', sans-serif; color: #000; font-weight: bold; border: none; box-sizing: border-box;">
        <div style="text-align: center; padding-bottom: 4px; margin-bottom: 6px; border-bottom: 1px dashed #000;">
          <div style="font-size: 9pt; font-weight: bold; color: #000;">Created By: ${rcpt.createdBy || 'admin'}</div>
        </div>

        <div style="font-size: 9.5pt; line-height: 1.45; color: #000;">
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">ரசீது எண்:</span> <span>#${rcpt.billNo}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">தேதி:</span> <span>${rcpt.date} ${rcpt.time}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">பெயர்:</span> <span>${rcpt.initial ? rcpt.initial + '. ' : ''}${rcpt.name}${rcpt.name1 ? ' ' + rcpt.name1 : ''}${rcpt.job ? ' - ' + rcpt.job : ''}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">இடம்:</span> <span>${rcpt.place}</span></div>
          ${rcpt.relationship ? `<div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">உறவு:</span> <span>${rcpt.relationship}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px; border-top: 2px solid #000; padding-top: 5px;"><span style="font-size: 13pt; font-weight: 900;">தொகை:</span> <span style="font-size: 18pt; font-weight: 900; font-family: sans-serif;">₹${parseFloat(rcpt.amount).toLocaleString('en-IN')}</span></div>
          <div style="font-size: 9.5pt; font-weight: bold; font-style: italic; margin-top: 2px; color: #000;">(${rcpt.amountWords})</div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px;"><span style="font-weight: bold;">செலுத்திய முறை:</span> <span>${rcpt.mode}</span></div>
          ${rcpt.upiTxTime ? `<div style="font-size: 8pt; color: #000;"><span>UPI Ref/Time:</span> <span>${rcpt.upiTxTime}</span></div>` : ''}
        </div>
      </div>
    `;

    const twoCopiesBody = singleCopy ? copy1Html : `${copy1Html}<div class="thermal-page-break"></div>${copy2Html}`;

    // 1. Popup Window for 3-Inch Thermal Printing (Page 1 prints first, then Page 2 sequentially on single click)
    let printWin = null;
    try {
      printWin = window.open('', '_blank', 'width=380,height=650,top=60,left=150,menubar=no,toolbar=no,location=no,status=no');
    } catch (popupErr) {
      console.warn('Popup window open error:', popupErr);
    }

    if (printWin && !printWin.closed) {
      const fullDocHtml = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <title>Moi Receipt #${rcpt.billNo}</title>
  <style>
    @page {
      size: 76mm auto; /* 3-inch POS thermal roll */
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: 76mm;
      max-width: 76mm;
      margin: 0 auto;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: 'Noto Sans Tamil', 'Latha', 'Vijaya', monospace, sans-serif;
    }
    .thermal-receipt-container {
      width: 76mm;
      max-width: 76mm;
      padding: 4mm 2mm;
      margin: 0;
      box-sizing: border-box;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      font-family: monospace, 'Noto Sans Tamil', sans-serif;
      color: #000;
      font-weight: bold;
      border: none;
    }
    .thermal-page-break {
      page-break-after: always !important;
      break-after: page !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
    }
  </style>
</head>
<body>
  <div id="receipt-print-box"></div>
  <script>
    const copy1 = ${JSON.stringify(copy1Html)};
    const copy2 = ${JSON.stringify(copy2Html)};
    const isSingle = ${Boolean(singleCopy)};
    const waUrl = ${JSON.stringify(waUrl || '')};
    const bNo = ${JSON.stringify(rcpt.billNo || '')};

    let pageNum = 1;
    let isPrinting = false;

    function renderPage(num) {
      const box = document.getElementById('receipt-print-box');
      if (num === 1) {
        document.title = "Moi Receipt #" + bNo + " (Customer Copy)";
        box.innerHTML = copy1;
      } else {
        document.title = "Moi Receipt #" + bNo + " (Office Copy)";
        box.innerHTML = copy2;
      }
    }

    function doPrint() {
      isPrinting = true;
      window.focus();
      window.print();
    }

    window.onload = function() {
      window.focus();
      renderPage(1);
      setTimeout(function() {
        doPrint();
      }, 350);
    };

    function onPrintComplete() {
      if (!isPrinting) return;
      isPrinting = false;

      // Completing the first page of receipt, the printer cuts the receipt paper,
      // then automatically triggers the second page (office copy) without approval!
      if (pageNum === 1 && !isSingle) {
        pageNum = 2;
        renderPage(2);
        setTimeout(function() {
          doPrint();
        }, 350);
        return;
      }

      // Second page printing complete
      if (waUrl) {
        window.location.href = waUrl;
      } else {
        setTimeout(function() {
          window.close();
        }, 500);
      }
    }

    window.onafterprint = onPrintComplete;
    window.addEventListener('afterprint', onPrintComplete);
  <\/script>
</body>
</html>`;

      printWin.document.open();
      printWin.document.write(fullDocHtml);
      printWin.document.close();

      const firstElem = document.getElementById('moi-mobile') || document.getElementById('moi-place');
      if (firstElem) firstElem.focus();
      if (typeof onAfterPrintCallback === 'function') {
        try { onAfterPrintCallback(); } catch(e){}
      }
      return;
    }

    // 2. Fallback: Use #thermal-print-area if popup window was blocked
    const printArea = document.getElementById('thermal-print-area');
    if (!printArea) return;

    printArea.classList.remove('hidden');
    printArea.innerHTML = copy1Html;

    let fallbackStep = 1;
    let fallbackPrinting = false;
    let fallbackDone = false;

    const onMainAfterPrint = () => {
      if (!fallbackPrinting) return;
      fallbackPrinting = false;

      // Completing first page of receipt, printer cuts receipt paper,
      // then automatically triggers the second page (office copy) without approval
      if (fallbackStep === 1 && !singleCopy) {
        fallbackStep = 2;
        printArea.innerHTML = copy2Html;
        setTimeout(() => {
          fallbackPrinting = true;
          window.print();
        }, 350);
        return;
      }

      if (fallbackDone) return;
      fallbackDone = true;

      window.removeEventListener('afterprint', onMainAfterPrint);
      window.onafterprint = null;

      printArea.classList.add('hidden');
      printArea.innerHTML = '';
      const firstElem = document.getElementById('moi-mobile') || document.getElementById('moi-place');
      if (firstElem) firstElem.focus();

      if (waUrl) {
        try { window.open(waUrl, '_blank'); } catch(e){}
      }
      if (typeof onAfterPrintCallback === 'function') {
        try { onAfterPrintCallback(); } catch(cbErr){}
      }
    };

    window.addEventListener('afterprint', onMainAfterPrint);
    window.onafterprint = onMainAfterPrint;
    fallbackPrinting = true;
    setTimeout(() => {
      window.print();
    }, 200);
  }

  // ==========================================
  // Payout Thermal Receipt Printing (Same Size & Layout as Moi Receipt - 3 Inch / 76mm)
  // ==========================================
  function printPayoutThermalReceipt(payout, ev) {
    if (!payout) return;

    const majorName = (ev && ev.displayName1) || payout.displayName1 || (ev && ev.memberName) || payout.memberName || (ev && ev.eventName) || '';
    const name1 = (ev && ev.displayName1) ? ((ev && ev.memberName) || payout.memberName || '') : '';
    const evPlace = (ev && ev.place) || payout.place || '';
    const payoutWords = window.TamilWords ? window.TamilWords.amountToTamilWords(payout.amount) : (payout.amount + ' ரூபாய் மட்டுமே');
    const voucherNo = payout.id ? String(payout.id).replace(/^payout_/, '') : '';

    const payoutReceiptHtml = `
      <div class="thermal-receipt-container" style="width: 76mm; max-width: 76mm; padding: 4mm 2mm; font-family: monospace, 'Noto Sans Tamil', sans-serif; color: #000; font-weight: bold; border: none; box-sizing: border-box;">
        <div style="text-align: center; padding-bottom: 4px; margin-bottom: 6px;">
          <h2 style="font-size: 15pt; font-weight: bold; margin: 0; color: #000;">ஆதி மொய்</h2>
          <p style="font-size: 8.5pt; font-weight: bold; margin: 2px 0 5px 0; color: #000; border-bottom: 1px solid #000; padding-bottom: 3px;">கருணாக்கமுத்தன்பட்டி (+91 9865607179)</p>
          ${majorName ? `<h3 style="font-size: 12.5pt; font-weight: 900; margin: 2px 0 1px 0; color: #000;">${majorName}</h3>` : ''}
          ${name1 ? `<h4 style="font-size: 11.5pt; font-weight: 900; margin: 2px 0; color: #000;">${name1}</h4>` : ''}
          ${evPlace ? `<p style="font-size: 9pt; font-weight: bold; margin: 0; color: #000;">${evPlace}</p>` : ''}
        </div>

        <div style="font-size: 9.5pt; line-height: 1.45; color: #000; border-top: 1px solid #000; padding-top: 5px;">
          <div style="text-align: center; font-size: 10.5pt; font-weight: 900; margin-bottom: 4px; border-bottom: 1px dashed #000; padding-bottom: 3px;">
            பட்டுவாடா ரசீது (Payout Receipt)
          </div>
          ${voucherNo ? `<div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">ரசீது எண்:</span> <span>#${voucherNo}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">தேதி & நேரம்:</span> <span>${payout.date || ''} ${payout.time || ''}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">பதிவு செய்தவர்:</span> <span>${payout.createdBy || 'admin'}</span></div>
          <div style="display: flex; justify-content: space-between; border-top: 1px dashed #000; margin-top: 4px; padding-top: 4px;"><span style="font-weight: bold;">அனுப்புபவர்:</span> <span style="font-weight: 900;">${payout.sender || payout.name || '-'}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">பெறுபவர்:</span> <span style="font-weight: 900;">${payout.receiver || '-'}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">காரணம்:</span> <span>${payout.reason || '-'}</span></div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px; border-top: 2px solid #000; padding-top: 5px;">
            <span style="font-size: 13pt; font-weight: 900;">செலவுத் தொகை:</span>
            <span style="font-size: 18pt; font-weight: 900; font-family: sans-serif;">₹${parseFloat(payout.amount).toLocaleString('en-IN')}</span>
          </div>
          <div style="font-size: 9.5pt; font-weight: bold; font-style: italic; margin-top: 2px; text-align: center; color: #000;">(${payoutWords})</div>
        </div>

        <div style="text-align: center; margin-top: 8px; font-size: 8.5pt; border-top: 1px solid #000; padding-top: 4px; color: #000;">
          <p style="font-weight: bold; margin: 0;">பட்டுவாடா பதிவு செய்யப்பட்டது</p>
        </div>
      </div>
    `;

    // 1. Popup Window for 3-Inch Thermal Printing (Identical size & popup behavior as Moi Receipt)
    let printWin = null;
    try {
      printWin = window.open('', '_blank', 'width=380,height=650,top=60,left=150,menubar=no,toolbar=no,location=no,status=no');
    } catch (popupErr) {
      console.warn('Payout popup window open error:', popupErr);
    }

    if (printWin && !printWin.closed) {
      const fullDocHtml = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <title>Payout Receipt #${voucherNo}</title>
  <style>
    @page {
      size: 76mm auto; /* 3-inch POS thermal roll - exact same as Moi receipt */
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: 76mm;
      max-width: 76mm;
      margin: 0 auto;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: 'Noto Sans Tamil', 'Latha', 'Vijaya', monospace, sans-serif;
    }
    .thermal-receipt-container {
      width: 76mm;
      max-width: 76mm;
      padding: 4mm 2mm;
      margin: 0;
      box-sizing: border-box;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      font-family: monospace, 'Noto Sans Tamil', sans-serif;
      color: #000;
      font-weight: bold;
      border: none;
    }
  </style>
</head>
<body>
  <div id="receipt-print-box">${payoutReceiptHtml}</div>
  <script>
    let isPrinting = false;

    function doPrint() {
      isPrinting = true;
      window.focus();
      window.print();
    }

    window.onload = function() {
      window.focus();
      setTimeout(function() {
        doPrint();
      }, 350);
    };

    function onPrintComplete() {
      if (!isPrinting) return;
      isPrinting = false;
      setTimeout(function() {
        window.close();
      }, 500);
    }

    window.onafterprint = onPrintComplete;
    window.addEventListener('afterprint', onPrintComplete);
  <\/script>
</body>
</html>`;

      printWin.document.open();
      printWin.document.write(fullDocHtml);
      printWin.document.close();

      const senderElem = document.getElementById('payout-sender') || document.getElementById('payout-name');
      if (senderElem) senderElem.focus();
      return;
    }

    // 2. Fallback: Use #thermal-print-area if popup window was blocked
    const printArea = document.getElementById('thermal-print-area');
    if (!printArea) return;

    printArea.classList.remove('hidden');
    printArea.innerHTML = payoutReceiptHtml;
    window.print();

    const cleanupAfterPrint = () => {
      printArea.classList.add('hidden');
      printArea.innerHTML = '';
      const nameElem = document.getElementById('payout-sender') || document.getElementById('payout-name');
      if (nameElem) nameElem.focus();
    };

    window.onafterprint = cleanupAfterPrint;
    setTimeout(cleanupAfterPrint, 1200);
  }

  window.appReprintPayoutThermal = function (payoutId) {
    const payout = state.payouts.find(p => p.id === payoutId);
    if (!payout) return;
    const ev = state.events.find(e => e.id === payout.eventId) || { memberName: payout.eventName || 'Aathi Moi', place: '-' };
    printPayoutThermalReceipt(payout, ev);
  };

  window.appPickTranslit = function (fieldId, val) {
    const elem = document.getElementById(fieldId);
    if (elem) {
      elem.value = val;
      elem.focus();
      if ((fieldId === 'moi-amount' || fieldId === 'edit-rcpt-amt') && window.TamilWords) {
        const targetWordsId = fieldId === 'moi-amount' ? 'moi-amount-words' : 'edit-rcpt-words';
        const wordsElem = document.getElementById(targetWordsId);
        if (wordsElem) wordsElem.value = window.TamilWords.amountToTamilWords(parseFloat(val));
      }
    }
    document.querySelectorAll('.translit-dropdown').forEach(d => d.classList.add('hidden'));
  };

  window.appToggleTamilKeyboard = function () {
    const wrapper = document.getElementById('tamil-keyboard-wrapper');
    wrapper?.classList.toggle('hidden');
  };

  window.appInsertTamilChar = function (char) {
    const targetId = state.lastFocusedFieldId || 'moi-place';
    const elem = document.getElementById(targetId);
    if (elem) {
      elem.value += char;
      elem.focus();
    }
  };

  window.appSwitchToReceiptsPanel = function () {
    switchPanel('receipt');
  };

  function renderReceiptTableRows(receiptList) {
    if (!receiptList || receiptList.length === 0) {
      return '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500">No receipts found.</td></tr>';
    }
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    return receiptList.map(r => {
      return `
        <tr class="hover:bg-slate-900/50">
          <td class="px-4 py-3 font-mono font-bold text-amber-400">${r.billNo}</td>
          <td class="px-4 py-3">${r.place}</td>
          <td class="px-4 py-3 font-medium text-slate-100">${r.initial ? r.initial + '. ' : ''}${r.name}${r.name1 ? ' ' + r.name1 : ''}${r.job ? ' - ' + r.job : ''}</td>
          <td class="px-4 py-3 font-bold text-emerald-400">₹${parseFloat(r.amount).toLocaleString('en-IN')}</td>
          <td class="px-4 py-3"><span class="px-2 py-0.5 text-xs rounded ${r.mode === 'UPI' || r.mode === 'யூ.பி.ஐ' ? 'bg-indigo-900/60 text-indigo-300' : 'bg-emerald-900/60 text-emerald-300'}">${r.mode}</span></td>
          <td class="px-4 py-3 text-xs font-semibold text-amber-300">${r.createdBy || 'admin'}</td>
          <td class="px-4 py-3 text-right space-x-2">
            ${(r.mobile && r.mobile.replace(/\D/g, '').length >= 10) ? `
              <button onclick="window.appResendWhatsApp('${r.id}')" class="px-2.5 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 text-xs font-semibold border border-emerald-500/40 transition cursor-pointer" title="Send WhatsApp">
                WA
              </button>
            ` : ''}
            <button onclick="window.appOpenReceiptModal('${r.id}')" class="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/30 transition cursor-pointer">
              View / HTML
            </button>
            <button onclick="window.appDownloadSingleReceiptHtml('${r.id}')" class="px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 text-xs font-semibold border border-emerald-500/40 transition cursor-pointer">
              Download HTML
            </button>
            <button onclick="window.appReprintThermal('${r.id}')" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition cursor-pointer">
              Print
            </button>
            <button onclick="window.appEditReceipt('${r.id}')" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer">
              Edit
            </button>
            ${isAdmin ? `
              <button onclick="window.appDeleteReceipt('${r.id}')" class="px-2.5 py-1 rounded bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 text-xs font-semibold border border-rose-700/40 transition cursor-pointer">
                Delete
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderReceiptPanel() {
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    const activeEv = getActiveEvent();
    const receipts = state.receipts.filter(r => {
      if (!state.activeEventId) return true;
      if (r.eventId && r.eventId === state.activeEventId) return true;
      if (activeEv && r.eventName && (r.eventName === activeEv.memberName || r.eventName === activeEv.displayName1)) return true;
      return false;
    });

    return `
      <div class="max-w-5xl mx-auto space-y-6">
        <div class="glass-card p-6">
          <div class="flex flex-col sm:flex-row items-center justify-between mb-4 pb-4 border-b border-slate-800 gap-4">
            <h2 class="text-xl font-extrabold gold-gradient-text flex items-center space-x-3">
              <i data-lucide="receipt" class="w-6 h-6 text-amber-400"></i>
              <span>Saved Receipts (<span id="receipt-count-badge">${receipts.length}</span>)</span>
            </h2>

            <div class="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <button type="button" onclick="window.appDownloadAllReceiptsHtml()" class="px-4 py-2 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/50 font-bold text-xs flex items-center space-x-2 transition shadow-lg cursor-pointer whitespace-nowrap">
                <i data-lucide="file-code" class="w-4 h-4 text-emerald-400"></i>
                <span>Download All Receipts in HTML</span>
              </button>

              <div class="flex items-center space-x-2">
                <label class="text-xs font-semibold text-amber-400 whitespace-nowrap">Select Event:</label>
                <select id="receipt-event-select" class="input-styled text-sm py-1.5 min-w-[200px]" ${!isAdmin ? 'disabled' : ''}>
                  ${isAdmin ? '<option value="">All Events</option>' : ''}
                  ${getVisibleEvents().map(ev => `
                    <option value="${ev.id}" ${ev.id === state.activeEventId ? 'selected' : ''}>
                      ${ev.displayName1 || ev.memberName}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''} (${ev.place})
                    </option>
                  `).join('')}
                </select>
              </div>
            </div>
          </div>

          <!-- Search Option for Saved Receipts -->
          <div class="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
            <div class="relative w-full sm:w-96">
              <input type="text" id="receipt-search-input" placeholder="🔍 Search receipt (Bill#, Name, Place, Phone, Mode, Amount)..."
                class="input-styled w-full text-xs py-2 pl-9 pr-8 rounded-xl bg-slate-950/80 text-slate-100 placeholder-slate-500 border border-slate-700/80 focus:border-amber-400">
              <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
              <button type="button" id="receipt-search-clear" onclick="window.appClearReceiptSearch()" class="hidden absolute right-2.5 top-2 text-slate-400 hover:text-slate-200">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
              </button>
            </div>
            <div class="text-xs text-slate-400 self-end sm:self-center">
              Showing <span id="receipt-visible-count" class="font-bold text-amber-400">${receipts.length}</span> of <span class="font-bold text-slate-300">${receipts.length}</span> receipts
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm text-slate-300">
              <thead class="text-xs uppercase bg-slate-900/60 text-amber-400 border-b border-slate-800">
                <tr>
                  <th class="px-4 py-3">Bill #</th>
                  <th class="px-4 py-3">Place</th>
                  <th class="px-4 py-3">Name</th>
                  <th class="px-4 py-3">Amount</th>
                  <th class="px-4 py-3">Mode</th>
                  <th class="px-4 py-3">Created By</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="receipt-table-body" class="divide-y divide-slate-800">
                ${renderReceiptTableRows(receipts)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div id="receipt-edit-modal-root"></div>
    `;
  }

  window.appClearReceiptSearch = function () {
    const searchInp = document.getElementById('receipt-search-input');
    if (searchInp) {
      searchInp.value = '';
      searchInp.dispatchEvent(new Event('input'));
      searchInp.focus();
    }
  };

  function bindReceiptEvents() {
    const sel = document.getElementById('receipt-event-select');
    sel?.addEventListener('change', (e) => {
      state.activeEventId = e.target.value;
      renderApp();
    });

    const searchInput = document.getElementById('receipt-search-input');
    const clearBtn = document.getElementById('receipt-search-clear');
    searchInput?.addEventListener('input', (e) => {
      const q = (e.target.value || '').trim().toLowerCase();
      if (clearBtn) {
        if (q) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
      }

      const activeEv = getActiveEvent();
      const allCurrentReceipts = state.receipts.filter(r => {
        if (!state.activeEventId) return true;
        if (r.eventId && r.eventId === state.activeEventId) return true;
        if (activeEv && r.eventName && (r.eventName === activeEv.memberName || r.eventName === activeEv.displayName1)) return true;
        return false;
      });

      const filtered = !q ? allCurrentReceipts : allCurrentReceipts.filter(r => {
        const billNo = String(r.billNo || '').toLowerCase();
        const place = String(r.place || '').toLowerCase();
        const name = String(r.name || '').toLowerCase();
        const initial = String(r.initial || '').toLowerCase();
        const job = String(r.job || '').toLowerCase();
        const name1 = String(r.name1 || '').toLowerCase();
        const mobile = String(r.mobile || r.phone || '').toLowerCase();
        const mode = String(r.mode || '').toLowerCase();
        const createdBy = String(r.createdBy || '').toLowerCase();
        const amt = String(r.amount || '').toLowerCase();

        return billNo.includes(q) ||
               place.includes(q) ||
               name.includes(q) ||
               initial.includes(q) ||
               job.includes(q) ||
               name1.includes(q) ||
               mobile.includes(q) ||
               mode.includes(q) ||
               createdBy.includes(q) ||
               amt.includes(q);
      });

      const tbody = document.getElementById('receipt-table-body');
      if (tbody) tbody.innerHTML = renderReceiptTableRows(filtered);

      const visibleCount = document.getElementById('receipt-visible-count');
      if (visibleCount) visibleCount.textContent = filtered.length;

      if (window.lucide) window.lucide.createIcons();
    });
  }

  window.appReprintThermal = function (receiptId) {
    const rcpt = state.receipts.find(r => r.id === receiptId);
    if (!rcpt) return;
    const ev = state.events.find(e => e.id === rcpt.eventId) || { memberName: rcpt.memberName || 'Aathi Moi', place: rcpt.place || '-' };
    printThermalReceipt(rcpt, ev);
  };

  window.appSubmitMoiEntryWithWhatsApp = function () {
    window.appSubmitMoiEntry(true);
  };

  // Formatted WhatsApp Receipt Text generator
  function getReceiptWhatsAppText(rcpt, ev) {
    if (!rcpt) return '';
    const eventObj = ev || (state.events ? state.events.find(e => e.id === rcpt.eventId) : null) || {
      memberName: rcpt.memberName || '',
      displayName1: rcpt.displayName1 || '',
      place: rcpt.place || '',
      eventName: rcpt.eventName || ''
    };

    const orgName = 'ஆதி மொய்';
    const orgContact = 'கருணாக்கமுத்தன்பட்டி 📞 (+91 9865607179)';
    const eventHeader = (eventObj && eventObj.displayName1) || rcpt.displayName1 
      ? `${(eventObj && eventObj.displayName1) || rcpt.displayName1}${eventObj && eventObj.memberName ? ' - ' + eventObj.memberName : (rcpt.memberName ? ' - ' + rcpt.memberName : '')}`
      : (eventObj ? eventObj.memberName : (rcpt.memberName || ''));
    const eventPlace = (eventObj && eventObj.place) || rcpt.place || '';
    const eventTitle = (eventObj && eventObj.eventName) || rcpt.eventName || '';
    const donorName = `${rcpt.initial ? rcpt.initial + '. ' : ''}${rcpt.name}${rcpt.name1 ? ' ' + rcpt.name1 : ''}${rcpt.job ? ' - ' + rcpt.job : ''}`;

    return [
      `✨ *${orgName} - மொய் ரசீது* ✨`,
      `${orgContact}`,
      `━━━━━━━━━━━━━━━━━━`,
      `🎉 *நிகழ்வு:* ${eventHeader}${eventTitle ? ' (' + eventTitle + ')' : ''}`,
      `📍 *இடம்:* ${eventPlace}`,
      `━━━━━━━━━━━━━━━━━━`,
      `🧾 *ரசீது எண்:* #${rcpt.billNo}`,
      `📅 *தேதி:* ${rcpt.date} ${rcpt.time}`,
      `👤 *பெயர்:* ${donorName}`,
      `🏠 *ஊர்:* ${rcpt.place}`,
      rcpt.relationship ? `🤝 *உறவு:* ${rcpt.relationship}` : null,
      `💰 *மொய் தொகை:* *₹${parseFloat(rcpt.amount).toLocaleString('en-IN')}*`,
      rcpt.amountWords ? `📝 *எழுத்தால்:* ${rcpt.amountWords}` : null,
      `💳 *செலுத்திய முறை:* ${rcpt.mode}${rcpt.upiTxTime ? ` (${rcpt.upiTxTime})` : ''}`,
      `━━━━━━━━━━━━━━━━━━`,
      `📸 *ரசீது படம் (Receipt Image) இத்துடன் இணைக்கப்பட்டுள்ளது.*`,
      `🙏 *தங்கள் வருகைக்கும் அன்பு மொய்க்கும் மனமார்ந்த நன்றி!*`
    ].filter(Boolean).join('\n');
  }

  window.appResendWhatsApp = function (receiptId) {
    const rcpt = state.receipts.find(r => r.id === receiptId);
    if (!rcpt) return;
    const digits = (rcpt.mobile || '').replace(/\D/g, '');
    if (!digits || digits.length < 10) {
      if (typeof window.showToast === 'function') {
        window.showToast('இந்த ரசீதில் செல்லுபடியாகும் மொபைல் எண் இல்லை! (No valid 10-digit mobile number found)', 'warning');
      } else {
        alert('இந்த ரசீதில் செல்லுபடியாகும் மொபைல் எண் இல்லை!');
      }
      return;
    }
    let cleanPhone = digits.length === 10 ? '91' + digits : (digits.length === 11 && digits.startsWith('0') ? '91' + digits.substring(1) : (digits.length === 12 && digits.startsWith('91') ? digits : '91' + digits));
    const ev = state.events.find(e => e.id === rcpt.eventId) || { memberName: rcpt.memberName || 'Aathi Moi', place: rcpt.place || '-' };
    const canvas = renderReceiptToCanvas(rcpt, ev);
    if (canvas && canvas.toBlob) {
      canvas.toBlob(blob => {
        if (blob && navigator.clipboard && window.ClipboardItem) {
          navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]).catch(e => console.warn('Clipboard write notice:', e));
        }
      }, 'image/png');
    }
    const textMsg = getReceiptWhatsAppText(rcpt, ev);
    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(textMsg)}`;
    try {
      const waWin = window.open(waUrl, '_blank');
      if (!waWin) {
        const a = document.createElement('a');
        a.href = waUrl;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e) {}
    if (typeof window.showToast === 'function') {
      window.showToast(`✓ ரசீது #${rcpt.billNo} வாட்ஸ்அப் திறக்கப்படுகிறது... ரசீது படம் நகலெடுக்கப்பட்டது (Ctrl+V கொடுத்து அனுப்பவும்).`, 'success', 5000);
    }
  };

  // ==========================================
  // WhatsApp Receipt in Image Format & Direct Sender
  // ==========================================
  function renderReceiptToCanvas(rcpt, ev) {
    const dpr = 2; // Ultra-sharp 2x resolution
    const width = 560;

    const rows = [
      { label: 'ரசீது எண்:', val: '#' + (rcpt.billNo || '') },
      { label: 'தேதி & நேரம்:', val: (rcpt.date || '') + ' ' + (rcpt.time || '') },
      { label: 'பெயர்:', val: (rcpt.initial ? rcpt.initial + '. ' : '') + (rcpt.name || '') + (rcpt.job ? ' - ' + rcpt.job : '') + (rcpt.name1 ? ' ' + rcpt.name1 : '') },
      { label: 'ஊர்:', val: rcpt.place || '-' }
    ];
    if (rcpt.relationship) {
      rows.push({ label: 'உறவு:', val: rcpt.relationship });
    }
    rows.push({ label: 'செலுத்திய முறை:', val: (rcpt.mode || 'ரொக்கம்') + (rcpt.upiTxTime ? ' (' + rcpt.upiTxTime + ')' : '') });
    if (rcpt.createdBy) {
      rows.push({ label: 'பதிவு செய்தவர்:', val: rcpt.createdBy });
    }

    function fitText(ctx, text, maxWidth) {
      let str = String(text || '');
      if (ctx.measureText(str).width <= maxWidth) return str;
      while (str.length > 3 && ctx.measureText(str + '...').width > maxWidth) {
        str = str.slice(0, -1);
      }
      return str + '...';
    }

    function wrapTextLines(ctx, text, maxWidth) {
      const words = String(text || '').split(' ');
      const lines = [];
      let currentLine = '';
      words.forEach(w => {
        const testLine = currentLine ? (currentLine + ' ' + w) : w;
        if (ctx.measureText(testLine).width <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = w;
        }
      });
      if (currentLine) lines.push(currentLine);
      return lines;
    }

    function roundRect(ctx, x, y, w, h, radius, fill, stroke) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      if (fill) ctx.fill();
      if (stroke) ctx.stroke();
    }

    // Measure words lines
    const dummyCanvas = document.createElement('canvas');
    const dummyCtx = dummyCanvas.getContext('2d');
    dummyCtx.font = 'bold 12.5px "Mukta Malar", "Nirmala UI", sans-serif';
    const amountWordsLines = rcpt.amountWords ? wrapTextLines(dummyCtx, '(' + rcpt.amountWords + ')', width - 80) : [];
    const amtBoxHeight = 85 + (amountWordsLines.length * 18);

    const contentStartY = 160;
    const rowsHeight = rows.length * 36;
    const footerHeight = 76;
    const totalHeight = contentStartY + rowsHeight + amtBoxHeight + footerHeight + 30;

    const canvas = document.createElement('canvas');
    canvas.width = width * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = totalHeight + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 1. Background
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 0, 0, width, totalHeight, 18, true, false);

    // Outer Border
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8B0000';
    roundRect(ctx, 1.5, 1.5, width - 3, totalHeight - 3, 18, false, true);

    // 2. Header banner with crimson gradient
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, 2, 2, width - 4, 140, 16, true, false);
    const grad = ctx.createLinearGradient(0, 0, width, 140);
    grad.addColorStop(0, '#8B0000');
    grad.addColorStop(1, '#5c0000');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Header Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "Mukta Malar", "Nirmala UI", sans-serif';
    ctx.fillText('ஆதி மொய்', width / 2, 38);

    // Header Subtitle
    ctx.fillStyle = '#fecaca';
    ctx.font = 'bold 13px "Mukta Malar", "Nirmala UI", sans-serif';
    ctx.fillText('கருணாக்கமுத்தன்பட்டி 📞 (+91 9865607179)', width / 2, 62);

    // Event Title & Place
    const evTitle = (ev && ev.displayName1) ? (ev.displayName1 + (ev.memberName ? ' - ' + ev.memberName : '')) : ((ev && ev.memberName) || (rcpt && rcpt.displayName1) || 'Aathi Moi Event');
    ctx.fillStyle = '#ffe082';
    ctx.font = 'bold 17px "Mukta Malar", "Nirmala UI", sans-serif';
    ctx.fillText(fitText(ctx, evTitle, width - 40), width / 2, 92);

    const evPlace = (ev && ev.place) || (rcpt && rcpt.place) || '';
    if (evPlace) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px "Mukta Malar", "Nirmala UI", sans-serif';
      ctx.fillText(evPlace, width / 2, 114);
    }

    // Gold divider
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(35, 132);
    ctx.lineTo(width - 35, 132);
    ctx.stroke();

    // 3. Details Rows
    let startY = 168;
    const paddingX = 35;
    const contentWidth = width - (paddingX * 2);

    rows.forEach(r => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 14px "Mukta Malar", "Nirmala UI", sans-serif';
      ctx.fillText(r.label, paddingX, startY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = (r.label === 'பெயர்:' ? 'bold 16px' : 'bold 14px') + ' "Mukta Malar", "Nirmala UI", sans-serif';
      ctx.fillText(fitText(ctx, r.val, contentWidth - 110), width - paddingX, startY);

      // Divider
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(paddingX, startY + 11);
      ctx.lineTo(width - paddingX, startY + 11);
      ctx.stroke();
      ctx.setLineDash([]);

      startY += 35;
    });

    // 4. Amount Box
    startY += 8;
    ctx.fillStyle = '#f0fdf4';
    roundRect(ctx, paddingX, startY, contentWidth, amtBoxHeight, 14, true, false);

    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 2;
    roundRect(ctx, paddingX, startY, contentWidth, amtBoxHeight, 14, false, true);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#166534';
    ctx.font = 'bold 12.5px "Mukta Malar", "Nirmala UI", sans-serif';
    ctx.fillText('மொய் தொகை', width / 2, startY + 24);

    const amtNum = '₹' + (parseFloat(rcpt.amount) || 0).toLocaleString('en-IN');
    ctx.fillStyle = '#15803d';
    ctx.font = '900 36px "Mukta Malar", "Nirmala UI", sans-serif';
    ctx.fillText(amtNum, width / 2, startY + 62);

    if (amountWordsLines.length > 0) {
      ctx.fillStyle = '#166534';
      ctx.font = 'bold 12px "Mukta Malar", "Nirmala UI", sans-serif';
      let wordY = startY + 84;
      amountWordsLines.forEach(l => {
        ctx.fillText(l, width / 2, wordY);
        wordY += 17;
      });
    }

    // 5. Footer
    const footerY = totalHeight - footerHeight;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    roundRect(ctx, 2, footerY, width - 4, footerHeight - 2, 16, true, false);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, footerY);
    ctx.lineTo(width - 2, footerY);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 14px "Mukta Malar", "Nirmala UI", sans-serif';
    ctx.fillText('🙏 தங்கள் வருகைக்கும் அன்பு மொய்க்கும் மனமார்ந்த நன்றி!', width / 2, footerY + 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px "Mukta Malar", "Nirmala UI", sans-serif';
    ctx.fillText('ஆதி மொய் மேலாண்மை • Group of Perumu', width / 2, footerY + 54);

    return canvas;
  }

  // ==========================================
  // ==========================================
  // Unified Moi Entry Save & Print Handler
  // ==========================================
  window.appSubmitMoiEntry = async function () {
    try {
      const activeEv = getActiveEvent();
      if (!activeEv) {
        alert('தயவுசெய்து முதலில் நிகழ்வை தேர்ந்தெடுக்கவும்! (Please select or create an active event in Event Master first!)');
        return;
      }

      const placeInput = document.getElementById('moi-place');
      const initialInput = document.getElementById('moi-initial');
      const nameInput = document.getElementById('moi-name');
      const jobInput = document.getElementById('moi-job');
      const name1Input = document.getElementById('moi-name1');
      const relInput = document.getElementById('moi-relationship');
      const mobileInput = document.getElementById('moi-mobile');
      const amountInput = document.getElementById('moi-amount');
      const wordsInput = document.getElementById('moi-amount-words');

      const place = placeInput ? placeInput.value.trim() : '';
      const initial = initialInput ? initialInput.value.trim().toUpperCase() : '';
      const name = nameInput ? nameInput.value.trim() : '';
      const job = jobInput ? jobInput.value.trim() : '';
      const name1 = name1Input ? name1Input.value.trim() : '';
      const rel = relInput ? relInput.value.trim() : '';
      const mobile = mobileInput ? mobileInput.value.trim() : '';
      const amt = amountInput ? amountInput.value.trim() : '';
      let words = wordsInput ? wordsInput.value.trim() : '';

      if (!place) {
        if (typeof window.showToast === 'function') {
          window.showToast('ஊர் பெயரை உள்ளிடவும்! (Please enter Place)', 'warning');
        } else {
          alert('ஊர் பெயரை உள்ளிடவும்! (Please enter Place)');
        }
        if (placeInput) placeInput.focus();
        return;
      }

      if (!name) {
        if (typeof window.showToast === 'function') {
          window.showToast('பெயரை உள்ளிடவும்! (Please enter Name)', 'warning');
        } else {
          alert('பெயரை உள்ளிடவும்! (Please enter Name)');
        }
        if (nameInput) nameInput.focus();
        return;
      }

      if (!amt || parseFloat(amt) <= 0) {
        if (typeof window.showToast === 'function') {
          window.showToast('தொகையை உள்ளிடவும்! (Please enter valid Amount)', 'warning');
        } else {
          alert('தொகையை உள்ளிடவும்! (Please enter valid Amount)');
        }
        if (amountInput) amountInput.focus();
        return;
      }

      // Auto-generate Tamil words if empty
      if (!words && window.TamilWords) {
        words = window.TamilWords.amountToTamilWords(parseFloat(amt));
      }

      // Payment Mode
      let mode = 'Cash';
      const modeRadios = document.getElementsByName('moi-mode');
      for (let r of modeRadios) {
        if (r.checked) {
          mode = r.value;
          break;
        }
      }
      const upiTxTime = document.getElementById('moi-upi-tx-time')?.value.trim() || '';
      if (mode === 'UPI' && !upiTxTime) {
        alert('Please enter UPI Transaction Time / Reference Number!');
        return;
      }

      const billNo = getNextBillNoForEvent(activeEv.id);
      const now = new Date();
      const dateStr = now.toLocaleDateString('ta-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      const newReceipt = {
        id: 'rcpt_' + Date.now(),
        billNo,
        eventId: activeEv.id,
        displayName1: activeEv.displayName1 || '',
        eventName: activeEv.eventName,
        memberName: activeEv.memberName,
        place,
        initial,
        name,
        job,
        name1,
        relationship: rel,
        mobile,
        amount: amt,
        amountWords: words,
        mode: mode === 'UPI' ? 'யூ.பி.ஐ' : 'ரொக்கம்',
        upiTxTime: mode === 'UPI' ? upiTxTime : '',
        createdBy: state.currentUser ? state.currentUser.username : 'admin',
        date: dateStr,
        time: timeStr,
        createdAt: now.toISOString()
      };

      // Check WhatsApp Receipt Sending Option
      const chkWa = document.getElementById('moi-chk-send-whatsapp');
      const isWaChecked = chkWa ? chkWa.checked : (localStorage.getItem('aathi_auto_send_whatsapp') !== 'false');

      let cleanPhone = '';
      if (mobile) {
        const digits = mobile.replace(/\D/g, '');
        if (digits.length === 10) {
          cleanPhone = '91' + digits;
        } else if (digits.length === 11 && digits.startsWith('0')) {
          cleanPhone = '91' + digits.substring(1);
        } else if (digits.length === 12 && digits.startsWith('91')) {
          cleanPhone = digits;
        } else if (digits.length > 10) {
          cleanPhone = digits;
        }
      }

      // If user enabled WhatsApp option but mobile is missing, prompt operator for number
      if (isWaChecked && !cleanPhone) {
        const promptPhone = prompt('Please enter customer WhatsApp mobile number (வாடிக்கையாளர் வாட்ஸ்அப் எண்):', '');
        if (promptPhone) {
          const digits = promptPhone.replace(/\D/g, '');
          if (digits.length === 10) cleanPhone = '91' + digits;
          else if (digits.length === 11 && digits.startsWith('0')) cleanPhone = '91' + digits.substring(1);
          else if (digits.length >= 10) cleanPhone = digits;
          if (cleanPhone) {
            mobile = promptPhone;
            newReceipt.mobile = promptPhone;
          }
        }
      }

      const willSendWhatsApp = isWaChecked && !!cleanPhone;

      // 1. Update State Memory & Member Details
      upsertMemberRecord(newReceipt);
      state.receipts.push(newReceipt);
      state.lastSavedReceipt = newReceipt;

      // 2. Save DB and drive files in background
      saveDb().catch(err => console.warn('Background saveDb notice:', err));
      saveReceiptFileToDrive(activeEv.eventName, newReceipt).catch(err => console.warn('Background Drive save notice:', err));
      if (state.localSaveDirHandle) {
        saveReceiptToChosenLocalFolder(newReceipt).catch(err => console.warn('Local folder auto-save notice:', err));
      }

      // 3. Prepare receipt image on clipboard if phone is present
      if (cleanPhone) {
        try {
          const canvas = renderReceiptToCanvas(newReceipt, activeEv);
          const dataUrl = canvas.toDataURL('image/png');

          fetch('/api/save-receipt-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: `Receipt_${newReceipt.billNo || newReceipt.id}`, dataUrl })
          }).catch(e => console.warn('Save receipt image notice:', e));

          if (canvas.toBlob) {
            canvas.toBlob(blob => {
              if (blob && navigator.clipboard && window.ClipboardItem) {
                navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': blob })
                ]).catch(clipErr => console.warn('Clipboard write notice:', clipErr));
              }
            }, 'image/png');
          }
        } catch (e) {
          console.warn('Canvas preparation notice:', e);
        }
      }

      // 4. Prepare WhatsApp URL if selected
      let waUrl = null;
      if (willSendWhatsApp) {
        const textMsg = getReceiptWhatsAppText(newReceipt, activeEv);
        waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(textMsg)}`;
        
        // Show prominent toast with direct 1-click link
        window.showWhatsAppRedirectBanner(cleanPhone, waUrl);
      }

      // 5. Thermal Print (3-inch paper, first two pages alone in popup window; after printing, opens WhatsApp)
      printThermalReceipt(newReceipt, activeEv, false, null, waUrl);

      // Re-render UI to update receipt table
      renderApp();

    } catch (err) {
      console.error('Moi Entry Submit Error:', err);
      alert('Notice: ' + err.message);
    }
  };

  // Sticky top banner for WhatsApp redirection
  window.showWhatsAppRedirectBanner = function (phone, waUrl) {
    const existing = document.getElementById('moi-wa-redirect-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'moi-wa-redirect-toast';
    toast.className = 'fixed top-4 right-4 z-[99999] bg-slate-900 border-2 border-emerald-500 p-4 rounded-2xl shadow-2xl flex items-center space-x-3 text-white max-w-md animate-in slide-in-from-top duration-200';
    toast.innerHTML = `
      <div class="p-2 rounded-xl bg-emerald-950 border border-emerald-500/40 text-emerald-400">
        <i data-lucide="message-circle" class="w-6 h-6"></i>
      </div>
      <div class="flex-1">
        <p class="font-extrabold text-sm text-slate-100">WhatsApp Receipt Sending...</p>
        <p class="text-xs text-emerald-300 font-semibold">+${phone} (ரசீது வாட்ஸ்அப்பில் அனுப்பப்படுகிறது)</p>
      </div>
      <a href="${waUrl}" target="_blank" onclick="this.closest('#moi-wa-redirect-toast').remove()" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition whitespace-nowrap cursor-pointer">
        Open WhatsApp ↗
      </a>
      <button type="button" onclick="this.closest('#moi-wa-redirect-toast').remove()" class="text-slate-400 hover:text-white p-1 cursor-pointer">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    `;
    document.body.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 15000);
  };

  window.appSendReceiptWhatsApp = async function (rcptIdOrObj, customMobile = null, options = {}) {
    const suppressModal = options && options.suppressModal !== false;
    const imageOnly = options && options.imageOnly !== false;

    const rcpt = typeof rcptIdOrObj === 'object' ? rcptIdOrObj : state.receipts.find(r => r.id === rcptIdOrObj);
    if (!rcpt) {
      alert('Receipt not found!');
      return;
    }

    let mobile = (customMobile || rcpt.mobile || '').trim();
    if (!mobile) {
      if (suppressModal) {
        if (typeof window.showToast === 'function') {
          window.showToast('வாட்ஸ்அப் அனுப்ப வாடிக்கையாளரின் மொபைல் எண் உள்ளிடப்படவில்லை! (No Mobile Number for WhatsApp)', 'warning');
        } else {
          alert('வாட்ஸ்அப் அனுப்ப வாடிக்கையாளரின் மொபைல் எண் உள்ளிடப்படவில்லை! (No Mobile Number for WhatsApp)');
        }
        return;
      }
      mobile = prompt('Please enter customer WhatsApp mobile number (வாடிக்கையாளர் வாட்ஸ்அப் எண்):', '');
      if (!mobile) return;
      rcpt.mobile = mobile.trim();
      saveDb().catch(e => console.warn(e));
    }

    let cleanPhone = mobile.replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
      cleanPhone = '91' + cleanPhone.substring(1);
    }

    const ev = state.events.find(e => e.id === rcpt.eventId) || {
      memberName: rcpt.memberName || '',
      displayName1: rcpt.displayName1 || '',
      place: rcpt.place || '',
      eventName: rcpt.eventName || ''
    };

    const orgName = 'ஆதி மொய்';
    const orgContact = 'கருணாக்கமுத்தன்பட்டி 📞 (+91 9865607179)';
    const eventHeader = (ev && ev.displayName1) || rcpt.displayName1 
      ? `${(ev && ev.displayName1) || rcpt.displayName1}${ev && ev.memberName ? ' - ' + ev.memberName : (rcpt.memberName ? ' - ' + rcpt.memberName : '')}`
      : (ev ? ev.memberName : (rcpt.memberName || ''));
    const eventPlace = (ev && ev.place) || rcpt.place || '';
    const eventTitle = (ev && ev.eventName) || rcpt.eventName || '';
    
    const donorName = `${rcpt.initial ? rcpt.initial + '. ' : ''}${rcpt.name}${rcpt.job ? ' - ' + rcpt.job : ''}${rcpt.name1 ? ' ' + rcpt.name1 : ''}`;

    const textLines = [
      `✨ *${orgName} - மொய் ரசீது* ✨`,
      `${orgContact}`,
      `━━━━━━━━━━━━━━━━━━`,
      `🎉 *நிகழ்வு:* ${eventHeader}${eventTitle ? ' (' + eventTitle + ')' : ''}`,
      `📍 *இடம்:* ${eventPlace}`,
      `━━━━━━━━━━━━━━━━━━`,
      `🧾 *ரசீது எண்:* #${rcpt.billNo}`,
      `📅 *தேதி:* ${rcpt.date} ${rcpt.time}`,
      `👤 *பெயர்:* ${donorName}`,
      `🏠 *ஊர்:* ${rcpt.place}`,
      rcpt.relationship ? `🤝 *உறவு:* ${rcpt.relationship}` : null,
      `💰 *மொய் தொகை:* *₹${parseFloat(rcpt.amount).toLocaleString('en-IN')}*`,
      rcpt.amountWords ? `📝 *எழுத்தால்:* ${rcpt.amountWords}` : null,
      `💳 *செலுத்திய முறை:* ${rcpt.mode}${rcpt.upiTxTime ? ` (${rcpt.upiTxTime})` : ''}`,
      `━━━━━━━━━━━━━━━━━━`,
      `📸 *ரசீது படம் (Receipt Image) இத்துடன் இணைக்கப்பட்டுள்ளது.*`,
      `🙏 *தங்கள் வருகைக்கும் அன்பு மொய்க்கும் மனமார்ந்த நன்றி!*`
    ].filter(Boolean).join('\n');

    // 1. Ensure fonts are loaded before drawing canvas
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // 2. Render Receipt Image to Canvas
    const canvas = renderReceiptToCanvas(rcpt, ev);
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const imgFilename = `Receipt_${rcpt.billNo || rcpt.id}.png`;

    // 3. Automatically Copy Image to Clipboard (For instant Ctrl+V paste in WhatsApp)
    let copiedToClipboard = false;
    if (navigator.clipboard && window.ClipboardItem && blob) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        copiedToClipboard = true;
      } catch (err) {
        console.warn('Clipboard write image failed:', err);
      }
    }

    // 4. Save receipt image to server / public folder in background
    fetch('/api/save-receipt-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: `Receipt_${rcpt.billNo || rcpt.id}`, dataUrl })
    }).catch(e => console.warn('Save receipt image notice:', e));

    // 5. Open WhatsApp Web / App
    // When imageOnly: open directly to the customer chat without long text dump so the customer receives the receipt image directly via paste
    const waUrl = imageOnly
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}`
      : `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(textLines)}`;
    window.open(waUrl, '_blank');

    if (typeof window.showToast === 'function') {
      if (copiedToClipboard) {
        window.showToast('✓ வாட்ஸ்அப் திறக்கப்படுகிறது... ரசீது படம் நகலெடுக்கப்பட்டது (Ctrl+V கொடுத்து வாட்ஸ்அப்பில் அனுப்பவும்).', 'success');
      } else {
        window.showToast('வாட்ஸ்அப் திறக்கப்படுகிறது... ரசீது படம் தயாராக உள்ளது.', 'info');
      }
    }

    // 6. Open Interactive WhatsApp Receipt Image Modal ONLY IF NOT SUPPRESSED
    if (!suppressModal) {
      window.appShowWhatsAppReceiptModal({
        rcpt,
        ev,
        blob,
        dataUrl,
        cleanPhone,
        textLines,
        waUrl,
        copiedToClipboard,
        imgFilename
      });
    }
  };

  // WhatsApp Receipt Image Modal Component
  window.appShowWhatsAppReceiptModal = function ({
    rcpt,
    ev,
    blob,
    dataUrl,
    cleanPhone,
    textLines,
    waUrl,
    copiedToClipboard,
    imgFilename
  }) {
    let modalEl = document.getElementById('whatsapp-receipt-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'whatsapp-receipt-modal';
      modalEl.className = 'modal-overlay z-50 flex items-center justify-center p-4';
      document.body.appendChild(modalEl);
    }

    modalEl.classList.remove('hidden');

    modalEl.innerHTML = `
      <div class="glass-card w-full max-w-xl p-5 sm:p-6 relative overflow-hidden shadow-2xl border border-emerald-500/40 max-h-[92vh] flex flex-col my-auto">
        <!-- Modal Header -->
        <div class="flex items-center justify-between pb-3.5 mb-3 border-b border-slate-700/60">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-600/90 border border-emerald-400/40 flex items-center justify-center text-white shadow-lg">
              <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            </div>
            <div>
              <h3 class="text-base sm:text-lg font-extrabold text-emerald-300">வாட்ஸ்அப் ரசீது படம் (Receipt Image)</h3>
              <p class="text-xs text-slate-300">ரசீது எண்: <strong class="text-amber-300">#${rcpt.billNo}</strong> | வாடிக்கையாளர் எண்: <strong class="text-emerald-400 font-mono">+${cleanPhone}</strong></p>
            </div>
          </div>
          <button type="button" onclick="document.getElementById('whatsapp-receipt-modal').classList.add('hidden')" class="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Notification Banner -->
        <div class="mb-3 p-2.5 rounded-xl ${copiedToClipboard ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300' : 'bg-amber-950/80 border border-amber-500/40 text-amber-300'} text-xs font-bold flex items-center justify-between gap-2 shadow-inner">
          <div class="flex items-center space-x-2">
            <i data-lucide="${copiedToClipboard ? 'check-circle-2' : 'info'}" class="w-4 h-4 shrink-0 ${copiedToClipboard ? 'text-emerald-400' : 'text-amber-400'}"></i>
            <span>${copiedToClipboard ? 'ரசீது படம் க்ளிப்போர்டில் நகலெடுக்கப்பட்டது! வாட்ஸ்அப்பில் <strong>Ctrl+V</strong> கொடுத்து படத்தை அனுப்பவும்.' : 'படத்தை வாட்ஸ்அப்பில் அனுப்ப கீழே உள்ள பொத்தான்களை பயன்படுத்தவும்.'}</span>
          </div>
          <button type="button" id="btn-copy-receipt-img-top" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold transition cursor-pointer shrink-0">
            Copy Image
          </button>
        </div>

        <!-- Scrollable Receipt Image Preview -->
        <div class="flex-1 overflow-y-auto rounded-xl border border-slate-700/80 bg-slate-950/90 p-3 flex justify-center items-start shadow-inner">
          <img src="${dataUrl}" id="modal-receipt-img" alt="Receipt Image Preview" class="rounded-xl border border-amber-500/30 shadow-2xl max-w-full h-auto" style="max-height: 48vh;">
        </div>

        <!-- Action Buttons -->
        <div class="pt-3.5 mt-3 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex items-center space-x-2 w-full sm:w-auto">
            <!-- Open WhatsApp Web Button -->
            <button type="button" id="btn-open-wa-modal" class="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center space-x-2 shadow-lg transition cursor-pointer">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
              <span>Open WhatsApp</span>
            </button>

            <!-- Direct Native Share Image (Mobile & Desktop) -->
            <button type="button" id="btn-share-receipt-img" class="px-3.5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-teal-100 font-bold text-xs flex items-center space-x-1.5 transition border border-teal-500/40 cursor-pointer">
              <i data-lucide="share-2" class="w-4 h-4 text-teal-300"></i>
              <span>Share Image</span>
            </button>
          </div>

          <div class="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <!-- Copy Image Button -->
            <button type="button" id="btn-copy-receipt-img" class="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center space-x-1.5 transition border border-slate-600/50 cursor-pointer">
              <i data-lucide="copy" class="w-4 h-4 text-amber-400"></i>
              <span>Copy Image</span>
            </button>

            <!-- Download PNG Image -->
            <button type="button" id="btn-download-receipt-img" class="px-3.5 py-2.5 rounded-xl bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 font-bold text-xs flex items-center space-x-1.5 transition border border-indigo-500/50 cursor-pointer">
              <i data-lucide="download" class="w-4 h-4 text-indigo-300"></i>
              <span>Download Image</span>
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Event Listeners for Modal Buttons
    const copyHandler = async () => {
      if (navigator.clipboard && window.ClipboardItem && blob) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          if (typeof window.showToast === 'function') {
            window.showToast('✓ ரசீது படம் க்ளிப்போர்டில் நகலெடுக்கப்பட்டது! வாட்ஸ்அப்பில் Ctrl+V கொடுக்கவும்.', 'success');
          } else {
            alert('Receipt image copied to clipboard! Paste (Ctrl+V) in WhatsApp.');
          }
        } catch (e) {
          alert('Could not copy image to clipboard automatically. Please click Download Image.');
        }
      }
    };

    document.getElementById('btn-copy-receipt-img')?.addEventListener('click', copyHandler);
    document.getElementById('btn-copy-receipt-img-top')?.addEventListener('click', copyHandler);

    document.getElementById('btn-open-wa-modal')?.addEventListener('click', () => {
      copyHandler();
      window.open(waUrl, '_blank');
    });

    document.getElementById('btn-download-receipt-img')?.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = imgFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (typeof window.showToast === 'function') {
        window.showToast(`✓ ரசீது படம் (${imgFilename}) பதிவிறக்கம் செய்யப்பட்டது!`, 'success');
      }
    });

    document.getElementById('btn-share-receipt-img')?.addEventListener('click', async () => {
      if (navigator.canShare && blob) {
        try {
          const file = new File([blob], imgFilename, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Moi Receipt #${rcpt.billNo}`,
              text: textLines
            });
            return;
          }
        } catch (e) {
          if (e.name !== 'AbortError') console.warn('Share error:', e);
        }
      }
      copyHandler();
      window.open(waUrl, '_blank');
    });
  };

  window.appChooseLocalSaveDirectory = async function () {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        state.localSaveDirHandle = dirHandle;
        state.localSaveFolderName = dirHandle.name;
        localStorage.setItem('aathi_moi_local_folder_name', dirHandle.name);
        
        if (typeof window.showToast === 'function') {
          window.showToast(`Selected local folder: "${dirHandle.name}". New Moi entry data will automatically save here one by one!`, 'success');
        } else {
          alert(`Selected local folder: "${dirHandle.name}". New Moi entry data will automatically save here one by one!`);
        }
        renderApp();
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('showDirectoryPicker notice:', err);
        }
      }
    } else {
      alert('Local folder selection is supported in Google Chrome, Microsoft Edge, and Electron application.');
    }
  };

  window.appClearLocalSaveDirectory = function () {
    state.localSaveDirHandle = null;
    state.localSaveFolderName = '';
    localStorage.removeItem('aathi_moi_local_folder_name');
    if (typeof window.showToast === 'function') {
      window.showToast('Local disk folder saving disabled. (All data continues auto-saving to Google Drive)', 'info');
    }
    renderApp();
  };

  async function saveReceiptToChosenLocalFolder(rcpt) {
    if (!state.localSaveDirHandle || !rcpt) return;
    try {
      const fileName = `Receipt_${rcpt.billNo || '0'}_${rcpt.name || 'Moi'}.html`.replace(/[\\/:*?"<>|]/g, '_');
      const fileHandle = await state.localSaveDirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();

      const ev = state.events.find(e => e.id === rcpt.eventId);
      const majorName = rcpt.displayName1 || (ev ? ev.displayName1 : '') || rcpt.memberName || (ev ? ev.memberName : '') || 'Event';
      const name1 = rcpt.displayName1 ? (rcpt.memberName || (ev ? ev.memberName : '')) : '';

      const htmlContent = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ஆதி மொய் - ரசீது #${rcpt.billNo}</title>
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
    <div class="subtitle">கருணாக்கமுத்தன்பட்டி (+91 9865607179)</div>
    <div class="row"><span class="bold">ரசீது எண்:</span> <span>#${rcpt.billNo}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${rcpt.date || ''} ${rcpt.time || ''}</span></div>
    <div class="row"><span class="bold">உறுப்பினர் பெயர்:</span> <span>${majorName}</span></div>
    ${name1 ? `<div class="row"><span class="bold">உறுப்பினர் பெயர் 1:</span> <span>${name1}</span></div>` : ''}
    <div class="row"><span class="bold">பெயர்:</span> <span>${rcpt.initial ? rcpt.initial + '. ' : ''}${rcpt.name || ''}${rcpt.job ? ' - ' + rcpt.job : ''}${rcpt.name1 ? ' ' + rcpt.name1 : ''}</span></div>
    <div class="row"><span class="bold">இடம்:</span> <span>${rcpt.place || ''}</span></div>
    ${rcpt.relationship ? `<div class="row"><span class="bold">உறவு:</span> <span>${rcpt.relationship}</span></div>` : ''}
    <div class="amount-box">
      <div class="amount-title">தொகை</div>
      <div class="amount-val">₹${parseFloat(rcpt.amount).toLocaleString('en-IN')}</div>
      <div class="amount-words">(${rcpt.amountWords || ''})</div>
    </div>
    <div class="row"><span class="bold">செலுத்திய முறை:</span> <span>${rcpt.mode || 'ரொக்கம்'}</span></div>
    <div class="footer">தங்கள் வருகைக்கு நன்றி</div>
  </div>
</body>
</html>`;

      await writable.write(htmlContent);
      await writable.close();
      if (typeof window.showToast === 'function') {
        window.showToast(`Saved #${rcpt.billNo} into local folder "${state.localSaveFolderName}"`, 'success');
      }
    } catch (err) {
      console.warn('Auto-save to chosen local folder error:', err);
    }
  }

  window.appSaveLatestOrSelectReceiptToLocalDisk = function () {
    const activeEvReceipts = state.activeEventId 
      ? state.receipts.filter(r => r.eventId === state.activeEventId)
      : state.receipts;

    if (activeEvReceipts.length === 0) {
      alert('No saved receipts found for this event. Please fill the Moi Entry form and click "Save & Print Thermal Receipt" first!');
      return;
    }

    const latestRcpt = activeEvReceipts[activeEvReceipts.length - 1];
    window.appSaveAsReceiptToLocalDisk(latestRcpt.id);
  };

  window.appSaveAsReceiptToLocalDisk = async function (receiptId) {
    const rcpt = state.receipts.find(r => r.id === receiptId);
    if (!rcpt) return;

    const ev = state.events.find(e => e.id === rcpt.eventId);
    const majorName = rcpt.displayName1 || (ev ? ev.displayName1 : '') || rcpt.memberName || (ev ? ev.memberName : '') || 'Event';
    const name1 = rcpt.displayName1 ? (rcpt.memberName || (ev ? ev.memberName : '')) : '';

    const htmlContent = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ஆதி மொய் - ரசீது #${rcpt.billNo}</title>
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
    <div class="subtitle">கருணாக்கமுத்தன்பட்டி (+91 9865607179)</div>
    <div class="row"><span class="bold">ரசீது எண்:</span> <span>#${rcpt.billNo}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${rcpt.date || ''} ${rcpt.time || ''}</span></div>
    <div class="row"><span class="bold">உறுப்பினர் பெயர்:</span> <span>${majorName}</span></div>
    ${name1 ? `<div class="row"><span class="bold">உறுப்பினர் பெயர் 1:</span> <span>${name1}</span></div>` : ''}
    <div class="row"><span class="bold">பெயர்:</span> <span>${rcpt.initial ? rcpt.initial + '. ' : ''}${rcpt.name || ''}${rcpt.job ? ' - ' + rcpt.job : ''}${rcpt.name1 ? ' ' + rcpt.name1 : ''}</span></div>
    <div class="row"><span class="bold">இடம்:</span> <span>${rcpt.place || ''}</span></div>
    ${rcpt.relationship ? `<div class="row"><span class="bold">உறவு:</span> <span>${rcpt.relationship}</span></div>` : ''}
    <div class="amount-box">
      <div class="amount-title">தொகை</div>
      <div class="amount-val">₹${parseFloat(rcpt.amount).toLocaleString('en-IN')}</div>
      <div class="amount-words">(${rcpt.amountWords || ''})</div>
    </div>
    <div class="row"><span class="bold">செலுத்திய முறை:</span> <span>${rcpt.mode || 'ரொக்கம்'}</span></div>
    <div class="footer">தங்கள் வருகைக்கு நன்றி</div>
  </div>
</body>
</html>`;

    const fileName = `Receipt_${rcpt.billNo || '0'}_${rcpt.name || 'Moi'}.html`.replace(/[\\/:*?"<>|]/g, '_');

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'HTML Receipt File',
            accept: { 'text/html': ['.html'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(htmlContent);
        await writable.close();
        alert('Receipt successfully saved to your selected local disk folder!');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('showSaveFilePicker error, falling back:', err);
      }
    }

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  window.appDownloadSingleReceiptHtml = function (receiptId) {
    window.appSaveAsReceiptToLocalDisk(receiptId);
  };

  window.appOpenReceiptModal = function (receiptId) {
    const rcpt = state.receipts.find(r => r.id === receiptId);
    if (!rcpt) return;
    const ev = state.events.find(e => e.id === rcpt.eventId);

    let modalEl = document.getElementById('receipt-download-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'receipt-download-modal';
      modalEl.className = 'modal-overlay z-50 fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
      document.body.appendChild(modalEl);
    }

    const majorName = rcpt.displayName1 || (ev ? ev.displayName1 : '') || rcpt.memberName || (ev ? ev.memberName : '') || 'Event';
    const name1 = rcpt.displayName1 ? (rcpt.memberName || (ev ? ev.memberName : '')) : '';

    modalEl.innerHTML = `
      <div class="glass-card max-w-md w-full p-6 space-y-5 border border-amber-500/30 shadow-2xl relative animate-fade-in">
        <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
          <div class="flex items-center space-x-2 text-amber-400 font-bold text-lg">
            <i data-lucide="file-text" class="w-5 h-5"></i>
            <span>Receipt #${rcpt.billNo}</span>
          </div>
          <button onclick="document.getElementById('receipt-download-modal').classList.add('hidden')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Receipt Preview Card -->
        <div class="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-xs space-y-2 text-slate-200">
          <div class="text-center font-bold text-base text-amber-300 border-b border-amber-500/20 pb-2 mb-2">
            ஆதி மொய் (Aathi Moi)
          </div>
          <div class="flex justify-between"><span class="text-slate-400 font-semibold">Bill No:</span><span class="font-mono font-bold text-amber-400">#${rcpt.billNo}</span></div>
          <div class="flex justify-between"><span class="text-slate-400 font-semibold">Date/Time:</span><span>${rcpt.date} ${rcpt.time}</span></div>
          <div class="flex justify-between"><span class="text-slate-400 font-semibold">Member:</span><span class="font-bold text-amber-300">${majorName} ${name1 ? '(' + name1 + ')' : ''}</span></div>
          <div class="flex justify-between"><span class="text-slate-400 font-semibold">Name:</span><span class="font-bold text-slate-100">${rcpt.initial ? rcpt.initial + '. ' : ''}${rcpt.name}${rcpt.job ? ' - ' + rcpt.job : ''}${rcpt.name1 ? ' ' + rcpt.name1 : ''}</span></div>
          <div class="flex justify-between"><span class="text-slate-400 font-semibold">Place:</span><span>${rcpt.place}</span></div>
          ${rcpt.relationship ? `<div class="flex justify-between"><span class="text-slate-400 font-semibold">Relationship:</span><span>${rcpt.relationship}</span></div>` : ''}
          <div class="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/30 text-center my-2">
            <div class="text-xs text-amber-400 font-semibold">Amount</div>
            <div class="text-xl font-black text-amber-300">₹${parseFloat(rcpt.amount).toLocaleString('en-IN')}</div>
            <div class="text-[11px] italic text-slate-300">(${rcpt.amountWords})</div>
          </div>
          <div class="flex justify-between"><span class="text-slate-400 font-semibold">Payment Mode:</span><span class="font-bold text-emerald-400">${rcpt.mode}</span></div>
        </div>

        <!-- Download Action Buttons -->
        <div class="space-y-2 pt-2">
          <button onclick="window.appSaveAsReceiptToLocalDisk('${rcpt.id}')" class="gold-button w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 shadow-lg cursor-pointer">
            <i data-lucide="hard-drive" class="w-4 h-4"></i>
            <span>Save to Local Disk (Save As Window - Choose Folder)</span>
          </button>
          
          <button onclick="window.appReprintThermal('${rcpt.id}'); document.getElementById('receipt-download-modal').classList.add('hidden');" class="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600/40 font-bold text-xs flex items-center justify-center space-x-2 transition cursor-pointer">
            <i data-lucide="printer" class="w-4 h-4 text-amber-400"></i>
            <span>Print Receipt / Thermal Print</span>
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    modalEl.classList.remove('hidden');
  };

  window.appDownloadAllReceiptsHtml = function () {
    const receiptsToDownload = state.activeEventId 
      ? state.receipts.filter(r => r.eventId === state.activeEventId)
      : state.receipts;

    if (!receiptsToDownload || receiptsToDownload.length === 0) {
      alert('No receipts available to download for the selected event.');
      return;
    }

    let modalEl = document.getElementById('all-receipts-download-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'all-receipts-download-modal';
      modalEl.className = 'modal-overlay z-50 fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
      document.body.appendChild(modalEl);
    }

    const activeEv = state.events.find(e => e.id === state.activeEventId);
    const eventLabel = activeEv ? (activeEv.displayName1 || activeEv.memberName) : 'All Events';

    modalEl.innerHTML = `
      <div class="glass-card max-w-lg w-full p-6 space-y-5 border border-emerald-500/40 shadow-2xl relative animate-fade-in">
        <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
          <div class="flex items-center space-x-2 text-emerald-400 font-bold text-lg">
            <i data-lucide="file-code" class="w-6 h-6"></i>
            <span>Batch Download All Receipts in HTML</span>
          </div>
          <button onclick="document.getElementById('all-receipts-download-modal').classList.add('hidden')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div class="space-y-3 text-xs text-slate-300">
          <div class="flex justify-between bg-emerald-950/40 p-3 rounded-xl border border-emerald-500/30">
            <span class="font-semibold text-slate-400">Event Scope:</span>
            <span class="font-bold text-emerald-300">${eventLabel}</span>
          </div>
          <div class="flex justify-between bg-amber-950/40 p-3 rounded-xl border border-amber-500/30">
            <span class="font-semibold text-slate-400">Total Receipts to Download:</span>
            <span class="font-mono font-bold text-amber-400">${receiptsToDownload.length} HTML Receipt File(s)</span>
          </div>
          <p class="text-[11px] text-slate-400 leading-relaxed">
            Clicking <strong>Start Automatic HTML Download</strong> will open save prompts/downloads for all <strong>${receiptsToDownload.length}</strong> receipts one by one automatically in standalone HTML format (.html).
          </p>

          <div id="batch-download-progress-box" class="hidden bg-slate-900 p-3 rounded-xl border border-slate-700 space-y-2">
            <div class="flex justify-between font-semibold text-emerald-400" id="batch-progress-text">
              Downloading receipts...
            </div>
            <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div id="batch-progress-bar" class="bg-emerald-500 h-full w-0 transition-all duration-200"></div>
            </div>
          </div>
        </div>

        <div class="pt-2 flex flex-col sm:flex-row gap-3">
          <button id="btn-start-batch-download" onclick="window.appExecuteBatchReceiptDownload()" class="gold-button flex-1 py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 shadow-lg cursor-pointer">
            <i data-lucide="download" class="w-4 h-4"></i>
            <span>Start Automatic HTML Download (${receiptsToDownload.length} Files)</span>
          </button>
          <button onclick="document.getElementById('all-receipts-download-modal').classList.add('hidden')" class="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    modalEl.classList.remove('hidden');
  };

  window.appExecuteBatchReceiptDownload = async function () {
    const receiptsToDownload = state.activeEventId 
      ? state.receipts.filter(r => r.eventId === state.activeEventId)
      : state.receipts;

    if (!receiptsToDownload || receiptsToDownload.length === 0) return;

    const btn = document.getElementById('btn-start-batch-download');
    const progressBox = document.getElementById('batch-download-progress-box');
    const progressText = document.getElementById('batch-progress-text');
    const progressBar = document.getElementById('batch-progress-bar');

    if (btn) btn.disabled = true;
    if (progressBox) progressBox.classList.remove('hidden');

    for (let i = 0; i < receiptsToDownload.length; i++) {
      const rcpt = receiptsToDownload[i];
      const pct = Math.round(((i + 1) / receiptsToDownload.length) * 100);

      if (progressText) progressText.textContent = `Downloading ${i + 1}/${receiptsToDownload.length}: Receipt #${rcpt.billNo} (${pct}%)`;
      if (progressBar) progressBar.style.width = pct + '%';

      window.appDownloadSingleReceiptHtml(rcpt.id);

      await new Promise(res => setTimeout(res, 350));
    }

    if (progressText) progressText.textContent = `✅ Successfully downloaded all ${receiptsToDownload.length} receipt(s) in HTML format!`;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i><span>Completed (${receiptsToDownload.length} Files Downloaded)</span>`;
    }

    setTimeout(() => {
      const modalEl = document.getElementById('all-receipts-download-modal');
      if (modalEl) modalEl.classList.add('hidden');
    }, 2000);
  };

  function openEditReceiptFormModal(rcpt) {
    const modalRoot = document.getElementById('receipt-edit-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-overlay">
        <div class="glass-card w-full max-w-xl max-h-[90vh] overflow-y-auto p-4 sm:p-5 space-y-3 rounded-2xl shadow-2xl">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h3 class="text-base font-bold gold-gradient-text flex items-center space-x-2">
              <i data-lucide="edit-3" class="w-4 h-4 text-amber-400"></i>
              <span>Edit Receipt #${rcpt.billNo}</span>
            </h3>
            <button type="button" onclick="document.getElementById('receipt-edit-modal-root').innerHTML=''" class="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>

          <form id="edit-receipt-form" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div class="relative">
              <label class="block text-[11px] font-semibold text-slate-300 mb-0.5">Mobile Number (Optional)</label>
              <input type="tel" id="edit-rcpt-mobile" class="input-styled font-mono" value="${rcpt.mobile || rcpt.phone || ''}" autocomplete="off" maxlength="15">
            </div>

            <div class="relative">
              <label class="block text-[11px] font-semibold text-slate-300 mb-0.5">Place *</label>
              <input type="text" id="edit-rcpt-place" class="input-styled" value="${rcpt.place}" required autocomplete="off">
              <div id="edit-rcpt-place-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-[11px] font-semibold text-slate-300 mb-0.5">Initial (Optional)</label>
              <input type="text" id="edit-rcpt-initial" class="input-styled uppercase font-bold" value="${rcpt.initial || ''}" autocomplete="off">
            </div>

            <div class="relative">
              <label class="block text-[11px] font-semibold text-slate-300 mb-0.5">Name *</label>
              <input type="text" id="edit-rcpt-name" class="input-styled" value="${rcpt.name}" required autocomplete="off">
              <div id="edit-rcpt-name-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-[11px] font-semibold text-slate-300 mb-0.5">Job (Optional)</label>
              <input type="text" id="edit-rcpt-job" class="input-styled" value="${rcpt.job || ''}" autocomplete="off">
            </div>

            <div class="relative">
              <label class="block text-[11px] font-semibold text-slate-300 mb-0.5">Name 1 (Optional)</label>
              <input type="text" id="edit-rcpt-name1" class="input-styled" value="${rcpt.name1 || ''}" autocomplete="off">
              <div id="edit-rcpt-name1-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-[11px] font-semibold text-slate-300 mb-0.5">Relationship (Optional)</label>
              <input type="text" id="edit-rcpt-rel" class="input-styled" value="${rcpt.relationship || ''}" autocomplete="off">
              <div id="edit-rcpt-rel-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-[11px] font-semibold text-slate-300 mb-0.5">Amount (₹) *</label>
              <input type="number" id="edit-rcpt-amt" class="input-styled font-mono text-emerald-400 font-bold" value="${rcpt.amount}" min="1" required>
            </div>

            <div class="sm:col-span-2">
              <label class="block text-[11px] font-semibold text-amber-400 mb-0.5">Amount in Words *</label>
              <input type="text" id="edit-rcpt-words" class="input-styled text-amber-300 font-bold" value="${rcpt.amountWords}" required>
            </div>

            <div class="sm:col-span-2 flex space-x-3 pt-2">
              <button type="button" onclick="document.getElementById('receipt-edit-modal-root').innerHTML=''" class="w-1/2 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300 transition cursor-pointer">
                Cancel
              </button>
              <button type="submit" class="w-1/2 gold-button py-2 text-xs font-bold rounded-xl shadow-lg cursor-pointer">
                Save Edits
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    // Google Tamil Transliteration for Edit Receipt
    bindGoogleTamilTransliteration('edit-rcpt-place', 'edit-rcpt-place-suggestions');
    bindGoogleTamilTransliteration('edit-rcpt-name', 'edit-rcpt-name-suggestions');
    bindGoogleTamilTransliteration('edit-rcpt-name1', 'edit-rcpt-name1-suggestions');
    bindGoogleTamilTransliteration('edit-rcpt-rel', 'edit-rcpt-rel-suggestions');

    // Live Amount to Tamil Words auto conversion in Edit Receipt
    const editAmtInput = document.getElementById('edit-rcpt-amt');
    const editWordsInput = document.getElementById('edit-rcpt-words');
    editAmtInput?.addEventListener('input', (e) => {
      const valStr = e.target.value.trim();
      const amt = parseFloat(valStr);
      if (!isNaN(amt) && amt > 0 && window.TamilWords) {
        editWordsInput.value = window.TamilWords.amountToTamilWords(amt);
      } else {
        editWordsInput.value = '';
      }
    });

    document.getElementById('edit-receipt-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      rcpt.place = document.getElementById('edit-rcpt-place').value.trim();
      rcpt.initial = document.getElementById('edit-rcpt-initial')?.value.trim().toUpperCase() || '';
      rcpt.name = document.getElementById('edit-rcpt-name').value.trim();
      rcpt.job = document.getElementById('edit-rcpt-job')?.value.trim() || '';
      rcpt.name1 = document.getElementById('edit-rcpt-name1').value.trim();
      rcpt.relationship = document.getElementById('edit-rcpt-rel').value.trim();
      rcpt.mobile = document.getElementById('edit-rcpt-mobile')?.value.trim() || '';
      rcpt.amount = document.getElementById('edit-rcpt-amt').value.trim();
      rcpt.amountWords = document.getElementById('edit-rcpt-words').value.trim();

      await saveDb();
      await saveReceiptFileToDrive(rcpt.eventName || '', rcpt);

      document.getElementById('receipt-edit-modal-root').innerHTML = '';
      renderApp();

      const ev = state.events.find(e => e.id === rcpt.eventId) || { memberName: rcpt.memberName || 'Aathi Moi', place: rcpt.place || '-' };
      printThermalReceipt(rcpt, ev);
    });
  }

  window.appEditReceipt = function (receiptId) {
    const rcpt = state.receipts.find(r => r.id === receiptId);
    if (!rcpt) return;

    // Permission Check: Receipts can be edited by creator user OR Admin
    const currentUsername = state.currentUser ? state.currentUser.username.toLowerCase() : '';
    const creatorUsername = (rcpt.createdBy || 'admin').toLowerCase();
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';

    if (!isAdmin && currentUsername !== creatorUsername) {
      alert('Access Restricted: Receipts can only be edited by the creator or Admin.');
      return;
    }

    const modalRoot = document.getElementById('receipt-edit-modal-root');
    if (!modalRoot) return;

    // Password modal with masked input (<input type="password">)
    modalRoot.innerHTML = `
      <div class="modal-overlay">
        <div class="glass-card w-full max-w-sm p-6 space-y-4">
          <h3 class="text-lg font-bold gold-gradient-text flex items-center space-x-2">
            <i data-lucide="lock" class="w-5 h-5 text-amber-400"></i>
            <span>Password Verification</span>
          </h3>
          <p class="text-xs text-slate-300">Enter password to edit receipt #${rcpt.billNo}:</p>
          <form id="verify-receipt-pass-form" class="space-y-4">
            <div>
              <input type="password" id="verify-receipt-pass-input" class="input-styled font-mono text-center tracking-widest text-lg" placeholder="••••••••" required autocomplete="off">
            </div>
            <div class="flex space-x-3 pt-2">
              <button type="button" onclick="document.getElementById('receipt-edit-modal-root').innerHTML=''" class="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300 transition">
                Cancel
              </button>
              <button type="submit" class="w-1/2 gold-button py-2.5 text-xs font-bold rounded-xl shadow-lg">
                Verify
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    const passInput = document.getElementById('verify-receipt-pass-input');
    if (passInput) passInput.focus();

    document.getElementById('verify-receipt-pass-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredPass = document.getElementById('verify-receipt-pass-input').value;

      let userObj = state.users.find(u => u.username.toLowerCase() === currentUsername);
      let adminUsr = state.users.find(u => u.username.toLowerCase() === 'admin' || u.role === 'admin');
      const userPass = userObj ? userObj.password : (state.currentUser ? state.currentUser.password : '1234');
      const adminPass = adminUsr ? adminUsr.password : '1234';

      if (enteredPass !== userPass && enteredPass !== adminPass) {
        alert('Incorrect Password! Access Denied.');
        return;
      }

      openEditReceiptFormModal(rcpt);
    });
  };

  window.appDeleteReceipt = async function (receiptId) {
    if (state.currentUser.role !== 'admin') {
      alert('Access Restricted: Only Admin can delete receipts!');
      return;
    }

    const rcpt = state.receipts.find(r => r.id === receiptId);
    if (!rcpt) return;

    if (confirm(`Are you sure you want to delete receipt #${rcpt.billNo} for ${rcpt.name} (₹${rcpt.amount})?`)) {
      state.receipts = state.receipts.filter(r => r.id !== receiptId);
      await saveDb();
      alert(`Receipt #${rcpt.billNo} deleted successfully.`);
      renderApp();
    }
  };

  // ==========================================
  // 7. PAYOUT PANEL
  // ==========================================
  // ==========================================
  // 7. PAYOUT PANEL
  // ==========================================
  function renderPayoutPanel() {
    const activeEv = getActiveEvent();
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    const currentUsername = state.currentUser ? state.currentUser.username.toLowerCase() : '';

    const eventPayouts = state.payouts.filter(p => {
      const matchesEvent = !state.activeEventId || p.eventId === state.activeEventId;
      if (!matchesEvent) return false;
      if (isAdmin) return true;
      return (p.createdBy || 'admin').toLowerCase() === currentUsername;
    });

    const totalPayout = eventPayouts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    return `
      <div class="max-w-4xl mx-auto space-y-6">
        <div class="glass-card p-6 border-l-4 border-rose-500 flex items-center justify-between">
          <div>
            <p class="text-xs font-extrabold uppercase tracking-wider text-rose-400">Total Payout Amount</p>
            <h3 class="text-3xl font-black text-rose-400 mt-2">₹${totalPayout.toLocaleString('en-IN')}</h3>
            <p class="text-[11px] text-slate-400 mt-1">${eventPayouts.length} Expenses Recorded ${!isAdmin ? '(Your Entries)' : '(All Users)'}</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400">
            <i data-lucide="hand-coins" class="w-6 h-6"></i>
          </div>
        </div>

        <div class="glass-card p-6">
          <div class="flex flex-col sm:flex-row items-center justify-between mb-6 pb-4 border-b border-slate-800 gap-4">
            <h2 class="text-xl font-extrabold gold-gradient-text flex items-center space-x-3">
              <i data-lucide="hand-coins" class="w-6 h-6 text-amber-400"></i>
              <span>Payout Entry Module</span>
            </h2>

            <div class="flex items-center space-x-3 w-full sm:w-auto">
              <label class="text-xs font-semibold text-amber-400 whitespace-nowrap">Select Event:</label>
              <select id="payout-event-select" class="input-styled text-sm py-1.5 min-w-[220px]" ${!isAdmin ? 'disabled' : ''}>
                ${isAdmin ? '<option value="">All Events</option>' : ''}
                ${getVisibleEvents().map(ev => `
                  <option value="${ev.id}" ${ev.id === state.activeEventId ? 'selected' : ''}>
                    ${ev.displayName1 || ev.memberName}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''} (${ev.place})
                  </option>
                `).join('')}
              </select>
            </div>
          </div>

          <form id="payout-entry-form" class="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Sender *</label>
              <input type="text" id="payout-sender" class="input-styled" placeholder="Ex: Karthi" required autocomplete="off">
              <div id="payout-sender-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Receiver *</label>
              <input type="text" id="payout-receiver" class="input-styled" placeholder="Ex: Murugan" required autocomplete="off">
              <div id="payout-receiver-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Reason *</label>
              <input type="text" id="payout-reason" class="input-styled" placeholder="Ex: Betel Leaf" required autocomplete="off">
              <div id="payout-reason-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Amount (₹) *</label>
              <input type="number" id="payout-amount" class="input-styled font-mono text-rose-400 font-bold" placeholder="500" min="1" required>
            </div>

            <div class="md:col-span-4 pt-2">
              <button type="submit" class="gold-button w-full py-3 rounded-xl font-bold flex items-center justify-center space-x-2">
                <i data-lucide="save" class="w-5 h-5"></i>
                <span>Save Payout Entry</span>
              </button>
            </div>
          </form>
        </div>

        <div class="glass-card p-6">
          <h3 class="text-lg font-bold text-slate-100 mb-4">Saved Payout Expenses (${eventPayouts.length})</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm text-slate-300">
              <thead class="text-xs uppercase bg-slate-900/60 text-amber-400 border-b border-slate-800">
                <tr>
                  <th class="px-4 py-3">S.No</th>
                  <th class="px-4 py-3">Date & Time</th>
                  <th class="px-4 py-3">Sender</th>
                  <th class="px-4 py-3">Receiver</th>
                  <th class="px-4 py-3">Reason</th>
                  <th class="px-4 py-3">Amount</th>
                  <th class="px-4 py-3">Created By</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                ${eventPayouts.length === 0 ? '<tr><td colspan="8" class="px-4 py-6 text-center text-slate-500">No payout entries recorded.</td></tr>' : ''}
                ${eventPayouts.map((p, idx) => `
                  <tr>
                    <td class="px-4 py-3 font-mono text-slate-400">${idx + 1}</td>
                    <td class="px-4 py-3 text-xs text-slate-400">${p.date} ${p.time}</td>
                    <td class="px-4 py-3 font-medium text-slate-100">${p.sender || p.name || '-'}</td>
                    <td class="px-4 py-3 font-medium text-amber-300">${p.receiver || '-'}</td>
                    <td class="px-4 py-3">${p.reason}</td>
                    <td class="px-4 py-3 font-bold text-rose-400">₹${parseFloat(p.amount).toLocaleString('en-IN')}</td>
                    <td class="px-4 py-3 text-xs font-semibold text-amber-300">${p.createdBy || 'admin'}</td>
                    <td class="px-4 py-3 text-right space-x-2">
                      <button onclick="window.appReprintPayoutThermal('${p.id}')" class="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/30 transition cursor-pointer">
                        Print
                      </button>
                      <button onclick="window.appEditPayout('${p.id}')" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer">
                        Edit
                      </button>
                      <button onclick="window.appDeletePayout('${p.id}')" class="px-2.5 py-1 rounded bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 text-xs font-semibold border border-rose-700/40 transition cursor-pointer">
                        Delete
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div id="payout-edit-modal-root"></div>
    `;
  }

  function bindPayoutEvents() {
    const sel = document.getElementById('payout-event-select');
    sel?.addEventListener('change', (e) => {
      state.activeEventId = e.target.value;
      renderApp();
    });

    const senderInput = document.getElementById('payout-sender') || document.getElementById('payout-name');
    const receiverInput = document.getElementById('payout-receiver');
    const reasonInput = document.getElementById('payout-reason');
    const amountInput = document.getElementById('payout-amount');

    bindGoogleTamilTransliteration('payout-sender', 'payout-sender-suggestions');
    bindGoogleTamilTransliteration('payout-receiver', 'payout-receiver-suggestions');
    bindGoogleTamilTransliteration('payout-reason', 'payout-reason-suggestions');

    // Enter & Tab Navigation: Sender -> Receiver -> Reason -> Amount -> Auto Submit
    const setupPayoutNavigation = (currentInput, nextInput, suggId) => {
      currentInput?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const suggDiv = document.getElementById(suggId);
          if (suggDiv && !suggDiv.classList.contains('hidden')) {
            const firstOption = suggDiv.querySelector('.translit-item span.font-semibold');
            if (firstOption && firstOption.textContent) {
              currentInput.value = firstOption.textContent;
            }
            suggDiv.classList.add('hidden');
          } else if (currentInput.value && !/[\u0B80-\u0BFF]/.test(currentInput.value)) {
            const goog = await window.TamilTransliterate.fetchGoogleInputToolsTamil(currentInput.value);
            if (goog && goog.length > 0) {
              currentInput.value = goog[0].ta;
            } else {
              currentInput.value = window.TamilTransliterate.transliterateText(currentInput.value);
            }
          }
          if (nextInput) {
            nextInput.focus();
            if (nextInput.select) nextInput.select();
          }
        }
      });
    };

    setupPayoutNavigation(senderInput, receiverInput, 'payout-sender-suggestions');
    setupPayoutNavigation(receiverInput, reasonInput, 'payout-receiver-suggestions');
    setupPayoutNavigation(reasonInput, amountInput, 'payout-reason-suggestions');

    amountInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const form = document.getElementById('payout-entry-form');
        if (form) {
          form.requestSubmit ? form.requestSubmit() : form.submit();
        }
      }
    });

    const form = document.getElementById('payout-entry-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();

      let activeEv = getActiveEvent();
      if (!activeEv && state.events.length > 0) {
        activeEv = state.events[0];
        state.activeEventId = activeEv.id;
      }

      if (!activeEv) {
        activeEv = {
          id: 'ev_' + Date.now(),
          memberName: 'பொது நிகழ்ச்சி (General Event)',
          eventName: 'General Event',
          place: 'தேனி',
          phone: '-',
          eventDate: new Date().toISOString().split('T')[0],
          status: 'confirmed',
          createdAt: new Date().toISOString()
        };
        state.events.push(activeEv);
        state.activeEventId = activeEv.id;
      }

      const sender = senderInput ? senderInput.value.trim() : '';
      const receiver = receiverInput ? receiverInput.value.trim() : '';
      const reason = reasonInput ? reasonInput.value.trim() : '';
      const amount = amountInput ? amountInput.value.trim() : '';

      if (!sender || !receiver || !reason || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        alert('Please fill in Sender, Receiver, Reason, and a valid Amount!');
        return;
      }

      const now = new Date();
      const dateStr = now.toLocaleDateString('ta-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      const newPayout = {
        id: 'payout_' + Date.now(),
        eventId: activeEv.id,
        eventName: activeEv.eventName || activeEv.memberName,
        sender,
        receiver,
        name: sender,
        reason,
        amount,
        createdBy: state.currentUser ? state.currentUser.username : 'admin',
        date: dateStr,
        time: timeStr,
        createdAt: now.toISOString()
      };

      state.payouts.push(newPayout);

      // 1. INSTANTLY open the Thermal Print Receipt Popup Window (< 10ms)
      printPayoutThermalReceipt(newPayout, activeEv);

      // 2. Save database asynchronously in background
      saveDb().catch(err => console.warn('Background payout saveDb notice:', err));

      // 3. Save Payout HTML receipt file locally to Backup folder
      savePayoutFileToDrive(activeEv.eventName || activeEv.memberName, newPayout);

      // 4. Sync payout to Google Apps Script if configured
      syncToGas('savePayout', { payout: newPayout }).catch(() => {});

      // 4. Re-render UI
      renderApp();
    });
  }

  function openEditPayoutFormModal(payout) {
    const modalRoot = document.getElementById('payout-edit-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-overlay">
        <div class="glass-card w-full max-w-md p-6 space-y-4">
          <h3 class="text-lg font-bold gold-gradient-text flex items-center space-x-2">
            <i data-lucide="edit-3" class="w-5 h-5 text-amber-400"></i>
            <span>Edit Payout Entry</span>
          </h3>

          <form id="edit-payout-form" class="space-y-4">
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Sender *</label>
              <input type="text" id="edit-payout-sender" class="input-styled" value="${payout.sender || payout.name || ''}" required autocomplete="off">
              <div id="edit-payout-sender-suggestions" class="translit-dropdown hidden"></div>
            </div>
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Receiver *</label>
              <input type="text" id="edit-payout-receiver" class="input-styled" value="${payout.receiver || ''}" required autocomplete="off">
              <div id="edit-payout-receiver-suggestions" class="translit-dropdown hidden"></div>
            </div>
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Reason *</label>
              <input type="text" id="edit-payout-reason" class="input-styled" value="${payout.reason || ''}" required autocomplete="off">
              <div id="edit-payout-reason-suggestions" class="translit-dropdown hidden"></div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Amount (₹) *</label>
              <input type="number" id="edit-payout-amt" class="input-styled font-mono text-rose-400 font-bold" value="${payout.amount}" min="1" required>
            </div>

            <div class="flex space-x-3 pt-3">
              <button type="button" onclick="document.getElementById('payout-edit-modal-root').innerHTML=''" class="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300">
                Cancel
              </button>
              <button type="submit" class="w-1/2 gold-button py-2.5 text-xs font-bold rounded-xl">
                Save Edits
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    bindGoogleTamilTransliteration('edit-payout-sender', 'edit-payout-sender-suggestions');
    bindGoogleTamilTransliteration('edit-payout-receiver', 'edit-payout-receiver-suggestions');
    bindGoogleTamilTransliteration('edit-payout-reason', 'edit-payout-reason-suggestions');

    document.getElementById('edit-payout-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      payout.sender = document.getElementById('edit-payout-sender').value.trim();
      payout.receiver = document.getElementById('edit-payout-receiver').value.trim();
      payout.name = payout.sender;
      payout.reason = document.getElementById('edit-payout-reason').value.trim();
      payout.amount = document.getElementById('edit-payout-amt').value.trim();

      await saveDb();
      savePayoutFileToDrive(payout.eventName || '', payout);

      document.getElementById('payout-edit-modal-root').innerHTML = '';
      renderApp();
    });
  }

  window.appEditPayout = function (payoutId) {
    const payout = state.payouts.find(p => p.id === payoutId);
    if (!payout) return;

    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    const currentUsername = state.currentUser ? state.currentUser.username.toLowerCase() : '';
    const creator = (payout.createdBy || 'admin').toLowerCase();

    if (!isAdmin && currentUsername !== creator) {
      alert('Access Restricted: Payout entries can only be edited by the creator or Admin.');
      return;
    }

    const modalRoot = document.getElementById('payout-edit-modal-root');
    if (!modalRoot) return;

    // Password verification modal with masked input (<input type="password">)
    modalRoot.innerHTML = `
      <div class="modal-overlay">
        <div class="glass-card w-full max-w-sm p-6 space-y-4">
          <h3 class="text-lg font-bold gold-gradient-text flex items-center space-x-2">
            <i data-lucide="lock" class="w-5 h-5 text-amber-400"></i>
            <span>Password Verification</span>
          </h3>
          <p class="text-xs text-slate-300">Enter password to edit payout entry for ${payout.name}:</p>
          <form id="verify-payout-pass-form" class="space-y-4">
            <div>
              <input type="password" id="verify-payout-pass-input" class="input-styled font-mono text-center tracking-widest text-lg" placeholder="••••••••" required autocomplete="off">
            </div>
            <div class="flex space-x-3 pt-2">
              <button type="button" onclick="document.getElementById('payout-edit-modal-root').innerHTML=''" class="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300 transition">
                Cancel
              </button>
              <button type="submit" class="w-1/2 gold-button py-2.5 text-xs font-bold rounded-xl shadow-lg">
                Verify
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    const passInput = document.getElementById('verify-payout-pass-input');
    if (passInput) passInput.focus();

    document.getElementById('verify-payout-pass-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredPass = document.getElementById('verify-payout-pass-input').value;

      let userObj = state.users.find(u => u.username.toLowerCase() === currentUsername);
      let adminUsr = state.users.find(u => u.username.toLowerCase() === 'admin' || u.role === 'admin');
      const userPass = userObj ? userObj.password : (state.currentUser ? state.currentUser.password : '1234');
      const adminPass = adminUsr ? adminUsr.password : '1234';

      if (enteredPass !== userPass && enteredPass !== adminPass) {
        alert('Incorrect Password! Access Denied.');
        return;
      }

      openEditPayoutFormModal(payout);
    });
  };

  window.appDeletePayout = async function (payoutId) {
    const payout = state.payouts.find(p => p.id === payoutId);
    if (!payout) return;

    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    const currentUsername = state.currentUser ? state.currentUser.username.toLowerCase() : '';
    const creator = (payout.createdBy || 'admin').toLowerCase();

    if (!isAdmin && currentUsername !== creator) {
      alert('Access Restricted: Payout entries can only be deleted by the creator or Admin.');
      return;
    }

    if (confirm(`Are you sure you want to delete payout entry for ${payout.name} (₹${payout.amount})?`)) {
      state.payouts = state.payouts.filter(p => p.id !== payoutId);
      await saveDb();
      renderApp();
    }
  };

  window.appDownloadExcelReport = function () {
    const activeEv = getActiveEvent() || (state.events.length > 0 ? state.events[0] : null);
    
    // Extract Event Master panel details: (Member Name, Member Name 1 (Optional), Phone Number, Place, Event Date)
    const memberName = activeEv ? (activeEv.displayName1 || activeEv.memberName || 'Aathi Moi') : 'Aathi Moi';
    const memberName1 = activeEv && activeEv.displayName1 ? (activeEv.memberName || '') : '';
    const phone = activeEv ? (activeEv.phone || '') : '';
    const place = activeEv ? (activeEv.place || '') : '';
    const eventDate = activeEv ? (activeEv.eventDate || '') : '';

    let eventMasterParts = [];
    if (memberName) eventMasterParts.push(memberName);
    if (memberName1) eventMasterParts.push(memberName1);
    if (phone) eventMasterParts.push(phone);
    if (place) eventMasterParts.push(place);
    if (eventDate) eventMasterParts.push(eventDate);

    const eventMasterHeaderStr = eventMasterParts.join(', ');
    const safeEventName = (memberName || 'Aathi_Moi_Report').replace(/[\\/:*?"<>|]/g, '_').trim();

    const filteredReceipts = typeof getFilteredReceipts === 'function' ? getFilteredReceipts() : state.receipts.filter(r => !state.activeEventId || r.eventId === state.activeEventId);
    const payoutsList = state.payouts.filter(p => !state.activeEventId || p.eventId === state.activeEventId);

    const totalMoiAmount = filteredReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const totalPayoutAmount = payoutsList.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalBalanceAmount = totalMoiAmount - totalPayoutAmount;

    const escapeXml = (str) => (str || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let excelHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]>
<xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>ஆதி மொய் அறிக்கை</x:Name>
    <x:WorksheetOptions>
     <x:DisplayGridlines/>
    </x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
  table { border-collapse: collapse; width: 100%; margin: 0 auto; }
  th { font-size: 12pt; font-weight: bold; border: 1.5px solid #000000; padding: 10px; text-align: center; background-color: #FFFFFF; }
  td { border: 1px solid #000000; padding: 8px; font-size: 11pt; text-align: left; vertical-align: middle; }
  .title-main { font-size: 26pt; font-weight: bold; text-align: center; border: none; padding-top: 15px; padding-bottom: 5px; font-family: 'Segoe UI', serif; }
  .title-sub { font-size: 14pt; font-weight: normal; text-align: center; border: none; padding-bottom: 15px; }
  .center { text-align: center; }
  .right { text-align: right; font-weight: bold; }
  .total-row { font-weight: bold; font-size: 12pt; border-top: 2px solid #000000; }
</style>
</head>
<body>

  <table>
    <!-- Top Heading: ஆதி மொய் -->
    <tr>
      <td colspan="5" class="title-main">ஆதி மொய்</td>
    </tr>
    <!-- Below Heading: Event Master (Member Name, Member Name 1 (Optional), Phone Number, Place, Event Date) -->
    <tr>
      <td colspan="5" class="title-sub">${escapeXml(eventMasterHeaderStr)}</td>
    </tr>

    <!-- Exact 5 Table Column Headings: s.no, bill no, place, name, amount -->
    <thead>
      <tr>
        <th style="width: 70px;">s.no</th>
        <th style="width: 120px;">bill no</th>
        <th style="width: 200px;">place</th>
        <th style="width: 300px;">name</th>
        <th style="width: 150px;">amount</th>
      </tr>
    </thead>
    <tbody>
      ${filteredReceipts.length === 0 ? '<tr><td colspan="5" class="center">No receipts recorded</td></tr>' : ''}
      ${filteredReceipts.map((r, idx) => {
        let nameDisplay = formatMoiPersonNameWithJob(r);

        return `
          <tr>
            <td class="center">${idx + 1}</td>
            <td class="center" style="font-weight: bold;">${escapeXml(r.billNo)}</td>
            <td>${escapeXml(r.place)}</td>
            <td style="font-weight: bold;">${escapeXml(nameDisplay)}</td>
            <td class="right" style="font-weight: bold; color: #047857;">₹${parseFloat(r.amount || 0).toLocaleString('en-IN')}</td>
          </tr>
        `;
      }).join('')}
      <tr class="total-row">
        <td colspan="4" style="text-align: right; font-weight: bold; font-size: 12pt;">Total Amount:</td>
        <td class="right" style="font-size: 13pt; font-weight: bold; color: #047857;">₹${totalMoiAmount.toLocaleString('en-IN')}</td>
      </tr>
    </tbody>
  </table>

  ${payoutsList.length > 0 ? `
  <br/><br/>
  <!-- Payout Expenses Section -->
  <table>
    <thead>
      <tr>
        <th colspan="5" style="font-size: 14pt; background-color: #F8FAFC; text-align: center; border: 1.5px solid #000000;">Payout Expenses (பட்டுவாடா செலவுகள்)</th>
      </tr>
      <tr>
        <th style="width: 70px;">s.no</th>
        <th style="width: 120px;">payout id</th>
        <th style="width: 200px;">reason</th>
        <th style="width: 300px;">name</th>
        <th style="width: 150px;">amount</th>
      </tr>
    </thead>
    <tbody>
      ${payoutsList.map((p, idx) => `
        <tr>
          <td class="center">${idx + 1}</td>
          <td class="center">${escapeXml(p.id)}</td>
          <td>${escapeXml(p.reason)}</td>
          <td style="font-weight: bold;">${escapeXml(p.name)}</td>
          <td class="right" style="color: #BE123C; font-weight: bold;">₹${parseFloat(p.amount || 0).toLocaleString('en-IN')}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="4" style="text-align: right; font-weight: bold;">Total Payout Amount:</td>
        <td class="right" style="font-size: 12pt; color: #BE123C;">₹${totalPayoutAmount.toLocaleString('en-IN')}</td>
      </tr>
      <tr class="total-row" style="background-color: #FEF3C7;">
        <td colspan="4" style="text-align: right; font-weight: bold; font-size: 13pt;">Net Balance Amount:</td>
        <td class="right" style="font-size: 14pt; color: ${totalBalanceAmount >= 0 ? '#047857' : '#BE123C'};">₹${totalBalanceAmount.toLocaleString('en-IN')}</td>
      </tr>
    </tbody>
  </table>
  ` : ''}

</body>
</html>`;

    // Download as Excel Spreadsheet file (.xls) with native Save As file picker
    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const fileName = `${safeEventName}_Excel_Report_${Date.now()}.xls`;
    saveBlobWithSaveAsDialog(blob, fileName);
  };

  // ==========================================
  // 7B. CASH DENOMINATION PANEL (STANDALONE MODULE)
  // ==========================================
  function renderCashDenominationPanel() {
    const activeEv = getActiveEvent();
    const allReceipts = state.receipts.filter(r => !state.activeEventId || r.eventId === state.activeEventId);
    const allPayouts = state.payouts.filter(p => !state.activeEventId || p.eventId === state.activeEventId);

    const totalMoiAmount = allReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const totalPayoutAmount = allPayouts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const totalUpiAmount = allReceipts
      .filter(r => r.mode === 'UPI' || r.mode === 'யூ.பி.ஐ')
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

    const activeEvKey = state.activeEventId || 'default';
    const savedDenom = (state.eventDenominations && state.eventDenominations[activeEvKey]) || null;
    const initialCounts = {
      500: savedDenom && savedDenom.c500 !== undefined ? savedDenom.c500 : 0,
      200: savedDenom && savedDenom.c200 !== undefined ? savedDenom.c200 : 0,
      100: savedDenom && savedDenom.c100 !== undefined ? savedDenom.c100 : 0,
      50:  savedDenom && savedDenom.c50  !== undefined ? savedDenom.c50  : 0,
      20:  savedDenom && savedDenom.c20  !== undefined ? savedDenom.c20  : 0,
      10:  savedDenom && savedDenom.c10  !== undefined ? savedDenom.c10  : 0,
      1:   savedDenom && savedDenom.c1   !== undefined ? savedDenom.c1   : 0,
    };
    const initialGpay = totalUpiAmount;
    const initialHostCash = totalPayoutAmount;

    const evDisplayName = activeEv ? ((activeEv.displayName1 || '') + (activeEv.displayName1 && activeEv.memberName ? ' - ' + activeEv.memberName : (activeEv.memberName || ''))) : 'No Event Selected';

    return `
      <div class="space-y-6">
        <!-- Event Info Banner -->
        <div class="glass-card p-5 border-l-4 border-indigo-500 flex items-center justify-between">
          <div>
            <p class="text-xs font-extrabold uppercase tracking-wider text-indigo-400">Cash Denomination</p>
            <h3 class="text-xl font-black text-indigo-300 mt-1">${evDisplayName}</h3>
            <p class="text-[11px] text-slate-400 mt-1">
              ${allReceipts.length} Receipts | Total: ₹${totalMoiAmount.toLocaleString('en-IN')} | UPI: ₹${totalUpiAmount.toLocaleString('en-IN')} | Payout: ₹${totalPayoutAmount.toLocaleString('en-IN')}
            </p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <i data-lucide="banknote" class="w-6 h-6"></i>
          </div>
        </div>

        <!-- Cash Denomination Card -->
        <div class="glass-card p-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-700/60 pb-3 gap-2 mb-5">
            <div class="flex items-center space-x-2.5">
              <div class="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 flex items-center justify-center">
                <i data-lucide="banknote" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-sm font-black text-indigo-300 uppercase tracking-wide">
                  Cash Denomination Report
                </h3>
                <p class="text-[11px] text-slate-400">
                  Enter physical note counts. Auto-reconciled with Google Pay / UPI and Host hand cash.
                </p>
              </div>
            </div>

            <!-- Save Status Badge -->
            <div class="flex items-center space-x-2">
              <span id="denom-saved-badge" class="text-[11px] font-bold text-slate-400">
                ${savedDenom && savedDenom.savedAt ? `
                  <span class="text-emerald-400 font-bold flex items-center gap-1">
                    <i data-lucide="check" class="w-3.5 h-3.5 inline"></i> Saved: ${new Date(savedDenom.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ` : '<span class="text-slate-500 italic">Not saved yet</span>'}
              </span>
            </div>
          </div>

          <!-- Denomination Inputs and Reconciliation -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <!-- Left: 7 Denominations Table -->
            <div class="lg:col-span-7 bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2.5">
              <div class="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                <span class="w-20">Note</span>
                <span class="flex-1 text-center">Count</span>
                <span class="w-28 text-right">Amount</span>
              </div>

              ${[500, 200, 100, 50, 20, 10, 1].map(val => `
                <div class="flex items-center justify-between gap-3 text-xs py-0.5">
                  <span class="w-20 font-black text-amber-400 font-mono text-sm">${val} X</span>
                  <div class="flex-1 max-w-[150px]">
                    <input type="number" min="0" step="1" id="denom-cnt-${val}" value="${initialCounts[val]}"
                      oninput="window.appRecalculateDenominations()"
                      class="input-styled text-center font-black text-slate-100 py-1 px-2 w-full text-sm font-mono border-slate-700 focus:border-amber-400">
                  </div>
                  <span id="denom-row-amt-${val}" class="w-28 text-right font-black text-slate-200 font-mono text-sm">
                    ₹${(initialCounts[val] * val).toLocaleString('en-IN')}
                  </span>
                </div>
              `).join('')}
            </div>

            <!-- Right: Reconciliation Breakdown Card -->
            <div class="lg:col-span-5 bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
              <div class="space-y-2.5 text-xs">
                <div class="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span class="text-slate-300 font-bold">Cash in Hand (Notes Total):</span>
                  <span id="denom-calc-cash-in-hand" class="font-black text-emerald-400 font-mono text-sm">₹0</span>
                </div>

                <div class="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span class="text-slate-300 font-bold">Google Pay / UPI (Total UPI Amount):</span>
                  <div class="max-w-[130px]">
                    <input type="number" min="0" step="any" id="denom-input-gpay" value="${initialGpay}"
                      readonly
                      class="input-styled text-right font-black text-indigo-300 py-1 px-2 w-full text-xs font-mono border-indigo-500/40 bg-slate-900/60 cursor-not-allowed opacity-90" title="Calculated automatically from UPI receipts">
                  </div>
                </div>

                <div class="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span class="text-slate-300 font-bold">Host Hand (Payout Expenses):</span>
                  <div class="max-w-[130px]">
                    <input type="number" min="0" step="any" id="denom-input-hostcash" value="${initialHostCash}"
                      readonly
                      class="input-styled text-right font-black text-amber-300 py-1 px-2 w-full text-xs font-mono border-amber-500/40 bg-slate-900/60 cursor-not-allowed opacity-90" title="Calculated automatically from Payout expenses">
                  </div>
                </div>

                <div class="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span class="text-amber-300 font-black">Total in Hand:</span>
                  <span id="denom-calc-total-in-hand" class="font-black text-amber-400 font-mono text-sm">₹0</span>
                </div>

                <div class="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span class="text-slate-300 font-bold">System Total:</span>
                  <span id="denom-calc-computer-total" class="font-black text-slate-100 font-mono text-sm">₹${totalMoiAmount.toLocaleString('en-IN')}</span>
                </div>

                <div class="flex justify-between items-center p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                  <span class="font-black text-xs text-slate-200">Difference:</span>
                  <span id="denom-calc-diff" class="font-black font-mono text-sm text-emerald-400">₹0</span>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="pt-3 border-t border-slate-800/80 flex flex-wrap gap-2.5">
                <button type="button" onclick="window.appSaveDenominationReport()"
                  class="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center space-x-1.5 shadow-md transition cursor-pointer">
                  <i data-lucide="save" class="w-4 h-4"></i>
                  <span>Save Cash Denomination Report</span>
                </button>

                <button type="button" onclick="window.appPrintDenominationReport()"
                  class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center justify-center space-x-1.5 shadow-md transition cursor-pointer">
                  <i data-lucide="printer" class="w-4 h-4"></i>
                  <span>Download / Print</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindCashDenominationEvents() {
    // Trigger initial recalculation
    if (typeof window.appRecalculateDenominations === 'function') {
      setTimeout(() => window.appRecalculateDenominations(), 100);
    }
  }

  // ==========================================
  // 8. REPORT & DOWNLOAD PANEL (WITH PAYOUT & BALANCE METRICS)
  // ==========================================
  function renderReportPanel() {
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    const activeEv = getActiveEvent();
    const allReceipts = state.receipts.filter(r => !state.activeEventId || r.eventId === state.activeEventId);
    const allPayouts = state.payouts.filter(p => !state.activeEventId || p.eventId === state.activeEventId);

    const totalMoiAmount = allReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const totalPayoutAmount = allPayouts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalBalanceAmount = totalMoiAmount - totalPayoutAmount;

    const uniquePlaces = Array.from(new Set(allReceipts.map(r => r.place))).filter(Boolean);
    const uniqueRels = Array.from(new Set(allReceipts.map(r => r.relationship))).filter(Boolean);
    const uniqueUsers = Array.from(new Set(allReceipts.map(r => r.createdBy || 'admin'))).filter(Boolean);

    return `
      <div class="space-y-6">
        <!-- Summary Cards: Total Moi Entry, Total Payout, Total Balance Amount -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="glass-card p-6 border-l-4 border-amber-500 flex items-center justify-between">
            <div>
              <p class="text-xs font-extrabold uppercase tracking-wider text-amber-400">Total Moi Entry Amount</p>
              <h3 class="text-3xl font-black text-amber-300 mt-2">₹${totalMoiAmount.toLocaleString('en-IN')}</h3>
              <p class="text-[11px] text-slate-400 mt-1">${allReceipts.length} Total Receipts</p>
            </div>
            <div class="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
              <i data-lucide="indian-rupee" class="w-6 h-6"></i>
            </div>
          </div>

          <div class="glass-card p-6 border-l-4 border-rose-500 flex items-center justify-between">
            <div>
              <p class="text-xs font-extrabold uppercase tracking-wider text-rose-400">Total Payout Amount</p>
              <h3 class="text-3xl font-black text-rose-400 mt-2">₹${totalPayoutAmount.toLocaleString('en-IN')}</h3>
              <p class="text-[11px] text-slate-400 mt-1">${allPayouts.length} Expenses Recorded</p>
            </div>
            <div class="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400">
              <i data-lucide="hand-coins" class="w-6 h-6"></i>
            </div>
          </div>

          <div class="glass-card p-6 border-l-4 ${totalBalanceAmount >= 0 ? 'border-emerald-500' : 'border-rose-600'} flex items-center justify-between">
            <div>
              <p class="text-xs font-extrabold uppercase tracking-wider ${totalBalanceAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}">Total Balance Amount</p>
              <h3 class="text-3xl font-black ${totalBalanceAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'} mt-2">₹${totalBalanceAmount.toLocaleString('en-IN')}</h3>
              <p class="text-[11px] text-slate-400 mt-1">Formula: Moi Amount - Payout Amount</p>
            </div>
            <div class="w-12 h-12 rounded-xl ${totalBalanceAmount >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} flex items-center justify-center">
              <i data-lucide="calculator" class="w-6 h-6"></i>
            </div>
          </div>
        </div>

        <div class="glass-card p-6">
          <div class="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4 border-b border-slate-800 pb-4">
            <h2 class="text-xl font-extrabold gold-gradient-text flex items-center space-x-3">
              <i data-lucide="download" class="w-6 h-6 text-amber-400"></i>
              <span>Download & Reports</span>
            </h2>
          </div>

          <!-- Filters -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
              <label class="block text-xs font-semibold text-amber-400 mb-1">Select Event</label>
              <select id="rpt-filter-event" class="input-styled" ${!isAdmin ? 'disabled' : ''}>
                ${isAdmin ? '<option value="">All Events</option>' : ''}
                ${getVisibleEvents().map(ev => `
                  <option value="${ev.id}" ${ev.id === state.activeEventId ? 'selected' : ''}>
                    ${ev.displayName1 || ev.memberName}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''} (${ev.place})
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Filter by Place</label>
              <select id="rpt-filter-place" class="input-styled">
                <option value="">All Places</option>
                ${uniquePlaces.map(p => `<option value="${p}">${p}</option>`).join('')}
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Filter by Relationship</label>
              <select id="rpt-filter-rel" class="input-styled">
                <option value="">All Relationships</option>
                ${uniqueRels.map(r => `<option value="${r}">${r}</option>`).join('')}
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-amber-300 mb-1">Filter by Created By</label>
              <select id="rpt-filter-user" class="input-styled">
                <option value="">All Operators</option>
                ${uniqueUsers.map(u => `<option value="${u}">${u}</option>`).join('')}
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Payment Mode</label>
              <select id="rpt-filter-mode" class="input-styled">
                <option value="">All Modes</option>
                <option value="ரொக்கம்">Cash</option>
                <option value="யூ.பி.ஐ">UPI</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Amount (₹)</label>
              <select id="rpt-filter-amt-sort" class="input-styled">
                <option value="">All Amounts</option>
                <option value="low-high">Low to High</option>
                <option value="high-low">High to Low</option>
              </select>
            </div>
          </div>

          <!-- Filter Actions & Quick Download for Filters Alone -->
          <div class="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-800/80 bg-slate-900/60 p-3 rounded-xl border border-slate-700/50">
            <div class="flex items-center space-x-2 text-xs text-slate-300">
              <i data-lucide="filter" class="w-4 h-4 text-amber-400"></i>
              <span>Active Filter Result: <strong id="rpt-filter-count" class="text-amber-300 font-mono">${allReceipts.length} entries</strong></span>
            </div>
            <div class="flex items-center space-x-2">
              <button type="button" id="btn-download-filters-alone-quick" onclick="window.appDownloadFilteredReport()" class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs flex items-center space-x-2 shadow-md transition cursor-pointer border border-teal-400/40">
                <i data-lucide="filter" class="w-4 h-4"></i>
                <span>Download Filters Alone</span>
              </button>
            </div>
          </div>

          <!-- Saved Places Manual Number Assignment Section -->
          ${uniquePlaces.length > 0 ? `
            <div class="bg-slate-900/80 p-4 rounded-xl border border-amber-500/30 space-y-4 mt-5">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-700/60 pb-3 gap-2">
                <div class="flex items-center space-x-2">
                  <i data-lucide="list-ordered" class="w-4 h-4 text-amber-400"></i>
                  <span class="text-xs font-bold text-amber-300">Saved Places Download Sequence Numbers</span>
                </div>
                <div class="flex items-center space-x-2">
                  <button type="button" onclick="window.appResetReportPlaceNumbers()" class="text-[11px] font-bold text-slate-400 hover:text-amber-300 transition cursor-pointer px-2.5 py-1 rounded-lg hover:bg-slate-800">
                    Reset
                  </button>
                </div>
              </div>
              <p class="text-[11px] text-slate-400">Assign manual sequence numbers (1, 2, 3...) for saved places to download and print one-by-one in your custom place sequence order. Click "Save Page Numbers" to save.</p>

              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-1">
                ${uniquePlaces.map((p, idx) => {
                  const currentNum = state.reportPlaceOrderMap && state.reportPlaceOrderMap[p] !== undefined ? state.reportPlaceOrderMap[p] : (idx + 1);
                  const placeCount = allReceipts.filter(r => r.place === p).length;
                  return `
                    <div class="bg-slate-900/90 p-2.5 rounded-xl border border-slate-700/80 space-y-1">
                      <div class="flex items-center justify-between">
                        <span class="text-[11px] font-bold text-slate-200 truncate" title="${p}">${p}</span>
                        <span class="text-[10px] text-amber-400 font-mono">(${placeCount})</span>
                      </div>
                      <div class="flex items-center space-x-1.5">
                        <span class="text-[10px] font-bold text-slate-400">No.</span>
                        <input type="number" min="1" max="99" value="${currentNum}" data-place="${p}" class="place-seq-input input-styled text-xs font-bold text-amber-300 text-center py-1 w-full" style="padding: 2px 4px;" onkeydown="if(event.key==='Enter') window.appSaveReportPlaceNumbers()">
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <div class="flex justify-end pt-2 border-t border-slate-800/80">
                <button type="button" onclick="window.appSaveReportPlaceNumbers()" class="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center space-x-1.5 shadow-md transition cursor-pointer">
                  <i data-lucide="save" class="w-4 h-4"></i>
                  <span>Save Page Numbers</span>
                </button>
              </div>
            </div>
          ` : ''}

          <!-- Download Options below Saved Places Download Sequence Numbers -->
          <div class="bg-slate-900/90 p-5 rounded-2xl border border-amber-500/40 mt-5 space-y-3">
            <div class="flex items-center space-x-2 border-b border-slate-800 pb-2.5">
              <i data-lucide="download" class="w-5 h-5 text-amber-400"></i>
              <h3 class="text-sm font-extrabold text-amber-300 uppercase tracking-wide">Download Options</h3>
            </div>

            <div class="flex flex-wrap items-center gap-3 pt-1">
              <!-- Master Button: Download overall -->
              <button id="btn-download-overall-master" type="button" onclick="window.appDownloadCompleteBook()" class="gold-button px-6 py-2.5 rounded-xl font-black text-sm flex items-center space-x-2 shadow-xl hover:scale-[1.02] transition cursor-pointer border border-amber-400">
                <i data-lucide="book-open" class="w-5 h-5 text-amber-950"></i>
                <span>Download overall</span>
              </button>

              <!-- Dedicated Button: Download Filters Alone -->
              <button id="btn-download-filtered-alone" type="button" onclick="window.appDownloadFilteredReport()" class="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-teal-100 border border-teal-500/60 font-black text-xs flex items-center space-x-2 transition shadow-lg cursor-pointer">
                <i data-lucide="filter" class="w-4 h-4 text-teal-300"></i>
                <span>Download Filters Alone</span>
              </button>

              <!-- 1. Download in Excel Format (.xlsx / .csv) -->
              <button type="button" onclick="window.appDownloadExcelReport()" class="px-5 py-2.5 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/50 font-bold text-xs flex items-center space-x-2 transition shadow-lg cursor-pointer">
                <i data-lucide="file-spreadsheet" class="w-4 h-4 text-emerald-400"></i>
                <span>Download in Excel Format (.xlsx / .csv)</span>
              </button>

              <!-- 2. Download First Page -->
              <button id="btn-download-first-page" onclick="window.appDownloadFirstPageA4('moi')" class="px-5 py-2.5 rounded-xl bg-amber-950/90 hover:bg-amber-900 text-amber-300 border border-amber-500/50 font-bold text-xs flex items-center space-x-2 transition shadow-lg cursor-pointer">
                <i data-lucide="image" class="w-4 h-4 text-amber-400"></i>
                <span>Download First Page</span>
              </button>

              <!-- 3. Download Index Page -->
              <button id="btn-download-index-page" onclick="window.appDownloadIndexPageA4()" class="px-5 py-2.5 rounded-xl bg-indigo-950/90 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/50 font-bold text-xs flex items-center space-x-2 transition shadow-lg cursor-pointer">
                <i data-lucide="list-ordered" class="w-4 h-4 text-indigo-400"></i>
                <span>Download Index Page</span>
              </button>

              <!-- 4. Download Moi Entry Report -->
              <button id="btn-download-a4" class="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs flex items-center space-x-2 shadow-lg cursor-pointer">
                <i data-lucide="file-text" class="w-4 h-4"></i>
                <span>Download Moi Entry Report</span>
              </button>

              <!-- 5. Download Payout Report -->
              <button id="btn-download-payout-a4" class="px-5 py-2.5 rounded-xl bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 border border-rose-600/50 font-bold text-xs flex items-center space-x-2 transition shadow-lg cursor-pointer">
                <i data-lucide="download" class="w-4 h-4"></i>
                <span>Download Payout Report</span>
              </button>
            </div>
          </div>

          <div class="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-4">
            <div id="rpt-summary-stats" class="text-sm font-semibold text-amber-300 flex flex-wrap gap-4">
              <span>Moi Collection: ₹${totalMoiAmount.toLocaleString('en-IN')}</span>
              <span class="text-rose-400">| Payout Expenses: ₹${totalPayoutAmount.toLocaleString('en-IN')}</span>
              <span class="${totalBalanceAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}">| Total Balance Amount: ₹${totalBalanceAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderReportRows(receiptsList) {
    if (receiptsList.length === 0) {
      return '<tr><td colspan="9" class="px-4 py-6 text-center text-slate-500">No report entries found.</td></tr>';
    }
    return receiptsList.map((r, idx) => `
      <tr class="hover:bg-slate-800/40">
        <td class="px-4 py-3 font-mono text-slate-400">${idx + 1}</td>
        <td class="px-4 py-3 font-mono text-amber-400">${r.billNo}</td>
        <td class="px-4 py-3">${r.place}</td>
        <td class="px-4 py-3 font-medium text-slate-100">${formatMoiPersonNameWithJob(r)}</td>
        <td class="px-4 py-3 text-xs text-slate-400">${r.relationship || '-'}</td>
        <td class="px-4 py-3 font-bold text-emerald-400">₹${parseFloat(r.amount).toLocaleString('en-IN')}</td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 text-xs rounded ${r.mode === 'UPI' || r.mode === 'யூ.பி.ஐ' ? 'bg-indigo-900/60 text-indigo-300 font-semibold' : 'bg-emerald-900/60 text-emerald-300'}">${r.mode}</span>
          ${r.upiTxTime ? `<div class="text-[11px] text-indigo-300 font-mono mt-0.5 font-semibold">${r.upiTxTime}</div>` : ''}
        </td>
        <td class="px-4 py-3 text-xs font-semibold text-amber-300">${r.createdBy || 'admin'}</td>
        <td class="px-4 py-3 text-xs text-slate-400">${formatDateDMY(r.date)}</td>
      </tr>
    `).join('');
  }

  function getFilteredReceipts() {
    const place = document.getElementById('rpt-filter-place')?.value || '';
    const rel = document.getElementById('rpt-filter-rel')?.value || '';
    const mode = document.getElementById('rpt-filter-mode')?.value || '';
    const amtSort = document.getElementById('rpt-filter-amt-sort')?.value || '';
    const user = document.getElementById('rpt-filter-user')?.value || '';

    let list = state.receipts.filter(r => {
      const matchesEv = !state.activeEventId || r.eventId === state.activeEventId;
      const matchesPlace = !place || r.place === place;
      const matchesRel = !rel || r.relationship === rel;
      const matchesMode = !mode || r.mode === mode || (mode === 'ரொக்கம்' && r.mode === 'Cash') || (mode === 'யூ.பி.ஐ' && r.mode === 'UPI');
      const matchesUser = !user || (r.createdBy || 'admin') === user;
      return matchesEv && matchesPlace && matchesRel && matchesMode && matchesUser;
    });

    if (amtSort === 'low-high') {
      list.sort((a, b) => (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0));
    } else if (amtSort === 'high-low') {
      list.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
    }

    // Apply Custom Manual Place Number Sorting
    if (state.reportPlaceOrderMap && Object.keys(state.reportPlaceOrderMap).length > 0) {
      list = sortEntriesByCustomPlaceNumbers(list, state.reportPlaceOrderMap);
    } else {
      const p1 = state.reportPlacePriority?.p1;
      const p2 = state.reportPlacePriority?.p2;
      const p3 = state.reportPlacePriority?.p3;
      list = sortEntriesByPlacePriority(list, p1, p2, p3);
    }

    return list;
  }

  function bindReportEvents() {
    const updateReport = () => {
      const filtered = getFilteredReceipts();
      const tbody = document.getElementById('rpt-table-body');
      const stats = document.getElementById('rpt-summary-stats');

      const allPayouts = state.payouts.filter(p => !state.activeEventId || p.eventId === state.activeEventId);
      const totalMoi = filtered.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
      const totalPayout = allPayouts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const totalBalance = totalMoi - totalPayout;

      if (tbody) tbody.innerHTML = renderReportRows(filtered);
      if (stats) {
        stats.innerHTML = `
          <span>Moi Collection: ₹${totalMoi.toLocaleString('en-IN')}</span>
          <span class="text-rose-400">| Payout Expenses: ₹${totalPayout.toLocaleString('en-IN')}</span>
          <span class="${totalBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}">| Total Balance Amount: ₹${totalBalance.toLocaleString('en-IN')}</span>
        `;
      }
      const countEl = document.getElementById('rpt-filter-count');
      if (countEl) {
        countEl.textContent = `${filtered.length} entries (₹${totalMoi.toLocaleString('en-IN')})`;
      }
    };

    document.getElementById('rpt-filter-event')?.addEventListener('change', (e) => {
      state.activeEventId = e.target.value;
      renderApp();
    });

    ['rpt-filter-place', 'rpt-filter-rel', 'rpt-filter-mode', 'rpt-filter-amt-sort', 'rpt-filter-user'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', updateReport);
      document.getElementById(id)?.addEventListener('input', updateReport);
    });

    function getSequenceOrderedReceipts(receiptsList) {
      if (!receiptsList || receiptsList.length === 0) return { orderedReceipts: [], placeMap: {}, orderedPlaces: [] };
      
      const placeMap = {};
      receiptsList.forEach(r => {
        const p = r.place || 'Unspecified';
        if (!placeMap[p]) placeMap[p] = [];
        placeMap[p].push(r);
      });

      const orderedPlaces = Object.keys(placeMap);
      
      orderedPlaces.sort((a, b) => {
        const orderA = state.reportPlaceOrderMap && state.reportPlaceOrderMap[a] !== undefined ? parseInt(state.reportPlaceOrderMap[a]) : 999;
        const orderB = state.reportPlaceOrderMap && state.reportPlaceOrderMap[b] !== undefined ? parseInt(state.reportPlaceOrderMap[b]) : 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b, 'ta');
      });

      let orderedReceipts = [];
      orderedPlaces.forEach(p => {
        orderedReceipts.push(...placeMap[p]);
      });

      return { orderedReceipts, placeMap, orderedPlaces };
    }

    window.appDownloadIndexPageA4 = function () {
      const filtered = typeof getFilteredReceipts === 'function' ? getFilteredReceipts() : state.receipts.filter(r => !state.activeEventId || r.eventId === state.activeEventId);
      if (filtered.length === 0) {
        alert('No data available to generate Index Page!');
        return;
      }

      const activeEv = getActiveEvent() || { memberName: 'Aathi Moi', place: '-' };
      const { orderedReceipts } = getSequenceOrderedReceipts(filtered);
      const totalPages = Math.ceil(orderedReceipts.length / 16);

      const html = buildIndexPageHtml(activeEv, orderedReceipts, totalPages);
      const printArea = document.getElementById('a4-report-print-area');

      const origTitle = document.title;
      const evFileTitle = [activeEv.displayName1, activeEv.memberName].filter(Boolean).join(' - ') || activeEv.eventName || 'Aathi_Moi_Report';

      const triggerPrint = () => {
        document.title = `${evFileTitle} - Index`;
        if (window.lucide) window.lucide.createIcons();
        if (printArea) {
          printArea.classList.remove('hidden');
          printArea.innerHTML = html;
        }
        window.print();
        setTimeout(() => {
          document.title = origTitle;
          if (printArea) {
            printArea.classList.add('hidden');
            printArea.innerHTML = '';
          }
        }, 1000);
      };

      downloadOrPrintPdf({
        html,
        filename: `${evFileTitle} - Index`,
        fallbackPrintFn: triggerPrint
      });
    };

    // Master Full Book Download: Cover + Index + Overall Report + Cash Denomination + Ruled Extra Pages
    window.appDownloadCompleteBook = function () {
      const filtered = typeof getFilteredReceipts === 'function' ? getFilteredReceipts() : state.receipts.filter(r => !state.activeEventId || r.eventId === state.activeEventId);
      if (filtered.length === 0) {
        alert('No data available to download!');
        return;
      }

      const { orderedReceipts } = getSequenceOrderedReceipts(filtered);
      const activeEv = getActiveEvent() || { memberName: 'Aathi Moi', place: '-' };
      const printArea = document.getElementById('a4-report-print-area');
      if (!printArea) return;

      const totalCash = orderedReceipts.filter(r => r.mode !== 'UPI' && r.mode !== 'யூ.பி.ஐ').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      const totalUpi = orderedReceipts.filter(r => r.mode === 'UPI' || r.mode === 'யூ.பி.ஐ').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      const totalMoi = totalCash + totalUpi;

      const allPayouts = state.payouts.filter(p => !state.activeEventId || p.eventId === state.activeEventId);
      const totalPayout = allPayouts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

      const evName = `${activeEv.displayName1 || activeEv.memberName || ''}${activeEv.displayName1 && activeEv.memberName ? ' - ' + activeEv.memberName : ''}`;
      const evMeta = [activeEv.place, formatPhoneWithCountryCode(activeEv.phone) || activeEv.phone, formatDateDMY(activeEv.eventDate)].filter(Boolean).join(' | ');

      // 1. First / Cover Page
      const firstPageHtml = buildFirstPageHtml(activeEv);

      // 2. Overall Report with Index Records extraction
      const repMeta = buildOverallReportHtml({
        entries: orderedReceipts,
        getPlace: r => r.place || '-',
        getName: r => formatMoiPersonNameWithJob(r),
        getInitial: r => (r.initial || '').trim(),
        getNameOnly: r => (r.name || '').trim(),
        getJob: r => (r.job || '').trim(),
        getSubName: r => (r.name1 || '').trim(),
        getBillNo: r => r.billNo || '',
        getAmount: r => parseFloat(r.amount) || 0,
        getMode: r => r.mode || '',
        eventTitle: evName,
        eventSubtitle: evMeta,
        totalCash,
        totalUpi,
        totalMoi,
        totalPayout,
        ROWS_PER_PAGE: 12,
        returnMeta: true
      });

      const overallReportHtml = repMeta.html || repMeta;
      const indexRecords = repMeta.indexRecords || [];
      const totalDataPages = repMeta.totalPages || Math.ceil(orderedReceipts.length / 12);

      // 3. Index Page HTML (with exact maternal uncles + sequence order pagination)
      const indexPageHtml = buildIndexPageHtml(activeEv, orderedReceipts, totalDataPages, indexRecords);

      // 4. Cash Denomination Report HTML
      const activeKey = state.activeEventId || 'default';
      const saved = (state.eventDenominations && state.eventDenominations[activeKey]) || {};
      const c500 = document.getElementById('denom-cnt-500') ? (parseInt(document.getElementById('denom-cnt-500').value, 10) || 0) : (saved.c500 || 0);
      const c200 = document.getElementById('denom-cnt-200') ? (parseInt(document.getElementById('denom-cnt-200').value, 10) || 0) : (saved.c200 || 0);
      const c100 = document.getElementById('denom-cnt-100') ? (parseInt(document.getElementById('denom-cnt-100').value, 10) || 0) : (saved.c100 || 0);
      const c50  = document.getElementById('denom-cnt-50') ? (parseInt(document.getElementById('denom-cnt-50').value, 10) || 0) : (saved.c50 || 0);
      const c20  = document.getElementById('denom-cnt-20') ? (parseInt(document.getElementById('denom-cnt-20').value, 10) || 0) : (saved.c20 || 0);
      const c10  = document.getElementById('denom-cnt-10') ? (parseInt(document.getElementById('denom-cnt-10').value, 10) || 0) : (saved.c10 || 0);
      const c1   = document.getElementById('denom-cnt-1') ? (parseInt(document.getElementById('denom-cnt-1').value, 10) || 0) : (saved.c1 || 0);

      const gpay = document.getElementById('denom-input-gpay') ? (parseFloat(document.getElementById('denom-input-gpay').value) || 0) : (saved.gpay !== undefined ? saved.gpay : totalUpi);
      const hostCash = document.getElementById('denom-input-hostcash') ? (parseFloat(document.getElementById('denom-input-hostcash').value) || 0) : (totalPayout > 0 ? totalPayout : (saved.hostCash !== undefined ? saved.hostCash : 0));

      const denominationReportHtml = buildDenominationReportHtml({
        activeEv,
        contributorCount: orderedReceipts.length,
        computerTotal: totalMoi,
        c500, c200, c100, c50, c20, c10, c1,
        gpay, hostCash
      });

      // 5. Extra Blank Ruled Ledger Pages (2 pages with 35 ruled rows matching media_1790097755829.pdf)
      const extraPagesHtml = buildExtraBlankPagesHtml(2);

      // Assemble full book: Cover -> Index -> Report + Summary -> Denomination -> Extra Ruled Pages
      const fullBookHtml = `
        ${firstPageHtml}
        ${indexPageHtml}
        ${overallReportHtml}
        ${denominationReportHtml}
        ${extraPagesHtml}
      `;

      const evFileTitle = [activeEv.displayName1, activeEv.memberName].filter(Boolean).join(' - ') || activeEv.eventName || 'Aathi_Moi_Report';

      const triggerPrint = () => {
        if (window.lucide) window.lucide.createIcons();
        const origTitle = document.title;
        document.title = evFileTitle;
        if (printArea) {
          printArea.classList.remove('hidden');
          printArea.innerHTML = fullBookHtml;
        }
        window.print();
        setTimeout(() => {
          document.title = origTitle;
          if (printArea) {
            printArea.classList.add('hidden');
            printArea.innerHTML = '';
          }
        }, 1000);
      };

      downloadOrPrintPdf({
        html: fullBookHtml,
        filename: evFileTitle,
        fallbackPrintFn: triggerPrint
      });
    };

    // Download Filters Alone (A4 Print / PDF of only the active filtered records)
    window.appDownloadFilteredReport = function () {
      const filtered = typeof getFilteredReceipts === 'function' ? getFilteredReceipts() : state.receipts.filter(r => !state.activeEventId || r.eventId === state.activeEventId);
      if (filtered.length === 0) {
        alert('No data matching the selected filters to download!');
        return;
      }

      const activeEv = getActiveEvent() || { memberName: 'Aathi Moi', place: '-' };
      const printArea = document.getElementById('a4-report-print-area');
      if (!printArea) return;

      const amtSortVal = document.getElementById('rpt-filter-amt-sort')?.value || '';
      let reportEntries = filtered;
      if (!amtSortVal) {
        const seq = getSequenceOrderedReceipts(filtered);
        reportEntries = seq.orderedReceipts;
      }

      const totalCash = reportEntries.filter(r => r.mode !== 'UPI' && r.mode !== 'யூ.பி.ஐ').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      const totalUpi = reportEntries.filter(r => r.mode === 'UPI' || r.mode === 'யூ.பி.ஐ').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      const totalMoi = totalCash + totalUpi;

      const allPayouts = state.payouts.filter(p => !state.activeEventId || p.eventId === state.activeEventId);
      const totalPayout = allPayouts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

      const filterParts = [];
      const placeVal = document.getElementById('rpt-filter-place')?.value;
      const relVal = document.getElementById('rpt-filter-rel')?.value;
      const modeVal = document.getElementById('rpt-filter-mode')?.value;
      const userVal = document.getElementById('rpt-filter-user')?.value;

      if (placeVal) filterParts.push(`Place: ${placeVal}`);
      if (relVal) filterParts.push(`Rel: ${relVal}`);
      if (modeVal) filterParts.push(`Mode: ${modeVal}`);
      if (userVal) filterParts.push(`Operator: ${userVal}`);
      if (amtSortVal) filterParts.push(`Sort: ${amtSortVal === 'low-high' ? 'Low to High' : 'High to Low'}`);

      const filterTag = filterParts.length > 0 ? `[Filter: ${filterParts.join(' | ')}]` : `[Filtered: All Entries]`;

      const evName = `${activeEv.displayName1 || activeEv.memberName || ''}${activeEv.displayName1 && activeEv.memberName ? ' - ' + activeEv.memberName : ''}`;
      const evMeta = [activeEv.place, formatPhoneWithCountryCode(activeEv.phone) || activeEv.phone, formatDateDMY(activeEv.eventDate), filterTag].filter(Boolean).join(' | ');

      const html = buildOverallReportHtml({
        entries: reportEntries,
        getPlace: r => r.place || '-',
        getName: r => formatMoiPersonNameWithJob(r),
        getInitial: r => (r.initial || '').trim(),
        getNameOnly: r => (r.name || '').trim(),
        getJob: r => (r.job || '').trim(),
        getSubName: r => (r.name1 || '').trim(),
        getBillNo: r => r.billNo || '',
        getAmount: r => parseFloat(r.amount) || 0,
        getMode: r => r.mode || '',
        eventTitle: evName,
        eventSubtitle: evMeta,
        totalCash,
        totalUpi,
        totalMoi,
        totalPayout,
        keepFlatOrder: !!amtSortVal,
        ROWS_PER_PAGE: 12
      });

      const evFileTitle = [activeEv.displayName1, activeEv.memberName].filter(Boolean).join(' - ') || activeEv.eventName || 'Aathi_Moi_Report';
      const triggerPrint = () => {
        const origTitle = document.title;
        document.title = `${evFileTitle} - Filtered`;
        if (printArea) {
          printArea.classList.remove('hidden');
          printArea.innerHTML = html;
        }
        window.print();
        setTimeout(() => {
          document.title = origTitle;
          if (printArea) {
            printArea.classList.add('hidden');
            printArea.innerHTML = '';
          }
        }, 1000);
      };

      downloadOrPrintPdf({
        html,
        filename: `${evFileTitle} - Filtered`,
        fallbackPrintFn: triggerPrint
      });
    };

    // Download Moi Entry Report
    document.getElementById('btn-download-a4')?.addEventListener('click', () => {
      const filtered = getFilteredReceipts();
      if (filtered.length === 0) {
        alert('No data available to download!');
        return;
      }

      const { orderedReceipts } = getSequenceOrderedReceipts(filtered);
      const activeEv = getActiveEvent() || { memberName: 'Aathi Moi', place: '-' };
      const printArea = document.getElementById('a4-report-print-area');
      if (!printArea) return;

      const totalCash = orderedReceipts.filter(r => r.mode !== 'UPI' && r.mode !== 'யூ.பி.ஐ').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      const totalUpi = orderedReceipts.filter(r => r.mode === 'UPI' || r.mode === 'யூ.பி.ஐ').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      const totalMoi = totalCash + totalUpi;

      const allPayouts = state.payouts.filter(p => !state.activeEventId || p.eventId === state.activeEventId);
      const totalPayout = allPayouts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

      const evName = `${activeEv.displayName1 || activeEv.memberName || ''}${activeEv.displayName1 && activeEv.memberName ? ' - ' + activeEv.memberName : ''}`;
      const evMeta = [activeEv.place, formatPhoneWithCountryCode(activeEv.phone) || activeEv.phone, formatDateDMY(activeEv.eventDate)].filter(Boolean).join(' | ');

      const html = buildOverallReportHtml({
        entries: orderedReceipts,
        getPlace: r => r.place || '-',
        getName: r => formatMoiPersonNameWithJob(r),
        getInitial: r => (r.initial || '').trim(),
        getNameOnly: r => (r.name || '').trim(),
        getJob: r => (r.job || '').trim(),
        getSubName: r => (r.name1 || '').trim(),
        getBillNo: r => r.billNo || '',
        getAmount: r => parseFloat(r.amount) || 0,
        getMode: r => r.mode || '',
        eventTitle: evName,
        eventSubtitle: evMeta,
        totalCash,
        totalUpi,
        totalMoi,
        totalPayout,
        ROWS_PER_PAGE: 12
      });

      const evFileTitle = [activeEv.displayName1, activeEv.memberName].filter(Boolean).join(' - ') || activeEv.eventName || 'Aathi_Moi_Report';
      const triggerPrint = () => {
        const origTitle = document.title;
        document.title = `${evFileTitle} - Report`;
        if (printArea) {
          printArea.classList.remove('hidden');
          printArea.innerHTML = html;
        }
        window.print();
        setTimeout(() => {
          document.title = origTitle;
          if (printArea) {
            printArea.classList.add('hidden');
            printArea.innerHTML = '';
          }
        }, 1000);
      };

      downloadOrPrintPdf({
        html,
        filename: `${evFileTitle} - Report`,
        fallbackPrintFn: triggerPrint
      });
    });

    // Download Payout Expenses Report
    document.getElementById('btn-download-payout-a4')?.addEventListener('click', () => {
      const allPayouts = state.payouts.filter(p => !state.activeEventId || p.eventId === state.activeEventId);
      if (allPayouts.length === 0) {
        alert('No payout expense data available to download!');
        return;
      }

      const activeEv = getActiveEvent() || { memberName: 'Aathi Moi', place: '-' };
      const allReceipts = state.receipts.filter(r => !state.activeEventId || r.eventId === state.activeEventId);

      const totalMoi = allReceipts.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      const totalPayout = allPayouts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const netBalance = totalMoi - totalPayout;

      const itemsPerPage = 25;
      const totalPages = Math.ceil(allPayouts.length / itemsPerPage);
      let htmlPages = '';

      for (let page = 0; page < totalPages; page++) {
        const pageItems = allPayouts.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
        if (pageItems.length === 0) continue;
        const pageTotal = pageItems.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

        htmlPages += `
          <div class="a4-page" style="position: relative; box-sizing: border-box; padding: 15px; border: 1px solid #ccc; margin-bottom: 20px;">
            <div style="text-align: center; border-bottom: 2px solid #8B0000; padding-bottom: 8px; margin-bottom: 12px;">
              <h1 style="font-size: 20pt; font-weight: bold; color: #8B0000; margin: 0;">ஆதி மொய்</h1>
              <div style="font-size: 11pt; font-weight: bold; color: #8B0000; margin-top: 2px;">கருணாக்கமுத்தன் பட்டி &nbsp;📞 (+91 9865607179)</div>
              <h2 style="font-size: 14pt; font-weight: bold; color: #0F172A; margin: 4px 0 2px 0;">
                ${activeEv.displayName1 || activeEv.memberName || ''}${activeEv.displayName1 && activeEv.memberName ? ' - ' + activeEv.memberName : ''}
              </h2>
              <div style="font-size: 10.5pt; font-weight: bold; color: #334155; margin-top: 4px;">
                <span>${activeEv.place || ''}</span> ${activeEv.place && activeEv.phone ? '&nbsp;|&nbsp;' : ''}
                <span>${formatPhoneWithCountryCode(activeEv.phone) || activeEv.phone || ''}</span> ${(activeEv.place || activeEv.phone) && activeEv.eventDate ? '&nbsp;|&nbsp;' : ''}
                <span>${formatDateDMY(activeEv.eventDate)}</span>
              </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
              <thead>
                <tr style="background: #f1f5f9; border-top: 1px solid #000; border-bottom: 2px solid #000;">
                  <th style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; width: 40px;">S.No</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #cbd5e1;">Date & Time</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #cbd5e1;">Name</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #cbd5e1;">Reason</th>
                  <th style="padding: 6px; text-align: right; border: 1px solid #cbd5e1;">Amount (₹)</th>
                  <th style="padding: 6px; text-align: center; border: 1px solid #cbd5e1;">Created By</th>
                </tr>
              </thead>
              <tbody>
                ${pageItems.map((p, i) => `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 5px; text-align: center; border: 1px solid #cbd5e1;">${page * itemsPerPage + i + 1}</td>
                    <td style="padding: 5px; text-align: left; border: 1px solid #cbd5e1; font-size: 9pt;">${formatDateDMY(p.date)} ${p.time || ''}</td>
                    <td style="padding: 5px; text-align: left; border: 1px solid #cbd5e1; font-weight: bold;">${p.name}</td>
                    <td style="padding: 5px; text-align: left; border: 1px solid #cbd5e1;">${p.reason}</td>
                    <td style="padding: 5px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold; color: #b91c1c;">₹${parseFloat(p.amount).toLocaleString('en-IN')}</td>
                    <td style="padding: 5px; text-align: center; border: 1px solid #cbd5e1;">${p.createdBy || 'admin'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div style="margin-top: 15px; border-top: 2px solid #000; padding-top: 8px; font-size: 10pt;">
              <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 4px;">
                <span>Page Payout Subtotal: ₹${pageTotal.toLocaleString('en-IN')}</span>
                <span>Total Payout Expenses: ₹${totalPayout.toLocaleString('en-IN')}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-weight: bold; color: #15803d; border-top: 1px dashed #aaa; padding-top: 4px;">
                <span>Total Moi Collection: ₹${totalMoi.toLocaleString('en-IN')}</span>
                <span>Total Net Balance Amount: ₹${netBalance.toLocaleString('en-IN')}</span>
              </div>
              <div style="text-align: center; border-top: 1px solid #cbd5e1; margin-top: 8px; padding-top: 4px; font-size: 9.5pt; font-weight: bold; color: #475569;">
                பக்கம் ${page + 1}
              </div>
            </div>
          </div>
        `;
      }

      const evFileTitle = [activeEv.displayName1, activeEv.memberName].filter(Boolean).join(' - ') || activeEv.eventName || 'Aathi_Moi_Report';
      const triggerPrint = () => {
        const printArea = document.getElementById('a4-report-print-area');
        if (printArea) {
          printArea.classList.remove('hidden');
          printArea.innerHTML = htmlPages;
        }
        window.print();
        setTimeout(() => {
          if (printArea) {
            printArea.classList.add('hidden');
            printArea.innerHTML = '';
          }
        }, 1000);
      };

      downloadOrPrintPdf({
        html: htmlPages,
        filename: `${evFileTitle} - Payout`,
        fallbackPrintFn: triggerPrint
      });
    });
  }

  // ==========================================
  // Note Entry Module Implementation
  // ==========================================
  function renderNoteEntryPanel() {
    const activeTab = state.activeNoteTab || 'event-master';
    const noteEvents = state.noteEvents || [];
    const noteEntries = state.noteEntries || [];
    if (!state.activeNoteEventId && noteEvents.length > 0) {
      state.activeNoteEventId = noteEvents[0].id;
    }
    const activeNoteEvId = state.activeNoteEventId;
    const activeNoteEv = noteEvents.find(e => e.id === activeNoteEvId) || null;

    return `
      <div class="space-y-6">
        <!-- Title & Sub Nav Tabs -->
        <div class="glass-card p-6 border border-amber-500/30">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-center space-x-3">
              <div class="w-12 h-12 rounded-xl crimson-gradient-bg border border-amber-500/40 flex items-center justify-center font-bold text-2xl text-amber-300 shadow-lg">
                <i data-lucide="notebook" class="w-6 h-6"></i>
              </div>
              <div>
                <h2 class="text-xl font-bold text-amber-300 gold-gradient-text">Note Entry</h2>
                <p class="text-xs text-slate-400">Manage Note Event Masters, Data Entry, Edit & Filtered Downloads</p>
              </div>
            </div>

            <!-- Sub Tabs -->
            <div class="flex flex-wrap gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-700/60">
              <button data-note-tab="event-master" class="note-tab-btn px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${activeTab === 'event-master' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-300 hover:text-amber-300'}">
                <i data-lucide="calendar-plus" class="w-4 h-4"></i>
                <span>Event Master</span>
              </button>
              <button data-note-tab="entry" class="note-tab-btn px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${activeTab === 'entry' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-300 hover:text-amber-300'}">
                <i data-lucide="file-plus" class="w-4 h-4"></i>
                <span>Entry</span>
              </button>
              <button data-note-tab="edit" class="note-tab-btn px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${activeTab === 'edit' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-300 hover:text-amber-300'}">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
                <span>Edit</span>
              </button>
              <button data-note-tab="upload" class="note-tab-btn px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${activeTab === 'upload' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-300 hover:text-amber-300'}">
                <i data-lucide="upload" class="w-4 h-4"></i>
                <span>Upload</span>
              </button>
              <button data-note-tab="download" class="note-tab-btn px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${activeTab === 'download' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-300 hover:text-amber-300'}">
                <i data-lucide="download" class="w-4 h-4"></i>
                <span>Download</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Tab Content Area -->
        ${renderNoteTabContent(activeTab, noteEvents, noteEntries, activeNoteEv)}
      </div>
    `;
  }

  function renderNoteTabContent(activeTab, noteEvents, noteEntries, activeNoteEv) {
    if (activeTab === 'event-master') {
      return renderNoteEventMasterTab(noteEvents, noteEntries);
    } else if (activeTab === 'entry') {
      return renderNoteEntryTab(noteEvents, noteEntries, activeNoteEv);
    } else if (activeTab === 'edit') {
      return renderNoteEditTab(noteEvents, noteEntries, activeNoteEv);
    } else if (activeTab === 'upload') {
      return renderNoteUploadTab(noteEvents, noteEntries, activeNoteEv);
    } else if (activeTab === 'download') {
      return renderNoteDownloadTab(noteEvents, noteEntries, activeNoteEv);
    }
    return '';
  }

  // 1. Note Event Master Tab
  function renderNoteEventMasterTab(noteEvents, noteEntries) {
    return `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Event Master Form -->
        <div class="glass-card p-6 border border-amber-500/30 space-y-4">
          <div class="flex items-center space-x-2 border-b border-slate-700/60 pb-3">
            <i data-lucide="calendar-plus" class="w-5 h-5 text-amber-400"></i>
            <h3 class="text-base font-bold text-amber-300">New Note Event Master</h3>
          </div>

          <form id="form-note-event-master" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Event Master Name *</label>
              <input type="text" id="note-event-name" class="input-styled text-xs font-bold ta-type-input text-amber-300" placeholder="e.g. கார்த்திக் - பிரியா" required autocomplete="off">
              <div id="note-event-name-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Event Title (Optional)</label>
              <input type="text" id="note-event-title" class="input-styled text-xs font-semibold ta-type-input text-amber-300" placeholder="e.g. திருமண வரவேற்பு / காதுகுத்து" autocomplete="off">
              <div id="note-event-title-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Place *</label>
              <input type="text" id="note-event-place" class="input-styled text-xs ta-type-input" placeholder="e.g. மதுரை" required autocomplete="off">
              <div id="note-event-place-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Date *</label>
              <input type="date" id="note-event-date" class="input-styled text-xs" required value="${new Date().toISOString().split('T')[0]}">
            </div>

            <button type="submit" class="gold-button w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 cursor-pointer shadow-lg">
              <i data-lucide="save" class="w-4 h-4"></i>
              <span>Save Note Event Master</span>
            </button>
          </form>
        </div>

        <!-- Saved Note Event Masters Table -->
        <div class="lg:col-span-2 glass-card p-6 border border-slate-800 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
            <div class="flex items-center space-x-2">
              <i data-lucide="list" class="w-5 h-5 text-amber-400"></i>
              <h3 class="text-base font-bold text-slate-200">Saved Note Event Masters</h3>
            </div>
            <span class="px-3 py-1 bg-amber-500/20 text-amber-300 font-bold text-xs rounded-lg border border-amber-500/30">
              Total: ${noteEvents.length}
            </span>
          </div>

          <div class="overflow-x-auto rounded-xl border border-slate-800">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-900 text-amber-400 font-bold border-b border-slate-800">
                <tr>
                  <th class="px-4 py-3">S.No</th>
                  <th class="px-4 py-3">Event Master Name</th>
                  <th class="px-4 py-3">Place</th>
                  <th class="px-4 py-3">Date</th>
                  <th class="px-4 py-3 text-center">Entries</th>
                  <th class="px-4 py-3 text-right">Total (₹)</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                ${noteEvents.length === 0 ? `
                  <tr>
                    <td colspan="7" class="px-4 py-8 text-center text-slate-500">No Note Event Masters created yet. Add one on the left form!</td>
                  </tr>
                ` : noteEvents.map((ev, i) => {
                  const evEntries = noteEntries.filter(e => e.noteEventId === ev.id);
                  const evTotal = evEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
                  const isSelected = state.activeNoteEventId === ev.id;
                  return `
                    <tr class="hover:bg-slate-900/50 ${isSelected ? 'bg-amber-500/10' : ''}">
                      <td class="px-4 py-3 font-mono text-slate-400">${i + 1}</td>
                      <td class="px-4 py-3 font-bold text-amber-300 text-sm">${ev.name}${ev.title ? ' <span class="text-xs font-normal text-amber-400/80">(' + ev.title + ')</span>' : ''}</td>
                      <td class="px-4 py-3 text-slate-200">${ev.place}</td>
                      <td class="px-4 py-3 text-slate-300">${formatDateDMY(ev.date)}</td>
                      <td class="px-4 py-3 text-center font-bold text-emerald-400">${evEntries.length}</td>
                      <td class="px-4 py-3 text-right font-bold text-amber-400">₹${evTotal.toLocaleString('en-IN')}</td>
                      <td class="px-4 py-3 text-right space-x-2">
                        <button type="button" onclick="window.appSelectNoteEvent('${ev.id}')" class="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold border border-amber-500/30 text-[11px] cursor-pointer">
                          ${isSelected ? 'Active' : 'Select'}
                        </button>
                        <button type="button" onclick="window.appOpenEditNoteEventModal('${ev.id}')" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border border-slate-600/40 text-[11px] cursor-pointer">
                          Edit
                        </button>
                        <button type="button" onclick="window.appDeleteNoteEvent('${ev.id}')" class="px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 font-bold border border-rose-800/40 text-[11px] cursor-pointer">
                          Delete
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div id="note-event-edit-modal-root"></div>
    `;
  }

  // 2. Note Entry Tab
  function renderNoteEntryTab(noteEvents, noteEntries, activeNoteEv) {
    if (noteEvents.length === 0) {
      return `
        <div class="glass-card p-8 text-center space-y-4 border border-amber-500/30">
          <i data-lucide="alert-triangle" class="w-12 h-12 text-amber-400 mx-auto"></i>
          <h3 class="text-lg font-bold text-amber-300">No Note Event Master Selected</h3>
          <p class="text-xs text-slate-400 max-w-md mx-auto">Please create an Event Master in the Event Master tab before entering data!</p>
          <button type="button" onclick="window.appSwitchNoteTab('event-master')" class="gold-button px-6 py-2.5 rounded-xl font-bold text-xs inline-flex items-center space-x-2 cursor-pointer">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
            <span>Create Event Master</span>
          </button>
        </div>
      `;
    }

    const currentEvEntries = activeNoteEv ? noteEntries.filter(e => e.noteEventId === activeNoteEv.id) : [];
    const recentEntries = [...currentEvEntries].reverse().slice(0, 10);

    return `
      <div class="space-y-6">
        <!-- Entry Form (Top) -->
        <div class="glass-card p-6 border border-amber-500/30 space-y-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
            <div class="flex items-center space-x-2">
              <i data-lucide="file-plus" class="w-5 h-5 text-amber-400"></i>
              <h3 class="text-base font-bold text-amber-300">Add Note Entry</h3>
            </div>

            <div class="flex items-center space-x-2">
              <label class="text-xs font-semibold text-slate-400">Event Master:</label>
              <select id="select-note-entry-event-master" onchange="window.appSelectNoteEvent(this.value)" class="input-styled text-xs font-bold text-amber-300 w-auto py-1.5">
                ${noteEvents.map(ev => `
                  <option value="${ev.id}" ${activeNoteEv && activeNoteEv.id === ev.id ? 'selected' : ''}>${ev.name} (${ev.place})</option>
                `).join('')}
              </select>
            </div>
          </div>

          <form id="form-note-entry" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Place *</label>
                <div class="relative flex items-center">
                  <input type="text" id="input-note-entry-place" class="input-styled text-xs ta-type-input pr-9" placeholder="e.g. மதுரை" required autocomplete="off">
                  <button type="button" onclick="window.appStartSpeechToText('input-note-entry-place')" id="btn-speech-input-note-entry-place" title="Tamil Voice Input" class="speech-mic-btn absolute right-2 text-amber-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-4 h-4"></i>
                  </button>
                </div>
                <div id="input-note-entry-place-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Initial (Optional)</label>
                <div class="relative flex items-center">
                  <input type="text" id="input-note-entry-initial" class="input-styled text-xs font-bold uppercase pr-9" placeholder="Ex: K, S.M" autocomplete="off">
                  <button type="button" onclick="window.appStartSpeechToText('input-note-entry-initial')" id="btn-speech-input-note-entry-initial" title="Voice Input" class="speech-mic-btn absolute right-2 text-amber-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>

              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Name 1 *</label>
                <div class="relative flex items-center">
                  <input type="text" id="input-note-entry-name1" class="input-styled text-xs font-bold ta-type-input text-amber-300 pr-9" placeholder="e.g. முருகன்" required autocomplete="off">
                  <button type="button" onclick="window.appStartSpeechToText('input-note-entry-name1')" id="btn-speech-input-note-entry-name1" title="Tamil Voice Input" class="speech-mic-btn absolute right-2 text-amber-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-4 h-4"></i>
                  </button>
                </div>
                <div id="input-note-entry-name1-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Job (Optional)</label>
                <div class="relative flex items-center">
                  <input type="text" id="input-note-entry-job" class="input-styled text-xs pr-9" placeholder="Ex: Farmer, Army" autocomplete="off">
                  <button type="button" onclick="window.appStartSpeechToText('input-note-entry-job')" id="btn-speech-input-note-entry-job" title="Voice Input" class="speech-mic-btn absolute right-2 text-amber-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>

              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Name 2 (Optional)</label>
                <div class="relative flex items-center">
                  <input type="text" id="input-note-entry-name2" class="input-styled text-xs ta-type-input pr-9" placeholder="e.g. வள்ளி (குடும்பம்)" autocomplete="off">
                  <button type="button" onclick="window.appStartSpeechToText('input-note-entry-name2')" id="btn-speech-input-note-entry-name2" title="Tamil Voice Input" class="speech-mic-btn absolute right-2 text-amber-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-4 h-4"></i>
                  </button>
                </div>
                <div id="input-note-entry-name2-suggestions" class="translit-dropdown hidden"></div>
              </div>

              <div class="relative">
                <label class="block text-xs font-semibold text-slate-300 mb-1">Amount (Optional)</label>
                <div class="relative flex items-center">
                  <input type="number" id="input-note-entry-amount" class="input-styled text-sm font-bold font-mono text-emerald-400 pr-9" placeholder="Ex: 501" autocomplete="off">
                  <button type="button" onclick="window.appStartSpeechToText('input-note-entry-amount')" id="btn-speech-input-note-entry-amount" title="Tamil Voice Input" class="speech-mic-btn absolute right-2 text-emerald-400 hover:text-emerald-300 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer">
                    <i data-lucide="mic" class="w-4 h-4"></i>
                  </button>
                </div>
              </div>
            </div>

            <div class="pt-2 flex justify-end">
              <button type="submit" class="gold-button px-8 py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 cursor-pointer shadow-lg">
                <i data-lucide="plus-circle" class="w-4 h-4"></i>
                <span>Save Note Entry</span>
              </button>
            </div>
          </form>
        </div>

        <!-- Recent Entries Preview (Below Add Note Entry) -->
        <div class="glass-card p-6 border border-slate-800 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
            <div class="flex items-center space-x-2">
              <i data-lucide="clock" class="w-5 h-5 text-amber-400"></i>
              <h3 class="text-base font-bold text-slate-200">Recent Entries for: <span class="text-amber-300">${activeNoteEv ? activeNoteEv.name : ''}</span></h3>
            </div>
            <span class="px-3 py-1 bg-emerald-500/20 text-emerald-300 font-bold text-xs rounded-lg border border-emerald-500/30">
              Total Entries: ${currentEvEntries.length}
            </span>
          </div>

          <div class="overflow-x-auto rounded-xl border border-slate-800">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-900 text-amber-400 font-bold border-b border-slate-800">
                <tr>
                  <th class="px-4 py-3">#</th>
                  <th class="px-4 py-3">Place</th>
                  <th class="px-4 py-3">பெயர் மற்றும் தொழில் (Name & Job)</th>
                  <th class="px-4 py-3 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                ${recentEntries.length === 0 ? `
                  <tr>
                    <td colspan="4" class="px-4 py-8 text-center text-slate-500">No entries recorded yet for this event. Fill the form above!</td>
                  </tr>
                ` : recentEntries.map((e, idx) => `
                  <tr class="hover:bg-slate-900/50">
                    <td class="px-4 py-3 font-mono text-slate-400">${currentEvEntries.length - idx}</td>
                    <td class="px-4 py-3 text-slate-200 font-medium">${e.place}</td>
                    <td class="px-4 py-3 font-bold text-amber-300">${formatNoteEntryPersonName(e)}</td>
                    <td class="px-4 py-3 text-right font-bold text-emerald-400">${e.amount && parseFloat(e.amount) > 0 ? '₹' + parseFloat(e.amount).toLocaleString('en-IN') : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // 3. Note Edit Tab
  function renderNoteEditTab(noteEvents, noteEntries, activeNoteEv) {
    if (noteEvents.length === 0) {
      return `
        <div class="glass-card p-8 text-center space-y-4 border border-amber-500/30">
          <p class="text-slate-400 text-xs">No Note Event Masters available.</p>
        </div>
      `;
    }

    const currentEvEntries = activeNoteEv ? noteEntries.filter(e => e.noteEventId === activeNoteEv.id) : [];

    return `
      <div class="glass-card p-6 border border-slate-800 space-y-4">
        <!-- Top Toolbar -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
          <div class="flex items-center space-x-3">
            <i data-lucide="edit-3" class="w-5 h-5 text-amber-400"></i>
            <div>
              <h3 class="text-base font-bold text-slate-200">Edit Note Entries</h3>
              <p class="text-xs text-slate-400">Select Event Master to edit or delete individual entries</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <select id="select-note-edit-event-master" onchange="window.appSelectNoteEvent(this.value)" class="input-styled text-xs font-bold text-amber-300 w-auto">
              ${noteEvents.map(ev => `
                <option value="${ev.id}" ${activeNoteEv && activeNoteEv.id === ev.id ? 'selected' : ''}>${ev.name} (${ev.place})</option>
              `).join('')}
            </select>

            <input type="text" id="input-note-edit-search" onkeyup="window.appFilterNoteEditTable()" class="input-styled text-xs w-48" placeholder="🔍 Search entries...">
          </div>
        </div>

        <!-- Entries Table -->
        <div class="overflow-x-auto rounded-xl border border-slate-800">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-900 text-amber-400 font-bold border-b border-slate-800">
              <tr>
                <th class="px-4 py-3">S.No</th>
                <th class="px-4 py-3">Place</th>
                <th class="px-4 py-3">பெயர் மற்றும் தொழில் (Name & Job)</th>
                <th class="px-4 py-3 text-right">Amount (₹)</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="note-edit-table-body" class="divide-y border-slate-800">
              ${currentEvEntries.length === 0 ? `
                <tr>
                  <td colspan="5" class="px-4 py-8 text-center text-slate-500">No entries found for this Event Master.</td>
                </tr>
              ` : currentEvEntries.map((e, idx) => `
                <tr class="hover:bg-slate-900/50 note-edit-row" data-search="${(e.place + ' ' + (e.initial || '') + ' ' + e.name1 + ' ' + (e.job || '') + ' ' + (e.name2 || '')).toLowerCase()}">
                  <td class="px-4 py-3 font-mono text-slate-400">${idx + 1}</td>
                  <td class="px-4 py-3 font-medium text-slate-200">${e.place}</td>
                  <td class="px-4 py-3 font-bold text-amber-300 text-sm">${formatNoteEntryPersonName(e)}</td>
                  <td class="px-4 py-3 text-right font-bold text-emerald-400 text-sm">${e.amount && parseFloat(e.amount) > 0 ? '₹' + parseFloat(e.amount).toLocaleString('en-IN') : '-'}</td>
                  <td class="px-4 py-3 text-right space-x-2">
                    <button type="button" onclick="window.appOpenEditNoteEntryModal('${e.id}')" class="px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold border border-amber-500/30 text-[11px] cursor-pointer">
                      Edit
                    </button>
                    <button type="button" onclick="window.appDeleteNoteEntry('${e.id}')" class="px-3 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 font-bold border border-rose-800/40 text-[11px] cursor-pointer">
                      Delete
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 4. Note Upload Tab (Excel Sheet Upload & Template Download)
  function renderNoteUploadTab(noteEvents, noteEntries, activeNoteEv) {
    if (noteEvents.length === 0) {
      return `
        <div class="glass-card p-8 text-center space-y-4 border border-amber-500/30">
          <p class="text-slate-400 text-xs">Please create a Note Event Master first before uploading Excel sheets.</p>
        </div>
      `;
    }

    return `
      <div class="space-y-6">
        <!-- Excel Upload Card -->
        <div class="glass-card p-6 border border-amber-500/30 space-y-6">
          <div class="flex items-center space-x-3 border-b border-slate-700/60 pb-4">
            <i data-lucide="upload-cloud" class="w-6 h-6 text-amber-400"></i>
            <div>
              <h3 class="text-base font-bold text-amber-300">Excel Sheet Data Upload</h3>
              <p class="text-xs text-slate-400">Upload bulk note entries directly from Excel (.xlsx / .csv) sheet into Event Master</p>
            </div>
          </div>

          <!-- Step 1: Download Template -->
          <div class="p-4 rounded-xl bg-slate-900/80 border border-slate-700/60 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 class="text-xs font-bold text-slate-200">1. Download Sample Excel Template</h4>
                <p class="text-[11px] text-slate-400">Download the ready-to-use template with proper column headers to fill your entries.</p>
              </div>
              <button type="button" onclick="window.appDownloadNoteExcelTemplate()" class="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs border border-amber-500/40 transition flex items-center justify-center space-x-2 cursor-pointer shadow">
                <i data-lucide="file-spreadsheet" class="w-4 h-4 text-amber-400"></i>
                <span>Download Excel Template</span>
              </button>
            </div>
            <div class="text-[11px] text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-1">
              <p class="font-semibold text-slate-300">Excel Column Headers Required:</p>
              <ul class="list-disc list-inside space-y-0.5 text-slate-400">
                <li><strong class="text-amber-300">Place</strong> : e.g. மதுரை, கம்பம்</li>
                <li><strong class="text-amber-300">Initial</strong> : e.g. M, K (Optional)</li>
                <li><strong class="text-amber-300">Name 1</strong> : e.g. கே. ராமன்</li>
                <li><strong class="text-amber-300">Job</strong> : e.g. விவசாயி (Optional)</li>
                <li><strong class="text-amber-300">Name 2</strong> : e.g. செல்வி (Optional)</li>
                <li><strong class="text-amber-300">Amount</strong> : e.g. 1000</li>
              </ul>
            </div>
          </div>

          <!-- Step 2: Select Event & Upload File -->
          <form id="form-note-excel-upload" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Select Note Event Master *</label>
                <select id="select-note-upload-event-master" class="input-styled text-xs font-bold text-amber-300" required>
                  ${noteEvents.map(ev => `
                    <option value="${ev.id}" ${activeNoteEv && activeNoteEv.id === ev.id ? 'selected' : ''}>${ev.name} (${ev.place})</option>
                  `).join('')}
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1">Select Excel File (.xlsx, .xls, .csv) *</label>
                <input type="file" id="input-note-excel-file" accept=".xlsx, .xls, .csv" class="input-styled text-xs text-slate-300 cursor-pointer" required>
              </div>
            </div>

            <div class="pt-2">
              <button type="submit" class="gold-button w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 cursor-pointer shadow-lg">
                <i data-lucide="upload" class="w-4 h-4"></i>
                <span>Upload & Save Entries</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // 5. Note Download Tab
  function renderNoteDownloadTab(noteEvents, noteEntries, activeNoteEv) {
    if (noteEvents.length === 0) {
      return `
        <div class="glass-card p-8 text-center space-y-4 border border-amber-500/30">
          <p class="text-slate-400 text-xs">No Note Event Masters available.</p>
        </div>
      `;
    }

    const currentEvEntries = activeNoteEv ? noteEntries.filter(e => e.noteEventId === activeNoteEv.id) : [];
    
    // Distinct places list
    const distinctPlaces = Array.from(new Set(currentEvEntries.map(e => e.place).filter(Boolean)));
    const places = ['ALL', ...distinctPlaces];
    const selectedPlace = state.notePlaceFilter || 'ALL';

    let filteredEntries = selectedPlace === 'ALL' ? currentEvEntries : currentEvEntries.filter(e => e.place === selectedPlace);
    if (state.notePlaceOrderMap && Object.keys(state.notePlaceOrderMap).length > 0) {
      filteredEntries = sortEntriesByCustomPlaceNumbers(filteredEntries, state.notePlaceOrderMap);
    } else {
      filteredEntries = sortEntriesByPlacePriority(filteredEntries, state.notePlacePriority?.p1, state.notePlacePriority?.p2, state.notePlacePriority?.p3);
    }

    const totalEventAmount = currentEvEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const filteredAmount = filteredEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

    return `
      <div class="space-y-6">
        <!-- Controls & Summary -->
        <div class="glass-card p-6 border border-amber-500/30 space-y-6">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
            <div class="flex items-center space-x-3">
              <i data-lucide="download" class="w-5 h-5 text-amber-400"></i>
              <div>
                <h3 class="text-base font-bold text-slate-200">Note Entry Reports & Download</h3>
                <p class="text-xs text-slate-400">Select Event Master and Filter Place-wise for report download</p>
              </div>
            </div>

            <!-- Event & Place Filter Selection -->
            <div class="flex flex-wrap items-center gap-3">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 mb-0.5">Event Master</label>
                <select id="select-note-dl-event-master" onchange="window.appSelectNoteEvent(this.value)" class="input-styled text-xs font-bold text-amber-300">
                  ${noteEvents.map(ev => `
                    <option value="${ev.id}" ${activeNoteEv && activeNoteEv.id === ev.id ? 'selected' : ''}>${ev.name} (${ev.place})</option>
                  `).join('')}
                </select>
              </div>

              <div>
                <label class="block text-[10px] font-bold text-slate-400 mb-0.5">Filter by Place</label>
                <select id="select-note-dl-place" onchange="window.appSetNotePlaceFilter(this.value)" class="input-styled text-xs font-bold text-emerald-300">
                  ${places.map(p => `
                    <option value="${p}" ${selectedPlace === p ? 'selected' : ''}>${p === 'ALL' ? 'All Places' : p}</option>
                  `).join('')}
                </select>
              </div>
            </div>
          </div>

          <!-- Summary Metric Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-slate-900/80 p-4 rounded-xl border border-slate-700/60">
              <p class="text-xs text-slate-400 font-medium">Total Event Entries</p>
              <p class="text-xl font-extrabold text-slate-100 mt-1">${currentEvEntries.length}</p>
            </div>

            <div class="bg-slate-900/80 p-4 rounded-xl border border-slate-700/60">
              <p class="text-xs text-slate-400 font-medium">Total Calculated Amount</p>
              <p class="text-xl font-extrabold text-amber-400 mt-1">₹${totalEventAmount.toLocaleString('en-IN')}</p>
            </div>

            <div class="bg-emerald-950/60 p-4 rounded-xl border border-emerald-500/40">
              <p class="text-xs text-emerald-300 font-medium">Filtered Entries Count (${selectedPlace})</p>
              <p class="text-xl font-extrabold text-emerald-300 mt-1">${filteredEntries.length}</p>
            </div>

            <div class="bg-emerald-950/60 p-4 rounded-xl border border-emerald-500/40">
              <p class="text-xs text-emerald-300 font-medium">Filtered Total Amount (${selectedPlace})</p>
              <p class="text-xl font-extrabold text-emerald-400 mt-1">₹${filteredAmount.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <!-- Saved Places Manual Number Assignment Section -->
          ${distinctPlaces.length > 0 ? `
            <div class="bg-slate-900/80 p-4 rounded-xl border border-amber-500/30 space-y-4 mt-4">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-700/60 pb-3 gap-2">
                <div class="flex items-center space-x-2">
                  <i data-lucide="list-ordered" class="w-4 h-4 text-amber-400"></i>
                  <span class="text-xs font-bold text-amber-300">Saved Places Download Sequence Numbers</span>
                </div>
                <div class="flex items-center space-x-2">
                  <button type="button" onclick="window.appResetNotePlaceNumbers()" class="text-[11px] font-bold text-slate-400 hover:text-amber-300 transition cursor-pointer px-2.5 py-1 rounded-lg hover:bg-slate-800">
                    Reset
                  </button>
                </div>
              </div>
              <p class="text-[11px] text-slate-400">Assign manual sequence numbers (1, 2, 3...) for saved places to download and print one-by-one in your custom place sequence order. Click "Save Page Numbers" to apply.</p>

              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-1">
                ${distinctPlaces.map((p, idx) => {
                  const currentNum = state.notePlaceOrderMap && state.notePlaceOrderMap[p] !== undefined ? state.notePlaceOrderMap[p] : (idx + 1);
                  const placeCount = currentEvEntries.filter(e => e.place === p).length;
                  return `
                    <div class="bg-slate-900/90 p-2.5 rounded-xl border border-slate-700/80 space-y-1">
                      <div class="flex items-center justify-between">
                        <span class="text-[11px] font-bold text-slate-200 truncate" title="${p}">${p}</span>
                        <span class="text-[10px] text-amber-400 font-mono">(${placeCount})</span>
                      </div>
                      <div class="flex items-center space-x-1.5">
                        <span class="text-[10px] font-bold text-slate-400">No.</span>
                        <input type="number" min="1" max="99" value="${currentNum}" data-place="${p}" class="note-place-seq-input input-styled text-xs font-bold text-amber-300 text-center py-1 w-full" style="padding: 2px 4px;" onkeydown="if(event.key==='Enter') window.appSaveNotePlaceNumbers()">
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <div class="flex justify-end pt-2 border-t border-slate-800/80">
                <button type="button" onclick="window.appSaveNotePlaceNumbers()" class="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center space-x-1.5 shadow-md transition cursor-pointer">
                  <i data-lucide="save" class="w-4 h-4"></i>
                  <span>Save Page Numbers</span>
                </button>
              </div>
            </div>
          ` : ''}

          <!-- Action Buttons -->
          <div class="flex flex-wrap gap-3 pt-2">
            <!-- Master Button: Download overall -->
            <button id="btn-download-note-overall" type="button" onclick="window.appDownloadNoteOverallBook()" class="gold-button px-6 py-2.5 rounded-xl font-black text-sm flex items-center space-x-2 shadow-xl hover:scale-[1.02] transition cursor-pointer border border-amber-400">
              <i data-lucide="book-open" class="w-5 h-5 text-amber-950"></i>
              <span>Download Overall</span>
            </button>

            <button type="button" onclick="window.appDownloadNoteEntriesCsv()" class="px-6 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-500/50 text-emerald-200 transition cursor-pointer shadow-md">
              <i data-lucide="file-spreadsheet" class="w-4 h-4 text-emerald-400"></i>
              <span>Download Excel / CSV (${selectedPlace})</span>
            </button>

            <button type="button" onclick="window.appDownloadFirstPageA4('note')" class="px-6 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 bg-amber-950/90 hover:bg-amber-900 border border-amber-500/50 text-amber-300 transition cursor-pointer shadow-md">
              <i data-lucide="image" class="w-4 h-4 text-amber-400"></i>
              <span>Download First Page</span>
            </button>

            <button type="button" onclick="window.appDownloadNoteIndexPageA4()" class="px-6 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-500/50 text-indigo-300 transition cursor-pointer shadow-md">
              <i data-lucide="list-ordered" class="w-4 h-4 text-indigo-400"></i>
              <span>Download Index Page</span>
            </button>

            <button type="button" onclick="window.appPrintNoteEntriesReport()" class="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs flex items-center space-x-2 shadow-lg cursor-pointer">
              <i data-lucide="file-text" class="w-4 h-4"></i>
              <span>Download Note Entry Report</span>
            </button>
          </div>
        </div>

        <!-- Filtered Data Table Preview -->
        <div class="glass-card p-6 border border-slate-800 space-y-4">
          <h4 class="text-sm font-bold text-slate-300">Filtered Entries Preview (${filteredEntries.length} records)</h4>

          <div class="overflow-x-auto rounded-xl border border-slate-800">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-900 text-amber-400 font-bold border-b border-slate-800">
                <tr>
                  <th class="px-4 py-3">S.No</th>
                  <th class="px-4 py-3">Place</th>
                  <th class="px-4 py-3">பெயர் மற்றும் தொழில் (Name & Job)</th>
                  <th class="px-4 py-3 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                ${filteredEntries.length === 0 ? `
                  <tr>
                    <td colspan="4" class="px-4 py-8 text-center text-slate-500">No matching records for selected filter.</td>
                  </tr>
                ` : filteredEntries.map((e, idx) => `
                  <tr class="hover:bg-slate-900/50">
                    <td class="px-4 py-3 font-mono text-slate-400">${idx + 1}</td>
                    <td class="px-4 py-3 text-slate-200 font-medium">${e.place}</td>
                    <td class="px-4 py-3 font-bold text-amber-300 text-sm">${formatNoteEntryPersonName(e)}</td>
                    <td class="px-4 py-3 text-right font-bold text-emerald-400 text-sm">${e.amount && parseFloat(e.amount) > 0 ? '₹' + parseFloat(e.amount).toLocaleString('en-IN') : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  async function saveNoteEntryFileToDrive(noteEventName, noteEntryData) {
    try {
      await fetch('/api/note-entries/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteEventName, noteEntry: noteEntryData })
      });
    } catch (e) {
      console.warn('Local note entry file save notice:', e);
    }

    const noteEntryHtml = `<!DOCTYPE html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <title>ஆதி மொய் - குறிப்பு பதிவு (${noteEntryData.name1})</title>
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
    <div class="row"><span class="bold">ஊர் / இடம்:</span> <span>${noteEntryData.place}</span></div>
    <div class="row"><span class="bold">பெயர் 1:</span> <span>${noteEntryData.name1}</span></div>
    ${noteEntryData.name2 ? `<div class="row"><span class="bold">பெயர் 2:</span> <span>${noteEntryData.name2}</span></div>` : ''}
    <div class="row"><span class="bold">தொகை:</span> <span class="amt">₹${parseFloat(noteEntryData.amount).toLocaleString('en-IN')}</span></div>
    <div class="row"><span class="bold">பதிவு செய்தவர்:</span> <span>${noteEntryData.createdBy || 'admin'}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${new Date(noteEntryData.createdAt || Date.now()).toLocaleString()}</span></div>
  </div>
</body>
</html>`;

    // Sync note entry & noteEntryHtml to Google Drive
    await syncToGas('saveNoteEntry', { noteEventName, noteEntry: noteEntryData, noteEntryHtml });
  }

  // Note Entry Event Handlers & Helpers
  function bindNoteEntryEvents() {
    // Sub-tab button listener
    document.querySelectorAll('.note-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-note-tab');
        if (tab) {
          state.activeNoteTab = tab;
          renderApp();
        }
      });
    });

    // Google Tamil Transliteration for Note Event Master creation
    bindGoogleTamilTransliteration('note-event-name', 'note-event-name-suggestions');
    bindGoogleTamilTransliteration('note-event-title', 'note-event-title-suggestions');
    bindGoogleTamilTransliteration('note-event-place', 'note-event-place-suggestions');

    // Form: Note Event Master Submit
    document.getElementById('form-note-event-master')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('note-event-name').value.trim();
      const title = document.getElementById('note-event-title')?.value.trim() || '';
      const place = document.getElementById('note-event-place').value.trim();
      const date = document.getElementById('note-event-date').value;

      if (!name || !place || !date) return;

      const newEvent = {
        id: 'nev_' + Date.now(),
        name,
        title,
        place,
        date,
        createdAt: new Date().toISOString()
      };

      state.noteEvents.unshift(newEvent);
      state.activeNoteEventId = newEvent.id;
      await saveDb();

      // Create backup folder for this Event Master immediately
      fetch('/api/note-events/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteEventName: name })
      }).catch(err => console.warn('Note event folder creation notice:', err));

      await syncToGas('createNoteEvent', { noteEvent: newEvent });

      if (typeof window.showToast === 'function') {
        window.showToast(`Saved Note Event Master: ${name}`, 'success');
      } else {
        alert(`Saved Note Event Master: ${name}`);
      }
      renderApp();
    });

    // Form: Note Excel Upload Submit
    document.getElementById('form-note-excel-upload')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const eventId = document.getElementById('select-note-upload-event-master').value;
      const fileInput = document.getElementById('input-note-excel-file');
      const file = fileInput.files[0];

      if (!eventId) {
        alert('Please select a Note Event Master!');
        return;
      }
      if (!file) {
        alert('Please select an Excel file!');
        return;
      }

      const activeEv = state.noteEvents.find(ev => ev.id === eventId);
      const eventName = activeEv ? activeEv.name : 'General';

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          let parsedRows = [];
          const data = evt.target.result;

          if (window.XLSX && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            parsedRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          } else {
            // Text/CSV Parsing
            const text = new TextDecoder().decode(data);
            const lines = text.split(/\r?\n/).filter(line => line.trim());
            if (lines.length > 1) {
              const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
              for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
                if (cols.length >= 3) {
                  const rowObj = {};
                  headers.forEach((h, idx) => {
                    rowObj[h] = cols[idx] || '';
                  });
                  parsedRows.push(rowObj);
                }
              }
            }
          }

          if (parsedRows.length === 0) {
            alert('No valid rows found in the uploaded file!');
            return;
          }

          const newEntries = [];
          let successCount = 0;

          parsedRows.forEach((row, index) => {
            const place = row['Place (ஊர்)'] || row['Place'] || row['ஊர்'] || row['இடம்'] || row['place'] || row[Object.keys(row)[0]] || '';
            const initial = row['Initial (இனிஷியல்)'] || row['Initial'] || row['இனிஷியல்'] || row['initial'] || '';
            const name1 = row['Name 1 (பெயர் 1)'] || row['Name 1'] || row['பெயர் 1'] || row['பெயர்'] || row['name1'] || row[Object.keys(row)[1]] || '';
            const job = row['Job (தொழில்)'] || row['Job'] || row['தொழில்'] || row['job'] || '';
            const name2 = row['Name 2 (பெயர் 2)'] || row['Name 2'] || row['பெயர் 2'] || row['name2'] || row[Object.keys(row)[2]] || '';
            const amount = row['Amount (தொகை)'] || row['Amount'] || row['தொகை'] || row['amount'] || row[Object.keys(row)[3]] || '';

            if (place && name1 && amount && !isNaN(parseFloat(amount))) {
              newEntries.push({
                id: 'nent_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 4),
                noteEventId: eventId,
                place: String(place).trim(),
                initial: String(initial || '').trim().toUpperCase(),
                name1: String(name1).trim(),
                job: String(job || '').trim(),
                name2: String(name2 || '').trim(),
                amount: String(amount).trim(),
                createdBy: state.currentUser ? state.currentUser.username : 'admin',
                createdAt: new Date().toISOString()
              });
              successCount++;
            }
          });

          if (newEntries.length === 0) {
            alert('Could not parse valid note entries. Please check column headers (Place, Name 1, Amount).');
            return;
          }

          state.noteEntries.push(...newEntries);
          await saveDb();

          // Save bulk files into Backup/Note Entry/<Event Master Name>/
          fetch('/api/note-entries/save-bulk-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ noteEventName: eventName, noteEntries: newEntries })
          }).catch(err => console.warn('Bulk note entries file save notice:', err));

          syncToGas('saveBulkNoteEntries', { noteEventName: eventName, noteEntries: newEntries })
            .catch(err => console.warn('Gas sync notice:', err));

          if (typeof window.showToast === 'function') {
            window.showToast(`Successfully uploaded ${successCount} note entries!`, 'success');
          } else {
            alert(`Successfully uploaded ${successCount} note entries into '${eventName}'!`);
          }

          // Switch to Download Tab automatically so uploaded data is shown immediately under event
          state.activeNoteEventId = eventId;
          state.activeNoteTab = 'download';
          renderApp();

        } catch (err) {
          console.error('Error parsing Excel file:', err);
          alert('Failed to parse Excel file: ' + err.message);
        }
      };

      reader.readAsArrayBuffer(file);
    });

    // Form: Note Entry Submit
    document.getElementById('form-note-entry')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.activeNoteEventId) {
        alert('Please select or create an Event Master first!');
        return;
      }

      const place = document.getElementById('input-note-entry-place').value.trim();
      const initial = document.getElementById('input-note-entry-initial')?.value.trim().toUpperCase() || '';
      const name1 = document.getElementById('input-note-entry-name1').value.trim();
      const job = document.getElementById('input-note-entry-job')?.value.trim() || '';
      const name2 = document.getElementById('input-note-entry-name2').value.trim();
      const amount = document.getElementById('input-note-entry-amount').value.trim();

      if (!place || !name1) return;

      const newEntry = {
        id: 'nent_' + Date.now(),
        noteEventId: state.activeNoteEventId,
        place,
        initial,
        name1,
        job,
        name2,
        amount: amount ? String(amount) : '',
        createdBy: state.currentUser ? state.currentUser.username : 'admin',
        createdAt: new Date().toISOString()
      };

      state.noteEntries.push(newEntry);
      await saveDb();

      const activeEv = state.noteEvents.find(ev => ev.id === state.activeNoteEventId);
      const evName = activeEv ? activeEv.name : 'General';
      saveNoteEntryFileToDrive(evName, newEntry).catch(err => console.warn('Background sync note entry notice:', err));

      if (typeof window.showToast === 'function') {
        const amtStr = amount ? ` (₹${parseFloat(amount).toLocaleString('en-IN')})` : '';
        window.showToast(`Saved entry: ${formatNoteEntryPersonName(newEntry)}${amtStr}`, 'success');
      }

      // Reset entry inputs
      if (document.getElementById('input-note-entry-initial')) document.getElementById('input-note-entry-initial').value = '';
      document.getElementById('input-note-entry-name1').value = '';
      if (document.getElementById('input-note-entry-job')) document.getElementById('input-note-entry-job').value = '';
      document.getElementById('input-note-entry-name2').value = '';
      document.getElementById('input-note-entry-amount').value = '';

      renderApp();

      setTimeout(() => {
        const placeInput = document.getElementById('input-note-entry-place');
        if (placeInput) {
          placeInput.focus();
          placeInput.select();
        }
      }, 50);
    });

    // Enable Tamil transliteration on inputs
    if (window.TamilTransliterate) {
      window.TamilTransliterate.bindInputs();
    }

    // Tab & Enter Field Navigation for Note Entry form
    const notePlaceInput = document.getElementById('input-note-entry-place');
    const noteInitialInput = document.getElementById('input-note-entry-initial');
    const noteName1Input = document.getElementById('input-note-entry-name1');
    const noteJobInput = document.getElementById('input-note-entry-job');
    const noteName2Input = document.getElementById('input-note-entry-name2');
    const noteAmountInput = document.getElementById('input-note-entry-amount');

    bindGoogleTamilTransliteration('input-note-entry-place', 'input-note-entry-place-suggestions');
    // English-only Initial & Job: NO Google Tamil transliteration!
    bindGoogleTamilTransliteration('input-note-entry-name1', 'input-note-entry-name1-suggestions');
    bindGoogleTamilTransliteration('input-note-entry-name2', 'input-note-entry-name2-suggestions');

    const setupNoteFieldNavigation = (currentInput, nextInput, suggId) => {
      currentInput?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const suggDiv = document.getElementById(suggId);
          if (suggDiv && !suggDiv.classList.contains('hidden')) {
            const firstOption = suggDiv.querySelector('.translit-item span.font-semibold');
            if (firstOption && firstOption.textContent) {
              currentInput.value = firstOption.textContent;
            }
            suggDiv.classList.add('hidden');
          } else if (currentInput.value && !/[\u0B80-\u0BFF]/.test(currentInput.value) && window.TamilTransliterate) {
            const goog = await window.TamilTransliterate.fetchGoogleInputToolsTamil(currentInput.value);
            if (goog && goog.length > 0) {
              currentInput.value = goog[0].ta;
            } else {
              currentInput.value = window.TamilTransliterate.transliterateText(currentInput.value);
            }
          }
          if (nextInput) {
            nextInput.focus();
            if (nextInput.select) nextInput.select();
          }
        }
      });
    };

    const setupNoteSimpleNavigation = (currentInput, nextInput) => {
      currentInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          if (nextInput) {
            nextInput.focus();
            if (nextInput.select) nextInput.select();
          }
        }
      });
    };

    setupNoteFieldNavigation(notePlaceInput, noteInitialInput, 'input-note-entry-place-suggestions');
    setupNoteSimpleNavigation(noteInitialInput, noteName1Input);
    setupNoteFieldNavigation(noteName1Input, noteJobInput, 'input-note-entry-name1-suggestions');
    setupNoteSimpleNavigation(noteJobInput, noteName2Input);
    setupNoteFieldNavigation(noteName2Input, noteAmountInput, 'input-note-entry-name2-suggestions');

    noteAmountInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const form = document.getElementById('form-note-entry');
        if (form) {
          form.requestSubmit ? form.requestSubmit() : form.submit();
        }
      }
    });
  }

  // Global Helpers for Note Entry
  window.appSwitchNoteTab = function (tabName) {
    state.activeNoteTab = tabName;
    renderApp();
  };

  window.appSelectNoteEvent = function (eventId) {
    state.activeNoteEventId = eventId;
    state.notePlaceFilter = 'ALL';
    renderApp();
  };

  window.appSetNotePlaceFilter = function (placeName) {
    state.notePlaceFilter = placeName;
    renderApp();
  };

  function parseTamilNumberWords(str) {
    if (!str) return '';
    const numMap = {
      'ஒன்று': '1', 'ஒன்னு': '1',
      'இரண்டு': '2', 'ரெண்டு': '2',
      'மூன்று': '3', 'மூனு': '3',
      'நான்கு': '4', 'நாலு': '4',
      'ஐந்து': '5', 'அஞ்சு': '5',
      'ஆறு': '6',
      'ஏழு': '7',
      'எட்டு': '8',
      'ஒன்பது': '9',
      'பத்து': '10',
      'ஐம்பது': '50',
      'நூறு': '100',
      'இருநூறு': '200',
      'முன்னூறு': '300',
      'நானூறு': '400',
      'ஐந்நூறு': '500',
      'ஆறாநூறு': '600',
      'எழுநூறு': '700',
      'எண்ணூறு': '800',
      'தொள்ளாயிரம்': '900',
      'ஆயிரம்': '1000',
      'ஐந்தாயிரம்': '5000',
      'பத்தாயிரம்': '10000'
    };
    for (const [word, num] of Object.entries(numMap)) {
      if (str.includes(word)) return num;
    }
    return '';
  }

  window.appStartSpeechToText = function (inputId, lang = 'ta-IN') {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (typeof window.showToast === 'function') {
        window.showToast('Speech Recognition is supported in Chrome, Edge, Safari, & WebSpeech browsers.', 'error');
      } else {
        alert('Voice Speech Recognition is not supported in this browser environment. Please use Chrome or Edge.');
      }
      return;
    }

    const inputElem = document.getElementById(inputId);
    const micBtn = document.getElementById('btn-speech-' + inputId) || document.querySelector(`[onclick*="${inputId}"]`);

    if (!inputElem) return;

    if (inputElem._speechRecognition) {
      try {
        inputElem._speechRecognition.stop();
      } catch (e) {}
      inputElem._speechRecognition = null;
      resetMicBtn(micBtn);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    inputElem._speechRecognition = recognition;

    function resetMicBtn(btn) {
      if (btn) {
        btn.classList.remove('animate-pulse', 'bg-rose-500/20', 'text-rose-400', 'border', 'border-rose-500/50');
        btn.innerHTML = `<i data-lucide="mic" class="w-4 h-4"></i>`;
        if (window.lucide) window.lucide.createIcons();
      }
    }

    recognition.onstart = function () {
      if (micBtn) {
        micBtn.classList.add('animate-pulse', 'bg-rose-500/20', 'text-rose-400', 'border', 'border-rose-500/50');
        micBtn.innerHTML = `<i data-lucide="mic-off" class="w-4 h-4 text-rose-400"></i>`;
        if (window.lucide) window.lucide.createIcons();
      }
      if (typeof window.showToast === 'function') {
        window.showToast('Listening in Tamil... Speak now (தமிழில் பேசுங்கள்...)', 'info');
      }
    };

    recognition.onresult = function (event) {
      if (event.results && event.results[0] && event.results[0][0]) {
        let transcript = event.results[0][0].transcript.trim();

        if (inputId.includes('amount') || inputId.includes('mobile') || inputElem.type === 'number' || inputElem.type === 'tel') {
          let digitsOnly = transcript.replace(/[^0-9]/g, '');
          if (!digitsOnly) {
            digitsOnly = parseTamilNumberWords(transcript);
          }
          if (digitsOnly) {
            inputElem.value = digitsOnly;
          } else {
            inputElem.value = transcript;
          }
        } else {
          transcript = transcript.replace(/\.$/, '');
          inputElem.value = transcript;
        }

        inputElem.dispatchEvent(new Event('input', { bubbles: true }));
        inputElem.dispatchEvent(new Event('change', { bubbles: true }));

        if (typeof window.showToast === 'function') {
          window.showToast(`Recorded: "${inputElem.value}"`, 'success');
        }
      }
    };

    recognition.onerror = function (event) {
      console.warn('Speech Recognition error:', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        if (typeof window.showToast === 'function') {
          window.showToast('Speech recognition notice: ' + event.error, 'error');
        }
      }
      resetMicBtn(micBtn);
      inputElem._speechRecognition = null;
    };

    recognition.onend = function () {
      resetMicBtn(micBtn);
      inputElem._speechRecognition = null;
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Speech Recognition start error:', err);
      resetMicBtn(micBtn);
      inputElem._speechRecognition = null;
    }
  };

  window.appOpenEditNoteEventModal = function (eventId) {
    const ev = state.noteEvents.find(e => e.id === eventId);
    if (!ev) return;

    let modalRoot = document.getElementById('note-event-edit-modal-root');
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'note-event-edit-modal-root';
      document.body.appendChild(modalRoot);
    }

    modalRoot.innerHTML = `
      <div class="modal-overlay flex items-center justify-center p-4">
        <div class="glass-card w-full max-w-lg p-5 flex flex-col overflow-hidden shadow-2xl relative border border-slate-700/60 space-y-4">
          
          <!-- Header -->
          <div class="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 class="text-base font-bold gold-gradient-text flex items-center space-x-2">
              <i data-lucide="edit-3" class="w-4 h-4 text-amber-400"></i>
              <span>Edit Note Event Master (நிகழ்ச்சி விவரம் திருத்துதல்)</span>
            </h3>
            <button type="button" onclick="document.getElementById('note-event-edit-modal-root').innerHTML=''" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form id="form-edit-note-event-master" class="space-y-4">
            <div class="relative">
              <label class="block text-xs font-semibold text-amber-300 mb-1">Event Master Name (நிகழ்ச்சி பெயர்) *</label>
              <input type="text" id="edit-note-ev-name" class="input-styled font-bold text-amber-300 border-amber-500/50 text-xs py-2" value="${ev.name || ''}" required autocomplete="off">
              <div id="edit-note-ev-name-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Event Title (Optional / நிகழ்ச்சித் தலைப்பு)</label>
              <input type="text" id="edit-note-ev-title" class="input-styled text-xs py-2 text-amber-300 font-semibold" value="${ev.title || ''}" placeholder="e.g. திருமண வரவேற்பு / காதுகுத்து" autocomplete="off">
              <div id="edit-note-ev-title-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Place (இடம் / ஊர்) *</label>
              <input type="text" id="edit-note-ev-place" class="input-styled text-xs py-2" value="${ev.place || ''}" required autocomplete="off">
              <div id="edit-note-ev-place-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Date (தேதி) *</label>
              <input type="date" id="edit-note-ev-date" class="input-styled text-xs py-2" value="${ev.date || ''}" required>
            </div>

            <div class="flex space-x-3 pt-2">
              <button type="button" onclick="document.getElementById('note-event-edit-modal-root').innerHTML=''" class="w-1/2 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300">
                Cancel
              </button>
              <button type="submit" class="w-1/2 gold-button py-2 text-xs font-bold rounded-xl">
                Save Edits
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Bind Google Tamil Transliteration
    bindGoogleTamilTransliteration('edit-note-ev-name', 'edit-note-ev-name-suggestions');
    bindGoogleTamilTransliteration('edit-note-ev-title', 'edit-note-ev-title-suggestions');
    bindGoogleTamilTransliteration('edit-note-ev-place', 'edit-note-ev-place-suggestions');

    document.getElementById('form-edit-note-event-master')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      ev.name = document.getElementById('edit-note-ev-name').value.trim();
      ev.title = document.getElementById('edit-note-ev-title')?.value.trim() || '';
      ev.place = document.getElementById('edit-note-ev-place').value.trim();
      ev.date = document.getElementById('edit-note-ev-date').value.trim();

      await saveDb();
      document.getElementById('note-event-edit-modal-root').innerHTML = '';
      if (typeof window.showToast === 'function') {
        window.showToast(`Updated Note Event Master "${ev.name}"`, 'success');
      }
      renderApp();
    });
  };

  window.appDeleteNoteEvent = async function (eventId) {
    if (confirm('Delete this Note Event Master and all its entries?')) {
      state.noteEvents = state.noteEvents.filter(e => e.id !== eventId);
      state.noteEntries = state.noteEntries.filter(e => e.noteEventId !== eventId);
      if (state.activeNoteEventId === eventId) {
        state.activeNoteEventId = state.noteEvents[0] ? state.noteEvents[0].id : null;
      }
      await saveDb();
      renderApp();
    }
  };

  window.appDeleteNoteEntry = async function (entryId) {
    if (confirm('Delete this note entry?')) {
      state.noteEntries = state.noteEntries.filter(e => e.id !== entryId);
      await saveDb();
      renderApp();
    }
  };

  window.appFilterNoteEditTable = function () {
    const q = (document.getElementById('input-note-edit-search')?.value || '').toLowerCase().trim();
    document.querySelectorAll('.note-edit-row').forEach(row => {
      const text = row.getAttribute('data-search') || '';
      if (!q || text.includes(q)) {
        row.classList.remove('hidden');
      } else {
        row.classList.add('hidden');
      }
    });
  };

  // Open Edit Modal for a Note Entry
  window.appOpenEditNoteEntryModal = function (entryId) {
    const entry = state.noteEntries.find(e => e.id === entryId);
    if (!entry) return;

    let modalEl = document.getElementById('edit-note-entry-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'edit-note-entry-modal';
      modalEl.className = 'modal-overlay z-50';
      document.body.appendChild(modalEl);
    }

    modalEl.innerHTML = `
      <div class="glass-card w-full max-w-md p-6 relative overflow-hidden shadow-2xl border border-amber-500/40">
        <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-700/50">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl crimson-gradient-bg border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold">
              <i data-lucide="edit-3" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="text-base font-bold text-amber-300">Edit Note Entry</h3>
              <p class="text-xs text-slate-400">Modify entry details</p>
            </div>
          </div>
          <button onclick="document.getElementById('edit-note-entry-modal').classList.add('hidden')" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="form-edit-note-entry-modal" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Place (ஊர் / இடம்) *</label>
            <input type="text" id="edit-note-place" class="input-styled text-xs ta-type-input" value="${entry.place}" required autocomplete="off">
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Initial (இனிஷியல்)</label>
            <input type="text" id="edit-note-initial" class="input-styled text-xs uppercase font-bold" value="${entry.initial || ''}" placeholder="Ex: K, S.M" autocomplete="off">
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Name 1 (பெயர் 1) *</label>
            <input type="text" id="edit-note-name1" class="input-styled text-xs font-bold ta-type-input text-amber-300" value="${entry.name1}" required autocomplete="off">
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Job (தொழில்)</label>
            <input type="text" id="edit-note-job" class="input-styled text-xs" value="${entry.job || ''}" placeholder="Ex: Farmer, Army" autocomplete="off">
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Name 2 (பெயர் 2)</label>
            <input type="text" id="edit-note-name2" class="input-styled text-xs ta-type-input" value="${entry.name2 || ''}" autocomplete="off">
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Amount (தொகை ₹) (Optional)</label>
            <input type="number" id="edit-note-amount" class="input-styled text-sm font-bold font-mono text-emerald-400" value="${entry.amount || ''}" autocomplete="off">
          </div>

          <div class="flex justify-end space-x-3 pt-2">
            <button type="button" onclick="document.getElementById('edit-note-entry-modal').classList.add('hidden')" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer">
              Cancel
            </button>
            <button type="submit" class="gold-button px-5 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 cursor-pointer shadow-lg">
              <i data-lucide="save" class="w-4 h-4"></i>
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    `;

    modalEl.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
    if (window.TamilTransliterate) window.TamilTransliterate.bindInputs();

    document.getElementById('form-edit-note-entry-modal')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      entry.place = document.getElementById('edit-note-place').value.trim();
      entry.initial = document.getElementById('edit-note-initial')?.value.trim().toUpperCase() || '';
      entry.name1 = document.getElementById('edit-note-name1').value.trim();
      entry.job = document.getElementById('edit-note-job')?.value.trim() || '';
      entry.name2 = document.getElementById('edit-note-name2').value.trim();
      const editAmt = document.getElementById('edit-note-amount').value.trim();
      entry.amount = editAmt ? String(editAmt) : '';

      await saveDb();
      modalEl.classList.add('hidden');
      renderApp();
    });
  };

  // Download Sample Excel Template for Note Entry Bulk Upload
  window.appDownloadNoteExcelTemplate = function () {
    const headers = ["Place (ஊர்)", "Initial (இனிஷியல்)", "Name 1 (பெயர் 1)", "Job (தொழில்)", "Name 2 (பெயர் 2)", "Amount (தொகை)"];
    const sampleRows = [
      ["மதுரை", "M", "ராமன்", "விவசாயி", "செல்வி", "1000"],
      ["கம்பம்", "T", "சுப்பிரமணி", "வியாபாரி", "வள்ளி", "2000"],
      ["தேனி", "P", "கார்த்திக்", "டிரைவர்", "", "500"]
    ];

    if (window.XLSX) {
      const data = [headers, ...sampleRows];
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Note_Entries");
      XLSX.writeFile(wb, "Note_Entry_Upload_Template.xlsx");
    } else {
      let csvContent = '\uFEFF' + headers.join(',') + '\n';
      sampleRows.forEach(r => {
        csvContent += r.map(c => `"${c}"`).join(',') + '\n';
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'Note_Entry_Upload_Template.csv';
      link.click();
    }
  };

  // Download Note Entries as CSV
  window.appDownloadNoteEntriesCsv = function () {
    const activeNoteEvId = state.activeNoteEventId;
    const activeNoteEv = state.noteEvents.find(e => e.id === activeNoteEvId);
    if (!activeNoteEv) {
      alert('No Note Event Master selected!');
      return;
    }

    const selectedPlace = state.notePlaceFilter || 'ALL';
    const allEntries = state.noteEntries.filter(e => e.noteEventId === activeNoteEvId);
    let filteredEntries = selectedPlace === 'ALL' ? allEntries : allEntries.filter(e => e.place === selectedPlace);
    if (state.notePlaceOrderMap && Object.keys(state.notePlaceOrderMap).length > 0) {
      filteredEntries = sortEntriesByCustomPlaceNumbers(filteredEntries, state.notePlaceOrderMap);
    } else {
      filteredEntries = sortEntriesByPlacePriority(filteredEntries, state.notePlacePriority?.p1, state.notePlacePriority?.p2, state.notePlacePriority?.p3);
    }

    if (filteredEntries.length === 0) {
      alert('No entries available to download.');
      return;
    }

    let csvContent = '\uFEFFS.No,Place (ஊர்),Initial,Name 1 (பெயர் 1),Job (தொழில்),Name 2 (பெயர் 2),Formatted Name (பெயர் மற்றும் தொழில்),Amount (₹)\n';
    filteredEntries.forEach((e, i) => {
      const formattedName = formatNoteEntryPersonName(e);
      csvContent += `"${i + 1}","${e.place}","${e.initial || ''}","${e.name1}","${e.job || ''}","${e.name2 || ''}","${formattedName}","${e.amount}"\n`;
    });

    const totalAmount = filteredEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    csvContent += `\n"Total","Filter: ${selectedPlace}","Count: ${filteredEntries.length}","","","","","${totalAmount}"\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const fileName = `Note_Entry_${activeNoteEv.name}_${selectedPlace}_${new Date().toISOString().split('T')[0]}.csv`.replace(/[\\/:*?"<>|]/g, '_');
    saveBlobWithSaveAsDialog(blob, fileName);
  };

  // Print Note Entries A4 Report
  window.appPrintNoteEntriesReport = function () {
    const activeNoteEvId = state.activeNoteEventId;
    const activeNoteEv = state.noteEvents.find(e => e.id === activeNoteEvId);
    if (!activeNoteEv) {
      alert('No Note Event Master selected!');
      return;
    }

    const selectedPlace = state.notePlaceFilter || 'ALL';
    const allEntries = state.noteEntries.filter(e => e.noteEventId === activeNoteEvId);
    let filteredEntries = selectedPlace === 'ALL' ? allEntries : allEntries.filter(e => e.place === selectedPlace);

    if (filteredEntries.length === 0) {
      alert('No entries available to print.');
      return;
    }

    // Apply Custom Manual Place Number Sorting
    if (state.notePlaceOrderMap && Object.keys(state.notePlaceOrderMap).length > 0) {
      filteredEntries = sortEntriesByCustomPlaceNumbers(filteredEntries, state.notePlaceOrderMap);
    } else {
      filteredEntries = sortEntriesByPlacePriority(filteredEntries, state.notePlacePriority?.p1, state.notePlacePriority?.p2, state.notePlacePriority?.p3);
    }

    const totalAmount = filteredEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

    const evTitle = `${activeNoteEv.name}${activeNoteEv.title ? ' - ' + activeNoteEv.title : ''}`;
    const evMetaParts = [
      activeNoteEv.place ? `ஊர்: ${activeNoteEv.place}` : '',
      activeNoteEv.date ? `தேதி: ${formatDateDMY(activeNoteEv.date)}` : '',
      selectedPlace !== 'ALL' ? `தேர்வு செய்த ஊர்: ${selectedPlace}` : ''
    ].filter(Boolean);
    const evSubtitle = evMetaParts.join(' | ');

    const html = buildOverallReportHtml({
      entries: filteredEntries,
      getPlace: e => e.place || '-',
      getName: e => formatNoteEntryPersonName(e),
      getInitial: e => (e.initial || '').trim(),
      getNameOnly: e => (e.name1 || '').trim(),
      getJob: e => (e.job || '').trim(),
      getSubName: e => (e.name2 || '').trim(),
      getBillNo: e => e.billNo || e.receiptNo || '',
      getAmount: e => parseFloat(e.amount) || 0,
      getMode: () => 'ரொக்கம்',
      eventTitle: evTitle,
      eventSubtitle: evSubtitle,
      totalCash: totalAmount,
      totalUpi: 0,
      totalMoi: totalAmount,
      totalPayout: 0,
      ROWS_PER_PAGE: 12
    });

    const printArea = document.getElementById('a4-report-print-area');

    const triggerPrint = () => {
      if (printArea) {
        printArea.classList.remove('hidden');
        printArea.innerHTML = html;
      }
      window.print();
      setTimeout(() => {
        if (printArea) {
          printArea.classList.add('hidden');
          printArea.innerHTML = '';
        }
      }, 1000);
    };

    downloadOrPrintPdf({
      html,
      filename: `${evTitle || 'Note_Entry_Report'}`,
      fallbackPrintFn: triggerPrint
    });
  };

  // Master: Download Note Entry Overall Book (Cover -> Index -> Ledger Report + Summary -> Extra Ruled Pages)
  window.appDownloadNoteOverallBook = function () {
    const activeNoteEvId = state.activeNoteEventId;
    const activeNoteEv = state.noteEvents.find(e => e.id === activeNoteEvId);
    if (!activeNoteEv) {
      alert('No Note Event Master selected!');
      return;
    }

    const selectedPlace = state.notePlaceFilter || 'ALL';
    const allEntries = state.noteEntries.filter(e => e.noteEventId === activeNoteEvId);
    let filteredEntries = selectedPlace === 'ALL' ? allEntries : allEntries.filter(e => e.place === selectedPlace);

    if (filteredEntries.length === 0) {
      alert('No note entry data available to download!');
      return;
    }

    // Apply Custom Manual Place Number Sorting
    if (state.notePlaceOrderMap && Object.keys(state.notePlaceOrderMap).length > 0) {
      filteredEntries = sortEntriesByCustomPlaceNumbers(filteredEntries, state.notePlaceOrderMap);
    } else {
      filteredEntries = sortEntriesByPlacePriority(filteredEntries, state.notePlacePriority?.p1, state.notePlacePriority?.p2, state.notePlacePriority?.p3);
    }

    const printArea = document.getElementById('a4-report-print-area');
    if (!printArea) return;

    const totalAmount = filteredEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const evTitle = `${activeNoteEv.name}${activeNoteEv.title ? ' - ' + activeNoteEv.title : ''}`;
    const evMetaParts = [
      activeNoteEv.place ? `ஊர்: ${activeNoteEv.place}` : '',
      activeNoteEv.date ? `தேதி: ${formatDateDMY(activeNoteEv.date)}` : '',
      selectedPlace !== 'ALL' ? `தேர்வு செய்த ஊர்: ${selectedPlace}` : ''
    ].filter(Boolean);
    const evSubtitle = evMetaParts.join(' | ');

    // 1. Cover Page
    const firstPageHtml = buildFirstPageHtml(activeNoteEv);

    // 2. Overall Report with Index Records extraction
    const repMeta = buildOverallReportHtml({
      entries: filteredEntries,
      getPlace: e => e.place || '-',
      getName: e => formatNoteEntryPersonName(e),
      getInitial: e => (e.initial || '').trim(),
      getNameOnly: e => (e.name1 || '').trim(),
      getJob: e => (e.job || '').trim(),
      getSubName: e => (e.name2 || '').trim(),
      getBillNo: e => e.billNo || e.receiptNo || '',
      getAmount: e => parseFloat(e.amount) || 0,
      getMode: () => 'ரொக்கம்',
      eventTitle: evTitle,
      eventSubtitle: evSubtitle,
      totalCash: totalAmount,
      totalUpi: 0,
      totalMoi: totalAmount,
      totalPayout: 0,
      ROWS_PER_PAGE: 12,
      returnMeta: true
    });

    const overallReportHtml = repMeta.html || repMeta;
    const indexRecords = repMeta.indexRecords || [];
    const totalDataPages = repMeta.totalPages || Math.ceil(filteredEntries.length / 12);

    // 3. Index Page HTML
    const indexPageHtml = buildIndexPageHtml(activeNoteEv, filteredEntries, totalDataPages, indexRecords);

    // 4. Extra Blank Ruled Ledger Pages (2 pages)
    const extraPagesHtml = buildExtraBlankPagesHtml(2);

    // Assemble full book: Cover -> Index -> Report + Summary -> Extra Ruled Pages
    const fullBookHtml = `
      ${firstPageHtml}
      ${indexPageHtml}
      ${overallReportHtml}
      ${extraPagesHtml}
    `;

    const triggerPrint = () => {
      if (printArea) {
        printArea.classList.remove('hidden');
        printArea.innerHTML = fullBookHtml;
      }
      window.print();
      setTimeout(() => {
        if (printArea) {
          printArea.classList.add('hidden');
          printArea.innerHTML = '';
        }
      }, 1000);
    };

    downloadOrPrintPdf({
      html: fullBookHtml,
      filename: `${activeNoteEv.name || 'Note_Book'}_Overall_Book`,
      fallbackPrintFn: triggerPrint
    });
  };

  // Download Note Entry Index Page A4 Report
  window.appDownloadNoteIndexPageA4 = function () {
    const activeNoteEvId = state.activeNoteEventId;
    const activeNoteEv = state.noteEvents.find(e => e.id === activeNoteEvId);
    if (!activeNoteEv) {
      alert('No Note Event Master selected!');
      return;
    }

    const selectedPlace = state.notePlaceFilter || 'ALL';
    const allEntries = state.noteEntries.filter(e => e.noteEventId === activeNoteEvId);
    let filteredEntries = selectedPlace === 'ALL' ? allEntries : allEntries.filter(e => e.place === selectedPlace);

    if (filteredEntries.length === 0) {
      alert('No note entry data available to generate Index Page.');
      return;
    }

    // Apply Custom Manual Place Number Sorting
    if (state.notePlaceOrderMap && Object.keys(state.notePlaceOrderMap).length > 0) {
      filteredEntries = sortEntriesByCustomPlaceNumbers(filteredEntries, state.notePlaceOrderMap);
    } else {
      filteredEntries = sortEntriesByPlacePriority(filteredEntries, state.notePlacePriority?.p1, state.notePlacePriority?.p2, state.notePlacePriority?.p3);
    }

    // Group entries by place in the sorted sequence order
    const placeMap = {};
    const orderedPlaces = [];
    filteredEntries.forEach(e => {
      const p = e.place || 'Unspecified';
      if (!placeMap[p]) {
        placeMap[p] = [];
        orderedPlaces.push(p);
      }
      placeMap[p].push(e);
    });

    const itemsPerPage = 15;
    const indexRows = [];

    let globalRowIndex = 0;
    orderedPlaces.forEach((placeName, placeIdx) => {
      const placeEntries = placeMap[placeName];
      const count = placeEntries.length;
      
      const startRow = globalRowIndex;
      const endRow = globalRowIndex + count - 1;
      
      const startPage = Math.floor(startRow / itemsPerPage) + 1;
      const endPage = Math.floor(endRow / itemsPerPage) + 1;

      const pageStr = (startPage === endPage) ? `${startPage}` : `${startPage}-${endPage}`;

      indexRows.push({
        sno: placeIdx + 1,
        placeName: `${placeName} (${count})`,
        pageStr,
        count
      });

      globalRowIndex += count;
    });

    const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);

    const printArea = document.getElementById('a4-report-print-area');

    const noteHtml = `
      <div class="a4-page" style="position: relative; box-sizing: border-box; padding: 25px; border: 1px solid #ccc; background: white; color: black; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin-bottom: 20px;">
        <!-- Header -->
        <div style="text-align: center; border-bottom: 2px solid #8B0000; padding-bottom: 10px; margin-bottom: 16px;">
          <h1 style="font-size: 22pt; font-weight: bold; color: #8B0000; margin: 0;">ஆதி மொய்</h1>
          <div style="font-size: 11.5pt; font-weight: bold; color: #8B0000; margin-top: 3px;">கருணாக்கமுத்தன் பட்டி &nbsp;📞 (+91 9865607179)</div>
          <h2 style="font-size: 15pt; font-weight: bold; color: #0F172A; margin: 6px 0 2px 0;">${activeNoteEv.name} (${activeNoteEv.place})</h2>
          <div style="font-size: 10.5pt; font-weight: bold; color: #334155; margin-top: 4px;">
            <span>தேதி: ${formatDateDMY(activeNoteEv.date)}</span>${selectedPlace !== 'ALL' ? ` &nbsp;|&nbsp; <span>ஊர்: ${selectedPlace}</span>` : ''}
          </div>
        </div>

        <!-- Index Page Title -->
        <div style="text-align: center; margin-bottom: 18px;">
          <h3 style="font-size: 18pt; font-weight: 900; text-decoration: underline; color: #000; margin: 0; letter-spacing: 0.5px;">Index Page</h3>
        </div>

        <!-- Table matching Moi Entry Index Page format -->
        <table style="width: 100%; border-collapse: collapse; font-size: 11pt; border: 1.5px solid #000;">
          <thead>
            <tr style="background: #ffffff; border-bottom: 1.5px solid #000;">
              <th style="padding: 8px 12px; text-align: center; border: 1px solid #000; width: 70px; font-weight: bold; font-size: 11.5pt;">வ. எண்</th>
              <th style="padding: 8px 14px; text-align: left; border: 1px solid #000; font-weight: bold; font-size: 11.5pt;">ஊர் பெயர் (எண்ணிக்கை)</th>
              <th style="padding: 8px 12px; text-align: center; border: 1px solid #000; width: 130px; font-weight: bold; font-size: 11.5pt;">பக்க எண்</th>
            </tr>
          </thead>
          <tbody>
            ${indexRows.map(row => `
              <tr style="border-bottom: 1px solid #000;">
                <td style="padding: 7px 12px; text-align: center; border: 1px solid #000;">${row.sno}</td>
                <td style="padding: 7px 14px; text-align: left; border: 1px solid #000; font-weight: bold;">${row.placeName}</td>
                <td style="padding: 7px 12px; text-align: center; border: 1px solid #000; font-weight: bold;">${row.pageStr}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Summary Footer -->
        <div style="margin-top: 20px; border-top: 1.5px solid #000; padding-top: 10px; font-size: 11pt; font-weight: bold; display: flex; justify-content: space-between; color: #000;">
          <span>மொத்த ஊர்கள்: ${indexRows.length}</span>
          <span>மொத்த பதிவுகள்: ${filteredEntries.length}</span>
          <span>மொத்த பக்கங்கள்: ${totalPages}</span>
        </div>
      </div>
    `;

    const triggerNotePrint = () => {
      if (printArea) {
        printArea.classList.remove('hidden');
        printArea.innerHTML = noteHtml;
      }
      window.print();
      setTimeout(() => {
        if (printArea) {
          printArea.classList.add('hidden');
          printArea.innerHTML = '';
        }
      }, 1000);
    };

    downloadOrPrintPdf({
      html: noteHtml,
      filename: `${activeNoteEv.name || 'Note'} - Index`,
      fallbackPrintFn: triggerNotePrint
    });
  };

  // Download Cover / First Page A4 Report
  window.appDownloadFirstPageA4 = function (type) {
    let ev = null;
    if (type === 'note') {
      ev = state.noteEvents.find(e => e.id === state.activeNoteEventId) || state.noteEvents[0];
      if (!ev) {
        alert('Please select a Note Event Master first!');
        return;
      }
    } else {
      ev = typeof getActiveEvent === 'function' ? getActiveEvent() : (state.events.find(e => e.id === state.activeEventId) || state.events[0]);
      if (!ev) {
        alert('Please select an Event Master first!');
        return;
      }
    }

    const memberName = ev.memberName || ev.name || '';
    const memberName1 = ev.displayName1 || ev.memberName1 || '';
    const eventTitle = ev.eventTitle || ev.title || '';
    const place = ev.place || '-';
    const rawDate = ev.eventDate || ev.date || '';
    const dateFormatted = rawDate ? formatDateDMY(rawDate) : '';

    const printArea = document.getElementById('a4-report-print-area');

    const firstPageHtml = buildFirstPageHtml(ev);

    const origTitle = document.title;
    const evFileTitle = [memberName1, memberName].filter(Boolean).join(' - ') || eventTitle || 'Aathi_Moi_Report';
    
    const triggerFirstPagePrint = () => {
      document.title = `${evFileTitle} - Cover`;
      if (window.lucide) window.lucide.createIcons();
      if (printArea) {
        printArea.classList.remove('hidden');
        printArea.innerHTML = firstPageHtml;
      }
      window.print();
      setTimeout(() => {
        document.title = origTitle;
        if (printArea) {
          printArea.classList.add('hidden');
          printArea.innerHTML = '';
        }
      }, 1000);
    };

    downloadOrPrintPdf({
      html: firstPageHtml,
      filename: `${evFileTitle} - Cover`,
      fallbackPrintFn: triggerFirstPagePrint
    });
  };

  // Global helper exports
  window.appSwitchPanel = switchPanel;
  window.formatMoiPersonNameWithJob = formatMoiPersonNameWithJob;
  window.buildOverallReportHtml = buildOverallReportHtml;
  window.buildIndexPageHtml = buildIndexPageHtml;
  window.buildFirstPageHtml = buildFirstPageHtml;
  window.appSetActiveEvent = function (eventId) {
    state.activeEventId = eventId;
    renderApp();
  };
  window.appDeleteUser = async function (userId) {
    if (confirm('Are you sure you want to delete this user?')) {
      state.users = state.users.filter(u => u.id !== userId);
      await saveDb();
      renderApp();
    }
  };

})();