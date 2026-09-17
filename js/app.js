// ஆதி மொய் (Aathi Moi) Main Application Script

(function () {
  // Global Application State
  const state = {
    currentUser: null, // { username, role, assignedEventId }
    activePanel: 'login',
    activeEventId: null,
    events: [],
    receipts: [],
    payouts: [],
    users: [],
    editingReceiptId: null,
    lastFocusedFieldId: 'moi-place',
    eventMasterTab: 'active',
    currentTheme: 'dark'
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
        state.payouts = data.payouts || [];
        state.users = data.users || [];
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
          state.payouts = data.payouts || [];
          state.users = data.users || [];
        } catch (err) {}
      }
    }

    if (!state.users || state.users.length === 0) {
      state.users = [{ id: 'usr_admin', username: 'admin', password: '1234', role: 'admin' }];
    }

    // Auto-select first event if none active
    if (!state.activeEventId && state.events.length > 0) {
      state.activeEventId = state.events[0].id;
    }
  }

  async function saveDb() {
    const payload = {
      events: state.events,
      receipts: state.receipts,
      payouts: state.payouts,
      users: state.users
    };

    // Always save to localStorage for instant offline & GitHub Pages support
    localStorage.setItem('aathi_moi_db', JSON.stringify(payload));

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
      const totalItems = totalEvents + totalReceipts + totalPayouts;

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
          await delay(350);
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
          await delay(350);
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
          await delay(350);
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
    try {
      await fetch('/api/receipts/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName, receiptData })
      });
    } catch (e) {
      console.warn('Local drive receipt save notice', e);
    }

    // Sync receipt HTML & row to Google Apps Script (Google Drive)
    await syncToGas('saveReceipt', { receipt: receiptData });
  }

  // Active Event Helper
  function getActiveEvent() {
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

  // Init App
  document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await fetchDb();

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
      case 'report':
        mainContent.innerHTML = renderReportPanel();
        bindReportEvents();
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

          <form id="event-form" class="grid grid-cols-1 md:grid-cols-2 gap-5 relative">
            <div class="relative md:col-span-2">
              <label class="block text-xs font-semibold text-amber-300 mb-1">Member Name *</label>
              <input type="text" id="ev-display-name1" class="input-styled text-base font-bold text-amber-300 border-amber-500/50" placeholder="Ex: கார்த்திக்" required autocomplete="off">
              <div id="ev-display-name1-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Member Name 1 (Optional)</label>
              <input type="text" id="ev-member-name" class="input-styled" placeholder="Ex: பிரியா" autocomplete="off">
              <div id="ev-member-suggestions" class="translit-dropdown hidden"></div>
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
              <button type="submit" class="gold-button w-full py-3 rounded-xl font-bold flex items-center justify-center space-x-2">
                <i data-lucide="save" class="w-5 h-5"></i>
                <span>Save Event</span>
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
            <div class="flex items-center space-x-3 w-full sm:w-auto">
              <button onclick="window.appSetEventMasterTab('active')" class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${currentTab !== 'completed' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-md' : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200'}">
                <span>Saved Events</span>
                <span class="px-2 py-0.5 bg-amber-500/30 text-amber-300 rounded-md text-[10px] font-black">${activeEvents.length}</span>
              </button>
              <button onclick="window.appSetEventMasterTab('completed')" class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${currentTab === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-md' : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200'}">
                <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-400"></i>
                <span>Completed Events</span>
                <span class="px-2 py-0.5 bg-emerald-500/30 text-emerald-300 rounded-md text-[10px] font-black">${completedEvents.length}</span>
              </button>
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

                  <div class="pt-2 border-t border-slate-800/60">
                    <button onclick="window.appDownloadEventOverallReport('${ev.id}')" class="gold-button w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 shadow-lg">
                      <i data-lucide="download" class="w-4 h-4"></i>
                      <span>Overall Download</span>
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

    // Google Tamil Transliteration for Display Name 1, Member Name & Place in Event Master
    bindGoogleTamilTransliteration('ev-display-name1', 'ev-display-name1-suggestions');
    bindGoogleTamilTransliteration('ev-member-name', 'ev-member-suggestions');
    bindGoogleTamilTransliteration('ev-place', 'ev-place-suggestions');

    const form = document.getElementById('event-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName1 = document.getElementById('ev-display-name1')?.value.trim() || '';
      const memberName = document.getElementById('ev-member-name').value.trim();
      const eventName = memberName;
      const place = document.getElementById('ev-place').value.trim();
      const phone = document.getElementById('ev-phone').value.trim();
      const eventDate = document.getElementById('ev-date').value.trim();
      const upiId = document.getElementById('ev-upi').value.trim();

      const newEv = {
        id: 'ev_' + Date.now(),
        displayName1,
        memberName,
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
      await createDriveFolder(newEv);

      alert(`Event "${memberName}" saved successfully!`);
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

  window.appSelectActiveEvent = function (eventId) {
    state.activeEventId = eventId;
    const ev = state.events.find(e => e.id === eventId);
    alert(`Active Event selected: ${ev ? ev.memberName : ''}`);
    renderApp();
  };

  window.appSetEventMasterTab = function (tabName) {
    state.eventMasterTab = tabName;
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

    const eventReceipts = state.receipts.filter(r => r.eventId === eventId);
    const eventPayouts = state.payouts.filter(p => p.eventId === eventId);

    const totalMoi = eventReceipts.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const totalPayout = eventPayouts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const netBalance = totalMoi - totalPayout;

    const printArea = document.getElementById('a4-report-print-area');
    printArea.classList.remove('hidden');

    const itemsPerPage = 25;
    const totalPages = Math.max(1, Math.ceil(eventReceipts.length / itemsPerPage));
    let htmlPages = '';

    for (let page = 0; page < totalPages; page++) {
      const pageItems = eventReceipts.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
      const pageTotal = pageItems.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

      htmlPages += `
        <div class="a4-page" style="position: relative; box-sizing: border-box; padding: 15px; border: 1px solid #ccc; margin-bottom: 20px;">
          <div style="position: absolute; top: 15px; right: 15px; font-size: 9.5pt; font-weight: bold; color: #475569;">
            Page ${page + 1} of ${totalPages}
          </div>

          <div style="text-align: center; border-bottom: 2px solid #8B0000; padding-bottom: 8px; margin-bottom: 12px;">
            <h1 style="font-size: 20pt; font-weight: bold; color: #8B0000; margin: 0;">ஆதி மொய்</h1>
            <h2 style="font-size: 14pt; font-weight: bold; color: #0F172A; margin: 4px 0 2px 0;">
              ${ev.displayName1 || ev.memberName || ''}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''}
            </h2>
            <div style="font-size: 10.5pt; font-weight: bold; color: #334155; margin-top: 4px;">
              <span>${ev.place || ''}</span> ${ev.place && ev.phone ? '&nbsp;|&nbsp;' : ''}
              <span>${ev.phone || ''}</span> ${(ev.place || ev.phone) && ev.eventDate ? '&nbsp;|&nbsp;' : ''}
              <span>${formatDateDMY(ev.eventDate)}</span>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
            <thead>
              <tr style="background: #f1f5f9; border-top: 1px solid #000; border-bottom: 2px solid #000;">
                <th style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; width: 40px;">S.No</th>
                <th style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; width: 70px;">Bill #</th>
                <th style="padding: 6px; text-align: left; border: 1px solid #cbd5e1;">இடம்</th>
                <th style="padding: 6px; text-align: left; border: 1px solid #cbd5e1;">பெயர்</th>
                <th style="padding: 6px; text-align: right; border: 1px solid #cbd5e1;">தொகை</th>
                <th style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; width: 140px;">செலுத்திய முறை</th>
              </tr>
            </thead>
            <tbody>
              ${pageItems.length === 0 ? '<tr><td colspan="6" style="padding: 10px; text-align: center;">No receipts recorded for this event.</td></tr>' : pageItems.map((r, i) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 5px; text-align: center; border: 1px solid #cbd5e1;">${page * itemsPerPage + i + 1}</td>
                  <td style="padding: 5px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold;">${r.billNo}</td>
                  <td style="padding: 5px; text-align: left; border: 1px solid #cbd5e1;">${r.place}</td>
                  <td style="padding: 5px; text-align: left; border: 1px solid #cbd5e1; font-weight: bold;">${r.name}${r.name1 ? ' ' + r.name1 : ''}${r.relationship ? ' (' + r.relationship + ')' : ''}</td>
                  <td style="padding: 5px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold;">₹${parseFloat(r.amount).toLocaleString('en-IN')}</td>
                  <td style="padding: 5px; text-align: center; border: 1px solid #cbd5e1;">${r.mode}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div style="margin-top: 15px; border-top: 2px solid #000; padding-top: 8px; font-size: 10pt;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 4px;">
              <span>Total Receipts Count: ${eventReceipts.length}</span>
              <span>Total Moi Collection: ₹${totalMoi.toLocaleString('en-IN')}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; color: #b91c1c; margin-bottom: 4px;">
              <span>Total Payout Count: ${eventPayouts.length}</span>
              <span>Total Payout Expenses: ₹${totalPayout.toLocaleString('en-IN')}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; color: #15803d; border-top: 1px dashed #aaa; padding-top: 4px;">
              <span>Status: Completed</span>
              <span>Total Net Balance Amount: ₹${netBalance.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      `;
    }

    printArea.innerHTML = htmlPages;
    window.print();

    setTimeout(() => {
      printArea.classList.add('hidden');
      printArea.innerHTML = '';
    }, 1000);
  };

  window.appEditEvent = function (eventId) {
    const ev = state.events.find(e => e.id === eventId);
    if (!ev) return;

    const modalRoot = document.getElementById('event-edit-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-overlay">
        <div class="glass-card w-full max-w-lg p-6 space-y-4">
          <h3 class="text-lg font-bold gold-gradient-text flex items-center space-x-2">
            <i data-lucide="edit-3" class="w-5 h-5 text-amber-400"></i>
            <span>Edit Event</span>
          </h3>

          <form id="edit-event-form" class="space-y-4">
            <div class="relative">
              <label class="block text-xs font-semibold text-amber-300 mb-1">Member Name *</label>
              <input type="text" id="edit-ev-display-name1" class="input-styled font-bold text-amber-300 border-amber-500/50" value="${ev.displayName1 || ''}" required autocomplete="off">
              <div id="edit-ev-display-name1-suggestions" class="translit-dropdown hidden"></div>
            </div>
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Member Name 1 (Optional)</label>
              <input type="text" id="edit-ev-member" class="input-styled" value="${ev.memberName || ''}" autocomplete="off">
              <div id="edit-ev-member-suggestions" class="translit-dropdown hidden"></div>
            </div>
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Place *</label>
              <input type="text" id="edit-ev-place" class="input-styled" value="${ev.place}" required autocomplete="off">
              <div id="edit-ev-place-suggestions" class="translit-dropdown hidden"></div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Phone Number *</label>
              <input type="tel" id="edit-ev-phone" class="input-styled" value="${ev.phone}" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Event Date *</label>
              <input type="date" id="edit-ev-date" class="input-styled" value="${ev.eventDate || ''}" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Status</label>
              <select id="edit-ev-status" class="input-styled font-bold">
                <option value="pending" ${ev.status === 'pending' ? 'selected' : ''}>pending</option>
                <option value="confirmed" ${ev.status === 'confirmed' || ev.status === 'conformed' ? 'selected' : ''}>conformed</option>
                <option value="assigned" ${ev.status === 'assigned' ? 'selected' : ''}>assigned ${ev.assignedUsername ? '(' + ev.assignedUsername + ')' : ''}</option>
                <option value="completed" ${ev.status === 'completed' ? 'selected' : ''}>completed</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">UPI ID (Optional)</label>
              <input type="text" id="edit-ev-upi" class="input-styled font-mono" value="${ev.upiId || ''}">
            </div>

            <div class="flex space-x-3 pt-3">
              <button type="button" onclick="document.getElementById('event-edit-modal-root').innerHTML=''" class="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl">
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

    // Google Tamil Transliteration for Edit Event modal
    bindGoogleTamilTransliteration('edit-ev-display-name1', 'edit-ev-display-name1-suggestions');
    bindGoogleTamilTransliteration('edit-ev-member', 'edit-ev-member-suggestions');
    bindGoogleTamilTransliteration('edit-ev-place', 'edit-ev-place-suggestions');

    document.getElementById('edit-event-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      ev.displayName1 = document.getElementById('edit-ev-display-name1').value.trim();
      ev.memberName = document.getElementById('edit-ev-member').value.trim();
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

  // DELETING EVENT DELETES ALL DATA BELONGING TO THE EVENT (RECEIPTS, PAYOUTS, REPORTS)
  window.appDeleteEvent = async function (eventId) {
    if (!state.currentUser || state.currentUser.role !== 'admin') {
      alert('Access Restricted: Only Admin can delete events!');
      return;
    }

    const ev = state.events.find(e => e.id === eventId);
    if (!ev) return;

    const countReceipts = state.receipts.filter(r => r.eventId === eventId).length;
    const countPayouts = state.payouts.filter(p => p.eventId === eventId).length;
    const eventTitle = ev.displayName1 || ev.memberName || ev.eventName;

    const confirmMsg = `Are you sure you want to delete event "${eventTitle}"?\n\nWARNING: This will permanently delete:\n- The Event ("${eventTitle}")\n- All ${countReceipts} Saved Receipts\n- All ${countPayouts} Payout Expense Entries\n- Overall Event Report Data`;

    if (confirm(confirmMsg)) {
      // 1. Delete all receipts belonging to this event
      state.receipts = state.receipts.filter(r => r.eventId !== eventId);

      // 2. Delete all payout entries belonging to this event
      state.payouts = state.payouts.filter(p => p.eventId !== eventId);

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

      await saveDb();
      alert(`Event "${eventTitle}" and all its associated data (${countReceipts} receipts, ${countPayouts} payouts, and overall reports) have been deleted successfully.`);
      renderApp();
    }
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
      <div class="max-w-4xl mx-auto space-y-6">
        <div class="glass-card p-6">
          <div class="flex flex-col sm:flex-row items-center justify-between mb-6 pb-4 border-b border-slate-800 gap-4">
            <h2 class="text-xl font-extrabold gold-gradient-text flex items-center space-x-3">
              <i data-lucide="file-plus-2" class="w-6 h-6 text-amber-400"></i>
              <span>Moi Entry</span>
            </h2>

            <div class="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
              <div class="flex items-center space-x-2">
                <label class="text-xs font-semibold text-amber-400 whitespace-nowrap">Select Event:</label>
                <select id="moi-event-select" class="input-styled text-sm py-1.5 min-w-[200px]">
                  ${state.events.length === 0 ? '<option value="">No Events Available</option>' : ''}
                  ${state.events.map(ev => `
                    <option value="${ev.id}" ${ev.id === state.activeEventId ? 'selected' : ''}>
                      ${ev.displayName1 || ev.memberName}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''} (${ev.place})
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="flex items-center space-x-2 bg-slate-900/90 px-4 py-2 rounded-xl border border-amber-500/40">
                <span class="text-xs font-semibold text-slate-400">Bill No:</span>
                <span id="moi-bill-no-display" class="text-base font-black font-mono text-amber-400 tracking-wider">${nextBillNo}</span>
              </div>
            </div>
          </div>

          <form id="moi-entry-form" class="grid grid-cols-1 md:grid-cols-2 gap-5 relative">
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Place *</label>
              <input type="text" id="moi-place" class="input-styled" placeholder="Type in English (e.g. Madurai) or Tamil" required autocomplete="off">
              <div id="moi-place-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Name *</label>
              <input type="text" id="moi-name" class="input-styled" placeholder="Type in English (e.g. Kumar) or Tamil" required autocomplete="off">
              <div id="moi-name-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Name 1 (Optional)</label>
              <input type="text" id="moi-name1" class="input-styled" placeholder="Type in English (e.g. Priya) or Tamil (Optional)" autocomplete="off">
              <div id="moi-name1-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Relationship (Optional)</label>
              <input type="text" id="moi-relationship" class="input-styled" placeholder="Ex: தாய்மாமன், நண்பர், பங்காளி" autocomplete="off">
              <div id="moi-relationship-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Amount (₹) *</label>
              <input type="number" id="moi-amount" class="input-styled font-mono text-lg font-bold text-emerald-400" placeholder="500" min="1" required>
            </div>

            <div class="md:col-span-2 bg-slate-900/80 p-4 rounded-xl border border-amber-500/30 space-y-2">
              <label class="block text-xs font-semibold text-amber-400">
                Amount in Tamil Words:
              </label>
              <input type="text" id="moi-amount-words" class="input-styled text-base font-bold text-amber-300" placeholder="பூஜ்யம் ரூபாய் மட்டும்" required>
            </div>

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

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Payment Mode *</label>
              <div class="flex space-x-4 mt-2">
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="moi-mode" value="Cash" checked class="w-4 h-4 text-amber-500">
                  <span class="text-sm font-medium text-slate-200">Cash</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="moi-mode" value="UPI" class="w-4 h-4 text-amber-500">
                  <span class="text-sm font-medium text-slate-200">UPI QR</span>
                </label>
              </div>
            </div>

            <div id="moi-upi-tx-time-box" class="hidden md:col-span-2 bg-indigo-950/40 p-4 rounded-xl border border-indigo-500/40 space-y-1">
              <label class="block text-xs font-semibold text-indigo-300">UPI Transaction Time / Ref No (பரிவர்த்தனை நேரம் / குறிப்பு எண்) *</label>
              <input type="text" id="moi-upi-tx-time" class="input-styled font-mono" placeholder="Ex: 11:45 AM / Ref: 987654321012">
            </div>

            <div id="moi-upi-qr-box" class="hidden md:col-span-2 bg-indigo-950/60 border border-indigo-500/40 p-4 rounded-xl text-center flex flex-col items-center">
              <p class="text-xs font-semibold text-indigo-300 mb-2">Scan QR Code below to make payment via UPI</p>
              <div id="qrcode-container" class="p-3 bg-white rounded-xl shadow-lg inline-block"></div>
              <p id="upi-string-display" class="text-[11px] font-mono text-indigo-200 mt-2"></p>
            </div>

            <div class="md:col-span-2 pt-4">
              <button type="submit" class="gold-button w-full py-4 rounded-xl font-extrabold text-base flex items-center justify-center space-x-2">
                <i data-lucide="printer" class="w-6 h-6"></i>
                <span>Save & Print Thermal Receipt</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function bindMoiEntryEvents() {
    const placeInput = document.getElementById('moi-place');
    const nameInput = document.getElementById('moi-name');
    const name1Input = document.getElementById('moi-name1');
    const amountInput = document.getElementById('moi-amount');
    const wordsInput = document.getElementById('moi-amount-words');
    const relInput = document.getElementById('moi-relationship');
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

    [placeInput, nameInput, name1Input, relInput, wordsInput].forEach(elem => {
      elem?.addEventListener('focus', () => {
        state.lastFocusedFieldId = elem.id;
      });
    });

    // Google Tamil Transliteration bindings for Moi Entry
    bindGoogleTamilTransliteration('moi-place', 'moi-place-suggestions');
    bindGoogleTamilTransliteration('moi-name', 'moi-name-suggestions');
    bindGoogleTamilTransliteration('moi-name1', 'moi-name1-suggestions');
    bindGoogleTamilTransliteration('moi-relationship', 'moi-relationship-suggestions');

    // Enter & Tab Navigation: Place -> Name -> Name1 -> Amount -> Auto-Submit Form
    const setupFieldNavigation = (currentInput, nextInput, suggId) => {
      currentInput?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
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

    setupFieldNavigation(placeInput, nameInput, 'moi-place-suggestions');
    setupFieldNavigation(nameInput, name1Input, 'moi-name-suggestions');
    setupFieldNavigation(name1Input, amountInput, 'moi-name1-suggestions');

    // Pressing Enter on Amount field submits the receipt form automatically
    amountInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const form = document.getElementById('moi-entry-form');
        if (form) {
          form.requestSubmit ? form.requestSubmit() : form.submit();
        }
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
      updateUpiQr();
    });

    function getSelectedPaymentMode() {
      for (let r of modeRadios) {
        if (r.checked) return r.value;
      }
      return 'Cash';
    }

    function updateUpiQr() {
      const mode = getSelectedPaymentMode();
      const activeEv = getActiveEvent();
      const amt = amountInput.value.trim();

      if (mode === 'UPI') {
        upiTxTimeBox?.classList.remove('hidden');
        if (activeEv && activeEv.upiId && amt && parseFloat(amt) > 0) {
          const upiString = `upi://pay?pa=${encodeURIComponent(activeEv.upiId)}&pn=${encodeURIComponent(activeEv.memberName)}&am=${amt}&cu=INR`;
          upiStringDisplay.textContent = upiString;
          qrContainer.innerHTML = '';
          if (window.QRCode) {
            new window.QRCode(qrContainer, {
              text: upiString,
              width: 140,
              height: 140
            });
          }
          upiQrBox?.classList.remove('hidden');
        } else {
          upiQrBox?.classList.add('hidden');
        }
      } else {
        upiTxTimeBox?.classList.add('hidden');
        upiQrBox?.classList.add('hidden');
      }
    }

    modeRadios.forEach(r => r.addEventListener('change', updateUpiQr));

    // Submit Form
    const form = document.getElementById('moi-entry-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const activeEv = getActiveEvent();
        if (!activeEv) {
          alert('Please select or create an active event in Event Master first!');
          return;
        }

        const place = placeInput ? placeInput.value.trim() : '';
        const name = nameInput ? nameInput.value.trim() : '';
        const name1 = name1Input ? name1Input.value.trim() : '';
        const rel = relInput ? relInput.value.trim() : '';
        const amt = amountInput ? amountInput.value.trim() : '';
        let words = wordsInput ? wordsInput.value.trim() : '';

        if (!place || !name || !amt || parseFloat(amt) <= 0) {
          alert('Please fill in Place, Name, and Amount!');
          return;
        }

        // Auto-generate Tamil words if empty
        if (!words && window.TamilWords) {
          words = window.TamilWords.amountToTamilWords(parseFloat(amt));
        }

        const mode = getSelectedPaymentMode();
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
          name,
          name1,
          relationship: rel,
          amount: amt,
          amountWords: words,
          mode: mode === 'UPI' ? 'யூ.பி.ஐ' : 'ரொக்கம்',
          upiTxTime: mode === 'UPI' ? upiTxTime : '',
          createdBy: state.currentUser ? state.currentUser.username : 'admin',
          date: dateStr,
          time: timeStr,
          createdAt: now.toISOString()
        };

        // 1. Instantly update state memory
        state.receipts.push(newReceipt);

        // 2. INSTANTLY open the Print Window Popup without network delay (< 10ms)
        printThermalReceipt(newReceipt, activeEv);

        // 3. Save to database & Google Drive asynchronously in the background
        saveDb().catch(err => console.warn('Background saveDb notice:', err));
        saveReceiptFileToDrive(activeEv.eventName, newReceipt).catch(err => console.warn('Background Drive save notice:', err));

        // 4. Re-render UI
        renderApp();
      } catch (err) {
        console.error('Receipt Save Error:', err);
        alert('Notice saving receipt: ' + err.message);
      }
    });
  }

  // ==========================================
  // Thermal Receipt Printing (2 Copies - 3 Inch / 78mm)
  // ==========================================
  function printThermalReceipt(rcpt, ev, singleCopy = false) {
    const printArea = document.getElementById('thermal-print-area');
    if (!printArea) return;

    printArea.classList.remove('hidden');

    // First Copy
    const copy1Html = `
      <div class="thermal-receipt-container" style="width: 78mm; padding: 8px; font-family: monospace; color: #000; font-weight: bold; border: none;">
        <div style="text-align: center; padding-bottom: 5px; margin-bottom: 8px;">
          <h2 style="font-size: 16pt; font-weight: bold; margin: 0; color: #000;">ஆதி மொய்</h2>
          <p style="font-size: 9pt; font-weight: bold; margin: 2px 0 6px 0; color: #000; border-bottom: 1px solid #000; padding-bottom: 4px;">கருணாக்கமுத்தன்பட்டி 9865607179</p>
          ${((ev && ev.displayName1) || rcpt.displayName1) ? `<h3 style="font-size: 13pt; font-weight: 900; margin: 3px 0 1px 0; color: #000;">${(ev && ev.displayName1) || rcpt.displayName1}</h3>` : ''}
          <h4 style="font-size: 12pt; font-weight: 900; margin: 2px 0; color: #000;">${ev ? ev.memberName : (rcpt.memberName || '')}</h4>
          <p style="font-size: 9.5pt; font-weight: bold; margin: 0; color: #000;">${ev ? ev.place : (rcpt.place || '')}</p>
        </div>

        <div style="font-size: 10pt; line-height: 1.5; color: #000; border-top: 1px solid #000; padding-top: 6px;">
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">ரசீது எண்:</span> <span>#${rcpt.billNo}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">தேதி:</span> <span>${rcpt.date} ${rcpt.time}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">பெயர்:</span> <span>${rcpt.name}${rcpt.name1 ? ' ' + rcpt.name1 : ''}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">இடம்:</span> <span>${rcpt.place}</span></div>
          ${rcpt.relationship ? `<div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">உறவு:</span> <span>${rcpt.relationship}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; border-top: 2px solid #000; padding-top: 6px;"><span style="font-size: 14pt; font-weight: 900;">தொகை:</span> <span style="font-size: 20pt; font-weight: 900; font-family: sans-serif;">₹${parseFloat(rcpt.amount).toLocaleString('en-IN')}</span></div>
          <div style="font-size: 10pt; font-weight: bold; font-style: italic; margin-top: 3px; color: #000;">(${rcpt.amountWords})</div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px;"><span style="font-weight: bold;">செலுத்திய முறை:</span> <span>${rcpt.mode}</span></div>
          ${rcpt.upiTxTime ? `<div style="font-size: 8pt; color: #000;"><span>UPI Ref/Time:</span> <span>${rcpt.upiTxTime}</span></div>` : ''}
        </div>

        <div style="text-align: center; margin-top: 10px; font-size: 9pt; border-top: 1px solid #000; padding-top: 4px; color: #000;">
          <p style="font-weight: bold; margin: 0;">தங்கள் வருகைக்கு நன்றி</p>
        </div>
      </div>
    `;

    // Second Copy
    const copy2Html = `
      <div class="thermal-receipt-container" style="width: 78mm; padding: 8px; font-family: monospace; color: #000; font-weight: bold; border: none;">
        <div style="text-align: center; padding-bottom: 4px; margin-bottom: 8px; border-bottom: 1px dashed #000;">
          <div style="font-size: 9.5pt; font-weight: bold; color: #000;">Created By: ${rcpt.createdBy || 'admin'}</div>
        </div>

        <div style="font-size: 10pt; line-height: 1.5; color: #000;">
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">ரசீது எண்:</span> <span>#${rcpt.billNo}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">தேதி:</span> <span>${rcpt.date} ${rcpt.time}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">பெயர்:</span> <span>${rcpt.name}${rcpt.name1 ? ' ' + rcpt.name1 : ''}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">இடம்:</span> <span>${rcpt.place}</span></div>
          ${rcpt.relationship ? `<div style="display: flex; justify-content: space-between;"><span style="font-weight: bold;">உறவு:</span> <span>${rcpt.relationship}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; border-top: 2px solid #000; padding-top: 6px;"><span style="font-size: 14pt; font-weight: 900;">தொகை:</span> <span style="font-size: 20pt; font-weight: 900; font-family: sans-serif;">₹${parseFloat(rcpt.amount).toLocaleString('en-IN')}</span></div>
          <div style="font-size: 10pt; font-weight: bold; font-style: italic; margin-top: 3px; color: #000;">(${rcpt.amountWords})</div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px;"><span style="font-weight: bold;">செலுத்திய முறை:</span> <span>${rcpt.mode}</span></div>
          ${rcpt.upiTxTime ? `<div style="font-size: 8pt; color: #000;"><span>UPI Ref/Time:</span> <span>${rcpt.upiTxTime}</span></div>` : ''}
        </div>
      </div>
    `;

    if (singleCopy) {
      printArea.innerHTML = copy1Html;
    } else {
      printArea.innerHTML = `
        ${copy1Html}
        <div class="thermal-page-break"></div>
        ${copy2Html}
      `;
    }

    window.print();

    // Auto-close/hide print area and focus back to Place input
    const cleanupAfterPrint = () => {
      printArea.classList.add('hidden');
      printArea.innerHTML = '';
      const placeElem = document.getElementById('moi-place');
      if (placeElem) placeElem.focus();
    };

    window.onafterprint = cleanupAfterPrint;
    setTimeout(cleanupAfterPrint, 1200);
  }

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

  // ==========================================
  // 6. RECEIPT PANEL
  // ==========================================
  function renderReceiptPanel() {
    const activeEv = getActiveEvent();
    const receipts = state.receipts.filter(r => !state.activeEventId || r.eventId === state.activeEventId);

    return `
      <div class="max-w-5xl mx-auto space-y-6">
        <div class="glass-card p-6">
          <div class="flex flex-col sm:flex-row items-center justify-between mb-6 pb-4 border-b border-slate-800 gap-4">
            <h2 class="text-xl font-extrabold gold-gradient-text flex items-center space-x-3">
              <i data-lucide="receipt" class="w-6 h-6 text-amber-400"></i>
              <span>Saved Receipts (${receipts.length})</span>
            </h2>

            <div class="flex items-center space-x-3 w-full sm:w-auto">
              <label class="text-xs font-semibold text-amber-400 whitespace-nowrap">Select Event:</label>
              <select id="receipt-event-select" class="input-styled text-sm py-1.5 min-w-[220px]">
                <option value="">All Events</option>
                ${state.events.map(ev => `
                  <option value="${ev.id}" ${ev.id === state.activeEventId ? 'selected' : ''}>
                    ${ev.displayName1 || ev.memberName}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''} (${ev.place})
                  </option>
                `).join('')}
              </select>
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
              <tbody class="divide-y divide-slate-800">
                ${receipts.length === 0 ? '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500">No receipts found for this event.</td></tr>' : ''}
                ${receipts.map(r => {
                  return `
                    <tr>
                      <td class="px-4 py-3 font-mono font-bold text-amber-400">${r.billNo}</td>
                      <td class="px-4 py-3">${r.place}</td>
                      <td class="px-4 py-3 font-medium text-slate-100">${r.name}${r.name1 ? ' ' + r.name1 : ''}</td>
                      <td class="px-4 py-3 font-bold text-emerald-400">₹${parseFloat(r.amount).toLocaleString('en-IN')}</td>
                      <td class="px-4 py-3"><span class="px-2 py-0.5 text-xs rounded ${r.mode === 'UPI' || r.mode === 'யூ.பி.ஐ' ? 'bg-indigo-900/60 text-indigo-300' : 'bg-emerald-900/60 text-emerald-300'}">${r.mode}</span></td>
                      <td class="px-4 py-3 text-xs font-semibold text-amber-300">${r.createdBy || 'admin'}</td>
                      <td class="px-4 py-3 text-right space-x-2">
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
                        ${state.currentUser.role === 'admin' ? `
                          <button onclick="window.appDeleteReceipt('${r.id}')" class="px-2.5 py-1 rounded bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 text-xs font-semibold border border-rose-700/40 transition cursor-pointer">
                            Delete
                          </button>
                        ` : ''}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div id="receipt-edit-modal-root"></div>
    `;
  }

  function bindReceiptEvents() {
    const sel = document.getElementById('receipt-event-select');
    sel?.addEventListener('change', (e) => {
      state.activeEventId = e.target.value;
      renderApp();
    });
  }

  window.appReprintThermal = function (receiptId) {
    const rcpt = state.receipts.find(r => r.id === receiptId);
    if (!rcpt) return;
    const ev = state.events.find(e => e.id === rcpt.eventId) || { memberName: rcpt.memberName || 'Aathi Moi', place: rcpt.place || '-' };
    printThermalReceipt(rcpt, ev);
  };

  window.appDownloadSingleReceiptHtml = function (receiptId) {
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
    <div class="subtitle">கருணாக்கமுத்தன்பட்டி 9865607179</div>
    <div class="row"><span class="bold">ரசீது எண்:</span> <span>#${rcpt.billNo}</span></div>
    <div class="row"><span class="bold">தேதி:</span> <span>${rcpt.date || ''} ${rcpt.time || ''}</span></div>
    <div class="row"><span class="bold">உறுப்பினர் பெயர்:</span> <span>${majorName}</span></div>
    ${name1 ? `<div class="row"><span class="bold">உறுப்பினர் பெயர் 1:</span> <span>${name1}</span></div>` : ''}
    <div class="row"><span class="bold">பெயர்:</span> <span>${rcpt.name || ''}${rcpt.name1 ? ' ' + rcpt.name1 : ''}</span></div>
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

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rcpt.billNo || 'Receipt'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          <div class="flex justify-between"><span class="text-slate-400 font-semibold">Name:</span><span class="font-bold text-slate-100">${rcpt.name}${rcpt.name1 ? ' ' + rcpt.name1 : ''}</span></div>
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
          <button onclick="window.appDownloadSingleReceiptHtml('${rcpt.id}')" class="gold-button w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 shadow-lg cursor-pointer">
            <i data-lucide="download" class="w-4 h-4"></i>
            <span>Download HTML Receipt (.html)</span>
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

  function openEditReceiptFormModal(rcpt) {
    const modalRoot = document.getElementById('receipt-edit-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-overlay">
        <div class="glass-card w-full max-w-lg p-6 space-y-4">
          <h3 class="text-lg font-bold gold-gradient-text flex items-center space-x-2">
            <i data-lucide="edit-3" class="w-5 h-5 text-amber-400"></i>
            <span>Edit Receipt #${rcpt.billNo}</span>
          </h3>

          <form id="edit-receipt-form" class="space-y-4">
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Place *</label>
              <input type="text" id="edit-rcpt-place" class="input-styled" value="${rcpt.place}" required autocomplete="off">
              <div id="edit-rcpt-place-suggestions" class="translit-dropdown hidden"></div>
            </div>
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Name *</label>
              <input type="text" id="edit-rcpt-name" class="input-styled" value="${rcpt.name}" required autocomplete="off">
              <div id="edit-rcpt-name-suggestions" class="translit-dropdown hidden"></div>
            </div>
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Name 1 (Optional)</label>
              <input type="text" id="edit-rcpt-name1" class="input-styled" value="${rcpt.name1 || ''}" autocomplete="off">
              <div id="edit-rcpt-name1-suggestions" class="translit-dropdown hidden"></div>
            </div>
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Relationship (Optional)</label>
              <input type="text" id="edit-rcpt-rel" class="input-styled" value="${rcpt.relationship || ''}" autocomplete="off">
              <div id="edit-rcpt-rel-suggestions" class="translit-dropdown hidden"></div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Amount (₹) *</label>
              <input type="number" id="edit-rcpt-amt" class="input-styled font-mono text-emerald-400 font-bold" value="${rcpt.amount}" min="1" required>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Amount in Words *</label>
              <input type="text" id="edit-rcpt-words" class="input-styled text-amber-300 font-bold" value="${rcpt.amountWords}" required>
            </div>

            <div class="flex space-x-3 pt-3">
              <button type="button" onclick="document.getElementById('receipt-edit-modal-root').innerHTML=''" class="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl">
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
      rcpt.name = document.getElementById('edit-rcpt-name').value.trim();
      rcpt.name1 = document.getElementById('edit-rcpt-name1').value.trim();
      rcpt.relationship = document.getElementById('edit-rcpt-rel').value.trim();
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
              <select id="payout-event-select" class="input-styled text-sm py-1.5 min-w-[220px]">
                <option value="">All Events</option>
                ${state.events.map(ev => `
                  <option value="${ev.id}" ${ev.id === state.activeEventId ? 'selected' : ''}>
                    ${ev.displayName1 || ev.memberName}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''} (${ev.place})
                  </option>
                `).join('')}
              </select>
            </div>
          </div>

          <form id="payout-entry-form" class="grid grid-cols-1 md:grid-cols-3 gap-5 relative">
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Name *</label>
              <input type="text" id="payout-name" class="input-styled" placeholder="Ex: Karthi" required autocomplete="off">
              <div id="payout-name-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Reason *</label>
              <input type="text" id="payout-reason" class="input-styled" placeholder="Ex: Betel Leaf (வெத்தலை)" required autocomplete="off">
              <div id="payout-reason-suggestions" class="translit-dropdown hidden"></div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 mb-1">Amount (₹) *</label>
              <input type="number" id="payout-amount" class="input-styled font-mono text-rose-400 font-bold" placeholder="500" min="1" required>
            </div>

            <div class="md:col-span-3 pt-2">
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
                  <th class="px-4 py-3">Name</th>
                  <th class="px-4 py-3">Reason</th>
                  <th class="px-4 py-3">Amount</th>
                  <th class="px-4 py-3">Created By</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                ${eventPayouts.length === 0 ? '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500">No payout entries recorded.</td></tr>' : ''}
                ${eventPayouts.map((p, idx) => `
                  <tr>
                    <td class="px-4 py-3 font-mono text-slate-400">${idx + 1}</td>
                    <td class="px-4 py-3 text-xs text-slate-400">${p.date} ${p.time}</td>
                    <td class="px-4 py-3 font-medium text-slate-100">${p.name}</td>
                    <td class="px-4 py-3">${p.reason}</td>
                    <td class="px-4 py-3 font-bold text-rose-400">₹${parseFloat(p.amount).toLocaleString('en-IN')}</td>
                    <td class="px-4 py-3 text-xs font-semibold text-amber-300">${p.createdBy || 'admin'}</td>
                    <td class="px-4 py-3 text-right space-x-2">
                      <button onclick="window.appEditPayout('${p.id}')" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition">
                        Edit
                      </button>
                      <button onclick="window.appDeletePayout('${p.id}')" class="px-2.5 py-1 rounded bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 text-xs font-semibold border border-rose-700/40 transition">
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

    const nameInput = document.getElementById('payout-name');
    const reasonInput = document.getElementById('payout-reason');
    const amountInput = document.getElementById('payout-amount');

    bindGoogleTamilTransliteration('payout-name', 'payout-name-suggestions');
    bindGoogleTamilTransliteration('payout-reason', 'payout-reason-suggestions');

    // Enter & Tab Navigation: Name -> Reason -> Amount -> Auto Submit
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

    setupPayoutNavigation(nameInput, reasonInput, 'payout-name-suggestions');

    reasonInput?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const suggDiv = document.getElementById('payout-reason-suggestions');
        if (suggDiv && !suggDiv.classList.contains('hidden')) {
          const firstOption = suggDiv.querySelector('.translit-item span.font-semibold');
          if (firstOption && firstOption.textContent) {
            reasonInput.value = firstOption.textContent;
          }
          suggDiv.classList.add('hidden');
        } else if (reasonInput.value && !/[\u0B80-\u0BFF]/.test(reasonInput.value)) {
          const goog = await window.TamilTransliterate.fetchGoogleInputToolsTamil(reasonInput.value);
          if (goog && goog.length > 0) {
            reasonInput.value = goog[0].ta;
          } else {
            reasonInput.value = window.TamilTransliterate.transliterateText(reasonInput.value);
          }
        }
        amountInput?.focus();
      }
    });

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

      const name = nameInput ? nameInput.value.trim() : '';
      const reason = reasonInput ? reasonInput.value.trim() : '';
      const amount = amountInput ? amountInput.value.trim() : '';

      if (!name || !reason || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        alert('Please fill in Name, Reason, and a valid Amount!');
        return;
      }

      const now = new Date();
      const dateStr = now.toLocaleDateString('ta-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      const newPayout = {
        id: 'payout_' + Date.now(),
        eventId: activeEv.id,
        eventName: activeEv.eventName || activeEv.memberName,
        name,
        reason,
        amount,
        createdBy: state.currentUser ? state.currentUser.username : 'admin',
        date: dateStr,
        time: timeStr,
        createdAt: now.toISOString()
      };

      state.payouts.push(newPayout);
      await saveDb();

      alert(`Payout entry of ₹${parseFloat(amount).toLocaleString('en-IN')} saved successfully!`);
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
              <label class="block text-xs font-semibold text-slate-300 mb-1">Name *</label>
              <input type="text" id="edit-payout-name" class="input-styled" value="${payout.name}" required autocomplete="off">
              <div id="edit-payout-name-suggestions" class="translit-dropdown hidden"></div>
            </div>
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-300 mb-1">Reason *</label>
              <input type="text" id="edit-payout-reason" class="input-styled" value="${payout.reason}" required autocomplete="off">
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

    bindGoogleTamilTransliteration('edit-payout-name', 'edit-payout-name-suggestions');
    bindGoogleTamilTransliteration('edit-payout-reason', 'edit-payout-reason-suggestions');

    document.getElementById('edit-payout-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      payout.name = document.getElementById('edit-payout-name').value.trim();
      payout.reason = document.getElementById('edit-payout-reason').value.trim();
      payout.amount = document.getElementById('edit-payout-amt').value.trim();

      await saveDb();

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
        let nameDisplay = r.name;
        if (r.name1) nameDisplay += ' ' + r.name1;
        if (r.relationship) nameDisplay += ` (${r.relationship})`;

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

    // Download as Excel Spreadsheet file (.xls)
    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const fileName = `${safeEventName}_Excel_Report_${Date.now()}.xls`;

    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (typeof window.showToast === 'function') {
      window.showToast('Excel Report downloaded with custom top headings & columns!', 'success');
    } else {
      alert('Excel Report downloaded with custom top headings & columns!');
    }
  };

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
          <div class="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
            <h2 class="text-xl font-extrabold gold-gradient-text flex items-center space-x-3">
              <i data-lucide="download" class="w-6 h-6 text-amber-400"></i>
              <span>Download & Reports</span>
            </h2>

            <div class="flex flex-wrap items-center gap-3">
              <button type="button" onclick="window.appDownloadExcelReport()" class="px-5 py-2.5 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/50 font-bold text-xs flex items-center space-x-2 transition shadow-lg cursor-pointer">
                <i data-lucide="file-spreadsheet" class="w-4 h-4 text-emerald-400"></i>
                <span>Download in Excel Format (.xlsx / .csv)</span>
              </button>

              <button id="btn-download-a4" class="gold-button px-5 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 shadow-lg cursor-pointer">
                <i data-lucide="file-text" class="w-4 h-4"></i>
                <span>Download Moi Entry Report</span>
              </button>

              <button id="btn-download-payout-a4" class="px-5 py-2.5 rounded-xl bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 border border-rose-600/50 font-bold text-xs flex items-center space-x-2 transition shadow-lg cursor-pointer">
                <i data-lucide="download" class="w-4 h-4"></i>
                <span>Download Payout Report</span>
              </button>
            </div>
          </div>

          <!-- Filters -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            ${isAdmin ? `
              <div>
                <label class="block text-xs font-semibold text-amber-400 mb-1">Select Event</label>
                <select id="rpt-filter-event" class="input-styled">
                  <option value="">All Events</option>
                  ${state.events.map(ev => `
                    <option value="${ev.id}" ${ev.id === state.activeEventId ? 'selected' : ''}>
                      ${ev.displayName1 || ev.memberName}${ev.displayName1 && ev.memberName ? ' - ' + ev.memberName : ''} (${ev.place})
                    </option>
                  `).join('')}
                </select>
              </div>
            ` : ''}

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
                <option value="ரொக்கம்">Cash (ரொக்கம்)</option>
                <option value="யூ.பி.ஐ">UPI (யூ.பி.ஐ)</option>
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

          <div class="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-4">
            <div id="rpt-summary-stats" class="text-sm font-semibold text-amber-300 flex flex-wrap gap-4">
              <span>Moi Collection: ₹${totalMoiAmount.toLocaleString('en-IN')}</span>
              <span class="text-rose-400">| Payout Expenses: ₹${totalPayoutAmount.toLocaleString('en-IN')}</span>
              <span class="${totalBalanceAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}">| Total Balance Amount: ₹${totalBalanceAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        <!-- Moi Entries Table Grid -->
        <div class="glass-card p-6">
          <h3 class="text-lg font-bold text-slate-100 mb-4 flex items-center space-x-2">
            <i data-lucide="table" class="w-5 h-5 text-amber-400"></i>
            <span>Moi Entry Collection Records (${allReceipts.length})</span>
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm text-slate-300">
              <thead class="text-xs uppercase bg-slate-900/60 text-amber-400 border-b border-slate-800">
                <tr>
                  <th class="px-4 py-3">S.No</th>
                  <th class="px-4 py-3">Bill #</th>
                  <th class="px-4 py-3">Place</th>
                  <th class="px-4 py-3">Name</th>
                  <th class="px-4 py-3">Relationship</th>
                  <th class="px-4 py-3">Amount</th>
                  <th class="px-4 py-3">Mode & UPI Time</th>
                  <th class="px-4 py-3">Created By</th>
                  <th class="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody id="rpt-table-body" class="divide-y divide-slate-800">
                ${renderReportRows(allReceipts)}
              </tbody>
            </table>
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
        <td class="px-4 py-3 font-medium text-slate-100">${r.name}${r.name1 ? ' ' + r.name1 : ''}</td>
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
    };

    document.getElementById('rpt-filter-event')?.addEventListener('change', (e) => {
      state.activeEventId = e.target.value;
      renderApp();
    });

    ['rpt-filter-place', 'rpt-filter-rel', 'rpt-filter-mode', 'rpt-filter-amt-sort', 'rpt-filter-user'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', updateReport);
      document.getElementById(id)?.addEventListener('input', updateReport);
    });

    // Download Moi Entry Report
    document.getElementById('btn-download-a4')?.addEventListener('click', () => {
      const filtered = getFilteredReceipts();
      if (filtered.length === 0) {
        alert('No data available to download!');
        return;
      }

      const activeEv = getActiveEvent() || { memberName: 'Aathi Moi', place: '-' };
      const printArea = document.getElementById('a4-report-print-area');
      printArea.classList.remove('hidden');

      const itemsPerPage = 25;
      const totalPages = Math.ceil(filtered.length / itemsPerPage);

      let htmlPages = '';

      for (let page = 0; page < totalPages; page++) {
        const pageItems = filtered.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
        const pageTotal = pageItems.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

        htmlPages += `
          <div class="a4-page" style="position: relative; box-sizing: border-box; padding: 15px; border: 1px solid #ccc; margin-bottom: 20px;">
            <div style="position: absolute; top: 15px; right: 15px; font-size: 9.5pt; font-weight: bold; color: #475569;">
              Page ${page + 1} of ${totalPages}
            </div>

            <div style="text-align: center; border-bottom: 2px solid #8B0000; padding-bottom: 8px; margin-bottom: 12px;">
              <h1 style="font-size: 20pt; font-weight: bold; color: #8B0000; margin: 0;">ஆதி மொய்</h1>
              <h2 style="font-size: 14pt; font-weight: bold; color: #0F172A; margin: 4px 0 2px 0;">
                ${activeEv.displayName1 || activeEv.memberName || ''}${activeEv.displayName1 && activeEv.memberName ? ' - ' + activeEv.memberName : ''}
              </h2>
              <div style="font-size: 10.5pt; font-weight: bold; color: #334155; margin-top: 4px;">
                <span>${activeEv.place || ''}</span> ${activeEv.place && activeEv.phone ? '&nbsp;|&nbsp;' : ''}
                <span>${activeEv.phone || ''}</span> ${(activeEv.place || activeEv.phone) && activeEv.eventDate ? '&nbsp;|&nbsp;' : ''}
                <span>${formatDateDMY(activeEv.eventDate)}</span>
              </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
              <thead>
                <tr style="background: #f1f5f9; border-top: 1px solid #000; border-bottom: 2px solid #000;">
                  <th style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; width: 40px;">S.No</th>
                  <th style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; width: 70px;">Bill #</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #cbd5e1;">இடம்</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #cbd5e1;">பெயர்</th>
                  <th style="padding: 6px; text-align: right; border: 1px solid #cbd5e1;">தொகை</th>
                  <th style="padding: 6px; text-align: center; border: 1px solid #cbd5e1; width: 140px;">செலுத்திய முறை நேரம்</th>
                </tr>
              </thead>
              <tbody>
                ${pageItems.map((r, i) => `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 5px; text-align: center; border: 1px solid #cbd5e1;">${page * itemsPerPage + i + 1}</td>
                    <td style="padding: 5px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold;">${r.billNo}</td>
                    <td style="padding: 5px; text-align: left; border: 1px solid #cbd5e1;">${r.place}</td>
                    <td style="padding: 5px; text-align: left; border: 1px solid #cbd5e1; font-weight: bold;">${r.name}${r.name1 ? ' ' + r.name1 : ''}${r.relationship ? ' (' + r.relationship + ')' : ''}</td>
                    <td style="padding: 5px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold;">₹${parseFloat(r.amount).toLocaleString('en-IN')}</td>
                    <td style="padding: 5px; text-align: center; border: 1px solid #cbd5e1;">
                      <span style="font-weight: bold;">${r.mode}</span>
                      ${r.upiTxTime ? `<div style="font-size: 8pt; color: #3730a3; font-family: monospace; font-weight: bold; margin-top: 1px;">${r.upiTxTime}</div>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div style="margin-top: 12px; display: flex; justify-content: space-between; font-size: 10pt; font-weight: bold; border-top: 1px solid #000; padding-top: 6px;">
              <span>Page Entries: ${pageItems.length}</span>
              <span>Page Subtotal: ₹${pageTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>
        `;
      }

      printArea.innerHTML = htmlPages;
      window.print();

      setTimeout(() => {
        printArea.classList.add('hidden');
        printArea.innerHTML = '';
      }, 1000);
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

      const printArea = document.getElementById('a4-report-print-area');
      printArea.classList.remove('hidden');

      const itemsPerPage = 25;
      const totalPages = Math.ceil(allPayouts.length / itemsPerPage);
      let htmlPages = '';

      for (let page = 0; page < totalPages; page++) {
        const pageItems = allPayouts.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
        const pageTotal = pageItems.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

        htmlPages += `
          <div class="a4-page" style="position: relative; box-sizing: border-box; padding: 15px; border: 1px solid #ccc; margin-bottom: 20px;">
            <div style="position: absolute; top: 15px; right: 15px; font-size: 9.5pt; font-weight: bold; color: #475569;">
              Page ${page + 1} of ${totalPages}
            </div>

            <div style="text-align: center; border-bottom: 2px solid #8B0000; padding-bottom: 8px; margin-bottom: 12px;">
              <h1 style="font-size: 20pt; font-weight: bold; color: #8B0000; margin: 0;">ஆதி மொய்</h1>
              <h2 style="font-size: 14pt; font-weight: bold; color: #0F172A; margin: 4px 0 2px 0;">
                ${activeEv.displayName1 || activeEv.memberName || ''}${activeEv.displayName1 && activeEv.memberName ? ' - ' + activeEv.memberName : ''}
              </h2>
              <div style="font-size: 10.5pt; font-weight: bold; color: #334155; margin-top: 4px;">
                <span>${activeEv.place || ''}</span> ${activeEv.place && activeEv.phone ? '&nbsp;|&nbsp;' : ''}
                <span>${activeEv.phone || ''}</span> ${(activeEv.place || activeEv.phone) && activeEv.eventDate ? '&nbsp;|&nbsp;' : ''}
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
            </div>
          </div>
        `;
      }

      printArea.innerHTML = htmlPages;
      window.print();

      setTimeout(() => {
        printArea.classList.add('hidden');
        printArea.innerHTML = '';
      }, 1000);
    });
  }

  // Global helper exports
  window.appSwitchPanel = switchPanel;
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