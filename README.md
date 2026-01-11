# Amazon Deals Scraper
A stealthy, modular, and persistent Amazon deals scraper built with Node.js and Puppeteer.

## ✨ Features
- **Stealth Mode**: Uses `puppeteer-extra-plugin-stealth` to evade bot detection.
- **Smart Scrolling**: Implements footer-aware incremental scrolling to handle Amazon's lazy-loading.
- **Persistence**: Remembers seen ASINs (`seen_asins.json`) and last scroll position to work efficiently as a cron job.
- **Auto-Cookie Management**: Saves and loads cookies to maintain session state.
- **Google Sheets Integration**: Automatically saves fetched deals to a Google Sheet.

## 🚀 Installation

```bash
npm install
```

## ⚙️ Configuration (.env)
Create a `.env` file in the root directory.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `AMAZON_DEALS_URL` | **Required**. Full URL to the Amazon deals page. | - |
| `AMAZON_FETCH_LIMIT` | Number of **new** items to fetch per run. | `15` |
| `AMAZON_TAG` | Your Amazon Affiliate Tag (optional). | - |
| `AMAZON_ONLY_DISCOUNTS`| Save only items with a discount? (`true`/`false`) | `true` |
| `SPREADSHEET_ID` | Google Sheet ID to save data to. | - |
| `GOOGLE_CREDS_JSON` | Path to your Service Account JSON key. | `credentials.json` |
| `PUPPETEER_HEADLESS` | Run browser in background? (`true`/`false`) | `true` |
| `AMAZON_SCROLL_DELAY_MS`| Wait time (ms) between scrolls. | `1500` |
| `AMAZON_MAX_RELOADS` | Max page reloads if no items found. | `3` |

## ▶️ Usage

Run the scraper manually or schedule it:
```bash
npm start
```
(This runs `node cron/fetchAmazonDeals.js`)

## 📂 Project Structure
- `scrapers/amazon.js`: Main controller logic.
- `scrapers/browserActions.js`: Browser interactions (scroll, cookies).
- `scrapers/browserSetup.js`: Puppeteer configuration & launch.
- `scrapers/amazonParsers.js`: DOM extraction logic.
- `utils/`: Helper functions and configuration.
