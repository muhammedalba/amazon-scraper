import puppeteer from "puppeteer";
import {
  norm,
  normalizePriceNumber,
  computeDiscount,
  pickBestTitle,
  addAffiliateTag,
} from "./helpers.js";
import "dotenv/config";
const AMAZON_DEALS_URL = process.env.AMAZON_DEALS_URL;
if (!AMAZON_DEALS_URL) {
  throw new Error("Missing AMAZON_DEALS_URL environment variable.");
}

/**
 * Fetch Amazon deals.
 * @param {number} limit
 * @param {object} opts - { headless, timeout, retries, slowMo, args, launchTimeout }
 */
export async function fetchAmazonDeals(limit = 10, opts = {}) {
  const options = {
    headless: true,
    timeout: 30000,
    retries: 2,
    slowMo: 0,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    launchTimeout: 30000,
    onlyDiscounts: false,
    ...opts,
  };

  let browser;
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      browser = await puppeteer.launch({
        headless: options.headless,
        args: options.args,
        slowMo: options.slowMo,
        timeout: options.launchTimeout,
      });

      const page = await browser.newPage();

      const USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36";

      // Avoid deprecated page.setUserAgent — set headers and inject navigator.userAgent
      await page.setExtraHTTPHeaders({
        "accept-language": "en-US,en;q=0.9,de;q=0.8",
        "user-agent": USER_AGENT,
      });

      await page.evaluateOnNewDocument((ua) => {
        try {
          Object.defineProperty(navigator, "userAgent", {
            get: () => ua,
            configurable: true,
          });
        } catch (e) {
          // ignore
        }
      }, USER_AGENT);
      await page.setViewport({ width: 1366, height: 768 });

      await page.goto(AMAZON_DEALS_URL, {
        waitUntil: "networkidle2",
        timeout: options.timeout,
      });

      await page.waitForSelector("div[data-asin]", { timeout: 10000 });

      // Try to auto-scroll / paginate so more deal items load (Amazon lazy-loads)
      try {
        const maxScrollTime = 15000; // ms
        const start = Date.now();
        while (Date.now() - start < maxScrollTime) {
          const count = await page.evaluate(
            () =>
              document.querySelectorAll('div[data-asin]:not([data-asin=""])')
                .length
          );
          if (count >= limit) break;
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await page.waitForTimeout(700);
        }
      } catch (e) {
        // continue even if scrolling fails
      }

      // collect raw fields in page context, then post-process in Node
      const raw = await page.evaluate((limit) => {
        const nodes = Array.from(
          document.querySelectorAll('div[data-asin]:not([data-asin=""])')
        );
        const items = nodes
          .map((el) => {
            const imgEl = el.querySelector("img");
            const linkEl =
              el.querySelector("h2 a") || el.querySelector("a.a-link-normal");
            const imgAlt = imgEl?.alt?.trim() || null;
            const linkTitle = linkEl?.title?.trim() || null;
            const h2Span =
              el.querySelector("h2 a span")?.textContent?.trim() || null;
            const h2Text = el.querySelector("h2")?.textContent?.trim() || null;
            const offscreenEls = Array.from(el.querySelectorAll(".a-offscreen"))
              .map((n) => n.textContent?.trim())
              .filter(Boolean);
            const priceRaw = offscreenEls[0] || null;
            const oldPriceRaw =
              offscreenEls[1] ||
              el.querySelector(".a-text-strike")?.textContent?.trim() ||
              null;
            let link = linkEl?.href || null;
            if (link && link.startsWith("/")) {
              try {
                link = new URL(link, location.origin).href;
              } catch {}
            }
            return {
              imgAlt,
              linkTitle,
              h2Span,
              h2Text,
              priceRaw,
              oldPriceRaw,
              image: imgEl?.src || null,
              link,
            };
          })
          .filter((it) => it.link);
        return items.slice(0, limit);
      }, limit);

      // post-process raw items in Node using helpers
      const processed = raw.map((it) => {
        const title = pickBestTitle({
          imgAlt: it.imgAlt,
          linkTitle: it.linkTitle,
          h2Span: it.h2Span,
          h2Text: it.h2Text,
        });
        const currentNum = normalizePriceNumber(it.priceRaw);
        const oldNum = normalizePriceNumber(it.oldPriceRaw);
        const discount = computeDiscount(oldNum, currentNum);
        const affiliateTag = process.env.AMAZON_TAG;
        const linkWithTag = addAffiliateTag(it.link, affiliateTag);
        return {
          title: title ? norm(title) : null,
          price: currentNum != null ? String(currentNum) : null,
          old_price: oldNum != null ? String(oldNum) : null,
          discount: discount,
          link: linkWithTag,
          image: it.image,
          source: "amazon",
          posted: "no",
        };
      });

      const deals = options.onlyDiscounts
        ? processed.filter((it) => it.discount)
        : processed;

      await browser.close();
      return deals.slice(0, limit);
    } catch (err) {
      if (browser) {
        try {
          await browser.close();
        } catch {}
      }
      if (attempt === options.retries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  return [];
}

export default fetchAmazonDeals;

/*
Example usage (keep commented to avoid auto-run):
(async () => {
  try {
    const deals = await fetchAmazonDeals(10, { headless: true, retries: 2 });
    console.log(deals);
  } catch (e) {
    console.error('Failed to fetch deals:', e);
  }
})();
*/
