const RETRYABLE_STATUS_CODES = new Set([404, 429, 500, 503, 504]);
const RETRYABLE_ERROR_TEXT = /RESOURCE_EXHAUSTED|rate.?limit|quota|model.{0,30}(not found|unavailable|not supported)|overloaded|temporarily unavailable/i;

export function getModelCandidates(primary, fallbackList, defaults) {
  const configuredFallbacks = fallbackList
    ?.split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  const fallbackModels = configuredFallbacks?.length ? configuredFallbacks : defaults;
  return [...new Set([primary, ...fallbackModels].filter(Boolean))];
}

export async function generateWithModelFallback(candidates, generate) {
  let lastError;

  for (const model of candidates) {
    try {
      const response = await generate(model);
      return { response, model };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
      const details = `${error?.message || ''} ${error?.details || ''} ${error?.cause?.message || ''}`;
      const shouldTryNext = RETRYABLE_STATUS_CODES.has(status) || RETRYABLE_ERROR_TEXT.test(details);
      if (!shouldTryNext || model === candidates.at(-1)) throw error;
      console.warn(`Gemini model ${model} unavailable or rate-limited (HTTP ${status || 'unknown'}); trying the next configured model.`);
    }
  }

  throw lastError || new Error('No Gemini models are configured.');
}
