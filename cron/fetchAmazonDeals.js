import dotenv from "dotenv";
import { fetchAmazonDeals } from "../scrapers/amazon.js";
import { saveDealsToSheet } from "../google/sheets.js";

dotenv.config();

(async () => {
  try {
    console.log("🔄 Fetching Amazon deals...");
    const onlyDiscounts =
      (process.env.ONLY_DISCOUNTS || "").toLowerCase() === "true" ||
      process.env.ONLY_DISCOUNTS === "1";
    const deals = await fetchAmazonDeals(10, { onlyDiscounts });

    if (!deals.length) {
      console.log("ℹ️ No deals found.");
      process.exit(0);
    }

    console.log(`✅ ${deals.length} deals fetched.`);
    console.log("💾 Saving deals to Google Sheet...");
    try {
      await saveDealsToSheet(deals);
      console.log(`✅ ${deals.length} deals saved to sheet.`);
    } catch (saveErr) {
      console.error(
        "❌ Failed saving to Google Sheet:",
        saveErr.message || saveErr
      );
      process.exit(1);
    }
    console.log(JSON.stringify(deals, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("❌ Cron job failed:", err.message);
    process.exit(1);
  }
})();
