import "dotenv/config";

export function getScraperOptions(overrides = {}) {
  const defaults = {
    headless: true,
    timeout: 30000,
    retries: 2,
    slowMo: 0,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    launchTimeout: 30000,
    onlyDiscounts: "true",
  };

  const options = { ...defaults, ...overrides };

  // Normalize env-driven options
  if (overrides.headless === undefined) {
    options.headless = process.env.PUPPETEER_HEADLESS
      ? String(process.env.PUPPETEER_HEADLESS).toLowerCase() === "true"
      : true;
  }

  options.launchTimeout =
    overrides.launchTimeout ??
    (process.env.LAUNCH_TIMEOUT
      ? parseInt(process.env.LAUNCH_TIMEOUT, 10)
      : 30000);

  options.retries =
    overrides.retries ??
    (process.env.LAUNCH_RETRIES ? parseInt(process.env.LAUNCH_RETRIES, 10) : 2);

  options.onlyDiscounts =
    typeof options.onlyDiscounts === "boolean"
      ? options.onlyDiscounts
      : (
          process.env.AMAZON_ONLY_DISCOUNTS ??
          process.env.ONLY_DISCOUNTS ??
          "true"
        ).toLowerCase() === "true";

  options.scrollDelayMs =
    process.env.AMAZON_SCROLL_DELAY_MS
      ? parseInt(process.env.AMAZON_SCROLL_DELAY_MS, 10)
      : 1500;

  options.maxReloads =
    process.env.AMAZON_MAX_RELOADS
      ? parseInt(process.env.AMAZON_MAX_RELOADS, 10)
      : 3;

  options.maxNoNew =
    process.env.AMAZON_MAX_NO_NEW
      ? parseInt(process.env.AMAZON_MAX_NO_NEW, 10)
      : 12;

  options.maxScrollAttempts =
    process.env.AMAZON_MAX_SCROLL_ATTEMPTS
      ? parseInt(process.env.AMAZON_MAX_SCROLL_ATTEMPTS, 10)
      : 120;

  options.pageSize =
    process.env.AMAZON_PAGE_SIZE
      ? parseInt(process.env.AMAZON_PAGE_SIZE, 10)
      : 60; // Default page size for pagination

  return options;
}
