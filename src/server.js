const express = require('express');
const fs = require('fs');
const https = require('https');
const querystring = require('querystring');
const { exec } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Load Port, hindari bentrok dengan NOCR_PORT (default 3000) jika didefinisikan berbeda
const PORT = process.env.PORT || 5000;

// Konfigurasi akun dan file session berdasarkan tipe koneksi
const CONFIG = {
  l2tp: {
    cookieFile: path.join(__dirname, "../data/cookies/ruijie_cookies_l2tp.json"),
    loginCommand: "node src/auth_login.js l2tp",
    username: process.env.RUIJIE_EMAIL_1,
    groupId: "7940586"
  },
  pppoe: {
    cookieFile: path.join(__dirname, "../data/cookies/ruijie_cookies_pppoe.json"),
    loginCommand: "node src/auth_login.js pppoe",
    username: process.env.RUIJIE_EMAIL_2,
    groupId: "7904031"
  }
};

/**
 * Membaca file cookie dan mengembalikan string header Cookie
 */
function getCookieString(cookieFile) {
  if (fs.existsSync(cookieFile)) {
    try {
      const data = fs.readFileSync(cookieFile, 'utf8');
      const cookies = JSON.parse(data);
      return Object.entries(cookies)
        .map(([key, val]) => `${key}=${val}`)
        .join('; ');
    } catch (e) {
      console.error(`[ERROR] Gagal membaca file cookie ${cookieFile}:`, e.message);
    }
  }
  return null;
}

/**
 * Menjalankan script login secara otomatis untuk memperbarui cookie
 */
function runLoginScript(command) {
  return new Promise((resolve, reject) => {
    console.log(`[INFO] Mencoba login otomatis dengan perintah: ${command}`);
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`[ERROR] Gagal menjalankan perintah login: ${command}`);
        reject(error);
      } else {
        console.log(`[INFO] Berhasil login.`);
        resolve(stdout);
      }
    });
  });
}

/**
 * Mengirim request POST reboot ke Ruijie Cloud API
 */
function sendRebootRequest(cookieStr, sn, username) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({
      snList: JSON.stringify([sn]),
      macc_groupTimezoneStr: "GMT+7:00",
      currentUsername: username
    });

    const options = {
      hostname: 'cloud-as.ruijienetworks.com',
      port: 443,
      path: '/admin3/monitor/reboot',
      method: 'POST',
      headers: {
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://cloud-as.ruijienetworks.com',
        'Referer': 'https://cloud-as.ruijienetworks.com/admin3/',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Mengirim request POST ganti nama alias ke Ruijie Cloud API
 */
function sendRenameRequest(cookieStr, sn, hostname, username) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({
      sn: sn,
      hostname: hostname,
      macc_groupTimezoneStr: "GMT+7:00",
      currentUsername: username
    });

    const options = {
      hostname: 'cloud-as.ruijienetworks.com',
      port: 443,
      path: '/admin3/monitor/postDevInfo',
      method: 'POST',
      headers: {
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://cloud-as.ruijienetworks.com',
        'Referer': 'https://cloud-as.ruijienetworks.com/admin3/',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', (e) => { reject(e); });
    req.write(postData);
    req.end();
  });
}

/**
 * Helper generik untuk mengirim request POST ke Ruijie Cloud API
 */
function makeRuijiePost(path, cookieStr, postData) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'cloud-as.ruijienetworks.com',
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://cloud-as.ruijienetworks.com',
        'Referer': 'https://cloud-as.ruijienetworks.com/admin3/',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', (e) => { reject(e); });
    req.write(postData);
    req.end();
  });
}

/**
 * Alur berurutan untuk mendapatkan link tunnel remote eWeb dari Ruijie Cloud
 */
async function getEWebTunnelUrl(cookieStr, sn, groupId, username) {
  // 1. getEnetPasswordStatus
  const pwdData = querystring.stringify({
    groupId: groupId,
    macc_groupTimezoneStr: "GMT+7:00",
    currentUsername: username
  });
  const pwdRes = await makeRuijiePost('/admin3/config/getEnetPasswordStatus', cookieStr, pwdData);
  console.log(`[DEBUG] getEnetPasswordStatus response:`, pwdRes.body);

  // 2. getTunnelAbility
  const abilityData = querystring.stringify({
    sn: sn,
    macc_groupTimezoneStr: "GMT+7:00",
    currentUsername: username
  });
  const abilityRes = await makeRuijiePost('/admin3/config/getTunnelAbility', cookieStr, abilityData);
  console.log(`[DEBUG] getTunnelAbility response:`, abilityRes.body);

  let adminProtocol = 'HTTP';
  try {
    const abilityObj = JSON.parse(abilityRes.body);
    if (abilityObj.code === 0 && abilityObj.data) {
      // Jika device hanya mendukung HTTPS atau direkomendasikan HTTPS
      if (abilityObj.data.supportHttps === true || abilityObj.data.adminProtocol === 'HTTPS') {
        adminProtocol = 'HTTPS';
      }
    }
  } catch (e) {
    // Abaikan error parsing, gunakan default HTTP
  }
  console.log(`[DEBUG] Menggunakan protokol admin: ${adminProtocol}`);

  // 3. getTunnelWebUrl
  const webUrlData = querystring.stringify({
    adminProtocol: adminProtocol,
    sn: sn,
    isDirectCreate: 'false',
    remoteHost: '127.0.0.1',
    operation_source: 'network_top_eweb',
    macc_groupTimezoneStr: "GMT+7:00",
    currentUsername: username
  });
  const webUrlRes = await makeRuijiePost('/admin3/config/getTunnelWebUrl', cookieStr, webUrlData);
  if (webUrlRes.statusCode !== 200) {
    throw new Error(`getTunnelWebUrl HTTP status ${webUrlRes.statusCode}`);
  }

  if (webUrlRes.body.trim().startsWith('<')) {
    throw new Error("Session Expired (Response is HTML)");
  }

  console.log(`[DEBUG] getTunnelWebUrl response:`, webUrlRes.body);
  const webUrlObj = JSON.parse(webUrlRes.body);
  if (webUrlObj.code !== 0) {
    throw new Error(`getTunnelWebUrl error: ${webUrlObj.msg || 'Unknown'}`);
  }

  const tunnelId = webUrlObj.data && webUrlObj.data.tunnelId;
  const directData = webUrlObj.data;
  if (directData && (directData.useUrl || directData.domainUrl || directData.ipUrl)) {
    const toStr = (v) => Array.isArray(v) ? v[0] : v;
    const useUrl = toStr(directData.useUrl) || null;
    const domainUrl = toStr(directData.domainUrl) || null;
    const ipUrl = toStr(directData.ipUrl) || null;
    if (useUrl || domainUrl || ipUrl) {
      console.log(`[INFO] Tunnel eWeb langsung tersedia`);
      return { useUrl, domainUrl, ipUrl };
    }
  }

  if (!tunnelId) {
    throw new Error("No tunnelId returned from getTunnelWebUrl");
  }

  // 4. getTunnelWebUrlTunnel dengan polling (max 10 kali, delay 1.5 detik)
  const tunnelData = querystring.stringify({
    sn: sn,
    tunnelId: tunnelId,
    targetSn: sn,
    macc_groupTimezoneStr: "GMT+7:00",
    currentUsername: username
  });
  
  for (let attempt = 1; attempt <= 10; attempt++) {
    const tunnelRes = await makeRuijiePost('/admin3/config/getTunnelWebUrlTunnel', cookieStr, tunnelData);
    if (tunnelRes.statusCode !== 200) {
      throw new Error(`getTunnelWebUrlTunnel HTTP status ${tunnelRes.statusCode}`);
    }

    console.log(`[DEBUG] getTunnelWebUrlTunnel response (percobaan ${attempt}):`, tunnelRes.body);
    const tunnelObj = JSON.parse(tunnelRes.body);
    if (tunnelObj.code === 0 && tunnelObj.data) {
      const d = tunnelObj.data;
      const toStr = (v) => Array.isArray(v) ? v[0] : v;
      const useUrl = toStr(d.useUrl) || null;
      const domainUrl = toStr(d.domainUrl) || null;
      const ipUrl = toStr(d.ipUrl) || null;
      if (useUrl || domainUrl || ipUrl) {
        return { useUrl, domainUrl, ipUrl };
      }
    }

    if (attempt < 10) {
      console.log(`[INFO] Tunnel eWeb belum siap (percobaan ${attempt}/10), menunggu 1.5 detik...`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      throw new Error(`Gagal membuat tunnel eWeb: ${tunnelObj.msg || 'Unknown error'}`);
    }
  }
}


/**
 * Endpoint POST /api/reboot
 * Body: { "sn": "KODE_SN", "type": "l2tp" | "pppoe" }
 */
app.post('/api/reboot', async (req, res) => {
  const { sn, type } = req.body;

  if (!sn) {
    return res.status(400).json({ error: "Serial Number (sn) wajib diisi." });
  }

  const connType = (type || 'l2tp').toLowerCase();
  const cfg = CONFIG[connType];

  if (!cfg) {
    return res.status(400).json({ error: `Tipe koneksi '${type}' tidak valid. Harus 'l2tp' atau 'pppoe'.` });
  }

  if (!cfg.username) {
    return res.status(500).json({ error: `Email kredensial untuk tipe '${connType}' belum dikonfigurasi di file .env.` });
  }

  // Helper fungsi rekursif untuk eksekusi perintah dengan retry jika session expired
  const executeRebootWithRetry = async (retryOnExpiry = true) => {
    let cookieStr = getCookieString(cfg.cookieFile);

    // Jika cookie belum ada, picu proses login terlebih dahulu
    if (!cookieStr) {
      console.log(`[INFO] Sesi/cookie tidak ditemukan untuk tipe ${connType}. Memicu login otomatis...`);
      try {
        await runLoginScript(cfg.loginCommand);
        cookieStr = getCookieString(cfg.cookieFile);
      } catch (err) {
        return { success: false, statusCode: 500, error: `Gagal login otomatis: ${err.message}` };
      }

      if (!cookieStr) {
        return { success: false, statusCode: 500, error: "Gagal memuat cookie setelah proses login otomatis." };
      }
    }

    try {
      const result = await sendRebootRequest(cookieStr, sn, cfg.username);

      if (result.statusCode === 200) {
        let jsonResponse;
        try {
          jsonResponse = JSON.parse(result.body);
        } catch (e) {
          // Jika gagal parse JSON, kemungkinan besar sesi habis dan Ruijie redirect ke halaman HTML login
          if (retryOnExpiry) {
            console.log("[WARN] Respon bukan JSON (Sesi kemungkinan kadaluwarsa). Memicu login ulang...");
            try {
              await runLoginScript(cfg.loginCommand);
              return await executeRebootWithRetry(false); // Matikan retry untuk mencegah loop abadi
            } catch (err) {
              return { success: false, statusCode: 500, error: `Gagal login ulang: ${err.message}` };
            }
          } else {
            return { success: false, statusCode: 500, error: "Gagal parsing respon JSON dari Ruijie Cloud." };
          }
        }

        return { success: true, statusCode: 200, data: jsonResponse };
      } else if ((result.statusCode === 401 || result.statusCode === 403) && retryOnExpiry) {
        console.log(`[WARN] HTTP ${result.statusCode} diterima (Sesi tidak sah). Memicu login ulang...`);
        try {
          await runLoginScript(cfg.loginCommand);
          return await executeRebootWithRetry(false);
        } catch (err) {
          return { success: false, statusCode: 500, error: `Gagal login ulang: ${err.message}` };
        }
      } else {
        return { success: false, statusCode: result.statusCode, error: `HTTP ${result.statusCode}: ${result.body}` };
      }
    } catch (err) {
      return { success: false, statusCode: 500, error: `Kesalahan jaringan/koneksi API: ${err.message}` };
    }
  };

  console.log(`[INFO] Request reboot diterima - SN: ${sn} | Tipe: ${connType.toUpperCase()}`);
  const result = await executeRebootWithRetry();

  if (result.success) {
    const data = result.data;
    if (data.code === 0) {
      return res.status(200).json({
        message: "Perintah reboot berhasil dikirim.",
        response: data
      });
    } else {
      return res.status(400).json({
        error: `Gagal mengeksekusi reboot: ${data.msg}`,
        response: data
      });
    }
  } else {
    return res.status(result.statusCode).json({ error: result.error });
  }
});

/**
 * Endpoint POST /api/rename
 * Body: { "sn": "KODE_SN", "alias": "NAMA_BARU", "type": "l2tp" | "pppoe" }
 */
app.post('/api/rename', async (req, res) => {
  const { sn, alias, type } = req.body;
  const connType = (type || 'l2tp').toLowerCase();

  if (!sn) {
    return res.status(400).json({ error: "Serial Number (sn) wajib diisi." });
  }
  if (!alias) {
    return res.status(400).json({ error: "Nama Alias (alias) baru wajib diisi." });
  }

  const cfg = CONFIG[connType];
  if (!cfg) {
    return res.status(400).json({ error: `Tipe koneksi '${connType}' tidak valid.` });
  }

  if (!cfg.username) {
    return res.status(500).json({ error: `Email kredensial untuk tipe '${connType}' belum dikonfigurasi di file .env.` });
  }

  // Helper fungsi rekursif untuk eksekusi perintah dengan retry jika session expired
  const executeRenameWithRetry = async (retryOnExpiry = true) => {
    let cookieStr = getCookieString(cfg.cookieFile);

    // Jika cookie belum ada, picu proses login terlebih dahulu
    if (!cookieStr) {
      console.log(`[INFO] Sesi/cookie tidak ditemukan untuk tipe ${connType}. Memicu login otomatis...`);
      try {
        await runLoginScript(cfg.loginCommand);
        cookieStr = getCookieString(cfg.cookieFile);
      } catch (err) {
        return { success: false, statusCode: 500, error: `Gagal login otomatis: ${err.message}` };
      }

      if (!cookieStr) {
        return { success: false, statusCode: 500, error: "Gagal memuat cookie setelah proses login otomatis." };
      }
    }

    try {
      const result = await sendRenameRequest(cookieStr, sn, alias, cfg.username);

      if (result.statusCode === 200) {
        let jsonResponse;
        try {
          jsonResponse = JSON.parse(result.body);
        } catch (e) {
          if (retryOnExpiry) {
            console.log("[WARN] Respon bukan JSON (Sesi kemungkinan kadaluwarsa). Memicu login ulang...");
            try {
              await runLoginScript(cfg.loginCommand);
              return await executeRenameWithRetry(false);
            } catch (err) {
              return { success: false, statusCode: 500, error: `Gagal login ulang: ${err.message}` };
            }
          } else {
            return { success: false, statusCode: 500, error: "Gagal parsing respon JSON dari Ruijie Cloud." };
          }
        }

        return { success: true, statusCode: 200, data: jsonResponse };
      } else if ((result.statusCode === 401 || result.statusCode === 403) && retryOnExpiry) {
        console.log(`[WARN] HTTP ${result.statusCode} diterima (Sesi tidak sah). Memicu login ulang...`);
        try {
          await runLoginScript(cfg.loginCommand);
          return await executeRenameWithRetry(false);
        } catch (err) {
          return { success: false, statusCode: 500, error: `Gagal login ulang: ${err.message}` };
        }
      } else {
        return { success: false, statusCode: result.statusCode, error: `HTTP ${result.statusCode}: ${result.body}` };
      }
    } catch (err) {
      return { success: false, statusCode: 500, error: `Kesalahan jaringan/koneksi API: ${err.message}` };
    }
  };

  console.log(`[INFO] Request ganti nama diterima - SN: ${sn} | Alias: ${alias} | Tipe: ${connType.toUpperCase()}`);
  const result = await executeRenameWithRetry();

  if (result.success) {
    const data = result.data;
    if (data.code === 0) {
      return res.status(200).json({
        message: "Perubahan nama alias berhasil dikirim.",
        response: data
      });
    } else {
      return res.status(400).json({
        error: `Gagal mengubah nama alias: ${data.msg}`,
        response: data
      });
    }
  } else {
    return res.status(result.statusCode).json({ error: result.error });
  }
});

/**
 * Endpoint POST /api/eweb
 * Body: { "sn": "KODE_SN", "type": "l2tp" | "pppoe" }
 */
app.post('/api/eweb', async (req, res) => {
  const { sn, type } = req.body;
  const connType = (type || 'l2tp').toLowerCase();

  if (!sn) {
    return res.status(400).json({ error: "Serial Number (sn) wajib diisi." });
  }

  const cfg = CONFIG[connType];
  if (!cfg) {
    return res.status(400).json({ error: `Tipe koneksi '${connType}' tidak valid.` });
  }

  if (!cfg.username) {
    return res.status(500).json({ error: `Email kredensial untuk tipe '${connType}' belum dikonfigurasi di file .env.` });
  }

  // Cari groupId dari cache device, atau gunakan default dari config
  let groupId = cfg.groupId;
  const cachedDevices = express_device_cache[connType] || [];
  const foundDevice = cachedDevices.find(d => d.sn === sn);
  if (foundDevice && foundDevice.group_id) {
    groupId = foundDevice.group_id;
  }

  const executeEWebWithRetry = async (retryOnExpiry = true) => {
    let cookieStr = getCookieString(cfg.cookieFile);

    if (!cookieStr) {
      console.log(`[INFO] Sesi/cookie tidak ditemukan untuk tipe ${connType}. Memicu login otomatis...`);
      try {
        await runLoginScript(cfg.loginCommand);
        cookieStr = getCookieString(cfg.cookieFile);
      } catch (err) {
        return { success: false, statusCode: 500, error: `Gagal login otomatis: ${err.message}` };
      }

      if (!cookieStr) {
        return { success: false, statusCode: 500, error: "Gagal memuat cookie setelah proses login otomatis." };
      }
    }

    try {
      const tunnelUrls = await getEWebTunnelUrl(cookieStr, sn, groupId, cfg.username);
      return { success: true, statusCode: 200, urls: tunnelUrls };
    } catch (err) {
      const errMsg = err.message;
      if (retryOnExpiry) {
        console.log(`[WARN] Koneksi eWeb gagal (Mencoba login ulang): ${errMsg}`);
        try {
          await runLoginScript(cfg.loginCommand);
          return await executeEWebWithRetry(false);
        } catch (loginErr) {
          return { success: false, statusCode: 500, error: `Gagal login ulang: ${loginErr.message}` };
        }
      }
      return { success: false, statusCode: 500, error: errMsg };
    }
  };

  console.log(`[INFO] Request eWeb Tunnel diterima - SN: ${sn} | Tipe: ${connType.toUpperCase()} | Group ID: ${groupId}`);
  const result = await executeEWebWithRetry();

  if (result.success) {
    return res.status(200).json({
      message: "Tunnel eWeb berhasil dibuat.",
      urls: result.urls
    });
  } else {
    return res.status(result.statusCode).json({ error: result.error });
  }
});

// Import scraper module untuk memicu manual scraping
const ruijieScraper = require('./scraper');

// Cache in-memory untuk menyimpan data terbaru dari background daemon
const express_device_cache = {
  l2tp: [],
  pppoe: []
};

// Isi cache awal dari Database jika tidak dalam mode debug
// Isi cache awal dari Database jika tidak dalam mode debug
const DB_DEBUG_MODE = (process.env.DEBUG || "false").toLowerCase() === "true";
let dbPool = null;

if (!DB_DEBUG_MODE) {
  const pg = require('pg');
  dbPool = new pg.Pool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });

  dbPool.query("SELECT * FROM ruijie_devices", (err, res) => {
    if (err) {
      console.warn("[WARN] Gagal memuat cache awal dari Database:", err.message);
    } else if (res.rows) {
      res.rows.forEach(row => {
        const connType = (row.connection_type || 'l2tp').toLowerCase();
        if (express_device_cache[connType]) {
          const payloadItem = {
            sn: row.sn,
            mac_address: row.mac_address,
            alias: row.alias,
            ip_address: row.ip_address,
            status: row.status,
            connection_type: row.connection_type,
            clients: row.clients,
            last_online: row.last_online,
            last_log_history: row.last_log_history,
            updated_at: row.updated_at,
            radio1_power: row.radio1_power,
            radio2_power: row.radio2_power,
            offline_reason: row.offline_reason,
            group_id: row.group_id,
            radio1_channel_util: row.radio1_channel_util,
            radio2_channel_util: row.radio2_channel_util,
            remark: row.remark,
            hardware_version: row.hardware_version,
            product_type: row.product_type,
            common_type: row.common_type,
            product_class: row.product_class,
            radio1_channel: row.radio1_channel,
            radio2_channel: row.radio2_channel,
            group_name: row.group_name,
            dev_mode: row.dev_mode,
            sta_nums: row.sta_nums,
            cpe_ip: row.cpe_ip,
            recommend_software_version: row.recommend_software_version,
            software_version: row.software_version
          };
          if (row.last_offline) {
            payloadItem.last_offline = row.last_offline;
          }
          express_device_cache[connType].push(payloadItem);
        }
      });
      console.log(`[INFO] Cache awal terisi dari database: ${express_device_cache.l2tp.length} L2TP, ${express_device_cache.pppoe.length} PPPoE`);
    }
  });
}

/**
 * Endpoint GET/POST /api/scrape
 * Query/Body: { "type": "l2tp" | "pppoe" }
 */
app.all('/api/scrape', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed. Gunakan GET atau POST." });
  }

  const connType = (req.query.type || req.body.type || 'l2tp').toLowerCase();
  
  if (connType !== 'l2tp' && connType !== 'pppoe') {
    return res.status(400).json({ error: `Tipe koneksi '${connType}' tidak valid. Harus 'l2tp' atau 'pppoe'.` });
  }

  try {
    // Jika GET, ambil langsung dari in-memory cache (sangat cepat, instan untuk pindah tab)
    if (req.method === 'GET') {
      const cached = express_device_cache[connType] || [];
      return res.status(200).json({
        message: `Mengambil data cache ${connType.toUpperCase()} berhasil.`,
        total_devices: cached.length,
        devices: cached
      });
    }

    // Jika POST, paksa lakukan penarikan data baru ke Ruijie Cloud
    const isFull = req.query.full === 'true' || req.body.full === true;
    console.log(`[INFO] Request scrape manual diterima (POST) - Tipe: ${connType.toUpperCase()} | Deep/Full: ${isFull}`);
    
    // Siapkan cache riwayat log yang ada saat ini untuk dikirim ke scraper
    const existingCacheMap = {};
    const cachedDevices = express_device_cache[connType] || [];
    cachedDevices.forEach(d => {
      if (d.sn) {
        existingCacheMap[d.sn] = d.last_log_history || d.last_offline_str || d.lastOfflineStr;
      }
    });

    const devices = await ruijieScraper.ambil_data_ruijie(connType, isFull, existingCacheMap);

    if (devices) {
      // Perbarui in-memory cache dengan data terbaru
      express_device_cache[connType] = devices;

      return res.status(200).json({
        message: `Scraping data ${connType.toUpperCase()} berhasil diselesaikan.`,
        total_devices: devices.length,
        devices: devices
      });
    } else {
      return res.status(500).json({ error: `Gagal mengambil data ${connType.toUpperCase()} dari Ruijie Cloud.` });
    }
  } catch (err) {
    console.error(`[ERROR] Gagal melakukan manual scrape:`, err.message);
    return res.status(500).json({ error: `Internal server error: ${err.message}` });
  }
});

/**
 * Endpoint GET /api/sites
 * Query: ?type=l2tp|pppoe
 */
app.get('/api/sites', async (req, res) => {
  const connType = (req.query.type || 'l2tp').toLowerCase();
  
  if (DB_DEBUG_MODE || !dbPool) {
    const cached = express_device_cache[connType] || [];
    const uniqueGroups = [];
    const seen = new Set();
    cached.forEach(d => {
      if (d.group_id && !seen.has(d.group_id)) {
        seen.add(d.group_id);
        uniqueGroups.push({ group_id: d.group_id, group_name: d.group_name || d.alias });
      }
    });
    return res.status(200).json({ sites: uniqueGroups });
  }

  try {
    const result = await dbPool.query(
      "SELECT DISTINCT group_id, group_name FROM ruijie_devices WHERE connection_type = $1 AND group_id IS NOT NULL ORDER BY group_name ASC",
      [connType.toUpperCase()]
    );
    return res.status(200).json({ sites: result.rows });
  } catch (err) {
    console.error("[ERROR] Gagal mengambil daftar site:", err.message);
    return res.status(500).json({ error: `Gagal mengambil daftar site: ${err.message}` });
  }
});

/**
 * Endpoint POST /api/traffic
 * Body: { "groupId": "...", "rangeType": "today"|"7days"|"30days"|"custom", "startDate": "YYYYMMDD", "endDate": "YYYYMMDD", "type": "l2tp"|"pppoe" }
 */
app.post('/api/traffic', async (req, res) => {
  const { groupId, rangeType, startDate, endDate, type, deviceSn } = req.body;
  const connType = (type || 'l2tp').toLowerCase();
  const cfg = CONFIG[connType];

  if (!cfg) {
    return res.status(400).json({ error: `Tipe koneksi '${type}' tidak valid.` });
  }

  let startStr = startDate;
  let endStr = endDate;
  
  const getGMT7Date = (offsetDays = 0) => {
    const d = new Date();
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const gmt7 = new Date(utc + 3600000 * 7);
    gmt7.setDate(gmt7.getDate() - offsetDays);
    const yyyy = gmt7.getFullYear();
    const mm = String(gmt7.getMonth() + 1).padStart(2, '0');
    const dd = String(gmt7.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  };

  const getGMT7DateYesterday = () => {
    return getGMT7Date(1);
  };

  if (rangeType === 'today') {
    startStr = getGMT7Date();
    endStr = getGMT7Date();
  } else if (rangeType === '7days') {
    startStr = getGMT7Date(7);
    endStr = getGMT7Date();
  } else if (rangeType === '30days') {
    startStr = getGMT7Date(30);
    endStr = getGMT7Date();
  }

  if (!startStr || !endStr) {
    return res.status(400).json({ error: "startDate dan endDate wajib diisi jika rangeType custom." });
  }

  const executeTrafficFetch = async (retryOnExpiry = true) => {
    let cookieStr = getCookieString(cfg.cookieFile);

    if (!cookieStr) {
      console.log(`[INFO] Sesi/cookie tidak ditemukan untuk tipe ${connType}. Memicu login otomatis...`);
      try {
        await runLoginScript(cfg.loginCommand);
        cookieStr = getCookieString(cfg.cookieFile);
      } catch (err) {
        throw new Error(`Gagal login otomatis: ${err.message}`);
      }
      if (!cookieStr) {
        throw new Error("Gagal memuat cookie setelah login.");
      }
    }

    // Build map of groupId -> groupName from DB
    const groupNameMap = {};
    if (!DB_DEBUG_MODE && dbPool) {
      try {
        const dbRes = await dbPool.query(
          "SELECT DISTINCT group_id, group_name FROM ruijie_devices WHERE connection_type = $1 AND group_id IS NOT NULL",
          [connType.toUpperCase()]
        );
        dbRes.rows.forEach(r => {
          if (r.group_id) groupNameMap[String(r.group_id)] = r.group_name;
        });
      } catch (e) {
        console.warn("[WARN] Gagal memuat groupNameMap dari DB:", e.message);
      }
    } else {
      const cached = express_device_cache[connType] || [];
      cached.forEach(d => {
        if (d.group_id) groupNameMap[String(d.group_id)] = d.group_name || d.alias;
      });
    }

    // CASE 1: Querying a specific group (site detail chart)
    if (groupId) {
      const exportPayload = querystring.stringify({
        order: 'asc',
        page: '1',
        orderBy: 'flow',
        limit: '100',
        type: 'TOP_APS',
        groupId: groupId,
        charType: rangeType === 'today' ? 'hour' : 'day',
        start: startStr,
        end: endStr,
        macc_groupTimezoneStr: "GMT+7:00",
        currentUsername: cfg.username,
        offset: '0'
      });

      const exportRes = await makeRuijiePost('/admin3/exportBuildingFlowBySn', cookieStr, exportPayload);
      if (exportRes.body.trim().startsWith('<') || exportRes.body === 'refresh') {
        if (retryOnExpiry) {
          console.log("[WARN] Sesi expired. Login ulang...");
          await runLoginScript(cfg.loginCommand);
          return await executeTrafficFetch(false);
        } else {
          throw new Error("Sesi expired.");
        }
      }

      let exportData;
      try {
        exportData = JSON.parse(exportRes.body);
      } catch (e) {
        throw new Error("Gagal parse JSON export.");
      }

      let totalTrafficBytes = 0;
      let totalClients = 0;
      let targetDevice = null;
      const deviceFlowList = exportData.snDataList || [];

      if (deviceSn) {
        targetDevice = deviceFlowList.find(d => String(d.sn).trim() === String(deviceSn).trim());
      }

      if (targetDevice) {
        totalTrafficBytes = parseInt(targetDevice.wifiUpDown) || 0;
        totalClients = parseInt(targetDevice.total) || 0;
      } else {
        deviceFlowList.forEach(d => {
          totalTrafficBytes += parseInt(d.wifiUpDown) || 0;
          totalClients += parseInt(d.total) || 0;
        });
      }

      const trendPayload = querystring.stringify({
        buildingId: groupId,
        businessType: 'MARKET',
        queryType: rangeType === 'today' ? 'today' : 'period',
        startDateStr: startStr,
        endDateStr: endStr,
        macc_groupTimezoneStr: "GMT+7:00",
        currentUsername: cfg.username
      });

      const trendRes = await makeRuijiePost('/admin3/flowTrend', cookieStr, trendPayload);
      
      let inTrafficBytes = 0;
      let outTrafficBytes = 0;
      let trendPoints = [];
      let rxRatio = 0.15;
      let txRatio = 0.85;

      if (!trendRes.body.trim().startsWith('<') && trendRes.body !== 'refresh') {
        try {
          const trendData = JSON.parse(trendRes.body);
          if (trendData.code === 0 && trendData.list && trendData.list.length > 0) {
            let sumRx = 0;
            let sumTx = 0;
            trendData.list.forEach(p => {
              sumRx += parseInt(p.rxBytes) || 0;
              sumTx += parseInt(p.txBytes) || 0;
              trendPoints.push({
                time: p.timeStamp_macc_groupTimezone || p.timeString,
                in: parseInt(p.rxBytes) || 0,
                out: parseInt(p.txBytes) || 0,
                total: (parseInt(p.rxBytes) || 0) + (parseInt(p.txBytes) || 0)
              });
            });
            const sumTotal = sumRx + sumTx;
            if (sumTotal > 0) {
              rxRatio = sumRx / sumTotal;
              txRatio = sumTx / sumTotal;
            }
          }
        } catch(e) {
          // ignore
        }
      }

      inTrafficBytes = Math.round(totalTrafficBytes * rxRatio);
      outTrafficBytes = totalTrafficBytes - inTrafficBytes;

      let siteName = groupNameMap[groupId] || `Site ${groupId}`;
      if (targetDevice && targetDevice.alias) {
        siteName = `${siteName} - ${targetDevice.alias}`;
      } else if (deviceFlowList.length > 0 && !groupNameMap[groupId]) {
        siteName = deviceFlowList[0].alias;
      }
      
      return {
        sitesTraffic: [{
          groupId: groupId,
          siteName: siteName,
          totalTrafficBytes,
          inTrafficBytes,
          outTrafficBytes,
          clients: totalClients,
          trendPoints: trendPoints
        }]
      };
    }

    // CASE 2: Querying all sites (Dashboard View)
    // Query the parent group to fetch all APs under this connection type in a single call
    const parentGroupId = cfg.groupId;
    const exportPayload = querystring.stringify({
      order: 'asc',
      page: '1',
      orderBy: 'flow',
      limit: '1000', // large limit to grab all APs at once
      type: 'TOP_APS',
      groupId: parentGroupId,
      charType: rangeType === 'today' ? 'hour' : 'day',
      start: startStr,
      end: endStr,
      macc_groupTimezoneStr: "GMT+7:00",
      currentUsername: cfg.username,
      offset: '0'
    });

    const exportRes = await makeRuijiePost('/admin3/exportBuildingFlowBySn', cookieStr, exportPayload);
    if (exportRes.body.trim().startsWith('<') || exportRes.body === 'refresh') {
      if (retryOnExpiry) {
        console.log("[WARN] Sesi expired. Login ulang...");
        await runLoginScript(cfg.loginCommand);
        return await executeTrafficFetch(false);
      } else {
        throw new Error("Sesi expired.");
      }
    }

    let exportData;
    try {
      exportData = JSON.parse(exportRes.body);
    } catch (e) {
      throw new Error("Gagal parse JSON export.");
    }

    if (exportData.code !== 0) {
      throw new Error(exportData.msg || "Ruijie returned error code");
    }

    // Fetch parent-level today's flowTrend to get overall RX/TX ratio
    const trendPayload = querystring.stringify({
      buildingId: parentGroupId,
      businessType: 'MARKET',
      queryType: 'today',
      startDateStr: getGMT7DateYesterday(),
      endDateStr: getGMT7Date(),
      macc_groupTimezoneStr: "GMT+7:00",
      currentUsername: cfg.username
    });

    const trendRes = await makeRuijiePost('/admin3/flowTrend', cookieStr, trendPayload);
    let rxRatio = 0.15;
    let txRatio = 0.85;

    if (!trendRes.body.trim().startsWith('<') && trendRes.body !== 'refresh') {
      try {
        const trendData = JSON.parse(trendRes.body);
        if (trendData.code === 0 && trendData.list && trendData.list.length > 0) {
          let sumRx = 0;
          let sumTx = 0;
          trendData.list.forEach(p => {
            sumRx += parseInt(p.rxBytes) || 0;
            sumTx += parseInt(p.txBytes) || 0;
          });
          const sumTotal = sumRx + sumTx;
          if (sumTotal > 0) {
            rxRatio = sumRx / sumTotal;
            txRatio = sumTx / sumTotal;
          }
        }
      } catch(e) {
        // ignore
      }
    }

    // Aggregate AP traffic by buildingId (subgroup/site ID)
    const siteAggregation = {};
    const apList = exportData.snDataList || [];
    apList.forEach(ap => {
      const bId = String(ap.buildingId || ap.groupId);
      if (!bId || bId === 'undefined' || bId === 'null') return;

      if (!siteAggregation[bId]) {
        siteAggregation[bId] = {
          groupId: bId,
          siteName: groupNameMap[bId] || ap.alias || `Site ${bId}`,
          totalTrafficBytes: 0,
          clients: 0
        };
      }
      siteAggregation[bId].totalTrafficBytes += parseInt(ap.wifiUpDown) || 0;
      siteAggregation[bId].clients += parseInt(ap.total) || 0;
    });

    const sitesTraffic = Object.values(siteAggregation).map(site => {
      const inTrafficBytes = Math.round(site.totalTrafficBytes * rxRatio);
      const outTrafficBytes = site.totalTrafficBytes - inTrafficBytes;
      return {
        ...site,
        inTrafficBytes,
        outTrafficBytes,
        trendPoints: []
      };
    });

    return { sitesTraffic };
  };

  console.log(`[INFO] Request traffic data - Range: ${rangeType} | Dates: ${startStr} - ${endStr} | Tipe: ${connType.toUpperCase()}`);
  
  try {
    const result = await executeTrafficFetch();
    return res.status(200).json(result);
  } catch (err) {
    console.error("[ERROR] Traffic fetch error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint internal untuk menerima update cache dari scraper daemon mandiri
 */
app.post('/api/internal/update-cache', (req, res) => {
  const { connType, devices } = req.body;
  if (connType && Array.isArray(devices)) {
    express_device_cache[connType] = devices;
    console.log(`[INFO] Cache terisi otomatis dari scraper daemon eksternal untuk tipe: ${connType.toUpperCase()} (${devices.length} perangkat)`);
  }
  return res.sendStatus(200);
});

// Jalankan Server & Daemon Scraper
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`Ruijie Features Backend berjalan di port ${PORT}`);
  console.log(`Endpoint:`);
  console.log(` - POST http://localhost:${PORT}/api/reboot`);
  console.log(` - POST http://localhost:${PORT}/api/rename`);
  console.log(` - POST http://localhost:${PORT}/api/eweb`);
  console.log(` - GET/POST http://localhost:${PORT}/api/scrape`);
  console.log(`==================================================`);
});
