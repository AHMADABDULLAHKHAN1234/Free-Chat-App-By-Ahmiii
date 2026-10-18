# Free Chat App by Ahmii

A Next.js chat app powered by Gemini, with image/sticker generation, file attachments, voice input, and a prompt kit.

## Run locally

1. Install Node.js 20 or newer.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and add your provider key(s).
4. Start with `npm run dev`, then open `http://localhost:3000`.

### Required and optional API keys

- `GEMINI_API_KEY` — required for Gemini chat, image generation, and stickers. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
- `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `GEMINI_IMAGE_MODEL`, and `GEMINI_IMAGE_FALLBACK_MODELS` are optional model overrides. Defaults are in `.env.example` as comments.

Never commit `.env.local`, publish API keys, or expose provider keys through `NEXT_PUBLIC_` variables. The `.gitignore` excludes `.env*` files. If a key was accidentally shared, revoke it and create a replacement.

## Deploy on Vercel

The project is connected to GitHub at `AHMADABDULLAHKHAN1234/Free-Chat-App-By-Ahmiii`. If Vercel is connected to that repository, each push to `main` should trigger a production deployment.

Before chat and image features can work in production:

1. Open the project in the Vercel dashboard.
2. Go to **Settings → Environment Variables**.
3. Add `GEMINI_API_KEY` with your Google AI Studio key for **Production** (and Preview/Development if those deployments need it).
4. Save and redeploy the latest deployment so the new variables are loaded.

Do not put API keys in GitHub, source files, or `NEXT_PUBLIC_` variables. The key is read only by server API routes. The site itself can load without a key, but chat, image, and sticker generation require `GEMINI_API_KEY`.

Vercel Hobby can host personal, non-commercial projects within its current quotas. Provider API usage has separate quotas and may incur charges. Review current Vercel and AI-provider terms, quotas, and pricing before opening the site to the public.

## File upload notes

The app currently accepts up to 5 attachments, with a 60 MB combined limit. DOCX and PPTX text is extracted in the browser. Images and PDFs are sent to Gemini and may exceed Gemini's own request or model limits even when they pass the app's upload checks.

## Checks

- `npm run lint`
- `npm run build`
