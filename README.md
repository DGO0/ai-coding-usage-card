# AI Coding Usage Card

A self-hosted GitHub profile card that shows how many tokens (and how much API-equivalent money) you've burned across your AI coding tools — **Claude Code, Codex, Gemini CLI, Copilot CLI, OpenCode, and everything else [ccusage](https://github.com/ccusage/ccusage) detects**.

No external services. No accounts. No API keys. Everything runs on your machine against your own local logs, and the card is just an SVG committed to your profile repo.

**Live examples** — all four variants, auto-updating daily from my own usage:

`ai-usage-full.svg` (846×225)

<img width="100%" src="https://raw.githubusercontent.com/Baek-Seunghyun/Baek-Seunghyun/main/cards/ai-usage-full.svg" alt="full variant" />

`ai-usage-combo.svg` (846×195) — half + grass merged in one SVG

<img width="100%" src="https://raw.githubusercontent.com/Baek-Seunghyun/Baek-Seunghyun/main/cards/ai-usage-combo.svg" alt="combo variant" />

`ai-usage-half.svg` (423×195) &nbsp;·&nbsp; `ai-usage-grass.svg` (423×195) — side by side = one full width

<p align="left">
<img width="49%" align="top" src="https://raw.githubusercontent.com/Baek-Seunghyun/Baek-Seunghyun/main/cards/ai-usage-half.svg" alt="half variant" />
<img width="49%" align="top" src="https://raw.githubusercontent.com/Baek-Seunghyun/Baek-Seunghyun/main/cards/ai-usage-grass.svg" alt="grass variant" />
</p>

`ai-usage-half-grass.svg` (423×335)

<img width="49%" src="https://raw.githubusercontent.com/Baek-Seunghyun/Baek-Seunghyun/main/cards/ai-usage-half-grass.svg" alt="half-grass variant" />

## Variants

One run generates all four — embed whichever you like:

| File | Size | Content |
|---|---|---|
| `ai-usage-full.svg` | 846×225 | Everything: totals, 4-currency cost, token mix, activity, per-tool split |
| `ai-usage-half.svg` | 423×195 | ALL-TIME + COST only — two halves side by side = one full width |
| `ai-usage-grass.svg` | 423×195 | 26-week usage grass only — pairs with the half card (GitHub 잔디 for AI usage) |
| `ai-usage-half-grass.svg` | 423×335 | Half card + 26-week usage grass stacked |
| `ai-usage-combo.svg` | 846×195 | Half + grass merged side by side in a single SVG |

## What it shows

| Block | Content |
|---|---|
| ALL-TIME | Total tokens + cache-hit ratio |
| COST | API-equivalent cost in USD + 3 currencies of your choice (live FX rates, free API) |
| TOKEN MIX | Output / input / cache read / cache write |
| ACTIVITY | Active days, avg per day, peak day, top model |
| BY TOOL | Per-tool cost split (Claude Code / Codex / Gemini / Copilot) |
| GRASS | Contribution-graph-style heatmap of daily cost |

> "API-equivalent" because subscription users (Claude Max etc.) don't actually pay per token — the number is what the same usage would cost on the API. That's the fun part.

## How it works

```
ccusage (each device) ──► cards/devices/<device>.json ──► merged SVG ──► profile README
        ▲                         ▲                                  ▲
   local CLI logs          overwritten per run             all devices combined
```

A scheduler (Task Scheduler / cron / launchd) runs the script once a day. Each run recomputes everything from your local logs, fetches fresh FX rates, and commits the regenerated SVG.

## Setup

**Requirements:** Node 18+, [GitHub CLI](https://cli.github.com/) logged in (`gh auth login`, `repo` scope is enough), and a profile repo (the public repo named after your username).

1. **Fork this repository, then clone your fork**

   ```bash
   git clone https://github.com/YOURNAME/ai-coding-usage-card.git
   cd ai-coding-usage-card
   ```

2. **Choose a permanent device ID.** Use a different ID on every computer and never rename it later.

3. **Test run**

   ```bash
   USAGE_CARD_REPO=YOURNAME/YOURNAME USAGE_CARD_DEVICE=macbook-work node usage-card.mjs
   # [2026-07-15T...] card updated: 12.6B tokens | $13,190 | Claude Code $13,190 | Codex $0.04
   ```

4. **Embed in your profile README** (any of the four variants)

   ```html
   <img width="100%" src="https://raw.githubusercontent.com/YOURNAME/YOURNAME/main/cards/ai-usage-full.svg" alt="AI usage" />
   <img width="100%" src="https://raw.githubusercontent.com/YOURNAME/YOURNAME/main/cards/ai-usage-grass.svg" alt="AI usage grass" />
   ```

5. **Schedule it daily**

   **Windows** — no-flash wrapper + Task Scheduler:

   ```vbs
   ' usage-card.vbs
   CreateObject("Wscript.Shell").Run "cmd /c ""node ""C:\path\to\usage-card.mjs"" >> ""C:\path\to\usage-card.log"" 2>&1""", 0, False
   ```

   ```powershell
   schtasks /Create /TN "AIUsageCard" /TR 'wscript.exe "C:\path\to\usage-card.vbs"' /SC DAILY /ST 09:37 /F
   ```

   **macOS / Linux** — cron:

   ```cron
   37 9 * * * USAGE_CARD_REPO=YOURNAME/YOURNAME USAGE_CARD_DEVICE=macbook-work /usr/local/bin/node /path/to/usage-card.mjs >> /path/to/usage-card.log 2>&1
   ```

## Multiple computers

Repeat the clone, test, and scheduling steps on each computer with a unique `USAGE_CARD_DEVICE`, such as `macbook-work`, `macbook-home`, or `desktop-windows`. Each run replaces that device's snapshot instead of adding to it, then rebuilds the cards from every device snapshot, so scheduled reruns do not duplicate usage.

Use a different schedule minute on each computer (for example 09:37, 09:42, 09:47) so two devices do not update the same Git branch simultaneously.

Do not sync or copy Claude Code, Codex, or other AI CLI log directories between computers. `ccusage` exposes daily totals rather than cross-device session IDs, so copied logs cannot be deduplicated reliably.

## Customization

- **Accent color** — `CONFIG.accent` (default: green on black; swap in your own hex)
- **Currencies** — any codes supported by [open.er-api.com](https://open.er-api.com) (`KRW`, `EUR`, `CNY`, `JPY`, `GBP`, …)
- **Layout** — it's ~80 lines of template SVG; move columns, add rows, go wild

## Gotchas (learned the hard way)

- **Escape `<` in any dynamic SVG text** (`&lt;`) — one raw `<` kills the whole card with `StartTag: invalid element name`.
- **Seeing a stale card right after a design change?** GitHub caches images aggressively. Append `?v=2` to the `<img>` URL to bust it. Daily data updates don't need this — the cache is only ~5 minutes.
- The script needs no `workflow` scope — it commits a plain file via the contents API, no Actions involved.

## 한국어 요약

로컬에 쌓인 AI 코딩 CLI 로그(ccusage가 감지하는 모든 툴)를 매일 집계해서, 누적 토큰·4개 통화 비용·툴별 분해·30일 차트를 담은 SVG 카드를 프로필 레포에 커밋하는 스크립트입니다. 외부 서비스·계정·API 키 전부 불필요.

1. 이 저장소를 fork한 뒤 `git clone https://github.com/YOURNAME/ai-coding-usage-card.git` 로 자신의 fork를 복제
2. 컴퓨터마다 겹치지 않는 고정 ID를 정하고 `USAGE_CARD_REPO=YOURNAME/YOURNAME USAGE_CARD_DEVICE=macbook-work node usage-card.mjs` 로 테스트
3. 프로필 README에 `<img width="100%" src="https://raw.githubusercontent.com/아이디/아이디/main/cards/ai-usage-full.svg" />` 삽입 (4종 중 원하는 파일명으로)
4. 같은 `USAGE_CARD_REPO`, `USAGE_CARD_DEVICE` 환경변수를 포함해 작업 스케줄러, launchd 또는 cron으로 매일 실행 등록

각 컴퓨터는 자신의 누적 스냅샷만 덮어쓰므로 재실행으로 사용량이 중복되지 않고, 카드는 모든 컴퓨터의 최신 스냅샷을 합산합니다. AI CLI 로그 폴더 자체를 컴퓨터 사이에 복사하거나 동기화하면 동일 세션을 판별할 수 없으므로 지원하지 않습니다.

전제 조건은 Node 18+, `gh auth login` 완료된 GitHub CLI뿐입니다.

## License

MIT
