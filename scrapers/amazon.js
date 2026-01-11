import { getScraperOptions } from "../utils/config.js";
import { processDeals } from "../utils/dataProcessor.js";
import { loadSeenAsins, saveSeenAsins } from "../utils/seenAsins.js";
import { loadLastPosition, saveLastPosition } from "../utils/lastPosition.js";
import { isCaptchaPage, scrapeVisibleItems } from "./amazonParsers.js";
import {
  tryCloseCookieBanner,
  performInitialScroll,
  scrollAndWaitForNew,
} from "./browserActions.js";
import { launchBrowser, saveCookies, clearCookies } from "./browserSetup.js";
import "dotenv/config";

const AMAZON_DEALS_URL = process.env.AMAZON_DEALS_URL;
if (!AMAZON_DEALS_URL) {
  throw new Error("Missing AMAZON_DEALS_URL environment variable.");
}

/**
 * Main scraper function that orchestrates the Amazon deals fetching process.
 *
 * Workflow:
 * 1. Launches a stealth browser instance using `browserSetup.js`.
 * 2. Loads `lastStartIndex` from persistent storage to resume pagination.
 * 3. Navigates to Amazon deals page using query parameters:
 *    `?promotionsSearchStartIndex=${startIndex}&promotionsSearchPageSize=${pageSize}`
 * 4. Collects items on the specific "page".
 * 5. If successful (items found):
 *    - Updates `lastStartIndex`.
 *    - Jumps to the next page index.
 * 6. If NO items found via pagination (fallback):
 *    - Reloads the page in "clean" mode (no query params).
 *    - Uses the traditional "Scroll & Load" method.
 *
 * @param {number} limit - Maximum number of new deals to fetch (default: 15).
 * @param {object} opts - Optional configuration overrides.
 * @returns {Promise<Array>} List of deal objects.
 */
export async function fetchAmazonDeals(limit = 60, opts = {}) {
  const options = getScraperOptions(opts);
  const pageSize = options.pageSize;

  let browser;
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      const setup = await launchBrowser(options);
      browser = setup.browser;
      const page = setup.page;

      const seenFile = options.seenAsinsPath || process.env.SEEN_ASINS_PATH;
      const seenSet = await loadSeenAsins(seenFile);

      const lastPosFile =
        options.lastPositionPath || process.env.LAST_POSITION_PATH;
      const lastPos = loadLastPosition(lastPosFile);
      
      // Load last start index, default to 0
      let startIndex = lastPos?.lastStartIndex || 0;
      // Also load last ASIN for the URL param
      let lastSeenAsin = lastPos?.lastAsin || null;
      
      let usedFallback = false;
      let consecutiveZeroResults = 0; // Track consecutive empty/bad pages across pagination

      const collected = [];
      const collectedAsins = new Set();
      
      console.log(`debug: starting at pagination index: ${startIndex}, lastAsin: ${lastSeenAsin}`);

      // PAGINATION LOOP
      // We try to fetch 'limit' items. In pagination mode, we might need to jump multiple pages.
      const maxPagesToCheck = 5; // safety breakdown to avoid infinite loops
      let pagesChecked = 0;

      while (collected.length < limit && pagesChecked < maxPagesToCheck) {
        if (usedFallback) break; // If we switched to fallback, handle it outside this loop

        // Construct Paginated URL
        // Structure: ?promotionsSearchLastSeenAsin=...&promotionsSearchStartIndex=...&promotionsSearchPageSize=...
        let paginatedUrl = `${AMAZON_DEALS_URL}?promotionsSearchStartIndex=${startIndex}&promotionsSearchPageSize=${pageSize}`;
        if (lastSeenAsin) {
            paginatedUrl += `&promotionsSearchLastSeenAsin=${lastSeenAsin}`;
        }
        
        console.log(`debug: navigating to ${paginatedUrl}`);

        await page.goto(paginatedUrl, {
          waitUntil: "networkidle2",
          timeout: options.timeout,
        });

        if (await isCaptchaPage(page)) {
            console.warn("⚠️ Amazon Captcha detected!");
            await page.screenshot({ path: "captcha_detected.png" });
            
            // If we hit a captcha, it's a strong signal to clear cookies for next time
            console.warn("🧹 Clearing cookies due to CAPTCHA...");
            await clearCookies();
            
            // Wait / break
            await new Promise((r) => setTimeout(r, 2000));
            // We might want to abort this run or try to reload clean
            // For now, let's break, process what we have (if any), and let the next run start fresh
            break; 
        }

        await page.waitForSelector('body'); // Wait for body at least

        // STRATEGY: Full Page Sweep
        // Scroll gradually from Top to Footer to ensure ALL lazy items load on this pagination index.
        console.log("debug: performing full page scroll sweep...");
        
        await page.evaluate(async () => {
            const getFooterTop = () => {
                const f = document.getElementById("navFooter") || document.querySelector("footer") || document.querySelector(".navLeftFooter") || document.querySelector("#rhf");
                return f ? f.getBoundingClientRect().top + window.scrollY : document.body.scrollHeight;
            };

            const viewHeight = window.innerHeight;
            let currentScroll = window.scrollY;
            let footerTop = getFooterTop();
            let maxScroll = Math.max(0, footerTop - viewHeight - 100); // Stop just before footer

            while (currentScroll < maxScroll) {
                // Scroll step
                window.scrollBy(0, 600);
                await new Promise(r => setTimeout(r, 800)); // wait for render
                
                // Recalculate limits (content might have expanded)
                currentScroll = window.scrollY;
                footerTop = getFooterTop();
                maxScroll = Math.max(0, footerTop - viewHeight - 100);
                
                // Check for "View More" button and click if visible
                const buttons = Array.from(document.querySelectorAll('a, button, span'));
                const target = buttons.find(el => {
                    const t = el.textContent?.trim().toLowerCase() || "";
                    return (t === "view more deals" || t === "see more deals" || t === "load more");
                });
                if (target && target.offsetParent !== null) {
                    target.click();
                    await new Promise(r => setTimeout(r, 2000)); // wait for load after click
                }
            }
        });

        // Wait a final moment for any last renders
        await new Promise(r => setTimeout(r, 1000));
        
        const items = await page.evaluate(scrapeVisibleItems);
        const validItems = items.filter(it => it.asin && it.link);
        
        console.log(`debug: page index ${startIndex} returned ${validItems.length} valid items.`);

        if (validItems.length === 0) {
            console.log("debug: pagination yielded 0 items. Switching to fallback scroll mode.");
            consecutiveZeroResults++;
            usedFallback = true;
            break;
        } else {
             consecutiveZeroResults = 0;
        }

        let newInThisPage = 0;
        for (const it of validItems) {
            if (seenSet.has(it.asin) || collectedAsins.has(it.asin)) continue;
            collected.push(it);
            collectedAsins.add(it.asin);
            newInThisPage++;
            if (collected.length >= limit) break;
        }
        
        console.log(`debug: collected ${newInThisPage} new items from this page.`);

        // If we found items (old or new), we assume pagination is working.
        // Increment index for NEXT run or next iteration
        startIndex += pageSize; 
        
        // Update lastSeenAsin for the next iteration (URL construction)
        if (validItems.length > 0) {
            lastSeenAsin = validItems[validItems.length - 1].asin;
        }

        pagesChecked++;
        
        // Save intermediate progress (lastStartIndex) immediately?
        // Or wait until end. Let's wait until success to save persistent state.
      }


      // FAILSAFE / FALLBACK MODE (Scroll based)
      // If pagination didn't give us enough items (or failed completely), reopen standard URL and scroll
      if ((collected.length < limit && usedFallback) || (collected.length === 0 && pagesChecked > 0)) {
         console.log("🔄 Fallback: Switching to infinite scroll mode...");
         
         // Navigate to base URL (clean)
         await page.goto(AMAZON_DEALS_URL, { waitUntil: "networkidle2", timeout: options.timeout });
         await tryCloseCookieBanner(page);
         await performInitialScroll(page, limit);

         let consecutiveNoNew = 0;
         let scrollAttempts = 0;
         let zeroVisibleCount = 0;
         
         // We might have some 'collected' items from pagination (if it partially worked), keep them.
         
         while (
            collected.length < limit &&
            scrollAttempts < options.maxScrollAttempts &&
            consecutiveNoNew < options.maxNoNew
          ) {
             // ... existing scroll logic ...
            try {
              const visibleCount = await page.evaluate(
                () => document.querySelectorAll('div[data-asin]:not([data-asin=""])').length
              );
              if (visibleCount === 0) zeroVisibleCount++;
              else zeroVisibleCount = 0;

              if (zeroVisibleCount >= Math.max(2, options.maxReloads)) {
                 await page.reload({ waitUntil: "networkidle2" });
                 await tryCloseCookieBanner(page);
                 zeroVisibleCount = 0;
              }
            } catch(e) {}

            const scrollItems = await page.evaluate(scrapeVisibleItems);
            let foundNew = 0;
            for (const it of scrollItems) {
                if (!it.asin || !it.link) continue;
                if (seenSet.has(it.asin) || collectedAsins.has(it.asin)) continue;
                collected.push(it);
                collectedAsins.add(it.asin);
                foundNew++;
                if (collected.length >= limit) break;
            }

            if (foundNew === 0) consecutiveNoNew++;
            else consecutiveNoNew = 0;

            if (collected.length >= limit) break;

            try {
                const prevVis = await page.evaluate(() => document.querySelectorAll('div[data-asin]:not([data-asin=""])').length);
                await scrollAndWaitForNew(page, options, prevVis);
            } catch(e) {}
            scrollAttempts++;
          }
      }

      // FINALIZATION
      // Update Seen ASINS
      for (const a of collectedAsins) seenSet.add(a);
      await saveSeenAsins(seenSet, seenFile);
      
      // Update Cookies (only if we didn't just clear them due to fatal errors)
      // If we cleared cookies mid-run, we probably don't want to save the current session unless we successfully recovered.
      await saveCookies(page);

      // Save Last Position
      // Only update Pagination Index if we actually used it successfully without falling back.
      // If we used Fallback, it means pagination failed, so we shouldn't overwrite the index with a potentially stuck value.
      if (!usedFallback) {
          await saveLastPosition({ 
              lastStartIndex: startIndex, 
              lastAsin: collected.length > 0 ? collected[collected.length-1].asin : null 
            }, lastPosFile);
            console.log(`✅ Saved next pagination index: ${startIndex}`);
      } else {
           // We used Fallback logic because pagination failed for this index (e.g. index 0 returned empty).
           // However, if we successfully collected items via scroll (Fallback), we should probably 
           // ADVANCE the startIndex anyway, so we don't get stuck retrying index 0 forever.
           // Let's assume we "consumed" a page worth of items.
           if (collected.length > 0) {
               // Update index by pageSize (or at least collected length)
               const nextIndex = startIndex + pageSize; 
               await saveLastPosition({ 
                  lastAsin: collected[collected.length-1].asin,
                  lastStartIndex: nextIndex 
                }, lastPosFile);
                console.log(`✅ Saved next pagination index: ${nextIndex} (via Fallback success)`);
           }
      }

      if (consecutiveZeroResults > 0) {
          // If we failed to get anything even with fallback, clearing cookies might be wise for next time
           console.warn("🧹 Clearing cookies due to zero results/fallback failure...");
           await clearCookies();
      }

      await browser.close();
      return processDeals(collected, limit, options.onlyDiscounts);

    } catch (err) {
      if (browser) await browser.close().catch(() => {});
      if (attempt === options.retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  return [];
}

export default fetchAmazonDeals;
