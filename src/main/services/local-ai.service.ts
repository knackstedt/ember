import { SmartFilterGroup } from "../../shared/types";

interface OllamaResponse {
  message?: {
    content?: string;
  };
  error?: string;
}

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";

function getConfig() {
  return {
    baseUrl: process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL,
    model: process.env.OLLAMA_MODEL || DEFAULT_MODEL,
  };
}

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const { baseUrl } = getConfig();
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function naturalLanguageToFilter(
  query: string,
  itemType: string,
): Promise<SmartFilterGroup | null> {
  const { baseUrl, model } = getConfig();

  const systemPrompt = `You are a smart filter generator for a media library. Convert natural language queries into JSON filter rules.

Available fields by type:
- game: title, platform, genres, releaseYear, developer, publisher, isFavorite, tags, playTime, rating, protonRating
- movie: title, genres, releaseYear, director, isFavorite, tags, rating, watchProgress
- music: title, artist, album, genre, year, isFavorite, tags
- tv: title, genres, firstAirYear, creator, isFavorite, tags, rating

Operators: eq, ne, gt, gte, lt, lte, contains, in, startsWith, endsWith, exists

Return ONLY a JSON object in this exact format:
{
  "logic": "and" | "or",
  "rules": [
    { "field": "string", "operator": "string", "value": "any" }
  ]
}

For array fields (genres, tags), use "contains" with a single value.
For boolean fields, use true/false as value.
For "exists" operator, omit the value field.
Do not wrap in markdown code blocks. Return raw JSON only.`;

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        prompt: `Create a filter for ${itemType}: "${query}"`,
        stream: false,
        format: "json",
        options: {
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status}`);
    }

    const data = (await res.json()) as OllamaResponse;
    const content = data.message?.content ?? data.response ?? "";
    const cleaned = content.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as SmartFilterGroup;

    if (!parsed.logic || !Array.isArray(parsed.rules)) {
      throw new Error("Invalid filter structure");
    }

    return parsed;
  } catch (err) {
    console.error("Local AI filter generation failed:", err);
    return null;
  }
}
