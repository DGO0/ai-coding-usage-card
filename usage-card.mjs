#!/usr/bin/env node
// AI Usage cards generator (4 variants) — self-hosted GitHub profile cards.
// Aggregates every AI coding CLI that ccusage detects (Claude Code, Codex,
// Gemini CLI, Copilot CLI, ...) + live FX rates, renders SVG cards, and
// commits them to your profile repo in a single git-tree commit.
// Variants: full (846x225) / half (423x195, ALL-TIME+COST) / half-grass (423x335) /
//           grass (423x195) / combo (846x195, half+grass merged).
// Requirements: Node 18+, GitHub CLI (`gh auth login`), npx.
// https://github.com/DGO0/ai-coding-usage-card
import { execSync } from 'node:child_process';

// ─────────────────────────── CONFIG ───────────────────────────
const CONFIG = {
  // Your profile repo — the public repo named after your username.
  repo: process.env.USAGE_CARD_REPO ?? 'YOURNAME/YOURNAME',
  // Directory inside that repo where the SVGs are committed.
  dir: 'cards',
  // Extra currencies next to USD (any codes from open.er-api.com).
  currencies: [['KRW', '₩'], ['EUR', '€'], ['CNY', '¥']],
  // Executables. Plain names work when PATH is set; Windows scheduled
  // tasks are safer with absolute paths, e.g.
  //   npx: 'C:\\Program Files\\nodejs\\npx.cmd',
  //   gh:  'C:\\Program Files\\GitHub CLI\\gh.exe',
  npx: process.env.NPX_PATH ?? (process.platform === 'win32' ? 'npx.cmd' : 'npx'),
  gh: process.env.GH_PATH ?? (process.platform === 'win32' ? 'gh.exe' : 'gh'),
  accent: '#4ade80',
};
// ──────────────────────────────────────────────────────────────

const REPO = CONFIG.repo;
const USER = '@' + REPO.split('/')[0];
const DIR = CONFIG.dir;
const NPX = CONFIG.npx;
const GH = CONFIG.gh;
const A = CONFIG.accent;
const GRASS_RAMP = ['#1b1b1b', '#0e4429', '#006d32', '#26a641', '#39d353'];

const sh = (cmd, big = false) =>
  execSync(cmd, { encoding: 'utf8', maxBuffer: (big ? 128 : 32) * 1024 * 1024, windowsHide: true });

// --- usage data (combined across all detected agent CLIs) ---
const { totals, daily } = JSON.parse(sh(`"${NPX}" -y ccusage@latest --json`, true));

const toolCost = (cmd) => {
  try {
    const t = JSON.parse(sh(`"${NPX}" -y ccusage@latest ${cmd} daily --json`)).totals || {};
    return t.costUSD ?? t.totalCost ?? 0;
  } catch { return 0; }
};
const others = [['Codex', toolCost('codex')], ['Gemini', toolCost('gemini')], ['Copilot', toolCost('copilot')]]
  .filter(([, c]) => c > 0);
const tools = [['Claude Code', totals.totalCost - others.reduce((s, [, c]) => s + c, 0)], ...others];

// --- FX ---
const fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
if (!fxRes.ok) throw new Error(`FX API failed: ${fxRes.status}`);
const fx = (await fxRes.json()).rates;

// --- derived ---
const usd = totals.totalCost;
const fmtTok = (n) =>
  n >= 1e12 ? (n / 1e12).toFixed(1) + 'T'
  : n >= 1e9 ? (n / 1e9).toFixed(1) + 'B'
  : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M'
  : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K'
  : String(n);
const int = (n) => new Intl.NumberFormat('en-US').format(Math.round(n));
const fmtCost = (c) => (c >= 100 ? int(c) : c.toFixed(2));
// NOTE: '<' must be XML-escaped inside SVG text or the whole card fails to parse.
const pct = (c) => { const p = (c / usd) * 100; return p >= 1 ? `${p.toFixed(0)}%` : '&lt;1%'; };

const daysActive = daily.length;
const avgDay = usd / Math.max(daysActive, 1);
const peak = daily.reduce((a, d) => (d.totalCost > a.totalCost ? d : a), daily[0]);
const cacheShare = ((totals.cacheReadTokens / totals.totalTokens) * 100).toFixed(1);

const modelCost = {};
for (const d of daily)
  for (const m of d.modelBreakdowns || [])
    if (!m.modelName.startsWith('<')) modelCost[m.modelName] = (modelCost[m.modelName] || 0) + m.cost;
const prettyModel = (id) => {
  const m = id.match(/claude-([a-z]+)-(\d+)(?:-(\d+))?/);
  if (!m) return id;
  return m[1][0].toUpperCase() + m[1].slice(1) + ' ' + (m[3] ? `${m[2]}.${m[3]}` : m[2]);
};
const [topModelId] = Object.entries(modelCost).sort((a, b) => b[1] - a[1])[0] || ['—'];

const localISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = localISO(new Date());
const costByDate = Object.fromEntries(daily.map((d) => [d.period, d.totalCost]));
const maxDay = Math.max(...daily.map((d) => d.totalCost), 1);

// --- shared pieces ---
const STYLE = `<style>
.t{font:600 18px 'Segoe UI',Ubuntu,sans-serif;fill:${A}}
.user{font:600 14px 'Segoe UI',Ubuntu,sans-serif;fill:#9e9e9e}
.hdr{font:600 11px 'Segoe UI',Ubuntu,sans-serif;fill:#6b6b6b;letter-spacing:1.5px}
.big{font:800 44px 'Segoe UI',Ubuntu,sans-serif;fill:${A}}
.sub{font:400 13px 'Segoe UI',Ubuntu,sans-serif;fill:#9e9e9e}
.lbl{font:400 13px 'Segoe UI',Ubuntu,sans-serif;fill:#a3a3a3}
.val{font:700 14px 'Segoe UI',Ubuntu,sans-serif;fill:${A}}
.foot{font:400 11px 'Segoe UI',Ubuntu,sans-serif;fill:#6b6b6b}
.fade{opacity:0;animation:fadeIn .8s ease-in-out forwards}
@keyframes fadeIn{to{opacity:1}}
</style>`;

const frame = (W, H, body) => `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AI usage">
${STYLE}
<rect width="${W - 1}" height="${H - 1}" x="0.5" y="0.5" rx="4.5" fill="#000000" stroke="#262626" stroke-width="1"/>
${body}
</svg>
`;

const header = (W, titleY = 38) => `<text x="30" y="${titleY}" class="t fade">&#9889; AI Usage</text>
<text x="${W - 30}" y="${titleY}" text-anchor="end" class="user fade">${USER}</text>
<text x="${W - 30}" y="${titleY + 15}" text-anchor="end" class="foot fade">API-equivalent &#183; ${today}</text>`;

const row = (x, y, label, value, wEnd) =>
  `<text x="${x}" y="${y}" class="lbl">${label}</text><text x="${wEnd}" y="${y}" text-anchor="end" class="val">${value}</text>`;

const allTimeBlock = (x, yHdr, yBig) => `<text x="${x}" y="${yHdr}" class="hdr">ALL-TIME</text>
<text x="${x}" y="${yBig}" class="big">${fmtTok(totals.totalTokens)}</text>
<text x="${x}" y="${yBig + 25}" class="sub">tokens &#183; ${cacheShare}% cache-hit</text>`;

const costRows = (x, y0, step, wEnd) =>
  [['USD', `$ ${int(usd)}`], ...CONFIG.currencies.map(([code, sym]) => [code, `${sym} ${int(usd * (fx[code] ?? 0))}`])]
    .slice(0, 4)
    .map(([l, v], i) => row(x, y0 + i * step, l, v, wEnd)).join('');

// contribution-style grass grid (GitHub green ramp on black)
const grass = (weeks, x0, y0, withLegend = true, legendY = null) => {
  const step = 14, cell = 11;
  const now = new Date();
  const dow = now.getDay(); // 0 = Sunday
  let cells = '';
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const back = (weeks - 1 - w) * 7 + (dow - d);
      if (back < 0) continue; // future cells in the current week
      const key = localISO(new Date(now.getTime() - back * 86400000));
      const c = costByDate[key] || 0;
      const lv = c === 0 ? 0 : c <= maxDay * 0.25 ? 1 : c <= maxDay * 0.5 ? 2 : c <= maxDay * 0.75 ? 3 : 4;
      cells += `<rect x="${x0 + w * step}" y="${y0 + d * step}" width="${cell}" height="${cell}" rx="2" fill="${GRASS_RAMP[lv]}"/>`;
    }
  }
  if (withLegend) {
    const ly = legendY ?? y0 + 7 * step + 14;
    const lx = x0 + weeks * step - 3 - 5 * step - 60;
    cells += `<text x="${lx - 8}" y="${ly + 9}" text-anchor="end" class="foot">less</text>`;
    for (let i = 0; i < 5; i++) cells += `<rect x="${lx + i * step}" y="${ly}" width="${cell}" height="${cell}" rx="2" fill="${GRASS_RAMP[i]}"/>`;
    cells += `<text x="${lx + 5 * step + 5}" y="${ly + 9}" class="foot">more</text>`;
  }
  return cells;
};

// ─── variant: FULL (846x225) ───
const buildFull = () => {
  const W = 846, H = 225;
  const cols = [30, 235, 465, 665], dividers = [215, 445, 645];
  const col3 = [['Output', fmtTok(totals.outputTokens)], ['Input', fmtTok(totals.inputTokens)], ['Cache read', fmtTok(totals.cacheReadTokens)], ['Cache write', fmtTok(totals.cacheCreationTokens)]]
    .map(([l, v], i) => row(cols[2], 98 + i * 25, l, v, 630)).join('');
  const col4 = [['Active days', String(daysActive)], ['Avg / day', `$ ${int(avgDay)}`], ['Peak day', `$ ${int(peak.totalCost)}`], ['Top model', prettyModel(topModelId)]]
    .map(([l, v], i) => row(cols[3], 98 + i * 25, l, v, 816)).join('');
  const toolLine = tools
    .map(([n, c]) => `<tspan class="lbl">${n}</tspan> <tspan class="val">$ ${fmtCost(c)}</tspan><tspan class="foot"> (${pct(c)})</tspan>`)
    .join('<tspan class="foot">&#160;&#160;&#183;&#160;&#160;</tspan>');
  return frame(W, H, `${header(W)}
${dividers.map((x) => `<line x1="${x}" y1="62" x2="${x}" y2="178" stroke="#262626" stroke-width="1"/>`).join('')}
<g class="fade" style="animation-delay:150ms">${allTimeBlock(cols[0], 72, 135)}</g>
<g class="fade" style="animation-delay:300ms"><text x="${cols[1]}" y="72" class="hdr">COST</text>${costRows(cols[1], 98, 25, 430)}</g>
<g class="fade" style="animation-delay:450ms"><text x="${cols[2]}" y="72" class="hdr">TOKEN MIX</text>${col3}</g>
<g class="fade" style="animation-delay:600ms"><text x="${cols[3]}" y="72" class="hdr">ACTIVITY</text>${col4}</g>
<g class="fade" style="animation-delay:750ms"><text x="30" y="205" class="hdr">BY TOOL</text><text x="110" y="205">${toolLine}</text></g>`);
};

// ─── variant: HALF (423x195 — two side by side = one full width) ───
const buildHalf = () => {
  const W = 423, H = 195;
  return frame(W, H, `${header(W, 34)}
<line x1="200" y1="60" x2="200" y2="175" stroke="#262626" stroke-width="1"/>
<g class="fade" style="animation-delay:150ms">${allTimeBlock(30, 74, 140)}</g>
<g class="fade" style="animation-delay:300ms"><text x="222" y="74" class="hdr">COST</text>${costRows(222, 98, 25, 393)}</g>`);
};

// ─── variant: HALF + GRASS (423x335) ───
const buildHalfGrass = () => {
  const W = 423, H = 335;
  return frame(W, H, `${header(W, 34)}
<line x1="200" y1="60" x2="200" y2="175" stroke="#262626" stroke-width="1"/>
<g class="fade" style="animation-delay:150ms">${allTimeBlock(30, 74, 140)}</g>
<g class="fade" style="animation-delay:300ms"><text x="222" y="74" class="hdr">COST</text>${costRows(222, 98, 25, 393)}</g>
<g class="fade" style="animation-delay:500ms"><text x="30" y="200" class="hdr">GRASS &#183; LAST 26 WEEKS</text>${grass(26, 30, 212, true, 316)}</g>`);
};

// ─── variant: GRASS only (423x195 — pairs with the half card) ───
const buildGrass = () => {
  const W = 423, H = 195;
  return frame(W, H, `${header(W, 34)}
<g class="fade" style="animation-delay:200ms">${grass(26, 30, 58, true, 168)}</g>`);
};

// ─── variant: COMBO (846x195 — half + grass merged in one SVG) ───
const buildCombo = () => {
  const W = 846, H = 195;
  return frame(W, H, `${header(W, 34)}
<line x1="200" y1="60" x2="200" y2="175" stroke="#262626" stroke-width="1"/>
<line x1="420" y1="60" x2="420" y2="175" stroke="#262626" stroke-width="1"/>
<g class="fade" style="animation-delay:150ms">${allTimeBlock(30, 74, 140)}</g>
<g class="fade" style="animation-delay:300ms"><text x="222" y="74" class="hdr">COST</text>${costRows(222, 98, 25, 393)}</g>
<g class="fade" style="animation-delay:500ms"><text x="440" y="74" class="hdr">GRASS &#183; LAST 26 WEEKS</text>${grass(26, 440, 84, false)}</g>`);
};

// --- single-commit push via git tree API ---
const token = sh(`"${GH}" auth token`).trim();
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
const j = async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };

const files = [
  [`${DIR}/ai-usage-full.svg`, buildFull()],
  [`${DIR}/ai-usage-half.svg`, buildHalf()],
  [`${DIR}/ai-usage-half-grass.svg`, buildHalfGrass()],
  [`${DIR}/ai-usage-grass.svg`, buildGrass()],
  [`${DIR}/ai-usage-combo.svg`, buildCombo()],
];

const ref = await j(await api(`repos/${REPO}/git/ref/heads/main`));
const baseCommit = await j(await api(`repos/${REPO}/git/commits/${ref.object.sha}`));
const treeItems = files.map(([path, content]) => ({ path, mode: '100644', type: 'blob', content }));
const tree = await j(await api(`repos/${REPO}/git/trees`, {
  method: 'POST',
  body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeItems }),
}));
const commit = await j(await api(`repos/${REPO}/git/commits`, {
  method: 'POST',
  body: JSON.stringify({
    message: `Update AI usage cards: ${fmtTok(totals.totalTokens)} tokens, $${int(usd)}`,
    tree: tree.sha,
    parents: [ref.object.sha],
  }),
}));
await j(await api(`repos/${REPO}/git/refs/heads/main`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) }));

console.log(`[${new Date().toISOString()}] 4 cards updated @ ${commit.sha.slice(0, 7)}: ${fmtTok(totals.totalTokens)} tokens | $${int(usd)} | ${tools.map(([n, c]) => `${n} $${fmtCost(c)}`).join(' | ')}`);
