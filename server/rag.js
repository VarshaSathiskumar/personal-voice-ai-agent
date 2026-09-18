import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMBEDDINGS_PATH = path.join(__dirname, "..", "data", "embeddings.json");
const QUERY_CACHE_LIMIT = 100;

const client = new OpenAI();
const queryEmbeddingCache = new Map();

let indexPromise = null;

function loadIndex() {
  if (!indexPromise) {
    indexPromise = readFile(EMBEDDINGS_PATH, "utf-8")
      .then((raw) => JSON.parse(raw))
      .catch(() => {
        throw new Error(
          "data/embeddings.json not found. Run `npm run build-index` first (requires OPENAI_API_KEY)."
        );
      });
  }
  return indexPromise;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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

export async function searchResume(query, topK = 2) {
  const index = await loadIndex();
  const queryEmbedding = await embedQuery(query, index.model);

  const scored = index.chunks
    .map((chunk) => ({
      section: chunk.section,
      text: chunk.text,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}
