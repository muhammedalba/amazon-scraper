/**
 * Detects if the Amazon Captcha page is present.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<boolean>}
 */
export async function isCaptchaPage(page) {
  try {
    return await page.evaluate(() => {
      const g = document.body.innerText;
      return (
        (g.includes("Enter the characters you see below") ||
          document.querySelector("input#captchacharacters")) !== null
      );
    });
  } catch (e) {
    return false;
  }
}

/**
 * Parsing logic extracted from the main scraper.
 * Scrapes visible product cards from the Amazon page.
 * @returns {Array} List of raw item objects
 */
export function scrapeVisibleItems() {
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
    const h2Span = el.querySelector("h2 a span")?.textContent?.trim() || null;
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
}
