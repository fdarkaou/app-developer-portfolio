import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDeveloperId, describe, describeTotal, change, trend, toRows, toMarkdown, toCsv, toComparison, toChat } from '../portfolio.js';

const resp = JSON.parse(readFileSync(new URL('../examples/developer.json', import.meta.url)));

test('developer id from a number or an App Store developer link', () => {
  assert.equal(parseDeveloperId('1000000000'), '1000000000');
  assert.equal(parseDeveloperId('id1000000000'), '1000000000');
  assert.equal(parseDeveloperId('https://apps.apple.com/us/developer/example-labs/id1000000000'), '1000000000');
  assert.equal(parseDeveloperId('Example Labs'), null);
});

test('estimates: range, below floor, unknown, MoM only between ranges', () => {
  assert.equal(describe({ kind: 'below_floor', ceiling: 5000 }, true), 'under $5k');
  assert.equal(describe(null), 'unknown');
  const [top, meal, water] = toRows(resp);
  assert.equal(Math.round(top.installsChange * 100), 18);
  assert.equal(top.revenueChange, null);
  assert.equal(Math.round(meal.revenueChange * 100), 11);
  assert.equal(water.installsChange, null);
  assert.equal(change({ kind: 'range', range: { mid: 5 }, previous: { kind: 'below_floor', ceiling: 5000 } }), null);
});

test('totals keep below-floor and unknown apps apart', () => {
  assert.equal(describeTotal(resp.totals.monthlyInstalls), '80k–345k (mid 166k) over 2 scored apps; 1 under 5k; 1 unknown');
  assert.equal(describeTotal({ range: null, rangedApps: 0, belowFloorApps: 0, unknownApps: 3 }), 'no scored app; 3 unknown');
});

test('trend skips days where more apps were scored', () => {
  const t = trend(resp.history, 'monthlyInstalls');
  assert.equal(t.from, '2026-10-23');
  assert.equal(t.rangedApps, 2);
  assert.equal(Math.round(t.change * 100), 4);
  assert.equal(trend([], 'monthlyInstalls'), null);
});

test('markdown, csv, comparison and chat outputs', () => {
  assert.match(toMarkdown(resp), /Example Calorie Tracker _\(top revenue, top downloads\)_/);
  const csv = toCsv(resp).split('\n');
  assert.equal(csv.length, 5);
  assert.match(csv[3], /below_floor,,,5000/);
  assert.match(toComparison([resp, resp]), /\| Example Labs \| 4 \| 166k mid \(2\) \| \$311k mid \(2\) \| 21 \| Example Calorie Tracker \|/);
  assert.match(toChat(resp), /Top apps by revenue: Example Calorie Tracker/);
});
