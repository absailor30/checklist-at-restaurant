// AI photo verification via Groq's vision-capable models. Informational
// only: a failure or a "not verified" result never blocks the flow — it
// just gets shown to whoever reviews the answer later. Returns null (not
// false) when verification itself couldn't run, so callers can tell "AI
// said no" apart from "AI never ran."

const GROQ_MODEL = process.env.GROQ_VISION_MODEL || 'llama-3.2-11b-vision-preview';

export interface PhotoVerification {
  verified: boolean;
  note: string;
}

export async function verifyPhoto(
  base64: string,
  mimeType: string,
  questionPrompt: string
): Promise<PhotoVerification | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'You are checking evidence photos for a restaurant line-check audit. ' +
                `The photo was submitted for this checklist question: "${questionPrompt}". ` +
                'Does the photo plausibly show real evidence relevant to that question ' +
                '(not blank, not black, not an obviously unrelated subject, not a photo of a screen or another photo)? ' +
                'Be lenient — flag only clear mismatches or unusable photos, not lighting or framing. ' +
                'Reply with ONLY compact JSON: {"verified": true|false, "note": "one short sentence"}',
            },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        }],
      }),
    });

    if (!res.ok) {
      console.error('Groq verify failed:', res.status, await res.text().catch(() => ''));
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return { verified: Boolean(parsed.verified), note: String(parsed.note ?? '').slice(0, 300) };
  } catch (e) {
    console.error('Groq verify error:', e);
    return null;
  }
}
