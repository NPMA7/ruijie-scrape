# Ruijie Scraper & Backend

Node.js application for logging in, scraping L2TP and PPPoE monitor data from Ruijie Cloud in parallel, persisting it to a PostgreSQL database, and exposing a REST API for device actions.

## Prasyarat

- Node.js (v18+) & npm
- PostgreSQL database
- Google Chrome / Chromium (terinstal pada sistem beserta Chromium-Driver untuk automasi headless browser).

  **Untuk sistem Linux (Debian/Ubuntu):**
  Pastikan Chromium dan Chromium-Driver terinstal beserta seluruh pustaka (libraries) pendukungnya dengan perintah berikut:
  ```bash
  sudo apt update && sudo apt install -y chromium chromium-driver
  ```

## Instalasi

1. Clone repository atau copy semua file ke direktori Anda.
2. Copy file `.env.example` menjadi `.env` dan isi kredensial Anda:
   ```bash
   cp .env.example .env
   ```
3. Sesuaikan konfigurasi pada file `.env` (Email, Password Ruijie, Kredensial Database, Host dan Port Nocr).
4. Install dependensi Node.js:
   ```bash
   npm install
   ```

## Penggunaan

### 1. Ruijie Scraper (Daemon Paralel)
Script ini berjalan di latar belakang untuk melakukan login otomatis (jika sesi habis) dan menarik data monitor perangkat L2TP dan PPPoE secara paralel pada satu terminal.
```bash
node src/scraper.js
```

### 2. Mode Debug (Tanpa Database)
Jika Anda ingin menjalankan monitor tanpa melakukan penyimpanan data ke database PostgreSQL (misalnya untuk pengujian koneksi ke Ruijie Cloud dan print log ke terminal saja), Anda dapat mengaktifkannya melalui salah satu cara berikut:
- **Melalui File `.env`**: Set variabel `DEBUG="true"` pada file `.env`.
- **Melalui CLI Argument**: Tambahkan flag `--debug` saat menjalankan script:
  ```bash
  node src/scraper.js --debug
  ```

### 3. Backend REST API Service (via Express & Unified Scraper)
Jalankan server backend Node.js untuk mengekspos REST API aksi perangkat, manual scraping, sekaligus mengaktifkan daemon scraper L2TP dan PPPoE di latar belakang:
```bash
npm start
```
*Secara default server berjalan di `http://localhost:5000` (atau sesuaikan port via env `PORT`).*

#### A. Mengirim Perintah Reboot Perangkat
Kirimkan request HTTP POST ke endpoint `/api/reboot`.

- **Endpoint**: `POST http://localhost:5000/api/reboot`
- **Payload JSON**:
  ```json
  {
    "sn": "G1U52G022315",
    "type": "l2tp"
  }
  ```
  *(Pilihan `type` adalah `"l2tp"` atau `"pppoe"`. Default-nya `"l2tp"`).*

- **Contoh Request cURL**:
  ```bash
  curl -X POST http://localhost:5000/api/reboot \
    -H "Content-Type: application/json" \
    -d '{"sn": "G1U52G022315", "type": "l2tp"}'
  ```

#### B. Memicu Scraping Manual & Mendapatkan Data Real-Time
Kirimkan request HTTP POST ke endpoint `/api/scrape` untuk memicu penarikan data secara manual dan mendapatkan hasil scraping dalam format JSON (sangat berguna terutama saat mode debug aktif tanpa database).

- **Endpoint**: `POST http://localhost:5000/api/scrape`
- **Payload JSON**:
  ```json
  {
    "type": "l2tp"
  }
  ```
  *(Pilihan `type` adalah `"l2tp"` atau `"pppoe"`. Default-nya `"l2tp"`).*

- **Contoh Request cURL**:
  ```bash
  curl -X POST http://localhost:5000/api/scrape \
    -H "Content-Type: application/json" \
    -d '{"type": "l2tp"}'
  ```

- **Mendapatkan data cache cepat (tanpa re-scrape)**:
  ```bash
  GET http://localhost:5000/api/scrape?type=l2tp
  ```

#### C. Mengambil URL Tunnel eWeb Perangkat
Kirimkan request HTTP POST ke endpoint `/api/eweb` untuk membuat sesi tunnel dan mendapatkan URL akses manajemen web perangkat AP secara langsung.

- **Endpoint**: `POST http://localhost:5000/api/eweb`
- **Payload JSON**:
  ```json
  {
    "sn": "G1U52G022315",
    "type": "l2tp"
  }
  ```
  *(Pilihan `type` adalah `"l2tp"` atau `"pppoe"`. Default-nya `"l2tp"`).*

- **Contoh Respons Sukses**:
  ```json
  {
    "message": "Tunnel eWeb berhasil dibuat.",
    "urls": {
      "domainUrl": "https://xxxx.ruijienetworks.com/...",
      "ipUrl": "http://192.168.x.x/...",
      "useUrl": "https://xxxx.ruijienetworks.com/..."
    }
  }
  ```

- **Contoh Request cURL**:
  ```bash
  curl -X POST http://localhost:5000/api/eweb \
    -H "Content-Type: application/json" \
    -d '{"sn": "G1U52G022315", "type": "l2tp"}'
  ```

#### D. Mengganti Nama (Alias) Perangkat
Kirimkan request HTTP POST ke endpoint `/api/rename` untuk mengubah nama alias sebuah perangkat.

- **Endpoint**: `POST http://localhost:5000/api/rename`
- **Payload JSON**:
  ```json
  {
    "sn": "G1U52G022315",
    "type": "l2tp",
    "newAlias": "NamaBaruPerangkat"
  }
  ```

- **Contoh Request cURL**:
  ```bash
  curl -X POST http://localhost:5000/api/rename \
    -H "Content-Type: application/json" \
    -d '{"sn": "G1U52G022315", "type": "l2tp", "newAlias": "AP-Kantor-Baru"}'
  ```

#### E. Mendapatkan Daftar Site / Project Group
Endpoint untuk mengambil daftar project group / site name yang unik dari database (atau dari in-memory cache jika database dinonaktifkan).
- **Endpoint**: `GET http://localhost:5000/api/sites?type=l2tp`
- **Query Parameter**:
  - `type`: `"l2tp"` atau `"pppoe"`. Default `"l2tp"`.
- **Contoh Respons Sukses**:
  ```json
  {
    "sites": [
      {
        "group_id": "8289421",
        "group_name": "Arjasari_Ancolmekar"
      }
    ]
  }
  ```

#### F. Mengambil Data Trafik & Trend Chart Site/AP
Endpoint untuk memuat data total trafik (Uplink/Downlink) serta daftar titik grafik historis (Trend) berdasarkan rentang waktu tertentu.
- **Endpoint**: `POST http://localhost:5000/api/traffic`
- **Payload JSON**:
  ```json
  {
    "groupId": "8289421",
    "rangeType": "today",
    "type": "l2tp",
    "deviceSn": "G1U52G9000587"
  }
  ```
  - `groupId` (wajib): ID site / building group.
  - `rangeType` (wajib): Pilihan `"today"` (Last 24 Hours), `"7days"`, `"30days"`, atau `"custom"`.
  - `type` (opsional): `"l2tp"` atau `"pppoe"`. Default `"l2tp"`.
  - `deviceSn` (opsional): Serial number AP spesifik. Jika dikirimkan, API akan memfilter data klien dan total bytes untuk AP tersebut saja (berguna untuk site multi-AP di PPPoE). Jika kosong, akan menghitung total agregat seluruh AP di site.
  - `startDate` (wajib jika `rangeType` bernilai `"custom"`): String tanggal format `YYYYMMDD` (contoh `"20260701"`).
  - `endDate` (wajib jika `rangeType` bernilai `"custom"`): String tanggal format `YYYYMMDD` (contoh `"20260716"`).

- **Contoh Respons Sukses**:
  ```json
  {
    "sitesTraffic": [
      {
        "groupId": "8289421",
        "siteName": "Arjasari_Ancolmekar - Arjasari_ancolmekar",
        "totalTrafficBytes": 347140719,
        "inTrafficBytes": 52071108,
        "outTrafficBytes": 295069611,
        "clients": 5,
        "trendPoints": [
          {
            "time": "2026-07-17 08:10:00",
            "in": 52071108,
            "out": 295069611,
            "total": 347140719
          }
        ]
      }
    ]
  }
  ```

## Mekanisme Sinkronisasi Real-Time

Untuk mempercepat pembaruan dashboard di aplikasi utama (`nocr-app`), script scraper ini dilengkapi dengan integrasi notifikasi HTTP lokal:
- **Alur Notifikasi:** Setelah selesai meng-upsert data terbaru ke PostgreSQL dan melakukan commit transaksi, script scraper akan mengirimkan permintaan HTTP POST ke server lokal:
  ```http
  POST http://<NOCR_HOST>:<NOCR_PORT>/api/mappings/sync-notify
  ```
- **Konfigurasi Lingkungan (`.env`):**
  Definisikan alamat host dan port aplikasi Node.js (`nocr`) pada file `.env` repositori ini:
  ```env
  NOCR_HOST="127.0.0.1"
  NOCR_PORT="9371"
  ```

## Struktur File Utama

- `src/auth_login.js` : Script helper untuk login menggunakan Selenium (akun L2TP & PPPoE) dan mengambil cookies.
- `src/scraper.js` : Script utama (daemon paralel) yang menarik data API Ruijie L2TP & PPPoE secara paralel, memasukkan data ke PostgreSQL, serta mengirimkan notifikasi.
- `src/server.js` : Server backend utama Node.js Express yang menyediakan endpoint REST API untuk aksi perangkat Ruijie (seperti `/api/reboot`), manual scraping, dan mengendalikan daemons.
- `data/` : Folder tempat penyimpanan cookies dan tabel skema database.
- `public/` : Folder tempat antarmuka web (UI) dashboard.
- `package.json` : Konfigurasi dependency Node.js untuk backend.
- `.env.example` : Template file konfigurasi.
