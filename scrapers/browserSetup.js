import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs/promises";
import path from "path";

puppeteer.use(StealthPlugin());

const COOKIES_PATH = path.resolve("cookies.json");

export async function launchBrowser(options) {
  const browser = await puppeteer.launch({
    headless: options.headless,
    args: options.args,
    slowMo: options.slowMo,
    timeout: options.launchTimeout,
  });

  const page = await browser.newPage();

  await page.setViewport({ width: 1366, height: 768 });

  await page.setExtraHTTPHeaders({
    "accept-language": "en-US,en;q=0.9",
  });

  // Load cookies if they exist
  try {
    const cookiesString = await fs.readFile(COOKIES_PATH, "utf8");
    const cookies = JSON.parse(cookiesString);
    // Use browser context instead of page for setting cookies
    await browser.defaultBrowserContext().setCookie(...cookies);
  } catch (error) {
    // ignore
  }

  return { browser, page };
}

export async function saveCookies(page) {
  try {
    const cookies = await page.browser().defaultBrowserContext().cookies();
    await fs.writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  } catch (e) {
    console.warn("warn: failed saving cookies", e.message);
  }
}

export async function clearCookies() {
  try {
    await fs.writeFile(COOKIES_PATH, JSON.stringify([], null, 2));
    console.log("🧹 Cookies file cleared (emptied).");
  } catch (e) {
    console.warn("warn: failed clearing cookies file", e.message);
  }
}
