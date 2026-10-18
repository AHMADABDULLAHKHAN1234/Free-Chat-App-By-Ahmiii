import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { generateWithModelFallback, getModelCandidates } from '../../lib/gemini-fallback.js';

const MAX_FILE_BYTES = 60 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 60 * 1024 * 1024;

export async function POST(request) {
  let activeProvider = 'unknown';
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const body = await request.json();
    const { message, history = [], attachments = [], language = 'Auto detect', mode = 'standard', provider = 'gemini', groqModel } = body;
    activeProvider = provider;
    if (typeof message !== 'string' || !message.trim() || !Array.isArray(history) || !Array.isArray(attachments)) {
      return Response.json({ error: 'Please provide a message and valid chat history.' }, { status: 400 });
    }
    if (attachments.length > 5) {
      return Response.json({ error: 'Attach no more than 5 files at a time.' }, { status: 413 });
    }

    let totalAttachmentBytes = 0;
    for (const file of attachments) {
      if (!file || typeof file.name !== 'string' || typeof file.mimeType !== 'string') {
        return Response.json({ error: 'One of the attachments is invalid. Please remove it and try again.' }, { status: 400 });
      }
      const fileBytes = typeof file.data === 'string'
        ? Math.max(0, Math.floor(file.data.length * 3 / 4) - (file.data.endsWith('==') ? 2 : file.data.endsWith('=') ? 1 : 0))
        : typeof file.text === 'string' ? Buffer.byteLength(file.text, 'utf8') : 0;
      if (fileBytes > MAX_FILE_BYTES) {
        return Response.json({ error: `${file.name} exceeds the 60 MB per-file limit.` }, { status: 413 });
      }
      totalAttachmentBytes += fileBytes;
      if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        return Response.json({ error: 'Attachments exceed the 60 MB combined limit. Remove a file or choose smaller files.' }, { status: 413 });
      }
    }

    const contents = history
      .filter((turn) => turn && typeof turn.content === 'string' && ['user', 'model'].includes(turn.role))
      .map((turn) => ({ role: turn.role, parts: [{ text: turn.content }] }));

    const userParts = [{ text: message.trim() }];
    for (const file of attachments.slice(0, 5)) {
      if (!file || typeof file.name !== 'string' || typeof file.mimeType !== 'string') continue;
      if (typeof file.text === 'string') {
        userParts.push({ text: `Attached file: ${file.name}\n${file.text.slice(0, 80_000)}` });
      } else if (typeof file.data === 'string' && (/^image\/(jpeg|png|webp|gif)$/.test(file.mimeType) || file.mimeType === 'application/pdf')) {
        userParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
      }
    }
    contents.push({ role: 'user', parts: userParts });

    const instructions = [];
    if (language && language !== 'Auto detect') instructions.push(`Respond in ${language}.`);
    if (mode === 'think') instructions.push('Think carefully through the request and give a clear, well-reasoned answer. Do not reveal private chain-of-thought; provide a concise rationale and useful conclusions.');
    if (mode === 'research') instructions.push('Use Google Search grounding to verify current or time-sensitive claims. Clearly distinguish sourced facts from uncertainty.');

    if (provider === 'groq') {
      const groqApiKey = process.env.GROQ_API_KEY;
      if (!groqApiKey) {
        return Response.json({ error: 'Groq is not configured. Locally, add GROQ_API_KEY to .env.local. On Vercel, add it under Project Settings → Environment Variables, then redeploy.' }, { status: 503 });
      }
      const supportedGroqModels = new Set(['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']);
      const model = supportedGroqModels.has(groqModel) ? groqModel : 'openai/gpt-oss-120b';
      const groq = new Groq({ apiKey: groqApiKey });
      const groqMessages = [
        ...(instructions.length ? [{ role: 'system', content: instructions.join(' ') }] : []),
        ...contents.flatMap((turn) => turn.parts.map((part) => ({ role: turn.role === 'model' ? 'assistant' : 'user', content: part.text }))),
        { role: 'user', content: userParts.map((part) => 'text' in part ? part.text : '[An image or PDF was attached. Groq text models cannot inspect this attachment; use Gemini for image or PDF understanding.]').join('\n') },
      ];
      const completion = await groq.chat.completions.create({ model, messages: groqMessages });
      return Response.json({ reply: completion.choices[0]?.message?.content || 'No response text generated.', model, provider: 'groq' });
    }
    if (provider !== 'gemini') {
      return Response.json({ error: 'Select Gemini or Groq as the chat provider.' }, { status: 400 });
    }
    if (!apiKey) {
      return Response.json(
        { error: 'Gemini is not configured. Locally, add GEMINI_API_KEY to .env.local. On Vercel, add it under Project Settings → Environment Variables for Production, then redeploy. Or select Groq and configure GROQ_API_KEY.' },
        { status: 503 },
      );
    }

    const config = {};
    if (instructions.length) config.systemInstruction = instructions.join(' ');
    if (mode === 'research') config.tools = [{ googleSearch: {} }];

    const ai = new GoogleGenAI({ apiKey });
    const modelCandidates = getModelCandidates(
      process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      process.env.GEMINI_FALLBACK_MODELS,
      ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
    );
    const { response, model } = await generateWithModelFallback(modelCandidates, (model) =>
      ai.models.generateContent({
        model,
        contents,
        ...(Object.keys(config).length ? { config } : {}),
      }),
    );

    return Response.json({ reply: response.text || 'No response text generated.', model });
  } catch (error) {
    const providerError = error instanceof Error ? error : new Error(`Unknown ${activeProvider} error`);
    const status = Number(providerError.status || providerError.statusCode || 500);
    const service = activeProvider === 'groq' ? 'Groq' : 'Gemini';
    console.error(`${service} chat request failed:`, { status, message: providerError.message });

    let message = `${service} could not complete the request. Check the server terminal for provider details.`;
    if (status === 401 || status === 403) {
      message = `${service} rejected its API key. Check the server-side ${activeProvider === 'groq' ? 'GROQ_API_KEY' : 'GEMINI_API_KEY'} setting and provider access.`;
    } else if (status === 429) {
      message = `${service} rate limit or quota reached. Check your provider usage limits and try again later.`;
    } else if (status === 404) {
      message = `${service} model is unavailable or retired. Choose another model in the selector and try again.`;
    } else if (status >= 400 && status < 500) {
      message = `${service} rejected the request (HTTP ${status}). Check the server terminal for details; the API key is not logged.`;
    }

    return Response.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
  }
}
