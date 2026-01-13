import fs from "fs/promises";
import path from "path";

const DEFAULT_FILENAME = "seen_asins.json";

function resolvePath(filePath) {
  // Resolve a provided path or fall back to workspace-local default file
  if (filePath) return path.resolve(filePath);
  return path.resolve(process.cwd(), DEFAULT_FILENAME);
}

/**
 * Load seen ASINs from a JSON file and return them as a Set.
 * @param {string} [filePath] - optional path to JSON file; uses default if omitted.
 * @returns {Promise<Set<string>>} set of ASIN strings
 *
 * Purpose: provide a compact, filesystem-backed persistence for ASIN deduplication
 * across runs. The JSON file stores an array of ASIN strings.
 */
export async function loadSeenAsins(filePath) {
  const p = resolvePath(filePath);
  try {
    const raw = await fs.readFile(p, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter(Boolean));
  } catch (e) {
    // file missing or invalid -> return empty set
  }
  return new Set();
}

/**
 * Save a Set of ASINs to disk as a JSON array.
 * @param {Set<string>} set - set of ASIN strings to persist
 * @param {string} [filePath] - optional path; uses default if omitted
 *
 * Purpose: best-effort durability. This function attempts to write the JSON
 * array and logs a warning on failure; it does not throw to avoid breaking the
 * scraping run for transient IO errors.
 */
export async function saveSeenAsins(set, filePath) {
  const p = resolvePath(filePath);
  const arr = Array.from(set || []);
  const data = JSON.stringify(arr, null, 2);
  try {
    await fs.writeFile(p, data, "utf8");
  } catch (e) {
    // Best-effort: log and continue
    console.warn("Failed to save seen ASINs:", e && e.message);
  }
}

/**
 * Clear the persisted seen ASINs (overwrite with empty array).
 * @param {string} [filePath]
 *
 * Purpose: convenience helper for CLI/tests to reset deduplication state.
 */
export async function clearSeenAsins(filePath) {
  await saveSeenAsins(new Set(), filePath);
}

/**
 * Checks the number of ASINs in the seen_asins.json file.
 * If the count exceeds 400, it clears seen_asins.json, lastPosition.json, and cookies.json.
 * @param {string} [seenAsinsPath] - Optional path to seen_asins.json
 */
export async function checkAndClearExcessiveAsins(seenAsinsPath) {
  const seenSet = await loadSeenAsins(seenAsinsPath);
  if (seenSet.size > 300) {
    console.log(`⚠️ Seen ASINs count (${seenSet.size}) exceeds 400. Performing automatic cleanup...`);
    
    // 1. Clear seen_asins.json
    await clearSeenAsins(seenAsinsPath);
    
    // 2. Clear lastPosition.json
    try {
      await fs.writeFile(path.resolve(process.cwd(), "lastPosition.json"), JSON.stringify({}, null, 2));
      console.log("✅ Cleared lastPosition.json");
    } catch (e) {
      console.warn("Failed to clear lastPosition.json:", e.message);
    }

    // 3. Clear cookies.json
    try {
      await fs.writeFile(path.resolve(process.cwd(), "cookies.json"), JSON.stringify([], null, 2));
      console.log("✅ Cleared cookies.json");
    } catch (e) {
      console.warn("Failed to clear cookies.json:", e.message);
    }
    
    return true;
  }
  return false;
}

export default { loadSeenAsins, saveSeenAsins, clearSeenAsins, checkAndClearExcessiveAsins };
