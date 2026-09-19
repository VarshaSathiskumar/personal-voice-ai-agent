import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESUME_PATH = path.join(__dirname, "..", "data", "resume.json");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "embeddings.json");
const EMBEDDING_MODEL = "text-embedding-3-small";

function chunkResume(resume) {
  const chunks = [];

  if (resume.summary) {
    chunks.push({ section: "summary", text: resume.summary });
  }

  for (const edu of resume.education ?? []) {
    chunks.push({
      section: "education",
      text: `${edu.degree} at ${edu.school} (${edu.dates}). ${edu.details ?? ""}`.trim(),
    });
  }

  for (const job of resume.experience ?? []) {
    const highlights = (job.highlights ?? []).join(" ");
    const summary = job.summary ? `${job.summary} ` : "";
    chunks.push({
      section: "experience",
      text: `${job.role} at ${job.company} (${job.dates}). ${summary}${highlights}`.trim(),
    });
  }

  for (const project of resume.projects ?? []) {
    const tech = (project.tech ?? []).join(", ");
    chunks.push({
      section: "projects",
      text: `Project "${project.name}" (${project.dates ?? ""}): ${project.description} Tech used: ${tech}.`.trim(),
    });
  }

  for (const pub of resume.publications ?? []) {
    chunks.push({
      section: "publications",
      text: `Publication "${pub.title}" (${pub.venue}). ${pub.details ?? ""}`.trim(),
    });
  }

  for (const cert of resume.certifications ?? []) {
    chunks.push({
      section: "certifications",
      text: `Certification: ${cert.name} (${cert.dates}). ${cert.details ?? ""}`.trim(),
    });
  }

  for (const [category, items] of Object.entries(resume.skills ?? {})) {
    chunks.push({
      section: "skills",
      text: `${category}: ${items.join(", ")}.`,
    });
  }

  if (resume.interests?.length) {
    chunks.push({
      section: "interests",
      text: `Interests: ${resume.interests.join(", ")}.`,
    });
  }

  return chunks;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.");
  }

  const resume = JSON.parse(await readFile(RESUME_PATH, "utf-8"));
  const chunks = chunkResume(resume);

  if (chunks.length === 0) {
    throw new Error("No chunks produced from data/resume.json — is it empty?");
  }

  const client = new OpenAI();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: chunks.map((c) => c.text),
  });

  const indexed = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: response.data[i].embedding,
  }));

  await writeFile(OUTPUT_PATH, JSON.stringify({ model: EMBEDDING_MODEL, chunks: indexed }, null, 2));
  console.log(`Indexed ${indexed.length} chunks -> ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
