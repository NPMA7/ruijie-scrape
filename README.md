# Ruijie Scraper

Scripts untuk login dan mengambil data monitor perangkat dari Ruijie Cloud dan menyimpannya ke database PostgreSQL.

## Prasyarat

- Python 3.x
- PostgreSQL database
- Google Chrome & ChromeDriver (untuk Selenium headless browser)

## Instalasi

1. Clone repository atau copy semua file ke direktori Anda.
2. Install dependensi Python:
   ```bash
   pip install -r requirements.txt
   ```
   *(Pastikan menginstall dependensi seperti `selenium`, `requests`, `python-dotenv`, `psycopg2-binary`)*
3. Copy file `.env.example` menjadi `.env` dan isi kredensial Anda:
   ```bash
   cp .env.example .env
   ```
4. Sesuaikan konfigurasi pada file `.env` (Email, Password Ruijie, Kredensial Database, Host dan Port Nocr).

## Penggunaan

### 1. Ruijie L2TP Scraper

Script ini akan login otomatis (jika sesi habis) menggunakan akun L2TP dan melakukan scrapping data secara berkala.
```bash
python3 ruijie_scraper.py
```

### 2. Ruijie PPPoE Scraper

Script ini akan login otomatis (jika sesi habis) menggunakan akun PPPoE dan melakukan scrapping data secara berkala.
```bash
python3 ruijie_scraper_pppoe.py
```

## Mekanisme Sinkronisasi Real-Time

Untuk mempercepat pembaruan dashboard di aplikasi utama (`nocr-app`), kedua script scraper ini dilengkapi dengan integrasi notifikasi HTTP lokal:

* **Alur Notifikasi:** Setelah selesai meng-upsert data terbaru ke PostgreSQL dan melakukan commit transaksi, script scraper akan mengirimkan permintaan HTTP POST ke server lokal:
  ```http
  POST http://<NOCR_HOST>:<NOCR_PORT>/api/mappings/sync-notify
  ```
* **Konfigurasi Lingkungan (`.env`):**
  Definisikan alamat host dan port aplikasi Node.js (`nocr`) pada file `.env` repositori ini:
  ```env
  # Host dan Port aplikasi utama Node.js (nocr) untuk pengiriman notifikasi
  NOCR_HOST="127.0.0.1"
  NOCR_PORT="9371"
  ```
* **Dampak:** Panggilan ini menginstruksikan backend server `nocr-app` untuk langsung membersihkan cache status internal dan memicu fungsi pemetaan status secara instan (real-time), tanpa harus menunggu pergantian jadwal per menit.

## Struktur File

- `ruijie_login.py` : Script helper untuk login menggunakan Selenium (akun L2TP) dan mengambil cookies.
- `ruijie_login_pppoe.py` : Script helper untuk login menggunakan Selenium (akun PPPoE) dan mengambil cookies.
- `ruijie_scraper.py` : Script utama (daemon) untuk L2TP yang menarik data API Ruijie setiap interval tertentu, memasukkan data ke PostgreSQL, serta mengirimkan notifikasi pembaruan ke server Node.js berdasarkan konfigurasi `NOCR_HOST` dan `NOCR_PORT`.
- `ruijie_scraper_pppoe.py` : Script utama (daemon) untuk PPPoE dengan mekanisme serupa.
- `.env.example` : Template file konfigurasi.
