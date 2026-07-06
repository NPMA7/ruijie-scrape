import json
import time
import os
from dotenv import load_dotenv

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service

load_dotenv()

# KREDENSIAL DIAMBIL DARI .ENV
EMAIL = os.getenv("RUIJIE_EMAIL_PPPOE")
PASSWORD = os.getenv("RUIJIE_PASSWORD_PPPOE")

LOGIN_URL = "https://cloud-as.ruijienetworks.com/admin3/login"
COOKIE_FILE = "ruijie_cookies_pppoe.json"


def login_and_get_cookies():
    print("Membuka browser di belakang layar (Headless Chromium) [PPPoE]...")
    chrome_options = Options()
    chrome_options.binary_location = '/usr/bin/chromium'
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920x1080")
    
    service = Service('/usr/bin/chromedriver')
    driver = webdriver.Chrome(service=service, options=chrome_options)
    
    try:
        print(f"Mengakses halaman login: {LOGIN_URL}")
        driver.get(LOGIN_URL)
        
        print("Menunggu halaman dimuat...")
        wait = WebDriverWait(driver, 15)
        
        username_input = wait.until(EC.presence_of_element_located((By.XPATH, "//input[@type='text' or @name='username' or @id='username']")))
        username_input.clear()
        username_input.send_keys(EMAIL)
        
        password_input = driver.find_element(By.XPATH, "//input[@type='password' or @name='password' or @id='password']")
        password_input.clear()
        password_input.send_keys(PASSWORD)
        
        print("Mencoba login...")
        login_btn = driver.find_element(By.ID, "J_userLogin_btn")
        driver.execute_script("arguments[0].click();", login_btn)
        
        print("Menunggu proses login berhasil (loading dashboard)...")
        time.sleep(8) 
        
        # Menerima banner cookie
        try:
            cookie_btn = driver.find_element(By.ID, "saveSessionOk")
            driver.execute_script("arguments[0].click();", cookie_btn)
            print("Banner cookie di-Accept.")
            time.sleep(2)
        except:
            pass
            
        print("Menunggu proses login berhasil (loading dashboard)...")
        time.sleep(10)
        
        cookies = driver.get_cookies()
        
        cookie_dict = {}
        for cookie in cookies:
            cookie_dict[cookie['name']] = cookie['value']
            
        if 'JSESSIONID' in cookie_dict or 'SERVERID' in cookie_dict:
            with open(COOKIE_FILE, 'w') as f:
                json.dump(cookie_dict, f, indent=4)
            print(f"BERHASIL! Cookie baru telah disimpan di {COOKIE_FILE}.")
            print(f"Cookie tersimpan: {cookie_dict}")
            return True
        else:
            print("GAGAL! JSESSIONID tidak ditemukan. Mungkin username/password salah, atau butuh Captcha.")
            return False
            
    except Exception as e:
        print(f"Terjadi error saat mencoba login otomatis: {e}")
        return False
    finally:
        driver.quit()

if __name__ == "__main__":
    if not EMAIL or not PASSWORD:
        print("PERHATIAN: Anda belum mengisi email/password untuk PPPoE di file .env!")
    else:
        login_and_get_cookies()
