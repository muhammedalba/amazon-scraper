/**
 * Tries to identify and click cookie consent buttons (e.g. "Accept", "Agree").
 * Uses a list of common selectors and text matching as a fallback.
 * @param {import('puppeteer').Page} page - The Puppeteer page instance.
 */
export async function tryCloseCookieBanner(page) {
  // ... existing code ...
  try {
    await page.evaluate(() => {
      const textMatches = (el, words) => {
        if (!el || !el.textContent) return false;
        const t = el.textContent.toLowerCase();
        return words.some((w) => t.includes(w));
      };

      const selectors = [
        "button#sp-cc-accept",
        "input#sp-cc-accept",
        'button[name="accept"]',
        'button[aria-label="Accept Cookies"]',
        'button[aria-label="Accept"]',
        'button[data-action="accept"]',
        ".a-popover-header + .a-button span",
        ".cookie-accept, .cookies-accept, .consent-accept",
      ];

      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el) {
          try {
            el.click();
          } catch {}
          return true;
        }
      }

      // fallback: find visible button with Accept/Agree text
      const buttons = Array.from(document.querySelectorAll("button,input"));
      for (const b of buttons) {
        if (textMatches(b, ["accept", "agree", "ok", "got it", "continue"])) {
          try {
            b.click();
          } catch {}
          return true;
        }
      }
      return false;
    });
  } catch (e) {}
}

/**
 * Performs a gentle initial scroll sequence to wake up Amazon's lazy loader.
 * Scrolls down a few times and waits, simulating a user exploring the page start.
 * @param {import('puppeteer').Page} page
 * @param {number} limit - Target number of items to ensure are loaded.
 */
export async function performInitialScroll(page, limit) {
  // ... existing code ...
  try {
    const maxInitialScrolls = 20;
    let currentScroll = 0;
    while (currentScroll < maxInitialScrolls) {
      const count = await page.evaluate(
        () =>
          document.querySelectorAll('div[data-asin]:not([data-asin=""])').length
      );
      if (count >= limit * 1.5) break;

      await page.evaluate(() => {
        window.scrollBy(0, 600); // Scroll down by ~600px
      });
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 500));
      currentScroll++;
    }
  } catch (e) {
    // continue
  }
}

/**
 * Smart incremental scroll that respects the page footer.
 * Scrolls down in small steps to trigger new content loading, but stops
 * before hitting the footer to avoid "overshooting" the content area.
 * 
 * @param {import('puppeteer').Page} page
 * @param {object} options - Scroll settings (delay, etc.) from config.
 * @param {number} prevVisible - Number of items visible before this scroll action.
 * @returns {Promise<number>} New count of visible items.
 */
export async function scrollAndWaitForNew(page, options, prevVisible) {
  // ... existing code ...
  const perAttempt =
    options.scrollDelayMs ??
    (process.env.AMAZON_SCROLL_DELAY_MS
      ? parseInt(process.env.AMAZON_SCROLL_DELAY_MS, 10)
      : 1500);

  // Scroll down incrementally, but stop exactly at footer
  const scrollSteps = 3;
  for (let i = 0; i < scrollSteps; i++) {
    await page.evaluate(() => {
      // Try to find the footer
      const footer =
        document.getElementById("navFooter") ||
        document.querySelector("footer") ||
        document.querySelector(".navLeftFooter") ||
        document.querySelector("#rhf"); // rhf often appears above footer, good stop point
        
      if (!footer) {
          // If no footer, just scroll a bit
          window.scrollBy(0, 500);
          return;
      }

      // If footer found, limit scroll to its top edge minus viewport (plus small buffer)
      const footerTop = footer.getBoundingClientRect().top + window.scrollY;
      const viewHeight = window.innerHeight;
      
      // Target: Bottom of viewport touches top of footer - 200px (safety buffer)
      const maxScrollY = Math.max(0, footerTop - viewHeight - 200);
      const currentY = window.scrollY;

      // Calculate next step
      const step = 600;
      let nextY = currentY + step;

      // Clamp
      if (nextY > maxScrollY) {
        nextY = maxScrollY;
      }

      // Only scroll if we have room to move (and aim is below current)
      if (nextY > currentY) {
        window.scrollTo({ top: nextY, behavior: "smooth" });
      }
    });
    await new Promise((r) => setTimeout(r, 800)); // slightly longer wait
  }

  // Wait a bit properly
  await new Promise((r) => setTimeout(r, perAttempt));

  // Check if new items appeared
  try {
    const cnt = await page.evaluate(
      () =>
        document.querySelectorAll('div[data-asin]:not([data-asin=""])').length
    );
    
    // If no new items, look for "View/See more deals" button
    if (cnt <= prevVisible) {
        const clickedMore = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('a, button, span'));
            // Look for specific text
            const target = buttons.find(el => {
                const t = el.textContent?.trim().toLowerCase() || "";
                return (t === "view more deals" || t === "see more deals" || t === "load more");
            });
            
            if (target && target. offsetParent !== null) { // is visible
                target.click();
                return true;
            }
            return false;
        });
        
        if (clickedMore) {
            console.log("debug: clicked 'View more deals' button, waiting for load...");
            await new Promise(r => setTimeout(r, 3000));
            // Re-count
             const cntAfterClick = await page.evaluate(
              () =>
                document.querySelectorAll('div[data-asin]:not([data-asin=""])').length
            );
            return cntAfterClick;
        }
    }

    return cnt;
  } catch (e) {
    return prevVisible;
  }
}
