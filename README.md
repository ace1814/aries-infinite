# Visual Options Spread Executor — concept for Aries Infinite

Independent concept prototype built from PRD v2.1. **Not an official Aries product. Simulated data only. No real orders.**

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine + parser unit tests (Vitest)
npm run build      # dist/ for Cloudflare Pages
```

Deploy (when you choose to): `npx wrangler pages deploy dist`. `public/_headers` sets `Permissions-Policy: microphone=(self)` and `noindex`.

## Demo flags (PRD §8)

| URL | Effect |
| --- | --- |
| `?demo=1` | Fixed seed, no drift, for clean recording |
| `?demo=requote` | Forces the Re-Quote state on the next send |
| `?demo=timeout` | Forces the data-timeout skeleton once (6s in) |
| `?onboarding=reset` | Clears all saved state and replays onboarding |

Flags combine: `?demo=1&demo=requote`.

## Logo (PRD §0.5)

Drop the official SVG into `reference/brand/`. It is picked up automatically for the top-left pill and favicon. Until then a text placeholder is shown (search `TODO_LOGO`). The current logo is `reference/brand/aries-logo.png` (125×24 white wordmark; swap in an SVG for sharper rendering).

## Where things live

- `src/config.ts` — every assumption: seed prices, fee, caps, Re-Quote threshold, delta targets
- `src/engine/` — Black-Scholes, chain, payoff, recognition, research sample data
- `src/parser/` — Command Bar Tier 1 parser and resolver
- `src/canvas/` — tldraw widget shape, Strategy Block, chain, research widgets
- `src/onboarding/` — five steps, questionnaire, layout generator
- `src/content/glossary.ts` — all ⓘ copy (three levels per term)

## Notes vs the PRD

- tldraw 3.15 (watermark kept). Leg Cards render inside the composite Strategy Block rather than as child shapes; drag a card out to remove it.
- Tier 2 LLM parsing (`/api/parse`) and voice are stretch items: the client already calls `/api/parse` on low confidence and falls back silently; no function is deployed. Voice uses the Web Speech API where available (Space in an empty Command Bar).
- Market-closed queueing (optional in §9) is not implemented.
