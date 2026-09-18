# Portfolio Voice Agent (backend)

An API-only backend for a voice agent that visitors can talk to on your portfolio site. It
answers questions about your education, work experience, projects, and interests — grounded in
your resume via retrieval-augmented generation (RAG). Your portfolio site's own frontend calls
this API directly (cross-origin); there's no UI in this repo.

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
Portfolio frontend (mic) --WebRTC--> OpenAI Realtime API
     |                                     |
     | POST /session                       | search_resume tool call
     v                                     v
Express server (this repo)  <----------  POST /retrieve (query)
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

`GET http://localhost:3000/` returns `{"status":"ok"}` once the server is up.

## Consuming the API

This backend has no UI — your portfolio site's frontend talks to it directly:

- **`POST /session`** — no body. Returns an ephemeral Realtime API key
  (`{ value, ... }`). Use it client-side to open a WebRTC connection straight to
  `https://api.openai.com/v1/realtime/calls` (your real `OPENAI_API_KEY` never leaves this
  server). Create an `RTCPeerConnection`, attach the mic track, open a data channel, and send the
  SDP offer with `Authorization: Bearer <ephemeralKey>`.
- **`POST /retrieve`** — body `{ "query": "..." }`. Returns `{ results: [{ section, text,
  score }, ...] }` from the resume RAG index. Call this whenever the model's Realtime session
  invokes the `search_resume` tool (listen for `response.function_call_arguments.done` events on
  the data channel), then send the results back as a `function_call_output` item.

Both routes are CORS-restricted to `ALLOWED_ORIGIN` (plus `localhost:8000` for local dev) — see
`server/index.js`.

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

## Deploying (Render)

This repo includes a `render.yaml` blueprint:

1. In the Render dashboard, **New → Blueprint**, point it at this repo.
2. Render reads `render.yaml` and creates a web service (`npm install` build, `npm start` start).
3. Set the `OPENAI_API_KEY` secret when prompted (it's marked `sync: false` so it isn't stored in
   the repo).
4. `ALLOWED_ORIGIN` defaults to `https://varshasathiskumar.github.io` in `render.yaml` — update it
   there (or override it in the dashboard) if your portfolio's origin changes.

Without the blueprint, any Node host works the same way: run `npm start` with `OPENAI_API_KEY` set.

Point your portfolio frontend's `fetch` calls at the resulting `https://<service>.onrender.com`
URL instead of relative paths, since it's now a different origin.
