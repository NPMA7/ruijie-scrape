// App State
let currentType = 'l2tp'; // 'l2tp' or 'pppoe'
let allDevices = [];
let filteredDevices = [];
let deviceToReboot = null;

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
        
        <div class="card-footer" style="gap: 0.5rem;">
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
