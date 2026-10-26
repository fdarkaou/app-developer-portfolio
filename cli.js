#!/usr/bin/env node
// Developer portfolio report on the PeekPanda API. Node 18+, no dependencies.
// One call per developer to GET /v1/developers/ios/{developerId}: every catalogued app, estimates and paid-ad counts.
import { readFile } from 'node:fs/promises';
import { parseDeveloperId, toMarkdown, toCsv, toChat, toComparison } from './portfolio.js';

const HELP = `Usage:
  PEEKPANDA_TOKEN=... node cli.js <developerId|apps.apple.com developer link> [more ...] [options]
  node cli.js --file developer.json [options]

Each developer is one API call. With two or more, a one-line-per-developer comparison is printed first.

Options:
  --format md|csv|json   output format (default md)
  --webhook <url>        also POST a short summary to a Slack or Discord incoming webhook
  --tenancy <value>      x-genviral-tenancy header (default personal)
  --api <url>            API base (default https://api.peekpanda.com)
  --file <path>          read a saved GET /v1/developers/ios/{developerId} response instead of calling the API`;

function parse(argv) {
  const o = { format: 'md', tenancy: 'personal', api: 'https://api.peekpanda.com', ids: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o.ids.push(a);
  }
  return o;
}

async function fetchDeveloper(raw, o) {
  const token = process.env.PEEKPANDA_TOKEN;
  if (!token) throw new Error('Set PEEKPANDA_TOKEN to a PeekPanda API key (Account → API keys). Never commit it.');
  const id = parseDeveloperId(raw);
  if (!id) throw new Error(`Not a numeric developer id or App Store developer link: "${raw}"`);
  const url = new URL(`/v1/developers/ios/${id}`, o.api);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'x-genviral-tenancy': o.tenancy, Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const retry = res.headers.get('retry-after');
    throw new Error(`PeekPanda API ${res.status} ${body?.error?.code ?? ''} for developer ${id}: ${body?.error?.message ?? res.statusText}${retry ? ` (retry after ${retry}s)` : ''}`);
  }
  return res.json();
}

async function main() {
  const o = parse(process.argv.slice(2));
  if (o.help || (!o.ids.length && !o.file)) { console.log(HELP); return; }
  const resps = o.file ? [JSON.parse(await readFile(o.file, 'utf8'))] : [];
  for (const raw of [...new Set(o.ids)]) resps.push(await fetchDeveloper(raw, o));

  if (o.format === 'json') console.log(JSON.stringify(resps.length === 1 ? resps[0] : resps, null, 2));
  else if (o.format === 'csv') console.log(resps.map((r, i) => (i ? toCsv(r).split('\n').slice(1).join('\n') : toCsv(r))).filter(Boolean).join('\n'));
  else {
    const parts = resps.length > 1 ? [toComparison(resps)] : [];
    parts.push(...resps.map(toMarkdown));
    console.log(parts.join('\n\n') + '\n\nEstimates are PeekPanda worldwide monthly App Store ranges, not store-reported numbers. Totals add up scored apps only; "unknown" means no estimate, not zero.');
  }

  if (o.webhook) {
    const text = resps.map(toChat).join('\n\n');
    const isDiscord = /discord(app)?\.com\/api\/webhooks/.test(o.webhook);
    const r = await fetch(o.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isDiscord ? { content: text.slice(0, 1900) } : { text }) });
    if (!r.ok) throw new Error(`Webhook returned ${r.status}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
