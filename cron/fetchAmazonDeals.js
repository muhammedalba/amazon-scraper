import dotenv from "dotenv";
import { fetchAmazonDeals } from "../scrapers/amazon.js";
import { saveDealsToSheet } from "../google/sheets.js";
import { saveLastPosition } from "../utils/lastPosition.js";
import { checkAndClearExcessiveAsins } from "../utils/seenAsins.js";

dotenv.config();

(async () => {
  try {
    console.log("🔄 Fetching Amazon deals...");
    
    // Check if we need to clear logs before starting
    await checkAndClearExcessiveAsins(process.env.SEEN_ASINS_PATH);
    // Read env / defaults
    const onlyDiscounts = process.env.AMAZON_ONLY_DISCOUNTS ?? "true";

    const fetchLimit = process.env.AMAZON_FETCH_LIMIT
      ? parseInt(process.env.AMAZON_FETCH_LIMIT, 10)
      : 15;

    const opts = {
      onlyDiscounts,
      maxScrollAttempts: process.env.AMAZON_MAX_SCROLL_ATTEMPTS
        ? parseInt(process.env.AMAZON_MAX_SCROLL_ATTEMPTS, 10)
        : undefined,
      maxNoNew: process.env.AMAZON_MAX_NO_NEW
        ? parseInt(process.env.AMAZON_MAX_NO_NEW, 10)
        : undefined,
      scrollDelayMs: process.env.AMAZON_SCROLL_DELAY_MS
        ? parseInt(process.env.AMAZON_SCROLL_DELAY_MS, 10)
        : undefined,
      seenAsinsPath: process.env.SEEN_ASINS_PATH,
      headless: process.env.PUPPETEER_HEADLESS
        ? String(process.env.PUPPETEER_HEADLESS).toLowerCase() === "true"
        : undefined,
      launchTimeout: process.env.LAUNCH_TIMEOUT
        ? parseInt(process.env.LAUNCH_TIMEOUT, 10)
        : undefined,
      retries: process.env.LAUNCH_RETRIES
        ? parseInt(process.env.LAUNCH_RETRIES, 10)
        : undefined,
    };

    console.log(
      `config: fetchLimit=${fetchLimit}, maxScrollAttempts=${
        opts.maxScrollAttempts || "default"
      }, maxNoNew=${opts.maxNoNew || "default"}, scrollDelayMs=${
        opts.scrollDelayMs || "default"
      }`
    );

    const deals = await fetchAmazonDeals(fetchLimit, opts);

    if (!deals.length) {
      console.log("ℹ️ No deals found.");
      process.exit(0);
    }

    console.log(`✅ ${deals.length} deals fetched.`);
    console.log("💾 Saving deals to Google Sheet...");
    try {
      await saveDealsToSheet(deals);
      console.log(`✅ ${deals.length} deals saved to sheet.`);
      // update lastPosition.json so next run continues after these items
      try {
        const last = deals[deals.length - 1];
        if (last && last.asin) {
          saveLastPosition(
            { lastAsin: last.asin, updatedAt: Date.now() },
            process.env.LAST_POSITION_PATH
          );
          console.log(`✅ Updated lastPosition -> ${last.asin}`);
        }
      } catch (e) {
        console.warn("warn: failed updating lastPosition", e.message || e);
      }
    } catch (saveErr) {
      console.error(
        "❌ Failed saving to Google Sheet:",
        saveErr.message || saveErr
      );
      process.exit(1);
    }
    // console.log(JSON.stringify(deals, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("❌ Cron job failed:", err.message);
    process.exit(1);
  }
})();
