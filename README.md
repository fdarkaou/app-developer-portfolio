# app-developer-portfolio

See every iOS app one App Store developer ships, in one report: price, rating, number of ratings, monthly downloads and monthly revenue with the change since last month, paid-ad counts, and the studio's portfolio trend. Give it a developer id or an `apps.apple.com/.../developer/...` link; it makes one API call per developer and prints Markdown, CSV or JSON. It can also post a short summary to Slack or Discord.

Use it to size up a rival studio, find which of their apps carries the revenue, or watch a few developers side by side.

Node 18+, no dependencies. There is also a [browser version](https://fdarkaou.github.io/app-developer-portfolio/) that renders a pasted response and never sends it anywhere.

```
## Example Labs (id 1000000000)

- Monthly downloads: 80k–345k (mid 166k) over 2 scored apps; 1 under 5k; 1 unknown
- Monthly revenue: $149k–$645k (mid $311k) over 2 scored apps; 2 unknown
- Live paid ads: 21 across 2 apps with stored ad counts
- Downloads trend 2026-10-23 → 2026-10-25: +4% (same 2 scored apps)

| App | Category | Price | Rating | Ratings | Monthly downloads | MoM | Monthly revenue | MoM | Paid ads | Status |
| --- | --- | --- | ---: | ---: | --- | ---: | --- | ---: | --- | --- |
| Example Calorie Tracker _(top revenue, top downloads)_ | Health & Fitness | Free + IAP | 4.7 | 12.5k | 62k–270k (mid 130k) | +18% | $140k–$600k (mid $290k) |  | 18 live / 64 | listed |
| Example Meal Prep | Food & Drink | $4.99 | 4.4 | 2.3k | 18k–75k (mid 36k) | -10% | $9k–$45k (mid $21k) | +11% | 3 live / 11 | listed |
| Example Water Reminder | Health & Fitness | Free + IAP | 4.5 | 860 | under 5k |  | unknown |  | unknown | listed |
```

(Example data from `examples/developer.json`, not real apps.)

## Where the data comes from

The data comes from [PeekPanda](https://peekpanda.com), an iOS competitor catalogue that keeps dated evidence for each app. The tool calls [`GET /v1/developers/ios/{developerId}`](https://peekpanda.com/docs/get-app-developer), which returns the developer and every app PeekPanda catalogues for it (up to 400, most-rated first). Over MCP the same read is the `search_apps` tool with action `developer`. It only reads stored data and never starts a collection.

Downloads and revenue are PeekPanda estimates: worldwide monthly App Store ranges (low, mid, high) in USD, scored nightly, or "under 5k" below the floor. They are not numbers reported by Apple or the developer, and revenue earned outside the App Store (such as web checkout) is not included. Read how PeekPanda computes them in its docs before you put them in a deck.

You need a PeekPanda account and an API key. Each developer is one call against your plan's daily API and MCP allowance.

## Use it

```bash
git clone https://github.com/fdarkaou/app-developer-portfolio && cd app-developer-portfolio
export PEEKPANDA_TOKEN=...   # API key from Account → API keys. Keep it out of source control.

node cli.js 1000000000                                              # one developer
node cli.js https://apps.apple.com/us/developer/example-labs/id1000000000
node cli.js 1000000000 1000000001                                   # compare two studios
node cli.js 1000000000 --format csv > portfolio.csv
node cli.js 1000000000 --webhook "$SLACK_WEBHOOK_URL"               # Discord webhook URLs work too
```

The developer id is Apple's numeric id: the `developerId` on a catalogue listing, or the number after `id` in an App Store developer link. A developer is never matched by name.

Try it without an account on the bundled example:

```bash
node cli.js --file examples/developer.json
npm test
```

Options: `--format md|csv|json`, `--webhook <url>`, `--file <path>`, `--tenancy`, `--api`. Run `node cli.js --help` for details.

## Ask an assistant instead

If your assistant is connected to the PeekPanda MCP server (`https://mcp.peekpanda.com/mcp`, OAuth sign-in or an API key), ask it to call `search_apps` with:

```json
{ "request": { "action": "developer", "params": { "platform": "ios", "developerId": "1000000000" } } }
```

Then paste the result into the browser version, or save it and run `node cli.js --file`.

## How to read it

- Totals add up only the apps with a ranged estimate. Apps under the floor and apps with no estimate are counted next to the sum, never folded in.
- The trend compares the newest day of the 90-day history with the first day that had the same number of scored apps. When more apps get scored, the total rises without real growth, so the tool skips those days.
- MoM compares this month's mid estimate for an app with the one a month earlier. It is blank when either month is missing or below the floor.
- "unknown" means PeekPanda holds no estimate or ad count for that app. It is unknown, not zero.
- `not_found` status means every observed storefront reported the app missing.
- Use the ranges for direction and scale, not for exact figures.

## Monthly post in GitHub Actions

`.github/workflows/monthly-portfolio.yml` is an example job that runs on the 1st of each month, writes the report to the run summary and posts a summary to a webhook. Add `PEEKPANDA_TOKEN` and `PORTFOLIO_WEBHOOK_URL` as repository secrets, set the repository variable `ENABLE_PORTFOLIO` to `true`, and put your own developer ids in the file.

## License

MIT
