/**
 * CLI: clear persisted seen ASINs.
 * Usage: `node cron/clearSeenAsins.js [optional-path-to-json]`
 */
import { clearSeenAsins } from "../utils/seenAsins.js";

(async () => {
  try {
    // Accept an optional path as first arg, else use default
    const filePath = process.argv[2];
    await clearSeenAsins(filePath);
    console.log(
      "✅ Cleared seen ASINs",
      filePath ? `at ${filePath}` : "(default seen_asins.json)"
    );
    process.exit(0);
  } catch (err) {
    console.error(
      "❌ Failed to clear seen ASINs:",
      err && err.message ? err.message : err
    );
    process.exit(1);
  }
})();
