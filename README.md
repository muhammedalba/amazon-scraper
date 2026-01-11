(Project README)

## Usage

- Run the scraper:

```bash
node cron/fetchAmazonDeals.js
```

- Clear persisted seen ASINs (resets deduplication state):

```bash
node cron/clearSeenAsins.js
# or
npm run clear-seen
```

## Persistence (seen ASINs)

- The project uses a JSON file `seen_asins.json` to persist ASINs seen in previous runs.
- Helpers are in `utils/seenAsins.js`:
  - `loadSeenAsins([path])` — returns a `Set` of ASINs.
  - `saveSeenAsins(set, [path])` — persists the `Set` to JSON (best-effort).
  - `clearSeenAsins([path])` — overwrite the JSON with an empty array.

## Notes

- The scraper implements an ASIN-aware infinite-scroll strategy: it repeatedly scrolls the page, samples visible product nodes (`div[data-asin]`), and collects new ASINs until `limit` new items are gathered or stop conditions are met.
- Do NOT use `slice(0, limit)` inside `page.evaluate` on infinite-scroll pages — slicing too early will only return the first visible items and miss lazily-loaded products.
  -- If you later need a stronger persistence backend (Redis), you can add a backend module and switch `opts.seenBackend` in `scrapers/amazon.js`.
