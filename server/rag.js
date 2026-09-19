import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMBEDDINGS_PATH = path.join(__dirname, "..", "data", "embeddings.json");
const QUERY_CACHE_LIMIT = 100;

const client = new OpenAI();
const queryEmbeddingCache = new Map();

function vectorNorm(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

let indexPromise = null;

function loadIndex() {
  if (!indexPromise) {
    indexPromise = readFile(EMBEDDINGS_PATH, "utf-8")
      .then((raw) => JSON.parse(raw))
      .then((index) => {
        for (const chunk of index.chunks) {
          chunk.norm = vectorNorm(chunk.embedding);
        }
        return index;
      })
      .catch(() => {
        throw new Error(
          "data/embeddings.json not found. Run `npm run build-index` first (requires OPENAI_API_KEY)."
        );
      });
  }
  return indexPromise;
}

// Eagerly warm the index at boot so the first live request doesn't pay for disk read + parse.
loadIndex().catch(() => {});

function cosineSimilarity(a, b, normB) {
  let dot = 0;
  let normA = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
  }
  return dot / (Math.sqrt(normA) * normB);
}

async function embedQuery(query, model) {
  const cacheKey = `${model}:${query.trim().toLowerCase()}`;
  const cached = queryEmbeddingCache.get(cacheKey);
  if (cached) return cached;

  const response = await client.embeddings.create({ model, input: query });
  const embedding = response.data[0].embedding;

  if (queryEmbeddingCache.size >= QUERY_CACHE_LIMIT) {
    queryEmbeddingCache.delete(queryEmbeddingCache.keys().next().value);
  }
  queryEmbeddingCache.set(cacheKey, embedding);

  return embedding;
}

export async function searchResume(query, topK = 3) {
  const index = await loadIndex();
  const queryEmbedding = await embedQuery(query, index.model);

  const scored = index.chunks
    .map((chunk) => ({
      section: chunk.section,
      text: chunk.text,
      score: cosineSimilarity(queryEmbedding, chunk.embedding, chunk.norm),
    }))
    .sort((a, b) => b.score - a.score);

  // Vague queries (e.g. "background") embed ambiguously and can rank
  // keyword-dense project/experience chunks above the summary chunk, so
  // always guarantee the summary is present as an identity anchor.
  const top = scored.slice(0, topK);
  if (!top.some((c) => c.section === "summary")) {
    const summaryChunk = scored.find((c) => c.section === "summary");
    if (summaryChunk) top.push(summaryChunk);
  }

  return top;
}
