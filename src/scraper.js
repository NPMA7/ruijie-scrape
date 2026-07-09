const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
require("dotenv").config();

// Debug Mode Configuration
const DEBUG_MODE =
  (process.env.DEBUG || "false").toLowerCase() === "true" ||
  process.argv.includes("--debug");

// CONFIGURATION
const API_URL =
  "https://cloud-as.ruijienetworks.com/admin3/monitor/getMonitorDeviceList";
const LOG_API_URL =
  "https://cloud-as.ruijienetworks.com/admin3/monitor/getAPLogsList";

// Database Configuration
let pool = null;
if (!DEBUG_MODE) {
  const pg = require("pg");
  pool = new pg.Pool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
}

const NOCR_HOST = process.env.NOCR_HOST || "127.0.0.1";
const NOCR_PORT = process.env.NOCR_PORT || "9371";

const INTERVAL_DETIK = 60;
const history_cache = {};
let cache_loaded = false;

/**
 * Memuat history cache dari database PostgreSQL
 */
async function muatCacheDariDB() {
  if (!pool) return;
  try {
    const res = await pool.query(
      "SELECT sn, last_online, last_log_history FROM ruijie_devices"
    );
    if (res.rows) {
      for (const row of res.rows) {
        if (row.sn) {
          history_cache[row.sn] = {
            lastOnline: row.last_online,
            lastOfflineStr: row.last_log_history || "Tidak ada riwayat",
          };
        }
      }
      console.log(
        `[INFO] Berhasil memuat ${res.rows.length} riwayat status dari database ke cache.`
      );
    }
  } catch (err) {
    console.warn(
      `[WARN] Gagal memuat riwayat status dari database ke cache: ${err.message}`
    );
  }
}

// Parameter Konfigurasi berdasarkan jenis koneksi
const CONFIGS = {
  l2tp: {
    name: "L2TP",
    cookieFile: path.join(__dirname, "../data/cookies/ruijie_cookies_l2tp.json"),
    loginCommand: "node src/auth_login.js l2tp",
    username: process.env.RUIJIE_EMAIL_1 || "",
    groupId: "7940586",
    connectionType: "L2TP",
    formatAlias: (ap) =>
      ap.aliasName || ap.name || ap.hostName || ap.remark || "TanpaAlias",
  },
  pppoe: {
    name: "PPPoE",
    cookieFile: path.join(__dirname, "../data/cookies/ruijie_cookies_pppoe.json"),
    loginCommand: "node src/auth_login.js pppoe",
    username: process.env.RUIJIE_EMAIL_2 || "",
    groupId: "7904031",
    connectionType: "PPPOE",
    formatAlias: (ap) => {
      let network =
        ap.groupName || ap.projectName || ap.networkName || "TanpaNetwork";
      if (network.includes(" / ")) {
        network = network.split(" / ")[0];
      }
      const alias_raw =
        ap.aliasName || ap.name || ap.hostName || ap.remark || "TanpaAlias";
      return `${network}-${alias_raw}`.toUpperCase();
    },
  },
};

/**
 * Membuat object Header request secara dinamis (mencegah tabrakan cookie antar proses)
 */
function getHeaders(cookieStr) {
  return {
    Cookie: cookieStr || "",
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, q=0.01) Chrome/148.0.0.0 Mobile Safari/537.36",
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    Origin: "https://cloud-as.ruijienetworks.com",
    Referer: "https://cloud-as.ruijienetworks.com/admin3/",
    "X-Requested-With": "XMLHttpRequest",
  };
}

/**
 * Membaca cookies dari file session
 */
function getCookieString(cookieFile) {
  if (fs.existsSync(cookieFile)) {
    try {
      const data = fs.readFileSync(cookieFile, "utf8");
      const cookies = JSON.parse(data);
      return Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    } catch (e) {
      // Abaikan error pembacaan
    }
  }
  return "";
}

/**
 * Menjalankan otomatisasi login selenium
 */
function jalankan_auto_login(connType) {
  const cfg = CONFIGS[connType];
  console.log(
    `[INFO] Mencoba login otomatis ${cfg.name} untuk mendapatkan Cookie baru...`,
  );
  return new Promise((resolve) => {
    exec(cfg.loginCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(
          `[ERROR] Perintah login '${cfg.loginCommand}' gagal dijalankan. Pastikan kredensial sudah diisi.`,
        );
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

function getWaktuSekarang() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - offset);
  return local.toISOString().replace("T", " ").substring(0, 19);
}

function getWaktuSekarangGMT7() {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const gmt7 = new Date(utc + 3600000 * 7);
  return gmt7.toISOString().replace("T", " ").substring(0, 19);
}

/**
 * Mengambil log status offline terakhir perangkat
 */
async function get_last_offline(sn, group_id, username, cookieStr) {
  const payload_log = new URLSearchParams({
    order: "desc",
    offset: "0",
    limit: "50",
    page: "1",
    rows: "50",
    log_type: "",
    sn: sn,
    days: "",
    groupId: group_id,
    macc_groupTimezoneStr: "GMT+7:00",
    currentUsername: username,
  });

  const headers = getHeaders(cookieStr);

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(LOG_API_URL, {
      method: "POST",
      headers: headers,
      body: payload_log,
      signal: controller.signal,
    });
    clearTimeout(id);

    if (res.status === 200) {
      const data = await res.json();
      if (data && data.rows) {
        const logs = data.rows;
        for (const log of logs) {
          const content = (
            String(log.logDetail || "") +
            " " +
            String(log.content || "")
          ).toLowerCase();
          const log_type = String(log.logType || "").toLowerCase();

          if (
            content.includes("offline") ||
            content.includes("putus") ||
            content.includes("disconnect") ||
            log_type.includes("offline") ||
            log_type.includes("reboot") ||
            content.includes("restart")
          ) {
            let waktu =
              log.operateTime_macc_groupTimezone ||
              log.operateTime ||
              log.createTimeStr ||
              log.updateTimeStr ||
              log.timeStr;
            if (typeof waktu === "number") {
              const date = new Date(waktu + 7 * 3600 * 1000);
              waktu = date.toISOString().replace("T", " ").substring(0, 19);
            }

            let jenis = "Offline";
            if (log_type.includes("reboot") || content.includes("restart")) {
              jenis = "Reboot";
            } else if (
              content.includes("online") ||
              content.includes("connect") ||
              content.includes("terhubung")
            ) {
              jenis = "Online";
            }

            return `${waktu} (${jenis})`;
          }
        }
        return "Tidak ada riwayat";
      }
    }
    return "Error API Log";
  } catch (err) {
    return "Error API Log";
  }
}

/**
 * Fungsi utama penarik data monitor perangkat dari Ruijie Cloud
 */
async function ambil_data_ruijie(connType, putaran_pertama = false, existing_cache = null) {
  const cfg = CONFIGS[connType];
  if (!cfg) {
    console.error(`[ERROR] Tipe koneksi '${connType}' tidak valid.`);
    return null;
  }

  // Muat cache dari database jika belum dimuat
  if (!cache_loaded && pool) {
    await muatCacheDariDB();
    cache_loaded = true;
  }

  const waktu_sekarang = getWaktuSekarang();
  try {
    const all_ap_list = [];
    let page = 1;
    const limit = 100;
    let total_records = "Tidak diketahui";

    while (true) {
      let cookieStr = getCookieString(cfg.cookieFile);
      if (!cookieStr) {
        console.log(
          `[INFO] Sesi/cookie tidak ditemukan untuk tipe ${cfg.name}. Memicu login otomatis...`,
        );
        if (await jalankan_auto_login(connType)) {
          cookieStr = getCookieString(cfg.cookieFile);
        } else {
          return null;
        }
      }

      const headers = getHeaders(cookieStr);
      const current_payload = new URLSearchParams({
        order: "asc",
        offset: "0",
        limit: String(limit),
        page: String(page),
        rows: String(limit),
        key: "",
        groupId: cfg.groupId,
        status: "",
        conf_sync: "",
        common_type: "AP",
        macc_groupTimezoneStr: "GMT+7:00",
        currentUsername: cfg.username,
      });

      const response = await fetch(API_URL, {
        method: "POST",
        headers: headers,
        body: current_payload,
      });

      if (response.status === 200) {
        let data;
        try {
          data = await response.json();
        } catch (e) {
          console.log(
            `[${waktu_sekarang}] Gagal parsing JSON untuk ${cfg.name}. Kemungkinan Cookie/Sesi telah berakhir.`,
          );
          if (await jalankan_auto_login(connType)) {
            console.log(
              "[INFO] Berhasil memperbarui sesi. Mengulangi pengambilan data...",
            );
            continue;
          } else {
            return null;
          }
        }

        if (data && data.rows && data.rows.length > 0) {
          all_ap_list.push(...data.rows);
          total_records = data.totalRecords || total_records;

          if (data.rows.length < limit) {
            break;
          }
          page += 1;
        } else {
          break;
        }
      } else if (response.status === 401 || response.status === 403) {
        console.log(
          `[${waktu_sekarang}] Gagal: Sesi ${cfg.name} telah berakhir atau ditolak. Mencoba auto-login...`,
        );
        if (await jalankan_auto_login(connType)) {
          continue;
        } else {
          return null;
        }
      } else {
        console.log(
          `[${waktu_sekarang}] Gagal mengambil data ${cfg.name}. HTTP Status: ${response.status}`,
        );
        return null;
      }
    }

    if (all_ap_list.length === 0) {
      console.log(`[${cfg.name}] Respons diterima, tetapi data kosong.`);
      return [];
    }

    console.log(
      `\n[${waktu_sekarang}] Data ${cfg.name} berhasil diambil (${all_ap_list.length} perangkat)!`,
    );

    const jumlah_online = all_ap_list.filter(
      (ap) => ap.onlineStatus === "ON",
    ).length;
    const jumlah_offline = all_ap_list.filter(
      (ap) => ap.onlineStatus === "OFF",
    ).length;

    console.log(
      `Total perangkat ${cfg.name}: ${total_records} (Online: ${jumlah_online}, Offline: ${jumlah_offline})`,
    );

    const db_payloads = [];
    const cookieStr = getCookieString(cfg.cookieFile);

    for (const ap of all_ap_list) {
      const mac = ap.mac || "N/A";
      const sn = ap.serialNumber || ap.sn || "";
      const group_id = ap.groupId || cfg.groupId;
      const status = ap.onlineStatus || "N/A";
      const alias = cfg.formatAlias(ap);
      const ip = ap.localIp || "N/A";

      const waktu_terakhir_ms = ap.lastOnline;
      let waktu_str = null;
      if (waktu_terakhir_ms && typeof waktu_terakhir_ms === "number") {
        const date = new Date(waktu_terakhir_ms + 7 * 3600 * 1000);
        waktu_str = date.toISOString().replace("T", " ").substring(0, 19);
      }

      const offline_time_ms = ap.offlineTime;
      let offline_str = null;
      if (offline_time_ms && typeof offline_time_ms === "number") {
        const date = new Date(offline_time_ms + 7 * 3600 * 1000);
        offline_str = date.toISOString().replace("T", " ").substring(0, 19);
      } else if (typeof offline_time_ms === "string") {
        try {
          const dt = new Date(offline_time_ms.replace(" ", "T") + "Z");
          dt.setHours(dt.getHours() + 7);
          offline_str = dt.toISOString().replace("T", " ").substring(0, 19);
        } catch (e) {
          offline_str = offline_time_ms;
        }
      }

      let last_offline_str = null;
      if (status === "OFF") {
        const waktu_tampil = offline_str || waktu_str;
        const status_tampil = waktu_tampil
          ? `OFF (Offline Sejak: ${waktu_tampil})`
          : "OFF";
      } else {
        const cached_data = history_cache[sn] || {};
        // Hanya ambil log offline jika putaran pertama DAN data lastOnline berubah/tidak cocok
        if (putaran_pertama && cached_data.lastOnline !== waktu_str) {
          process.stdout.write(
            `\rMengunduh log untuk ${alias.substring(0, 15)}...       `,
          );

          last_offline_str = await get_last_offline(
            sn,
            group_id,
            cfg.username,
            cookieStr,
          );
          if (last_offline_str !== "Error API Log") {
            history_cache[sn] = {
              lastOnline: waktu_str,
              lastOfflineStr: last_offline_str,
            };
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          // Cari riwayat log dari history_cache lokal, atau fallback ke existing_cache dari server.js
          const cachedVal = cached_data.lastOfflineStr;
          const externalVal = existing_cache ? existing_cache[sn] : null;
          
          last_offline_str = "Tidak ada riwayat";
          if (cachedVal && cachedVal !== "Tidak ada riwayat" && cachedVal !== "Error API Log") {
            last_offline_str = cachedVal;
          } else if (externalVal && externalVal !== "Tidak ada riwayat" && externalVal !== "Error API Log") {
            last_offline_str = externalVal;
          }
          
          // Simpan kembali ke cache lokal agar tetap konsisten
          if (last_offline_str !== "Tidak ada riwayat") {
            history_cache[sn] = {
              lastOnline: waktu_str,
              lastOfflineStr: last_offline_str
            };
          }
        }
      }

      const waktu_terakhir_offline = offline_str || waktu_str;
      const status_tampil =
        status === "OFF"
          ? offline_str || waktu_str
            ? `OFF (Offline Sejak: ${offline_str || waktu_str})`
            : "OFF"
          : `ON  (Terakhir Offline:  ${waktu_terakhir_offline}) | (Terakhir Online Kembali: ${last_offline_str})`;

      if (status === "ON" && putaran_pertama) {
        process.stdout.write("\r\u001b[K");
      }

      const sn_tampil = ap.serialNumber || ap.sn || "N/A";
      const klien = ap.staActiveNums !== undefined ? ap.staActiveNums : (ap.staNums || 0);

      console.log(
        ` - MAC: ${mac.padEnd(16)} | SN: ${sn_tampil.padEnd(15)} | IP: ${ip.padEnd(15)} | Klien: ${String(klien).padEnd(3)} | Status: ${status_tampil.padEnd(65)} | Nama: ${alias}`,
      );

      const payloadItem = {
        sn: sn_tampil,
        mac_address: mac,
        alias: alias,
        ip_address: ip,
        status: status,
        connection_type: cfg.connectionType,
        clients: isNaN(parseInt(klien)) ? 0 : parseInt(klien),
        last_online: waktu_str,
        last_offline: offline_str,
        last_log_history: last_offline_str,
        updated_at: getWaktuSekarangGMT7(),
        group_id: group_id,
        radio1_power: isNaN(parseInt(ap.radio1Power)) ? null : parseInt(ap.radio1Power),
        radio2_power: isNaN(parseInt(ap.radio2Power)) ? null : parseInt(ap.radio2Power),
        offline_reason: ap.offlineReason || null,
        radio1_channel_util: isNaN(parseInt(ap.radio1ChannelUtil)) ? null : parseInt(ap.radio1ChannelUtil),
        radio2_channel_util: isNaN(parseInt(ap.radio2ChannelUtil)) ? null : parseInt(ap.radio2ChannelUtil),
        remark: ap.remark || null,
        hardware_version: ap.hardwareVersion || null,
        product_type: ap.productType || null,
        common_type: ap.commonType || null,
        product_class: ap.productClass || null,
        radio1_channel: isNaN(parseInt(ap.radio1Channel)) ? null : parseInt(ap.radio1Channel),
        radio2_channel: isNaN(parseInt(ap.radio2Channel)) ? null : parseInt(ap.radio2Channel),
        group_name: ap.groupName || null,
        dev_mode: ap.devMode || null,
        sta_nums: isNaN(parseInt(ap.staNums)) ? null : parseInt(ap.staNums),
        cpe_ip: ap.cpeIp || null,
        recommend_software_version: ap.recommendSoftwareVersion || null,
        software_version: ap.softwareVersion || null
      };

      if (payloadItem.last_offline === null) {
        delete payloadItem.last_offline;
      }

      db_payloads.push(payloadItem);
    }

    if (db_payloads.length > 0) {
      if (DEBUG_MODE) {
        console.log(
          `[DEBUG] Mode debug aktif: ${db_payloads.length} data ${cfg.name} tidak disimpan ke Database.`,
        );
      } else {
        try {
          const values = [];
          const placeholders = [];
          let counter = 1;

          db_payloads.forEach((p) => {
            values.push(
              p.sn,
              p.mac_address,
              p.alias,
              p.ip_address,
              p.status,
              p.connection_type,
              p.clients,
              p.last_online,
              p.last_log_history,
              p.updated_at,
              p.radio1_power,
              p.radio2_power,
              p.offline_reason,
              p.group_id,
              p.radio1_channel_util,
              p.radio2_channel_util,
              p.remark,
              p.hardware_version,
              p.product_type,
              p.common_type,
              p.product_class,
              p.radio1_channel,
              p.radio2_channel,
              p.group_name,
              p.dev_mode,
              p.sta_nums,
              p.cpe_ip,
              p.recommend_software_version,
              p.software_version
            );
            
            // Build placeholders like ($1, $2, ... $29)
            let ph = [];
            for(let i=0; i<29; i++) { ph.push(`$${counter + i}`); }
            placeholders.push(`(${ph.join(", ")})`);
            counter += 29;
          });

          const query = `
            INSERT INTO ruijie_devices (
              sn, mac_address, alias, ip_address, status, connection_type, clients, last_online, last_log_history, updated_at,
              radio1_power, radio2_power, offline_reason, group_id, radio1_channel_util, radio2_channel_util, remark,
              hardware_version, product_type, common_type, product_class, radio1_channel, radio2_channel, group_name,
              dev_mode, sta_nums, cpe_ip, recommend_software_version, software_version
            )
            VALUES ${placeholders.join(", ")}
            ON CONFLICT (sn) DO UPDATE SET
              mac_address = EXCLUDED.mac_address,
              alias = EXCLUDED.alias,
              ip_address = EXCLUDED.ip_address,
              status = EXCLUDED.status,
              connection_type = EXCLUDED.connection_type,
              clients = EXCLUDED.clients,
              last_online = EXCLUDED.last_online,
              last_log_history = CASE 
                WHEN EXCLUDED.last_log_history IS NULL OR EXCLUDED.last_log_history = 'Tidak ada riwayat' OR EXCLUDED.last_log_history = 'Error API Log'
                THEN COALESCE(ruijie_devices.last_log_history, EXCLUDED.last_log_history)
                ELSE EXCLUDED.last_log_history
              END,
              updated_at = EXCLUDED.updated_at,
              radio1_power = EXCLUDED.radio1_power,
              radio2_power = EXCLUDED.radio2_power,
              offline_reason = EXCLUDED.offline_reason,
              group_id = EXCLUDED.group_id,
              radio1_channel_util = EXCLUDED.radio1_channel_util,
              radio2_channel_util = EXCLUDED.radio2_channel_util,
              remark = EXCLUDED.remark,
              hardware_version = EXCLUDED.hardware_version,
              product_type = EXCLUDED.product_type,
              common_type = EXCLUDED.common_type,
              product_class = EXCLUDED.product_class,
              radio1_channel = EXCLUDED.radio1_channel,
              radio2_channel = EXCLUDED.radio2_channel,
              group_name = EXCLUDED.group_name,
              dev_mode = EXCLUDED.dev_mode,
              sta_nums = EXCLUDED.sta_nums,
              cpe_ip = EXCLUDED.cpe_ip,
              recommend_software_version = EXCLUDED.recommend_software_version,
              software_version = EXCLUDED.software_version
          `;

          await pool.query(query, values);
          console.log(
            `[INFO] Berhasil menyimpan ${db_payloads.length} data ${cfg.name} ke Database PostgreSQL!`,
          );

          try {
            await fetch(
              `http://${NOCR_HOST}:${NOCR_PORT}/api/mappings/sync-notify`,
              { method: "POST" },
            );
          } catch (notify_err) {
            console.log(
              `[WARN] Gagal mengirim notifikasi sinkronisasi: ${notify_err.message}`,
            );
          }
        } catch (db_err) {
          console.error(
            `[ERROR] Exception saat menyimpan ke Database:`,
            db_err.message,
          );
        }
      }
    }

    // Kirim data update ke server Express menggunakan HTTP POST (mendukung eksekusi terpisah)
    try {
      const server_port = process.env.PORT || 5000;
      await fetch(`http://127.0.0.1:${server_port}/api/internal/update-cache`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connType: connType,
          devices: db_payloads
        })
      });
    } catch (e) {
      // Abaikan jika Express server belum dijalankan
    }

    return db_payloads;
  } catch (err) {
    console.log(
      `[${waktu_sekarang}] Terjadi kesalahan koneksi ${cfg.name}:`,
      err.message,
    );
    return null;
  }
}

/**
 * Loop background daemon untuk satu jenis koneksi
 */
async function startDaemon(connType) {
  const cfg = CONFIGS[connType];
  console.log(
    `Memulai monitoring Ruijie ${cfg.name} setiap ${INTERVAL_DETIK} detik...`,
  );
  let putaran_pertama = true;
  while (true) {
    await ambil_data_ruijie(connType, putaran_pertama);
    putaran_pertama = false;
    console.log("-".repeat(50));

    for (let s = INTERVAL_DETIK; s > 0; s--) {
      process.stdout.write(
        `\rMenunggu tarikan ${cfg.name} berikutnya dalam ${s} detik... \u001b[K`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    process.stdout.write("\r\u001b[K");
  }
}

async function main() {
  if (DEBUG_MODE) {
    console.log("[DEBUG] Mode debug aktif: Hasil tidak disimpan di database.");
  }

  // Jalankan pemantauan L2TP dan PPPoE secara paralel
  Promise.all([startDaemon("l2tp"), startDaemon("pppoe")]).catch((err) => {
    console.error("Terjadi error pada daemon monitoring:", err.message);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Terjadi error pada main daemon:", err.message);
  });
}

module.exports = { ambil_data_ruijie };
