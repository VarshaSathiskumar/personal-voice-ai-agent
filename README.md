# Portfolio Voice Agent

A small voice agent that visitors can talk to on your portfolio site. It answers questions
about your education, work experience, projects, and interests — grounded in your resume via
retrieval-augmented generation (RAG).

## How it works

- **Voice**: [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) over WebRTC
  handles speech-to-text, reasoning, and text-to-speech in one live session. The browser connects
  directly to OpenAI using a short-lived ephemeral key minted by our server — your real API key
  never reaches the browser.
- **RAG**: your resume (`data/resume.json`) is split into small chunks (one per job, project,
  education entry, etc.) and embedded once with `npm run build-index`. During a conversation, the
  model calls a `search_resume` tool whenever it needs facts; the server embeds the query and
  does an in-memory cosine-similarity search over the pre-computed chunks — no vector database.

```
Browser (mic) --WebRTC--> OpenAI Realtime API
     |                          |
     | POST /session            | search_resume tool call
     v                          v
Express server  <----------  POST /retrieve (query)
     |
     v
data/embeddings.json (cosine similarity)
```

## Setup

```bash
npm install
cp .env.example .env   # add your OPENAI_API_KEY
npm run build-index    # embeds data/resume.json -> data/embeddings.json
npm run dev             # starts the server at http://localhost:3000
```

Open `http://localhost:3000`, click **Start talking**, grant mic access, and ask about
education, experience, projects, or interests.

## Using your real resume

`data/resume.json` currently has placeholder content. Replace it with your real data (same
shape: `summary`, `education`, `experience`, `projects`, `interests`), then re-run:

```bash
npm run build-index
```

This regenerates `data/embeddings.json`. Commit the regenerated file so deployments don't need
to call the embeddings API on boot.

The schema also supports `publications`, `certifications`, and `skills` (an object of
category → list of items) in addition to `summary`, `education`, `experience`, `projects`,
and `interests` — see `data/resume.json` for the current shape.

## Deploying

Any Node host works (Render, Railway, Fly.io, a VPS, etc.) — it just needs to run
`npm start` with `OPENAI_API_KEY` set as an environment variable. The app serves both the
API routes and the static widget from the same process, so one deploy is enough.

## Embedding in the portfolio

Once deployed, embed the widget as an iframe inside the portfolio's `#about` section
(`~/Documents/GitHub/Portfolio/src/sections/about/about.js`), e.g.:

```html
<iframe
  src="https://your-deployed-voice-agent-url.com"
  title="Ask Varsha — voice agent"
  style="width: 100%; max-width: 420px; height: 480px; border: none;"
  allow="microphone"
></iframe>
```

The `allow="microphone"` attribute is required for the mic to work inside the iframe.
