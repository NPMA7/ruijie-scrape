const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, '../.env') });

// Ambil tipe koneksi dari CLI argument (l2tp atau pppoe, default: l2tp)
const connType = (process.argv[2] || "l2tp").toLowerCase();

const CONFIGS = {
  l2tp: {
    name: "L2TP",
    email: process.env.RUIJIE_EMAIL_1,
    password: process.env.RUIJIE_PASSWORD_1,
    cookieFile: path.join(__dirname, "../data/cookies/ruijie_cookies_l2tp.json"),
  },
  pppoe: {
    name: "PPPoE",
    email: process.env.RUIJIE_EMAIL_2,
    password: process.env.RUIJIE_PASSWORD_2,
    cookieFile: path.join(__dirname, "../data/cookies/ruijie_cookies_pppoe.json"),
  },
};

const cfg = CONFIGS[connType];
if (!cfg) {
  console.error(
    `[ERROR] Tipe koneksi '${connType}' tidak valid. Harus 'l2tp' atau 'pppoe'.`,
  );
  process.exit(1);
}

const LOGIN_URL = "https://cloud-as.ruijienetworks.com/admin3/login";


async function loginAndGetCookies() {
  console.log(
    `Membuka browser di belakang layar (Headless Chrome) [${cfg.name}]...`,
  );

  let options = new chrome.Options();
  options.addArguments("--headless");
  options.addArguments("--no-sandbox");
  options.addArguments("--disable-dev-shm-usage");
  options.addArguments("--window-size=1920,1080");

  // Gunakan user-data-dir spesifik agar tidak memenuhi /tmp dengan folder acak baru setiap kali run
  const profilePath = path.join(__dirname, `../data/chrome_profiles/${connType}`);
  if (!fs.existsSync(profilePath)) {
    fs.mkdirSync(profilePath, { recursive: true });
  } else {
    const lockFile = path.join(profilePath, "SingletonLock");
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch (e) {}
    }
  }
  options.addArguments(`--user-data-dir=${profilePath}`);

  // Lintas-platform check
  if (fs.existsSync("/usr/bin/chromium")) {
    options.setChromeBinaryPath("/usr/bin/chromium");
  }

  let serviceBuilder = new chrome.ServiceBuilder();
  if (fs.existsSync("/usr/bin/chromedriver")) {
    serviceBuilder.setPath("/usr/bin/chromedriver");
  }

  let driver;
  try {
    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .setChromeService(serviceBuilder)
      .build();
  } catch (err) {
    console.error("Gagal inisialisasi WebDriver:", err.message);
    process.exit(1);
  }

  try {
    console.log(`Mengakses halaman login: ${LOGIN_URL}`);
    await driver.get(LOGIN_URL);

    console.log("Menunggu halaman dimuat...");
    const usernameInput = await driver.wait(
      until.elementLocated(
        By.xpath("//input[(@name='username' or @id='username' or @id='loginName' or @placeholder) and not(@type='hidden')]")
      ),
      15000
    );
    try {
      await usernameInput.sendKeys(cfg.email);
    } catch (e) {
      await driver.executeScript(
        "const el = document.querySelector('input[name=\"username\"], #username, input[type=\"text\"]'); if (el) { el.value = arguments[0]; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }",
        cfg.email
      );
    }

    const passwordInput = await driver.wait(
      until.elementLocated(
        By.xpath("//input[@type='password' and not(@type='hidden')]")
      ),
      15000
    );
    try {
      await passwordInput.sendKeys(cfg.password);
    } catch (e) {
      await driver.executeScript(
        "const el = document.querySelector('input[type=\"password\"]'); if (el) { el.value = arguments[0]; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }",
        cfg.password
      );
    }

    console.log("Mencoba login...");
    const loginBtn = await driver.findElement(By.id("J_userLogin_btn"));
    await driver.executeScript("arguments[0].click();", loginBtn);

    console.log("Menunggu redirect ke dashboard...");
    // Tunggu sampai URL berubah dari halaman login ke dashboard (max 30 detik)
    try {
      await driver.wait(async () => {
        const url = await driver.getCurrentUrl();
        return !url.includes('/admin3/login') && url.includes('admin3');
      }, 30000, "Timeout: Dashboard tidak dimuat dalam 30 detik");
      console.log("Dashboard berhasil dimuat!");
    } catch (e) {
      const currentUrl = await driver.getCurrentUrl();
      console.warn("Peringatan: URL tidak redirect ke dashboard. URL saat ini:", currentUrl);
    }

    // Terima banner cookie jika muncul (non-blocking, timeout 3 detik)
    try {
      const cookieBtn = await driver.wait(
        until.elementLocated(By.id("saveSessionOk")),
        3000
      );
      await driver.executeScript("arguments[0].click();", cookieBtn);
      console.log("Banner cookie di-Accept.");
      await driver.sleep(500);
    } catch (e) {
      // Banner tidak muncul, abaikan
    }

    const cookies = await driver.manage().getCookies();
    const cookieDict = {};
    for (const cookie of cookies) {
      cookieDict[cookie.name] = cookie.value;
    }

    if (cookieDict["JSESSIONID"] || cookieDict["SERVERID"] || cookieDict["SESSION"]) {

      fs.writeFileSync(cfg.cookieFile, JSON.stringify(cookieDict, null, 4));
      console.log(`BERHASIL! Cookie baru telah disimpan di ${cfg.cookieFile}.`);
      console.log("Cookie tersimpan:", cookieDict);
    } else {
      console.log(
        `GAGAL! JSESSIONID atau SERVERID tidak ditemukan untuk ${cfg.name}. Kredensial salah atau butuh Captcha.`,
      );
    }
  } catch (err) {
    console.error("Terjadi error saat mencoba login otomatis:", err.message);
  } finally {
    if (driver) {
      await driver.quit();
    }
  }
}

if (!cfg.email || !cfg.password) {
  console.log(
    `PERHATIAN: Anda belum mengisi email atau password untuk ${cfg.name} di file .env!`,
  );
} else {
  loginAndGetCookies();
}
