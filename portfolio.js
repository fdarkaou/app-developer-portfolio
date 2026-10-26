// Pure helpers for the developer portfolio report. Works in Node and in the browser (index.html imports it).
// Input: one GET /v1/developers/ios/{developerId} response. Output: rows, Markdown, CSV, a chat summary.

export function compact(n) {
  if (n == null || !Number.isFinite(n)) return '';
  const a = Math.abs(n);
  if (a >= 1e9) return trim(n / 1e9) + 'B';
  if (a >= 1e6) return trim(n / 1e6) + 'M';
  if (a >= 1e3) return trim(n / 1e3) + 'k';
  return String(Math.round(n));
}
function trim(x) { return (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toString(); }

// Accepts "1000000000", "id1000000000" or an apps.apple.com/.../developer/<slug>/id<digits> link.
export function parseDeveloperId(input) {
  const s = String(input ?? '').trim();
  const m = s.match(/developer\/[^/]*\/id(\d{1,20})/i) || s.match(/^(?:id)?(\d{1,20})$/i);
  return m ? m[1] : null;
}

// App estimate: { kind: 'range', range }, { kind: 'below_floor', ceiling }, or null (unknown, not zero).
export function describe(est, money = false) {
  const p = money ? '$' : '';
  if (!est) return 'unknown';
  if (est.kind === 'below_floor') return `under ${p}${compact(est.ceiling)}`;
  if (est.kind === 'range' && est.range) return `${p}${compact(est.range.low)}–${p}${compact(est.range.high)} (mid ${p}${compact(est.range.mid)})`;
  return 'unknown';
}

// Month-over-month change of the mid, only when this month and the previous one are both ranges.
export function change(est) {
  if (!est || est.kind !== 'range' || est.previous?.kind !== 'range') return null;
  const now = est.range?.mid, before = est.previous.range?.mid;
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return (now - before) / before;
}

export function pct(x) {
  if (x == null) return '';
  const v = Math.round(x * 100);
  return (v > 0 ? '+' : '') + v + '%';
}

// Developer total: { range|null, rangedApps, belowFloorApps, belowFloorCeiling, unknownApps }.
// The sum covers only the ranged apps; the other counts are reported next to it, never added in.
export function describeTotal(t, money = false) {
  if (!t) return 'unknown';
  const p = money ? '$' : '';
  const parts = [];
  if (t.range) parts.push(`${p}${compact(t.range.low)}–${p}${compact(t.range.high)} (mid ${p}${compact(t.range.mid)}) over ${t.rangedApps} scored app${t.rangedApps === 1 ? '' : 's'}`);
  else parts.push('no scored app');
  if (t.belowFloorApps) parts.push(`${t.belowFloorApps} under ${p}${compact(t.belowFloorCeiling)}`);
  if (t.unknownApps) parts.push(`${t.unknownApps} unknown`);
  return parts.join('; ');
}

// Trend over the history window. Only compares days with the same rangedApps count,
// because a higher count means more apps were scored, which is not growth.
export function trend(history, key = 'monthlyInstalls') {
  const pts = (history ?? []).filter((h) => h?.[key]?.range);
  if (pts.length < 2) return null;
  const last = pts.at(-1);
  const first = pts.find((h) => h[key].rangedApps === last[key].rangedApps);
  if (!first || first === last) return null;
  const a = first[key].range.mid, b = last[key].range.mid;
  if (!a) return null;
  return { from: first.day, to: last.day, rangedApps: last[key].rangedApps, change: (b - a) / a };
}

export function toRows(resp) {
  return (resp?.apps ?? []).map((a) => ({
    storeId: a.storeId ?? '',
    name: a.name ?? '',
    category: a.category ?? '',
    genre: a.genre ?? '',
    price: a.formattedPrice ?? (a.price == null ? '' : String(a.price)),
    inAppPurchases: a.inAppPurchases ?? null,
    storeStatus: a.storeStatus ?? '',
    rating: a.rating ?? null,
    totalRatings: a.totalRatings ?? null,
    releaseDate: a.releaseDate ?? '',
    storeUpdatedAt: a.storeUpdatedAt ?? '',
    installs: a.monthlyInstalls ?? null,
    revenue: a.monthlyRevenue ?? null,
    installsChange: change(a.monthlyInstalls),
    revenueChange: change(a.monthlyRevenue),
    liveAds: a.paidAds?.liveAds ?? null,
    totalAds: a.paidAds?.totalAds ?? null,
    isTopRevenue: a.storeId === resp?.topRevenueStoreId,
    isTopInstalls: a.storeId === resp?.topInstallsStoreId,
  }));
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const ads = (r) => (r.liveAds == null ? 'unknown' : `${r.liveAds} live / ${r.totalAds}`);

export function summaryLines(resp) {
  const t = resp?.totals ?? {};
  const name = resp?.name ?? `developer ${resp?.developerId ?? ''}`;
  const lines = [
    `${name}: ${resp?.appCount ?? 0} catalogued app${resp?.appCount === 1 ? '' : 's'}${resp?.appsTruncated ? ` (top ${resp.apps?.length ?? 0} by ratings served)` : ''}`,
    `Monthly downloads: ${describeTotal(t.monthlyInstalls)}`,
    `Monthly revenue: ${describeTotal(t.monthlyRevenue, true)}`,
    `Live paid ads: ${t.liveAds ?? 0} across ${t.appsWithPaidAds ?? 0} app${t.appsWithPaidAds === 1 ? '' : 's'} with stored ad counts`,
  ];
  const ti = trend(resp?.history, 'monthlyInstalls'), tr = trend(resp?.history, 'monthlyRevenue');
  if (ti) lines.push(`Downloads trend ${ti.from} → ${ti.to}: ${pct(ti.change)} (same ${ti.rangedApps} scored apps)`);
  if (tr) lines.push(`Revenue trend ${tr.from} → ${tr.to}: ${pct(tr.change)} (same ${tr.rangedApps} scored apps)`);
  if (resp?.categories?.length) lines.push(`Categories: ${resp.categories.map((c) => `${c.category} (${c.appCount})`).join(', ')}`);
  if (resp?.estimatesAsOf) lines.push(`Estimates as of ${resp.estimatesAsOf.slice(0, 10)} (${resp.currency ?? 'USD'})`);
  return lines;
}

export function toMarkdown(resp) {
  const out = [`## ${esc(resp?.name ?? 'Unnamed developer')} (id ${resp?.developerId ?? '?'})`, ''];
  for (const l of summaryLines(resp).slice(1)) out.push(`- ${esc(l)}`);
  out.push('', '| App | Category | Price | Rating | Ratings | Monthly downloads | MoM | Monthly revenue | MoM | Paid ads | Status |');
  out.push('| --- | --- | --- | ---: | ---: | --- | ---: | --- | ---: | --- | --- |');
  for (const r of toRows(resp)) {
    const tag = [r.isTopRevenue && 'top revenue', r.isTopInstalls && 'top downloads'].filter(Boolean).join(', ');
    out.push(`| ${esc(r.name)}${tag ? ` _(${tag})_` : ''} | ${esc(r.genre || r.category)} | ${esc(r.price)}${r.inAppPurchases ? ' + IAP' : ''} | ${r.rating ?? ''} | ${compact(r.totalRatings)} | ${describe(r.installs)} | ${pct(r.installsChange)} | ${describe(r.revenue, true)} | ${pct(r.revenueChange)} | ${ads(r)} | ${r.storeStatus} |`);
  }
  return out.join('\n');
}

export function toCsv(resp) {
  const q = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lo = (e) => (e?.kind === 'range' ? e.range.low : null);
  const mid = (e) => (e?.kind === 'range' ? e.range.mid : null);
  const hi = (e) => (e?.kind === 'range' ? e.range.high : e?.kind === 'below_floor' ? e.ceiling : null);
  const head = ['developer_id', 'developer', 'store_id', 'name', 'category', 'price', 'in_app_purchases', 'store_status', 'rating', 'total_ratings', 'release_date', 'store_updated_at',
    'installs_kind', 'installs_low', 'installs_mid', 'installs_high', 'installs_mom', 'revenue_kind', 'revenue_low', 'revenue_mid', 'revenue_high', 'revenue_mom', 'live_ads', 'total_ads', 'currency'];
  const lines = [head.join(',')];
  for (const r of toRows(resp)) {
    lines.push([resp?.developerId, resp?.name, r.storeId, r.name, r.category, r.price, r.inAppPurchases, r.storeStatus, r.rating, r.totalRatings, r.releaseDate, r.storeUpdatedAt,
      r.installs?.kind ?? 'unknown', lo(r.installs), mid(r.installs), hi(r.installs), r.installsChange == null ? null : r.installsChange.toFixed(4),
      r.revenue?.kind ?? 'unknown', lo(r.revenue), mid(r.revenue), hi(r.revenue), r.revenueChange == null ? null : r.revenueChange.toFixed(4),
      r.liveAds, r.totalAds, resp?.currency ?? 'USD'].map(q).join(','));
  }
  return lines.join('\n');
}

// One line per developer, for comparing several studios side by side.
export function toComparison(resps) {
  const out = ['| Developer | Apps | Monthly downloads (scored apps) | Monthly revenue (scored apps) | Live ads | Top revenue app |', '| --- | ---: | --- | --- | ---: | --- |'];
  for (const d of resps) {
    const top = d.apps?.find((a) => a.storeId === d.topRevenueStoreId)?.name ?? '';
    const tot = (t, m) => (t?.range ? `${m ? '$' : ''}${compact(t.range.mid)} mid (${t.rangedApps})` : 'unknown');
    out.push(`| ${esc(d.name ?? d.developerId)} | ${d.appCount ?? ''} | ${tot(d.totals?.monthlyInstalls)} | ${tot(d.totals?.monthlyRevenue, true)} | ${d.totals?.liveAds ?? ''} | ${esc(top)} |`);
  }
  return out.join('\n');
}

export function toChat(resp) {
  const lines = summaryLines(resp).slice(0, 5);
  const top = toRows(resp).filter((r) => r.revenue?.kind === 'range').slice(0, 3);
  if (top.length) lines.push('Top apps by revenue: ' + top.map((r) => `${r.name} ${describe(r.revenue, true)}`).join('; '));
  return lines.join('\n') + '\n(PeekPanda estimates, not store-reported numbers)';
}
