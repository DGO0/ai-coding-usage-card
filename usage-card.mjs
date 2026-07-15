#!/usr/bin/env node
// AI Coding Usage Card — self-hosted GitHub profile card generator.
//
// Aggregates token usage across every AI coding CLI that ccusage detects
// (Claude Code, Codex, Gemini CLI, Copilot CLI, OpenCode, ...) and renders a
// full-width SVG stats card, then commits it to your profile repo via the
// GitHub contents API. No external services, no accounts — everything runs
// on your machine against your own local logs.
//
// Requirements: Node 18+, GitHub CLI (`gh auth login`, repo scope), npx.
// Run once to test, then schedule it daily (Task Scheduler / cron / launchd).
//
// https://github.com/DGO0/ai-coding-usage-card
import { execSync } from 'node:child_process';

// ─────────────────────────── CONFIG ───────────────────────────
const CONFIG = {
  // Your profile repo (the one named after your username) — "user/user".
  repo: process.env.USAGE_CARD_REPO ?? 'YOURNAME/YOURNAME',
  // Path of the SVG inside that repo.
  filePath: process.env.USAGE_CARD_PATH ?? 'cards/ai-usage.svg',
  // Extra currencies shown next to USD (any codes from open.er-api.com).
  currencies: [
    ['KRW', '₩'],
    ['EUR', '€'],
    ['CNY', '¥'],
  ],
  // Executables. Plain names work when PATH is set; scheduled tasks on
  // Windows are safer with absolute paths, e.g.
  //   npx: 'C:\\Program Files\\nodejs\\npx.cmd',
  //   gh:  'C:\\Program Files\\GitHub CLI\\gh.exe',
  npx: process.env.NPX_PATH ?? (process.platform === 'win32' ? 'npx.cmd' : 'npx'),
  gh: process.env.GH_PATH ?? (process.platform === 'win32' ? 'gh.exe' : 'gh'),
  // Palette: black background, gray text, one accent.
  accent: '#4ade80',
};
// ──────────────────────────────────────────────────────────────

const sh = (cmd, big = false) =>
  execSync(cmd, { encoding: 'utf8', maxBuffer: (big ? 128 : 32) * 1024 * 1024, windowsHide: true });

// --- usage data (combined across all agent CLIs ccusage detects) ---
const { totals, daily } = JSON.parse(sh(`"${CONFIG.npx}" -y ccusage@latest --json`, true));

// --- per-tool breakdown; "Claude Code" share = combined minus the rest ---
const toolCost = (cmd) => {
  try {
    const t = JSON.parse(sh(`"${CONFIG.npx}" -y ccusage@latest ${cmd} daily --json`)).totals || {};
    return t.costUSD ?? t.totalCost ?? 0;
  } catch {
    return 0;
  }
};
const others = [
  ['Codex', toolCost('codex')],
  ['Gemini', toolCost('gemini')],
  ['Copilot', toolCost('copilot')],
  ['OpenCode', toolCost('opencode')],
].filter(([, c]) => c > 0);
const tools = [['Claude Code', totals.totalCost - others.reduce((s, [, c]) => s + c, 0)], ...others];

// --- FX rates (USD base, free, no key) ---
const fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
if (!fxRes.ok) throw new Error(`FX API failed: ${fxRes.status}`);
const fx = (await fxRes.json()).rates;

// --- derived stats ---
const usd = totals.totalCost;
const fmtTok = (n) =>
  n >= 1e12 ? (n / 1e12).toFixed(1) + 'T'
  : n >= 1e9 ? (n / 1e9).toFixed(1) + 'B'
  : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M'
  : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K'
  : String(n);
const int = (n) => new Intl.NumberFormat('en-US').format(Math.round(n));

const daysActive = daily.length;
const avgDay = usd / Math.max(daysActive, 1);
const peak = daily.reduce((a, d) => (d.totalCost > a.totalCost ? d : a), daily[0]);
const cacheShare = ((totals.cacheReadTokens / totals.totalTokens) * 100).toFixed(1);

const modelCost = {};
for (const d of daily)
  for (const m of d.modelBreakdowns || [])
    if (!m.modelName.startsWith('<')) modelCost[m.modelName] = (modelCost[m.modelName] || 0) + m.cost;
const pretty = (id) => {
  const m = id.match(/(?:claude|gpt)-([a-z0-9.]+)(?:-(\d+))?/i);
  if (!m) return id;
  return m[1][0].toUpperCase() + m[1].slice(1) + (m[2] ? ` ${m[2]}` : '');
};
const [topModelId] = Object.entries(modelCost).sort((a, b) => b[1] - a[1])[0] || ['—'];

const today = new Date().toISOString().slice(0, 10);

// --- layout (846x294, 4 columns + BY TOOL row + 30-day sparkline) ---
const W = 846, H = 294, A = CONFIG.accent;
const cols = [30, 235, 465, 665];
const dividers = [215, 445, 645];
const row = (x, y, label, value, wEnd) =>
  `<text x="${x}" y="${y}" class="lbl">${label}</text><text x="${wEnd}" y="${y}" text-anchor="end" class="val">${value}</text>`;

const col2 = [['USD', `$ ${int(usd)}`], ...CONFIG.currencies.map(([code, sym]) => [code, `${sym} ${int(usd * (fx[code] ?? 0))}`])]
  .slice(0, 4)
  .map(([l, v], i) => row(cols[1], 98 + i * 25, l, v, 430)).join('');
const col3 = [['Output', fmtTok(totals.outputTokens)], ['Input', fmtTok(totals.inputTokens)], ['Cache read', fmtTok(totals.cacheReadTokens)], ['Cache write', fmtTok(totals.cacheCreationTokens)]]
  .map(([l, v], i) => row(cols[2], 98 + i * 25, l, v, 630)).join('');
const col4 = [['Active days', String(daysActive)], ['Avg / day', `$ ${int(avgDay)}`], ['Peak day', `$ ${int(peak.totalCost)}`], ['Top model', pretty(topModelId)]]
  .map(([l, v], i) => row(cols[3], 98 + i * 25, l, v, 816)).join('');

// NOTE: every dynamic string rendered into the SVG must be XML-safe.
// '<' in particular breaks the whole card ("StartTag: invalid element name").
const fmtCost = (c) => (c >= 100 ? int(c) : c.toFixed(2));
const pct = (c) => { const p = (c / usd) * 100; return p >= 1 ? `${p.toFixed(0)}%` : '&lt;1%'; };
const toolLine = tools
  .map(([n, c]) => `<tspan class="lbl">${n}</tspan> <tspan class="val">$ ${fmtCost(c)}</tspan><tspan class="foot"> (${pct(c)})</tspan>`)
  .join('<tspan class="foot">&#160;&#160;&#183;&#160;&#160;</tspan>');

const last = daily.slice(-30);
const maxCost = Math.max(...last.map((d) => d.totalCost), 1);
const slotW = (W - 60) / 30, barW = Math.floor(slotW - 6), baseY = 266, maxBarH = 40;
const bars = last
  .map((d, i) => {
    const h = Math.max(2, Math.round((d.totalCost / maxCost) * maxBarH));
    return `<rect x="${(30 + i * slotW).toFixed(1)}" y="${baseY - h}" width="${barW}" height="${h}" rx="2" fill="${A}" opacity="${d === peak ? 1 : 0.45}"/>`;
  })
  .join('');

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AI coding usage">
<style>
.t{font:600 18px 'Segoe UI',Ubuntu,sans-serif;fill:${A}}
.hdr{font:600 11px 'Segoe UI',Ubuntu,sans-serif;fill:#6b6b6b;letter-spacing:1.5px}
.big{font:800 44px 'Segoe UI',Ubuntu,sans-serif;fill:${A}}
.sub{font:400 13px 'Segoe UI',Ubuntu,sans-serif;fill:#9e9e9e}
.lbl{font:400 13px 'Segoe UI',Ubuntu,sans-serif;fill:#a3a3a3}
.val{font:700 14px 'Segoe UI',Ubuntu,sans-serif;fill:${A}}
.foot{font:400 11px 'Segoe UI',Ubuntu,sans-serif;fill:#6b6b6b}
.fade{opacity:0;animation:fadeIn .8s ease-in-out forwards}
@keyframes fadeIn{to{opacity:1}}
</style>
<rect width="${W - 1}" height="${H - 1}" x="0.5" y="0.5" rx="4.5" fill="#000000" stroke="#262626" stroke-width="1"/>
<text x="30" y="38" class="t fade">&#9889; AI Coding Usage</text>
<text x="${W - 30}" y="38" text-anchor="end" class="foot fade">API-equivalent cost &#183; auto-updated ${today}</text>
${dividers.map((x) => `<line x1="${x}" y1="62" x2="${x}" y2="178" stroke="#262626" stroke-width="1"/>`).join('')}
<g class="fade" style="animation-delay:150ms">
<text x="${cols[0]}" y="72" class="hdr">ALL-TIME</text>
<text x="${cols[0]}" y="135" class="big">${fmtTok(totals.totalTokens)}</text>
<text x="${cols[0]}" y="160" class="sub">tokens &#183; ${cacheShare}% cache-hit</text>
</g>
<g class="fade" style="animation-delay:300ms"><text x="${cols[1]}" y="72" class="hdr">COST</text>${col2}</g>
<g class="fade" style="animation-delay:450ms"><text x="${cols[2]}" y="72" class="hdr">TOKEN MIX</text>${col3}</g>
<g class="fade" style="animation-delay:600ms"><text x="${cols[3]}" y="72" class="hdr">ACTIVITY</text>${col4}</g>
<g class="fade" style="animation-delay:750ms">
<text x="30" y="205" class="hdr">BY TOOL</text>
<text x="110" y="205">${toolLine}</text>
</g>
<g class="fade" style="animation-delay:900ms">
${bars}
<text x="30" y="284" class="foot">daily cost &#183; last 30 days</text>
<text x="${W - 30}" y="284" text-anchor="end" class="foot">peak $ ${int(peak.totalCost)} (${peak.period.slice(5)})</text>
</g>
</svg>
`;

// --- commit to profile repo via contents API ---
const token = sh(`"${CONFIG.gh}" auth token`).trim();
const api = (url, opts = {}) =>
  fetch(`https://api.github.com/${url}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });

const cur = await api(`repos/${CONFIG.repo}/contents/${CONFIG.filePath}`);
const sha = cur.ok ? (await cur.json()).sha : undefined;

const put = await api(`repos/${CONFIG.repo}/contents/${CONFIG.filePath}`, {
  method: 'PUT',
  body: JSON.stringify({
    message: `Update usage card: ${fmtTok(totals.totalTokens)} tokens, $${int(usd)}`,
    content: Buffer.from(svg, 'utf8').toString('base64'),
    ...(sha ? { sha } : {}),
  }),
});
if (!put.ok) {
  console.error(`[${new Date().toISOString()}] card update failed: ${put.status} ${await put.text()}`);
  process.exit(1);
}
console.log(`[${new Date().toISOString()}] card updated: ${fmtTok(totals.totalTokens)} tokens | $${int(usd)} | ${tools.map(([n, c]) => `${n} $${fmtCost(c)}`).join(' | ')}`);
