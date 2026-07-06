import requests
import time
import json
import sys
import os
import subprocess
import datetime
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

# KONFIGURASI
API_URL = "https://cloud-as.ruijienetworks.com/admin3/monitor/getMonitorDeviceList"
LOG_API_URL = "https://cloud-as.ruijienetworks.com/admin3/monitor/getAPLogsList"

# Konfigurasi Database
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

HEADERS = {
    "Cookie": "",
    "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Origin": "https://cloud-as.ruijienetworks.com",
    "Referer": "https://cloud-as.ruijienetworks.com/admin3/",
    "X-Requested-With": "XMLHttpRequest"
}

def load_cookies():
    cookie_file = "ruijie_cookies.json"
    if os.path.exists(cookie_file):
        try:
            with open(cookie_file, 'r') as f:
                cookies = json.load(f)
            # Bangun string cookie
            cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])
            HEADERS['Cookie'] = cookie_str
            return True
        except:
            pass
    return False

def jalankan_auto_login():
    print("[INFO] Mencoba login otomatis L2TP untuk mendapatkan Cookie baru...")
    try:
        # Panggil script login
        subprocess.run(["python3", "ruijie_login.py"], check=True)
        # Muat ulang cookie
        return load_cookies()
    except subprocess.CalledProcessError:
        print("[ERROR] Script login gagal dijalankan. Pastikan kredensial sudah diisi.")
        return False
    except FileNotFoundError:
        print("[ERROR] ruijie_login.py tidak ditemukan.")
        return False

# Panggil pertama kali
load_cookies()

PAYLOAD = {
    "order": "asc",
    "offset": "0",
    "limit": "100",
    "page": "1",
    "rows": "100",
    "key": "",
    "groupId": "7940586",
    "status": "",
    "conf_sync": "",
    "common_type": "AP",
    "macc_groupTimezoneStr": "GMT+7:00",
    "currentUsername": os.getenv("RUIJIE_EMAIL")
}

INTERVAL_DETIK = 60 

# Cache untuk menyimpan riwayat offline
history_cache = {}

def get_last_offline(sn, group_id):
    payload_log = {
        "order": "desc",
        "offset": "0",
        "limit": "50",
        "page": "1",
        "rows": "50",
        "log_type": "",
        "sn": sn,
        "days": "",
        "groupId": group_id,
        "macc_groupTimezoneStr": "GMT+7:00",
        "currentUsername": PAYLOAD.get("currentUsername", "")
    }
    try:
        res = requests.post(LOG_API_URL, headers=HEADERS, data=payload_log, timeout=5)
        if res.status_code == 200:
            try:
                data = res.json()
            except ValueError as e:
                return "Error API Log"

            if 'rows' in data:
                logs = data['rows']
                
                for log in logs:
                    content = str(log.get('logDetail', '')).lower() + " " + str(log.get('content', '')).lower()
                    log_type = str(log.get('logType', '')).lower()
                    
                    if 'offline' in content or 'offline' in log_type or 'putus' in content or 'disconnect' in content or 'reboot' in log_type or 'restart' in content:
                        waktu = log.get('operateTime_macc_groupTimezone') or log.get('operateTime') or log.get('createTimeStr') or log.get('updateTimeStr') or log.get('timeStr')
                        if isinstance(waktu, (int, float)):
                             waktu = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(waktu / 1000 + 7 * 3600))
                        
                        jenis = "Offline"
                        if 'reboot' in log_type or 'restart' in content:
                            jenis = "Reboot"
                        elif 'online' in content or 'connect' in content or 'terhubung' in content:
                            jenis = "Online"
                            
                        return f"{waktu} ({jenis})"
    except Exception as e:
        pass
    return "Tidak ada riwayat"

def ambil_data_ruijie(putaran_pertama=False):
    waktu_sekarang = time.strftime('%Y-%m-%d %H:%M:%S')
    try:
        all_ap_list = []
        page = 1
        limit = 100
        total_records = "Tidak diketahui"
        
        while True:
            current_payload = PAYLOAD.copy()
            current_payload['limit'] = str(limit)
            current_payload['rows'] = str(limit)
            current_payload['page'] = str(page)
            current_payload['offset'] = str((page - 1) * limit)
            
            response = requests.post(API_URL, headers=HEADERS, data=current_payload)
            
            if response.status_code == 200:
                try:
                    data = response.json()
                except ValueError:
                    print(f"[{waktu_sekarang}] Gagal parsing JSON. Kemungkinan Cookie/Sesi telah berakhir.")
                    if jalankan_auto_login():
                        print("[INFO] Berhasil memperbarui sesi. Mengulangi pengambilan data...")
                        return ambil_data_ruijie(putaran_pertama)
                    else:
                        return
                
                if 'rows' in data and data['rows']:
                    all_ap_list.extend(data['rows'])
                    total_records = data.get('totalRecords', total_records)
                    
                    if len(data['rows']) < limit:
                        break
                    page += 1
                else:
                    break
                    
            elif response.status_code == 401 or response.status_code == 403:
                print(f"[{waktu_sekarang}] Gagal: Sesi telah berakhir atau ditolak. Mencoba auto-login...")
                if jalankan_auto_login():
                    return ambil_data_ruijie(putaran_pertama)
                else:
                    return
            else:
                print(f"[{waktu_sekarang}] Gagal mengambil data. HTTP Status: {response.status_code}")
                return
                
        if not all_ap_list:
            print("Respons diterima, tetapi data kosong.")
            return

        print(f"\n[{waktu_sekarang}] Data L2TP berhasil diambil ({len(all_ap_list)} perangkat)!")
        
        jumlah_online = sum(1 for ap in all_ap_list if ap.get('onlineStatus') == 'ON')
        jumlah_offline = sum(1 for ap in all_ap_list if ap.get('onlineStatus') == 'OFF')
        
        print(f"Total perangkat L2TP: {total_records} (Online: {jumlah_online}, Offline: {jumlah_offline})")
        
        db_payloads = []

        for ap in all_ap_list:
                    mac = ap.get('mac', 'N/A')
                    sn = ap.get('serialNumber') or ap.get('sn') or ''
                    group_id = ap.get('groupId', PAYLOAD.get('groupId'))
                    status = ap.get('onlineStatus', 'N/A')
                    
                    alias = ap.get('aliasName') or ap.get('name') or ap.get('hostName') or ap.get('remark') or 'TanpaAlias'
                    
                    ip = ap.get('localIp', 'N/A')
                    
                    waktu_terakhir_ms = ap.get('lastOnline')
                    waktu_str = ""
                    if waktu_terakhir_ms and isinstance(waktu_terakhir_ms, (int, float)):
                        waktu_str = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(waktu_terakhir_ms / 1000 + 7 * 3600))
                    
                    offline_time_ms = ap.get('offlineTime')
                    offline_str = ""
                    if offline_time_ms and isinstance(offline_time_ms, (int, float)):
                        offline_str = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(offline_time_ms / 1000 + 7 * 3600))
                    elif isinstance(offline_time_ms, str):
                        try:
                            dt = datetime.datetime.strptime(offline_time_ms, '%Y-%m-%d %H:%M:%S')
                            dt = dt + datetime.timedelta(hours=7)
                            offline_str = dt.strftime('%Y-%m-%d %H:%M:%S')
                        except:
                            offline_str = offline_time_ms

                    last_offline_str = None
                    if status == 'OFF':
                        waktu_tampil = offline_str if offline_str else waktu_str
                        status_tampil = f"OFF (Offline Sejak: {waktu_tampil})" if waktu_tampil else "OFF"
                    else:
                        cached_data = history_cache.get(sn, {})
                        if cached_data.get('lastOnline') != waktu_terakhir_ms:
                            if putaran_pertama:
                                sys.stdout.write(f"\rMengunduh log untuk {alias[:15]}...       ")
                                sys.stdout.flush()
                                
                            last_offline_str = get_last_offline(sn, group_id)
                            history_cache[sn] = {
                                'lastOnline': waktu_terakhir_ms,
                                'lastOfflineStr': last_offline_str
                            }
                            time.sleep(0.1)
                        else:
                            last_offline_str = cached_data.get('lastOfflineStr', 'Tidak ada riwayat')
                            
                        waktu_terakhir_offline = offline_str if offline_str else waktu_str
                        status_tampil = f"ON  (Terakhir Offline:  {waktu_terakhir_offline}) | (Terakhir Online Kembali: {last_offline_str})"
                    
                    if status == 'ON' and putaran_pertama:
                        sys.stdout.write("\r\033[K")
                        
                    sn_tampil = ap.get('serialNumber') or ap.get('sn') or 'N/A'
                    klien = ap.get('staNums', 0)
                        
                    print(f" - MAC: {mac:<16} | SN: {sn_tampil:<15} | IP: {ip:<15} | Klien: {klien:<3} | Status: {status_tampil:<65} | Nama: {alias}")
                    
                    db_payloads.append({
                        "sn": sn_tampil,
                        "mac_address": mac,
                        "alias": alias,
                        "ip_address": ip,
                        "status": status,
                        "connection_type": "L2TP",
                        "clients": int(klien) if str(klien).isdigit() else 0,
                        "last_online": waktu_str if waktu_str else None,
                        "last_offline": offline_str if offline_str else None,
                        "last_log_history": last_offline_str if last_offline_str else None,
                        "updated_at": time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() + 7 * 3600))
                    })
                    
        if db_payloads:
            try:
                conn = get_db_connection()
                cur = conn.cursor()
                
                query = """
                    INSERT INTO ruijie_devices (sn, mac_address, alias, ip_address, status, connection_type, clients, last_online, last_offline, last_log_history, updated_at)
                    VALUES %s
                    ON CONFLICT (sn) DO UPDATE SET
                        mac_address = EXCLUDED.mac_address,
                        alias = EXCLUDED.alias,
                        ip_address = EXCLUDED.ip_address,
                        status = EXCLUDED.status,
                        connection_type = EXCLUDED.connection_type,
                        clients = EXCLUDED.clients,
                        last_online = EXCLUDED.last_online,
                        last_offline = EXCLUDED.last_offline,
                        last_log_history = EXCLUDED.last_log_history,
                        updated_at = EXCLUDED.updated_at
                """
                values = [
                    (
                        p['sn'], p['mac_address'], p['alias'], p['ip_address'], p['status'],
                        p['connection_type'], p['clients'], p['last_online'], p['last_offline'],
                        p['last_log_history'], p['updated_at']
                    ) for p in db_payloads
                ]
                
                execute_values(cur, query, values)
                conn.commit()
                cur.close()
                conn.close()
                print(f"[INFO] Berhasil menyimpan {len(db_payloads)} data L2TP ke Database PostgreSQL!")
            except Exception as e:
                print(f"[ERROR] Exception saat menyimpan ke Database: {e}")

    except requests.exceptions.RequestException as e:
        print(f"[{waktu_sekarang}] Terjadi kesalahan koneksi: {e}")

if __name__ == "__main__":
    print(f"Memulai monitoring Ruijie L2TP setiap {INTERVAL_DETIK} detik...\nTekan Ctrl+C untuk berhenti.")
    try:
        putaran_pertama = True
        while True:
            ambil_data_ruijie(putaran_pertama)
            putaran_pertama = False
            print("-" * 50)
            for s in range(INTERVAL_DETIK, 0, -1):
                sys.stdout.write(f"\rMenunggu tarikan L2TP berikutnya dalam {s} detik... \033[K")
                sys.stdout.flush()
                time.sleep(1)
            sys.stdout.write("\r\033[K")
    except KeyboardInterrupt:
        print("\nMonitoring L2TP dihentikan.")
