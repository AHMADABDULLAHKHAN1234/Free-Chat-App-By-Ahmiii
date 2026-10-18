import { GoogleGenAI } from '@google/genai';
import { generateWithModelFallback, getModelCandidates } from '../../lib/gemini-fallback.js';

export async function POST(request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'Image generation needs GEMINI_API_KEY. Locally, add it to .env.local. On Vercel, add it under Project Settings → Environment Variables for Production, then redeploy.' }, { status: 503 });
    }

    const { prompt, kind = 'image' } = await request.json();
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return Response.json({ error: 'Describe the image you want to create.' }, { status: 400 });
    }
    if (prompt.length > 4000 || !['image', 'sticker'].includes(kind)) {
      return Response.json({ error: 'Please use a prompt under 4,000 characters and choose image or sticker.' }, { status: 400 });
    }

    const imagePrompt = kind === 'sticker'
      ? `Create one polished, friendly sticker based on this description: ${prompt.trim()}. Use a single centered subject, expressive design, crisp bold white die-cut outline, vivid colors, clean simple background, no watermark, and avoid any text unless specifically requested.`
      : `Create a high-quality image based on this description: ${prompt.trim()}. Compose it clearly with thoughtful lighting and detail.`;

    const ai = new GoogleGenAI({ apiKey });
    const modelCandidates = getModelCandidates(
      process.env.GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1',
      process.env.GEMINI_IMAGE_FALLBACK_MODELS,
      ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image'],
    );
    const { response, model } = await generateWithModelFallback(modelCandidates, (model) =>
      ai.models.generateContent({
        model,
        contents: imagePrompt,
        config: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    );

    const parts = response.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const imagePart = parts.find((part) => part.inlineData?.data && part.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart?.inlineData) {
      return Response.json({ error: 'The image model did not return an image. Try a more specific prompt.' }, { status: 502 });
    }

    return Response.json({ imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`, model });
  } catch (error) {
    const providerError = error instanceof Error ? error : new Error('Unknown image-generation error');
    const status = Number(providerError.status || providerError.statusCode || 500);
    console.error('Gemini image request failed:', { status, message: providerError.message });

    let message = 'Image generation failed. Check the server terminal for the provider error.';
    if (status === 401 || status === 403) message = 'Gemini rejected the API key or image-model access. Check access in Google AI Studio.';
    else if (status === 429) message = 'Gemini image quota or rate limit reached. Check usage and try again later.';
    else if (status === 404) message = 'The image model is unavailable to this key or project. Check image-model access in Google AI Studio.';
    return Response.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
  }
}
