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
        By.xpath("//input[@type='text' or @name='username' or @id='username']"),
      ),
      15000,
    );
    await usernameInput.clear();
    await usernameInput.sendKeys(cfg.email);

    const passwordInput = await driver.findElement(
      By.xpath(
        "//input[@type='password' or @name='password' or @id='password']",
      ),
    );
    await passwordInput.clear();
    await passwordInput.sendKeys(cfg.password);

    console.log("Mencoba login...");
    const loginBtn = await driver.findElement(By.id("J_userLogin_btn"));
    await driver.executeScript("arguments[0].click();", loginBtn);

    console.log("Menunggu proses login berhasil (loading dashboard)...");
    await driver.sleep(8000);

    // Menerima banner cookie jika muncul
    try {
      const cookieBtn = await driver.findElement(By.id("saveSessionOk"));
      await driver.executeScript("arguments[0].click();", cookieBtn);
      console.log("Banner cookie di-Accept.");
      await driver.sleep(2000);
    } catch (e) {
      // Banner tidak muncul, abaikan
    }

    await driver.sleep(10000);

    const cookies = await driver.manage().getCookies();
    const cookieDict = {};
    for (const cookie of cookies) {
      cookieDict[cookie.name] = cookie.value;
    }

    if (cookieDict["JSESSIONID"] || cookieDict["SERVERID"]) {
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
