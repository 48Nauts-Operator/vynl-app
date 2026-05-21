import { generateText } from "@/lib/llm";

interface FeedbackItem {
  title: string;
  artist: string;
  genre?: string;
  rating: "bad" | "ok" | "amazing";
}

interface TasteProfileResult {
  profileText: string;
  genreDistribution: Record<string, number>;
  topArtists: string[];
  moodPreferences: {
    energy: string;
    valence: string;
    complexity: string;
  };
}

export async function generateTasteProfile(
  feedback: FeedbackItem[],
  preferences?: { genres: string[]; moodLevel: number; tempoLevel: number; era: string }
): Promise<TasteProfileResult> {
  const replyText = await generateText({
    maxTokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are a music taste analyst. Based on the following listening session feedback and preferences, generate a detailed taste profile.

${preferences ? `Initial preferences:
- Preferred genres: ${preferences.genres.join(", ")}
- Mood level (1-10): ${preferences.moodLevel}
- Tempo preference (1-10): ${preferences.tempoLevel}
- Era preference: ${preferences.era}` : ""}

Listening feedback:
${feedback.map((f) => `- "${f.title}" by ${f.artist}${f.genre ? ` (${f.genre})` : ""}: ${f.rating}`).join("\n")}

Respond in JSON format:
{
  "profileText": "A 2-3 paragraph natural language description of this person's music taste, written in second person",
  "genreDistribution": {"genre": percentage, ...},
  "topArtists": ["artist1", "artist2", ...],
  "moodPreferences": {
    "energy": "low/medium/high",
    "valence": "melancholic/balanced/uplifting",
    "complexity": "simple/moderate/complex"
  }
}`,
      },
    ],
  });

  const text =
    replyText;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse taste profile response");
  return JSON.parse(jsonMatch[0]);
}

export async function getRecommendations(
  profile: string,
  existingTracks: { title: string; artist: string }[],
  mood?: string,
  count = 10
): Promise<{ title: string; artist: string; reason: string }[]> {
  const replyText = await generateText({
    maxTokens: 1500,
    messages: [
      {
        role: "user",
        content: `Based on this taste profile:
${profile}

${mood ? `Current mood/activity: ${mood}` : ""}

The user already has these tracks in their library:
${existingTracks.slice(0, 50).map((t) => `- "${t.title}" by ${t.artist}`).join("\n")}

Suggest ${count} tracks they would enjoy but likely don't know. Respond in JSON:
[{"title": "...", "artist": "...", "reason": "..."}]`,
      },
    ],
  });

  const text =
    replyText;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Failed to parse recommendations");
  return JSON.parse(jsonMatch[0]);
}

export async function generatePlaylist(
  profile: string,
  availableTracks: { id: number; title: string; artist: string; genre?: string }[],
  mood: string,
  count = 20
): Promise<{ name: string; description: string; trackIds: number[] }> {
  // CRITICAL: Sample down to a manageable set before sending. Dumping
  // 15k tracks into the prompt blows past every LLM's context window
  // (1.2 MB of text for a typical library), causing reasoning models
  // to truncate the input or return empty. We sample 500 tracks with
  // a weighted strategy: prefer ones whose genre even loosely matches
  // the mood keywords, then top up with a random shuffle for breadth.
  const SAMPLE_SIZE = 500;
  const moodLower = mood.toLowerCase();
  const moodKeywords = moodLower.split(/\s+/).filter((w) => w.length >= 3);
  const matchesMood = (t: { genre?: string }) => {
    const g = (t.genre || "").toLowerCase();
    return g && moodKeywords.some((k) => g.includes(k));
  };

  let candidates = availableTracks;
  if (availableTracks.length > SAMPLE_SIZE) {
    const matched = availableTracks.filter(matchesMood);
    const rest = availableTracks.filter((t) => !matchesMood(t));
    // Shuffle each pool then take a slice.
    const shuffled = (arr: typeof availableTracks) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const matchedPick = shuffled(matched).slice(0, Math.min(matched.length, SAMPLE_SIZE * 0.6));
    const restPick = shuffled(rest).slice(0, SAMPLE_SIZE - matchedPick.length);
    candidates = [...matchedPick, ...restPick];
  }

  const replyText = await generateText({
    // Reasoning models (qwen3, gemma-thinking) need headroom for the
    // think block + the answer JSON. Same fix as the Doctor consult.
    maxTokens: 3000,
    messages: [
      {
        role: "user",
        content: `Create a playlist for: "${mood}"

Taste profile: ${profile}

Available tracks (select from these by ID — list is a relevance-sampled subset of the user's library; you do NOT need to use all of them):
${candidates.map((t) => `ID:${t.id} - "${t.title}" by ${t.artist}${t.genre ? ` [${t.genre}]` : ""}`).join("\n")}

Select up to ${count} tracks and create a cohesive playlist. Respond in JSON only, no markdown:
{"name": "Playlist Name", "description": "Brief description", "trackIds": [1, 2, 3]}`,
      },
    ],
  });

  const text = replyText;
  // Strip reasoning blocks the same way Doctor does — qwen3 / deepseek-r1
  // / gemma-thinking emit <think>...</think> before the JSON.
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `LLM did not return parseable JSON. First 200 chars: ${text.slice(0, 200)}`
    );
  }
  return JSON.parse(jsonMatch[0]);
}

export async function generateCoverArtPrompt(
  playlistName: string,
  trackTitles: string[],
  mood: string
): Promise<string> {
  const replyText = await generateText({
    maxTokens: 300,
    messages: [
      {
        role: "user",
        content: `Generate a creative, detailed prompt for an AI image generator to create album cover art for a playlist called "${playlistName}".

Mood: ${mood}
Sample tracks: ${trackTitles.slice(0, 5).join(", ")}

The prompt should describe a visually striking, abstract or artistic image suitable as album artwork. Keep it under 100 words. Respond with just the prompt text, nothing else.`,
      },
    ],
  });

  return replyText;
}

export async function generateCoverArt(prompt: string): Promise<string | null> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;

  try {
    const { default: Replicate } = await import("replicate");
    const replicate = new Replicate({ auth: token });

    const output = await replicate.run(
      "stability-ai/sdxl:7762fd07cf82c948c1b778f43d18a7e13c53b398abed3feed134d9822505c98b",
      {
        input: {
          prompt: prompt,
          width: 512,
          height: 512,
          num_outputs: 1,
          negative_prompt: "text, words, letters, watermark, low quality",
        },
      }
    );

    if (Array.isArray(output) && output.length > 0) {
      return output[0] as string;
    }
    return null;
  } catch (err) {
    console.error("Cover art generation failed:", err);
    return null;
  }
}
