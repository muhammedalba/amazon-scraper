import puppeteer from "puppeteer";
import {
  norm,
  normalizePriceNumber,
  computeDiscount,
  pickBestTitle,
  addAffiliateTag,
} from "./helpers.js";
import { loadSeenAsins, saveSeenAsins } from "../utils/seenAsins.js";
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
    onlyDiscounts: process.env.AMAZON_ONLY_DISCOUNTS ?? " true",
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
          await new Promise((r) => setTimeout(r, 700));
        }
      } catch (e) {
        // continue even if scrolling fails
      }

      // ASIN-aware iterative collection with deduplication across runs
      // JSON-only backend: load and save using utils/seenAsins.js
      const seenFile = options.seenAsinsPath; // optional path provided via opts
      const seenSet = await loadSeenAsins(seenFile);

      const collected = [];
      const collectedAsins = new Set();

      let consecutiveNoNew = 0;
      const maxNoNew = options.maxNoNew ?? 5; // stop if no new ASINs appear this many times
      let scrollAttempts = 0;
      const maxScrollAttempts = options.maxScrollAttempts ?? 30; // failsafe max scrolls

      // Repeatedly read visible items, skipping ASINs already seen, until we
      // collect `limit` new ASINs, or stop conditions triggered.
      // Note: do NOT use `slice(0, limit)` inside `page.evaluate` — that would
      // return only the first N items currently visible in the DOM. On
      // infinite-scroll pages Amazon lazy-loads items as you scroll; slicing
      // early prevents discovering newly-loaded items. Instead we drive the
      // scrolling from Node and assemble new unique ASINs across multiple
      // DOM snapshots.
      while (
        collected.length < limit &&
        scrollAttempts < maxScrollAttempts &&
        consecutiveNoNew < maxNoNew
      ) {
        const items = await page.evaluate(() => {
          const nodes = Array.from(
            document.querySelectorAll('div[data-asin]:not([data-asin=""])')
          );
          return nodes.map((el) => {
            const asin = el.getAttribute("data-asin") || null;
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
              asin,
              imgAlt,
              linkTitle,
              h2Span,
              h2Text,
              priceRaw,
              oldPriceRaw,
              image: imgEl?.src || null,
              link,
            };
          });
        });

        let foundNewThisRound = 0;
        for (const it of items) {
          if (!it.asin || !it.link) continue;
          if (seenSet.has(it.asin) || collectedAsins.has(it.asin)) continue;
          collected.push(it);
          collectedAsins.add(it.asin);
          foundNewThisRound++;
          if (collected.length >= limit) break;
        }

        if (foundNewThisRound === 0) {
          consecutiveNoNew++;
        } else {
          consecutiveNoNew = 0;
        }

        if (collected.length >= limit) break;

        // scroll to load more items and wait a moment
        try {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        } catch (e) {}
        await new Promise((r) => setTimeout(r, 700));
        scrollAttempts++;
      }

      // Persist newly seen ASINs (best-effort)
      for (const a of collectedAsins) seenSet.add(a);
      await saveSeenAsins(seenSet, seenFile);

      // Post-process collected items in Node using helpers
      const processed = collected.slice(0, limit).map((it) => {
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
