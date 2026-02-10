import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

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
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
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
    message.content[0].type === "text" ? message.content[0].text : "";
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
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
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
    message.content[0].type === "text" ? message.content[0].text : "";
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
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Create a playlist for: "${mood}"

Taste profile: ${profile}

Available tracks (select from these by ID):
${availableTracks.map((t) => `ID:${t.id} - "${t.title}" by ${t.artist}${t.genre ? ` [${t.genre}]` : ""}`).join("\n")}

Select up to ${count} tracks and create a cohesive playlist. Respond in JSON:
{"name": "Playlist Name", "description": "Brief description", "trackIds": [1, 2, 3]}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse playlist");
  return JSON.parse(jsonMatch[0]);
}

export async function generateCoverArtPrompt(
  playlistName: string,
  trackTitles: string[],
  mood: string
): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 300,
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

  return message.content[0].type === "text" ? message.content[0].text : "";
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
