# FlowAI Backend (Hybrid Parser)

## Setup

1. Install dependencies

```
cd backend
npm install
```

2. Install Playwright browser binaries (Chromium)

```
npx playwright install chromium
```

3. Start the server

```
npm run start
# or during development with auto-reload (Node 18+)
npm run dev
```

Server runs on http://localhost:5000

## API

POST /api/parse

Request body:
```
{ "url": "https://example.com" }
```

Response:
```
{
  "url": "https://example.com",
  "mode": "static" | "dynamic" | "error",
  "elements": {
    "title": "...",
    "links": ["..."],
    "buttons": ["..."],
    "forms": 0,
    "inputs": 0,
    "totalText": 1234
  },
  "error": "optional"
}
```

## Notes
- The server auto-selects dynamic mode for SPA/JS-heavy pages and falls back to dynamic if static fetch fails.
