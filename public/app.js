// App State
let currentType = 'l2tp'; // 'l2tp' or 'pppoe'
let allDevices = [];
let filteredDevices = [];
let deviceToReboot = null;

// Traffic Monitor App State
let currentTrafficType = 'l2tp';
let currentTrafficRange = 'today';
let trafficChartInstance = null;
let userTrandChartInstance = null;
let trafficChartAbortController = null;
let sitesTrafficData = [];
let modalActiveDeviceSn = null;

// DOM Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const searchInput = document.getElementById('search-input');
const syncBtn = document.getElementById('sync-btn');
const deviceGrid = document.getElementById('device-grid');
const loadingSpinner = document.getElementById('loading-spinner');
const emptyState = document.getElementById('empty-state');
const deviceCountBadge = document.getElementById('device-count');
const sortSelect = document.getElementById('sort-select');

// Stats Elements
const statTotal = document.getElementById('stat-total');
const statOnline = document.getElementById('stat-online');
const statOffline = document.getElementById('stat-offline');

// Modal Elements
const rebootModal = document.getElementById('reboot-modal');
const modalAlias = document.getElementById('modal-alias');
const modalSn = document.getElementById('modal-sn');
const modalIp = document.getElementById('modal-ip');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');

const renameModal = document.getElementById('rename-modal');
const renameModalCurrentAlias = document.getElementById('rename-modal-current-alias');
const renameModalSn = document.getElementById('rename-modal-sn');
const renameInput = document.getElementById('rename-input');
const renameModalCancelBtn = document.getElementById('rename-modal-cancel-btn');
const renameModalConfirmBtn = document.getElementById('rename-modal-confirm-btn');

const ewebModal = document.getElementById('eweb-modal');
const ewebModalStatus = document.getElementById('eweb-modal-status');
const ewebModalAlias = document.getElementById('eweb-modal-alias');
const ewebModalSn = document.getElementById('eweb-modal-sn');
const ewebModalLoading = document.getElementById('eweb-modal-loading');
const ewebModalLinks = document.getElementById('eweb-modal-links');
const ewebLinkDomain = document.getElementById('eweb-link-domain');
const ewebLinkIp = document.getElementById('eweb-link-ip');
const ewebLinkUse = document.getElementById('eweb-link-use');
const ewebModalCloseBtn = document.getElementById('eweb-modal-close-btn');

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  fetchDevices();
  initializeTabs();
  initializeSearch();
  initializeButtons();
  
  // Traffic Monitor Initializers
  initializeTrafficModalControls();
  
  // Initialize Lucide Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});

// Tab Switcher
function initializeTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      currentType = btn.dataset.type;
      searchInput.value = '';
      fetchDevices();
    });
  });
}

// Search & Sort Filter Handler
function initializeSearch() {
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
      filteredDevices = [...allDevices];
    } else {
      filteredDevices = allDevices.filter(dev => 
        (dev.alias || '').toLowerCase().includes(query) ||
        (dev.sn || '').toLowerCase().includes(query) ||
        (dev.mac_address || '').toLowerCase().includes(query) ||
        (dev.ip_address || '').toLowerCase().includes(query)
      );
    }
    sortDevices();
    renderDevices();
  });

  sortSelect.addEventListener('change', () => {
    sortDevices();
    renderDevices();
  });
}

// Sorting logic
function sortDevices() {
  const sortBy = sortSelect.value;
  
  filteredDevices.sort((a, b) => {
    const aliasA = (a.alias || '').toLowerCase();
    const aliasB = (b.alias || '').toLowerCase();
    
    if (sortBy === 'name-asc') {
      return aliasA.localeCompare(aliasB);
    } else if (sortBy === 'name-desc') {
      return aliasB.localeCompare(aliasA);
    } else if (sortBy === 'status-on') {
      if (a.status === b.status) return aliasA.localeCompare(aliasB);
      return a.status === 'ON' ? -1 : 1;
    } else if (sortBy === 'status-off') {
      if (a.status === b.status) return aliasA.localeCompare(aliasB);
      return a.status === 'OFF' ? -1 : 1;
    } else if (sortBy === 'clients-desc') {
      if (a.clients === b.clients) return aliasA.localeCompare(aliasB);
      return b.clients - a.clients;
    }
    return 0;
  });
}

// Button Click Event Listeners
function initializeButtons() {
  syncBtn.addEventListener('click', () => {
    fetchDevices(true);
  });
  
  modalCancelBtn.addEventListener('click', hideRebootModal);
  
  modalConfirmBtn.addEventListener('click', executeReboot);

  renameModalCancelBtn.addEventListener('click', hideRenameModal);

  renameModalConfirmBtn.addEventListener('click', executeRename);

  ewebModalCloseBtn.addEventListener('click', () => {
    ewebModal.classList.add('hidden');
  });
}

// Fetch Devices from API
async function fetchDevices(forcePull = false) {
  // Tampilkan loading screen hanya jika grid kosong (load pertama) atau saat sinkronisasi manual
  if (deviceGrid.children.length === 0 || forcePull) {
    showLoading(true);
  }
  try {
    
    // We fetch from /api/scrape?type=xxx
    const response = await fetch(`/api/scrape?type=${currentType}`, {
      method: forcePull ? 'POST' : 'GET', // POST will force reload in the backend
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const data = await response.json();
    allDevices = data.devices || [];
    filteredDevices = [...allDevices];
    
    updateStats();
    sortDevices();
    renderDevices();
    
  } catch (error) {
    console.error('Fetch error:', error);
    showToast(`Gagal memuat data perangkat: ${error.message}`, 'error');
    showLoading(false);
  }
}


// Render Stats Overview cards
function updateStats() {
  const total = allDevices.length;
  const online = allDevices.filter(d => d.status === 'ON').length;
  const offline = allDevices.filter(d => d.status === 'OFF').length;
  
  statTotal.textContent = total;
  statOnline.textContent = online;
  statOffline.textContent = offline;
  
  deviceCountBadge.textContent = `${total} devices`;
}

// Render Grid Devices Cards
function renderDevices() {
  showLoading(false);
  deviceGrid.innerHTML = '';
  
  if (filteredDevices.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  
  filteredDevices.forEach(dev => {
    const isOnline = dev.status === 'ON';
    const statusText = isOnline ? 'Online' : 'Offline';
    const statusClass = isOnline ? 'online' : 'offline';
    const statusIcon = isOnline ? 'check' : 'alert-circle';
    
    const cardHtml = `
      <div class="device-card glass">
        <div class="card-header">
          <div class="device-info-header">
            <h3 class="device-name" title="${dev.alias || 'Tanpa Nama'}">${dev.alias || 'Tanpa Nama'}</h3>
            <span class="device-sn">SN: ${dev.sn || '-'}</span>
          </div>
          <span class="status-pill ${statusClass}">
            <i data-lucide="${statusIcon}"></i> ${statusText}
          </span>
        </div>
        
        <div class="card-body">
          <div class="info-row">
            <span class="info-label">MAC Address</span>
            <span class="info-value font-mono">${dev.mac_address || '-'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">IP Address</span>
            <span class="info-value font-mono">${dev.ip_address || '-'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Clients Connected</span>
            <span class="info-value">${dev.clients || 0} user</span>
          </div>
          <div class="info-row">
            <span class="info-label">${isOnline ? 'Offline Sejak' : 'Last Offline'}</span>
            <span class="info-value">${dev.last_online || '-'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">${isOnline ? 'Online Sejak' : 'Log Terakhir'}</span>
            <span class="info-value history-text">${dev.last_log_history || '-'}</span>
          </div>
        </div>
        
        <div class="card-footer" style="gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-card-action traffic-trigger" data-group-id="${dev.group_id || ''}" data-group-name="${dev.group_name || dev.alias || ''}" data-clients="${dev.clients || 0}" data-sn="${dev.sn || ''}">
            <i data-lucide="activity"></i> Traffic
          </button>
          <button class="btn btn-secondary btn-card-action eweb-trigger" data-sn="${dev.sn}" data-alias="${dev.alias}">
            <i data-lucide="globe"></i> eWeb
          </button>
          <button class="btn btn-secondary btn-card-action rename-trigger" data-sn="${dev.sn}" data-alias="${dev.alias}">
            <i data-lucide="edit-3"></i> Edit Nama
          </button>
          <button class="btn btn-secondary btn-card-action reboot-trigger" data-sn="${dev.sn}" data-alias="${dev.alias}" data-ip="${dev.ip_address}">
            <i data-lucide="power"></i> Reboot
          </button>
        </div>
      </div>
    `;
    
    deviceGrid.insertAdjacentHTML('beforeend', cardHtml);
  });
  
  // Re-create icons for Lucide elements inside dynamic grid
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Register click traffic buttons
  document.querySelectorAll('.traffic-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const groupId = btn.dataset.groupId;
      const groupName = btn.dataset.groupName;
      const clients = btn.dataset.clients;
      const sn = btn.dataset.sn;
      
      if (!groupId) {
        showToast("Group ID untuk perangkat ini tidak ditemukan.", "error");
        return;
      }
      
      // Open traffic detail modal for this group/site
      openTrafficTrendModal(groupId, groupName, clients, sn);
    });
  });
  
  // Register click reboot buttons
  document.querySelectorAll('.reboot-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const sn = btn.dataset.sn;
      const alias = btn.dataset.alias;
      const ip = btn.dataset.ip;
      showRebootModal({ sn, alias, ip });
    });
  });

  // Register click rename buttons
  document.querySelectorAll('.rename-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const sn = btn.dataset.sn;
      const alias = btn.dataset.alias;
      showRenameModal({ sn, alias });
    });
  });

  // Register click eWeb buttons
  document.querySelectorAll('.eweb-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const sn = btn.dataset.sn;
      const alias = btn.dataset.alias;
      executeEWeb(sn, alias, btn);
    });
  });
}

// Show/Hide Loading Overlay
function showLoading(isLoading) {
  if (isLoading) {
    const textElement = loadingSpinner.querySelector('p');
    if (textElement) {
      textElement.textContent = 'Menarik data terbaru dari Ruijie Cloud...';
    }
    loadingSpinner.classList.remove('hidden');
    deviceGrid.classList.add('hidden');
  } else {
    loadingSpinner.classList.add('hidden');
    deviceGrid.classList.remove('hidden');
  }
}

// Modal Control
function showRebootModal(device) {
  deviceToReboot = device;
  modalAlias.textContent = device.alias || 'Tanpa Nama';
  modalSn.textContent = device.sn || '-';
  modalIp.textContent = device.ip || '-';
  
  rebootModal.classList.remove('hidden');
}

function hideRebootModal() {
  rebootModal.classList.add('hidden');
  deviceToReboot = null;
}

// Execute Reboot Request on backend
async function executeReboot() {
  if (!deviceToReboot) return;
  
  const sn = deviceToReboot.sn;
  setRebootingState(true);
  
  try {
    const response = await fetch('/api/reboot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sn: sn,
        type: currentType
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showToast(`Perintah reboot untuk ${deviceToReboot.alias} berhasil dikirim!`, 'success');
      hideRebootModal();
      // Delay fetch to let the status update reflect
      setTimeout(fetchDevices, 4000);
    } else {
      throw new Error(result.error || 'Terjadi kesalahan sistem.');
    }
  } catch (error) {
    console.error('Reboot error:', error);
    showToast(`Gagal melakukan reboot: ${error.message}`, 'error');
  } finally {
    setRebootingState(false);
  }
}

// Set Confirm Reboot Button Loading State
function setRebootingState(isRebooting) {
  if (isRebooting) {
    modalConfirmBtn.disabled = true;
    modalCancelBtn.disabled = true;
    modalConfirmBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto;"></div>';
  } else {
    modalConfirmBtn.disabled = false;
    modalCancelBtn.disabled = false;
    modalConfirmBtn.innerHTML = '<i data-lucide="power"></i> Ya, Reboot Sekarang';
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

// State for renaming
let deviceToRename = null;

function showRenameModal(device) {
  deviceToRename = device;
  renameModalCurrentAlias.textContent = device.alias || 'Tanpa Nama';
  renameModalSn.textContent = device.sn || '-';
  renameInput.value = device.alias || '';
  renameModal.classList.remove('hidden');
  renameInput.focus();
}

function hideRenameModal() {
  renameModal.classList.add('hidden');
  deviceToRename = null;
  renameInput.value = '';
}

async function executeRename() {
  if (!deviceToRename) return;

  const newAlias = renameInput.value.trim();
  if (!newAlias) {
    showToast('Nama alias baru tidak boleh kosong!', 'error');
    return;
  }

  setRenamingState(true);

  try {
    const response = await fetch('/api/rename', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sn: deviceToRename.sn,
        alias: newAlias,
        type: currentType
      })
    });

    const result = await response.json();

    if (response.ok) {
      showToast(`Nama alias berhasil diubah menjadi ${newAlias}!`, 'success');
      hideRenameModal();
      // Refetch untuk menampilkan nama baru
      fetchDevices();
    } else {
      throw new Error(result.error || 'Terjadi kesalahan sistem.');
    }
  } catch (error) {
    console.error('Rename error:', error);
    showToast(`Gagal mengubah nama alias: ${error.message}`, 'error');
  } finally {
    setRenamingState(false);
  }
}

function setRenamingState(isRenaming) {
  if (isRenaming) {
    renameModalConfirmBtn.disabled = true;
    renameModalCancelBtn.disabled = true;
    renameModalConfirmBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto;"></div>';
  } else {
    renameModalConfirmBtn.disabled = false;
    renameModalCancelBtn.disabled = false;
    renameModalConfirmBtn.innerHTML = '<i data-lucide="save"></i> Simpan Perubahan';
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

// Menghubungi API server untuk membuat secure tunnel remote eWeb
async function executeEWeb(sn, alias, btnElement) {
  // Buka modal koneksi eWeb terlebih dahulu
  ewebModalAlias.textContent = alias || 'Tanpa Nama';
  ewebModalSn.textContent = sn || '-';
  ewebModalStatus.textContent = 'Mempersiapkan terowongan VPN tunnel aman...';
  ewebModalStatus.className = '';
  ewebModalLoading.classList.remove('hidden');
  ewebModalLinks.classList.add('hidden');
  ewebLinkDomain.classList.add('hidden');
  ewebLinkIp.classList.add('hidden');
  ewebLinkUse.classList.add('hidden');
  ewebModal.classList.remove('hidden');

  const originalHtml = btnElement.innerHTML;
  btnElement.disabled = true;
  btnElement.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px;margin:0 auto;"></div>';

  try {
    const response = await fetch('/api/eweb', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sn: sn,
        type: currentType
      })
    });

    const result = await response.json();

    if (response.ok && result.urls) {
      ewebModalStatus.textContent = 'Succeeded in creating the tunnel. The eWeb system is connected.';
      ewebModalStatus.className = 'text-success';
      
      // Show/hide each link based on availability
      if (result.urls.domainUrl) {
        ewebLinkDomain.href = result.urls.domainUrl;
        ewebLinkDomain.classList.remove('hidden');
      } else {
        ewebLinkDomain.classList.add('hidden');
      }

      if (result.urls.ipUrl) {
        ewebLinkIp.href = result.urls.ipUrl;
        ewebLinkIp.classList.remove('hidden');
      } else {
        ewebLinkIp.classList.add('hidden');
      }

      if (result.urls.useUrl) {
        ewebLinkUse.href = result.urls.useUrl;
        ewebLinkUse.classList.remove('hidden');
      } else {
        ewebLinkUse.classList.add('hidden');
      }
      
      ewebModalLoading.classList.add('hidden');
      ewebModalLinks.classList.remove('hidden');
      showToast('Koneksi tunnel eWeb berhasil dibuat!', 'success');

      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } else {
      throw new Error(result.error || 'Terjadi kesalahan sistem.');
    }
  } catch (error) {
    console.error('eWeb tunnel error:', error);
    ewebModalStatus.textContent = `Gagal membuka eWeb: ${error.message}`;
    ewebModalLoading.classList.add('hidden');
    showToast(`Gagal membuka eWeb: ${error.message}`, 'error');
  } finally {
    btnElement.disabled = false;
    btnElement.innerHTML = originalHtml;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}


// Toast Notifications System
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type} glass`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle-2';
  if (type === 'error') iconName = 'alert-octagon';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span class="toast-message">${message}</span>
  `;
  
  container.appendChild(toast);
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  // Remove toast after 4.5 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4500);
}

// ==========================================
// Traffic Monitor Modal Section
// ==========================================

let modalActiveGroupId = null;
let modalActiveSiteName = '';
let modalActiveClients = 0;
let modalActiveConnType = 'l2tp';

// Initialize Modal Date Selectors, Range Dropdown, and Refresh controls
function initializeTrafficModalControls() {
  const modalTrafficRange = document.getElementById('modal-traffic-range');
  const modalCustomDates = document.getElementById('modal-custom-dates');
  const modalStartDate = document.getElementById('modal-start-date');
  const modalEndDate = document.getElementById('modal-end-date');
  const modalRefreshBtn = document.getElementById('modal-refresh-btn');
  const trafficModalCloseBtn = document.getElementById('traffic-modal-close-btn');
  const trafficDetailModal = document.getElementById('traffic-detail-modal');

  if (modalTrafficRange) {
    modalTrafficRange.addEventListener('change', () => {
      const range = modalTrafficRange.value;
      if (range === 'custom') {
        modalCustomDates.classList.remove('hidden');
        
        // Pre-fill dates: start 7 days ago, end today
        const today = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        
        const toYYYYMMDD = (d) => {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        };
        
        modalStartDate.value = toYYYYMMDD(start);
        modalEndDate.value = toYYYYMMDD(today);
        
        loadModalTrafficChart();
      } else {
        modalCustomDates.classList.add('hidden');
        loadModalTrafficChart();
      }
    });
  }

  if (modalStartDate) {
    ['change', 'input'].forEach(evt => {
      modalStartDate.addEventListener(evt, () => {
        loadModalTrafficChart();
      });
    });
  }

  if (modalEndDate) {
    ['change', 'input'].forEach(evt => {
      modalEndDate.addEventListener(evt, () => {
        loadModalTrafficChart();
      });
    });
  }

  if (modalRefreshBtn) {
    modalRefreshBtn.addEventListener('click', () => {
      loadModalTrafficChart();
    });
  }

  if (trafficModalCloseBtn) {
    trafficModalCloseBtn.addEventListener('click', () => {
      trafficDetailModal.classList.add('hidden');
      if (trafficChartInstance) {
        trafficChartInstance.destroy();
        trafficChartInstance = null;
      }
      if (userTrandChartInstance) {
        userTrandChartInstance.destroy();
        userTrandChartInstance = null;
      }
      // Sembunyikan user trend chart wrapper saat modal ditutup
      const wrapper = document.getElementById('usertrand-chart-wrapper');
      const row = document.getElementById('usertrand-row');
      const totalRow = document.getElementById('totaluser-24h-row');
      if (wrapper) wrapper.style.display = 'none';
      if (row) row.style.display = 'none';
      if (totalRow) totalRow.style.display = 'none';
    });
  }
}

// Open and show site traffic detail modal
async function openTrafficTrendModal(groupId, siteName, clients, sn = '') {
  const trafficDetailModal = document.getElementById('traffic-detail-modal');
  const modalSiteName = document.getElementById('traffic-modal-sitename');
  const modalGroupId = document.getElementById('traffic-modal-groupid');
  const modalClients = document.getElementById('traffic-modal-clients');
  const modalTotalBytes = document.getElementById('traffic-modal-total-bytes');
  const modalTrafficRange = document.getElementById('modal-traffic-range');
  const modalCustomDates = document.getElementById('modal-custom-dates');

  // Save active parameters
  modalActiveGroupId = groupId;
  modalActiveSiteName = siteName;
  modalActiveClients = clients;
  modalActiveDeviceSn = sn;
  modalActiveConnType = currentType; // L2TP or PPPoE

  if (modalSiteName) modalSiteName.textContent = siteName;
  if (modalGroupId) modalGroupId.textContent = groupId;
  if (modalClients) modalClients.textContent = `${clients || 0} user`;
  if (modalTotalBytes) modalTotalBytes.textContent = '-';

  // Reset range and dates UI
  if (modalTrafficRange) modalTrafficRange.value = 'today';
  if (modalCustomDates) modalCustomDates.classList.add('hidden');

  trafficDetailModal.classList.remove('hidden');

  // Load the chart
  loadModalTrafficChart();
}

// Fetch trend data and render/update the line chart
async function loadModalTrafficChart() {
  const modalTrafficRange = document.getElementById('modal-traffic-range').value;
  
  let payload = {
    groupId: modalActiveGroupId,
    rangeType: modalTrafficRange,
    type: modalActiveConnType,
    deviceSn: modalActiveDeviceSn
  };

  if (modalTrafficRange === 'custom') {
    const startDateVal = document.getElementById('modal-start-date').value;
    const endDateVal = document.getElementById('modal-end-date').value;
    if (!startDateVal || !endDateVal) {
      return;
    }
    payload.startDate = startDateVal.replace(/-/g, '');
    payload.endDate = endDateVal.replace(/-/g, '');
  }

  // Abort any ongoing request
  if (trafficChartAbortController) {
    trafficChartAbortController.abort();
  }
  trafficChartAbortController = new AbortController();
  const signal = trafficChartAbortController.signal;

  try {
    const res = await fetch('/api/traffic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: signal
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    const data = await res.json();
    const siteData = data.sitesTraffic && data.sitesTraffic[0];

    if (siteData) {
      const modalClients = document.getElementById('traffic-modal-clients');
      if (modalClients) {
        modalClients.textContent = `${siteData.clients || 0} user`;
      }
      const modalTotalBytes = document.getElementById('traffic-modal-total-bytes');
      if (modalTotalBytes) {
        modalTotalBytes.textContent = formatBytes(siteData.totalTrafficBytes || 0);
      }

      // Tampilkan data userTrand jika tersedia (hanya saat rangeType = today)
      const usertrandRow = document.getElementById('usertrand-row');
      const usertrandEl = document.getElementById('traffic-modal-usertrand');
      const totaluserRow = document.getElementById('totaluser-24h-row');
      const totaluserEl = document.getElementById('traffic-modal-totaluser-24h');

      if (siteData.userTrandClients !== undefined && siteData.userTrandClients !== null && siteData.userTrandClients > 0) {
        const snapshotTime = siteData.userTrandLastTime && String(siteData.userTrandLastTime).length >= 8
          ? `<span style="font-size:0.7rem;font-weight:400;color:#9ca3af;margin-left:0.3rem;">@ ${String(siteData.userTrandLastTime).length >= 16 ? String(siteData.userTrandLastTime).substring(5, 16) : String(siteData.userTrandLastTime)}</span>`
          : '';
        if (usertrandEl) {
          usertrandEl.innerHTML = `<span style="background:rgba(245,158,11,0.15);color:#f59e0b;padding:0.15rem 0.5rem;border-radius:999px;font-size:0.85rem;">${siteData.userTrandClients} user</span>${snapshotTime}`;
        }
        if (usertrandRow) usertrandRow.style.display = '';
      } else {
        if (usertrandRow) usertrandRow.style.display = 'none';
      }

      // Tampilkan Total Klien Terdeteksi (MAX total) - independen dari userTrandClients
      const totaluserLabel = document.getElementById('totaluser-24h-label');
      if (totaluserEl && siteData.userTrandTotal24h !== undefined && siteData.userTrandTotal24h !== null && siteData.userTrandTotal24h > 0) {
        totaluserEl.textContent = `${siteData.userTrandTotal24h} user`;
        if (totaluserRow) totaluserRow.style.display = '';
        // Label dinamis sesuai range
        if (totaluserLabel) {
          if (modalTrafficRange === 'today') totaluserLabel.textContent = 'Peak Klien (24 Jam):';
          else if (modalTrafficRange === '7days') totaluserLabel.textContent = 'Peak Klien (7 Hari):';
          else if (modalTrafficRange === '30days') totaluserLabel.textContent = 'Peak Klien (30 Hari):';
          else totaluserLabel.textContent = 'Peak Klien (Custom):';
        }
      } else {
        if (totaluserRow) totaluserRow.style.display = 'none';
      }
    }

    if (!siteData || !siteData.trendPoints || siteData.trendPoints.length === 0) {
      console.warn("Data trend untuk site ini tidak ditemukan atau kosong.");
      
      // Clear chart if empty
      if (trafficChartInstance) {
        trafficChartInstance.destroy();
        trafficChartInstance = null;
      }

      // Render user trend chart jika ada data userTrand meski traffic kosong
      renderUserTrandChart(siteData, modalTrafficRange);
      return;
    }

    const trend = siteData.trendPoints;
    
    // Sort trend chronologically
    trend.sort((a, b) => {
      const getCompareTime = (tStr) => {
        if (!tStr) return 0;
        const clean = String(tStr).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3').replace(' ', 'T');
        return new Date(clean).getTime() || 0;
      };
      return getCompareTime(a.time) - getCompareTime(b.time);
    });

    const labels = trend.map(t => {
      const formattedTime = String(t.time).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3').replace(' ', 'T');
      const date = new Date(formattedTime);
      if (!isNaN(date.getTime())) {
        if (modalTrafficRange === 'today') {
          // Format menjadi "MM-DD HH:mm" (misal: "07-17 16:50")
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          const hh = String(date.getHours()).padStart(2, '0');
          const min = String(date.getMinutes()).padStart(2, '0');
          return `${mm}-${dd} ${hh}:${min}`;
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
      return t.time;
    });

    const datasetIn = trend.map(t => t.in / (1024 * 1024)); // Convert to MB
    const datasetOut = trend.map(t => t.out / (1024 * 1024)); // Convert to MB

    const ctx = document.getElementById('traffic-modal-chart').getContext('2d');
    
    if (trafficChartInstance) {
      trafficChartInstance.destroy();
    }

    trafficChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Uplink',
            data: datasetIn,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Downlink',
            data: datasetOut,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#f3f4f6' }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                if (context.parsed.y !== null) {
                  label += formatBytes(context.parsed.y * 1024 * 1024);
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af' }
          },
          y: {
            min: 0,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { 
              color: '#9ca3af',
              callback: function(value) {
                return formatBytes(value * 1024 * 1024);
              }
            }
          }
        }
      }
    });

    // Render user trend chart
    renderUserTrandChart(siteData, modalTrafficRange);

  } catch (err) {
    if (err.name === 'AbortError') {
      return;
    }
    console.error("Gagal menggambar chart:", err);
    showToast(`Gagal mengambil data trend: ${err.message}`, 'error');
  }
}

// Render atau destroy chart User Trend (activeTotal per 10 menit)
function renderUserTrandChart(siteData, rangeType) {
  const wrapper = document.getElementById('usertrand-chart-wrapper');
  const canvas  = document.getElementById('usertrand-chart');
  const titleEl = document.getElementById('usertrand-chart-title');
  if (!wrapper || !canvas) return;

  // Tampilkan chart hanya jika kita punya data points
  const hasPoints = siteData && siteData.userTrandPoints && siteData.userTrandPoints.length > 0;
  if (!siteData || (!hasPoints && siteData.userTrandClients === null)) {
    wrapper.style.display = 'none';
    if (userTrandChartInstance) { userTrandChartInstance.destroy(); userTrandChartInstance = null; }
    return;
  }

  // Dinamiskan judul grafik tren berdasarkan range
  if (titleEl) {
    if (rangeType === 'today') {
      titleEl.textContent = 'Wi-Fi Client Trend (Hari Ini)';
    } else if (rangeType === '7days') {
      titleEl.textContent = 'Wi-Fi Client Trend (7 Hari Terakhir)';
    } else if (rangeType === '30days') {
      titleEl.textContent = 'Wi-Fi Client Trend (30 Hari Terakhir)';
    } else {
      titleEl.textContent = 'Wi-Fi Client Trend (Custom Range)';
    }
  }

  wrapper.style.display = 'block';

  let labels = [];
  let datasetActive = [];
  let datasetTotal = [];

  // Fungsi pembantu untuk memformat label waktu / tanggal di grafik
  const formatUserTrandLabel = (timeStr) => {
    if (!timeStr) return 'Terkini';
    const sTime = String(timeStr);
    
    // Format 1: "YYYY-MM-DD HH:mm:ss" (Today per 10 menit) -> Ambil "MM-DD HH:mm"
    if (sTime.length >= 16 && sTime.includes('-')) {
      return sTime.substring(5, 16);
    }
    
    // Format 2: "YYYYMMDD" (Historis 7d, 30d, custom) -> Ubah menjadi "DD MMM" (misal: "10 Jul")
    if (sTime.length === 8 && !isNaN(Number(sTime))) {
      const yyyy = sTime.substring(0, 4);
      const mm = sTime.substring(4, 6);
      const dd = sTime.substring(6, 8);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const monthIndex = parseInt(mm, 10) - 1;
      const monthName = months[monthIndex] || mm;
      return `${parseInt(dd, 10)} ${monthName}`;
    }
    
    return timeStr;
  };

  // Jika ada data points lengkap dari server, kita gambar grafiknya
  if (siteData.userTrandPoints && siteData.userTrandPoints.length > 0) {
    // Urutkan secara kronologis berdasarkan waktu string
    const sortedPoints = [...siteData.userTrandPoints].sort((a, b) => {
      return String(a.time).localeCompare(String(b.time));
    });

    labels = sortedPoints.map(p => formatUserTrandLabel(p.time));
    datasetActive = sortedPoints.map(p => p.activeTotal);
    datasetTotal = sortedPoints.map(p => p.total);
  } else {
    // Fallback jika hanya ada single point
    const lastVal = siteData.userTrandClients || 0;
    const lastTime = siteData.userTrandLastTime || '';
    labels = [formatUserTrandLabel(lastTime)];
    datasetActive = [lastVal];
    datasetTotal = [lastVal];
  }

  if (userTrandChartInstance) {
    userTrandChartInstance.destroy();
    userTrandChartInstance = null;
  }

  const ctx = canvas.getContext('2d');
  userTrandChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Klien Aktif',
          data: datasetActive,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2
        },
        {
          label: 'Total Terdeteksi',
          data: datasetTotal,
          borderColor: '#9ca3af',
          backgroundColor: 'rgba(156, 163, 175, 0.05)',
          fill: false,
          tension: 0.3,
          borderWidth: 1,
          borderDash: [4, 4]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          labels: { color: '#f3f4f6', font: { size: 10 } } 
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} user`
          }
        }
      },
      scales: {
        x: { 
          grid: { color: 'rgba(255,255,255,0.03)' }, 
          ticks: { color: '#9ca3af', font: { size: 9 } } 
        },
        y: {
          min: 0,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#9ca3af', stepSize: 1, font: { size: 9 } }
        }
      }
    }
  });
}

// Utility to format bytes into human readable sizes
function formatBytes(bytes) {
  if (bytes === 0 || isNaN(bytes)) return '0 B';
  const isNegative = bytes < 0;
  const absBytes = Math.abs(bytes);
  const k = 1024;
  const dm = 2;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(absBytes) / Math.log(k));
  const formatted = parseFloat((absBytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  return isNegative ? `-${formatted}` : formatted;
}
