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
4. Sesuaikan konfigurasi pada file `.env` (Email, Password Ruijie, dan Kredensial Database PostgreSQL).

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

## Struktur File

- `ruijie_login.py` : Script helper untuk login menggunakan Selenium (akun L2TP) dan mengambil cookies.
- `ruijie_login_pppoe.py` : Script helper untuk login menggunakan Selenium (akun PPPoE) dan mengambil cookies.
- `ruijie_scraper.py` : Script utama (daemon) untuk L2TP yang menarik data API Ruijie setiap interval tertentu dan memasukkan data ke PostgreSQL.
- `ruijie_scraper_pppoe.py` : Script utama (daemon) untuk PPPoE.
- `.env.example` : Template file konfigurasi.
