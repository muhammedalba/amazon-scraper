/**
 * Handles persistence of the last seen position (ASIN or Pagination Index).
 */
import fs from "fs";
import path from "path";

const DEFAULT_FILE = "lastPosition.json";

/**
 * Loads the last saved position.
 * @param {string} [filePath] - Optional path to the JSON file.
 * @returns {object} { lastAsin, lastStartIndex, updatedAt } or empty object.
 */
export function loadLastPosition(filePath) {
  const p = filePath ? path.resolve(filePath) : path.resolve(DEFAULT_FILE);
  if (!fs.existsSync(p)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn("warn: failed loading last position", err.message);
    return {};
  }
}

/**
 * Saves the last position (ASIN or Index).
 * @param {object} data - { lastAsin: string, lastStartIndex: number, updatedAt: number }
 * @param {string} [filePath]
 */
export function saveLastPosition(data, filePath) {
  const p = filePath ? path.resolve(filePath) : path.resolve(DEFAULT_FILE);
  try {
    // Merge with existing data so we don't lose fields if we only update one
    const existing = loadLastPosition(filePath);
    const merged = { ...existing, ...data, updatedAt: Date.now() };
    fs.writeFileSync(p, JSON.stringify(merged, null, 2));
  } catch (err) {
    console.warn("warn: failed saving last position", err.message);
  }
}
