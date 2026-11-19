import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { GEMINI_CONFIG } from './config.ts';

export class GeminiForensicError extends Error {
  statusCode: number;
  retryAfterSec: number | null;
  code: string;

  constructor(message: string, statusCode = 500, code = 'GEMINI_ERROR', retryAfterSec: number | null = null) {
    super(message);
    this.name = 'GeminiForensicError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiForensicError(
      'GEMINI_API_KEY is not configured in the server environment. Set it in Settings > Secrets or use the Offline Demo Preview.',
      503,
      'API_KEY_MISSING'
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

function parseRetryDelayMs(err: unknown): number | null {
  const errObj = err as Record<string, unknown> | undefined;
  const msg = String(errObj?.message || err || '');

  // Check Retry-After or Google RetryInfo seconds in message
  const retryMatch = msg.match(/retry(?:Delay| in|\s+after)?[:\s=]+(\d+(?:\.\d+)?)\s*s/i);
  if (retryMatch) {
    const sec = parseFloat(retryMatch[1]);
    if (!Number.isNaN(sec) && sec > 0 && sec <= 60) {
      return Math.ceil(sec * 1000);
    }
  }
  return null;
}

function isRetryableError(err: unknown): { retryable: boolean; notFound: boolean; status: number } {
  const errObj = err as Record<string, unknown> | undefined;
  const status = Number(errObj?.status || errObj?.code || 0);
  const msg = String(errObj?.message || err || '').toLowerCase();

  const notFound =
    status === 404 ||
    msg.includes('not_found') ||
    msg.includes('not found') ||
    msg.includes('is not supported for generatecontent');

  const retryable =
    status === 429 ||
    status === 503 ||
    status === 500 ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable') ||
    msg.includes('timeout');

  return { retryable, notFound, status: status || 500 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GeminiCallTelemetry {
  modelUsed: string;
  fallbackUsed: boolean;
  attempts: number;
  warnings: string[];
}

export async function generateContentWithFallback(
  params: Omit<GenerateContentParameters, 'model'>,
  preferredModel?: string
): Promise<{ response: GenerateContentResponse; telemetry: GeminiCallTelemetry }> {
  const ai = getGeminiClient();
  const modelChain = Array.from(
    new Set([
      preferredModel || GEMINI_CONFIG.primaryModel,
      ...GEMINI_CONFIG.fallbackModels,
    ])
  );

  const warnings: string[] = [];
  let totalAttempts = 0;
  let lastError: unknown = null;
  let lastRetryAfterSec: number | null = null;

  for (let mIdx = 0; mIdx < modelChain.length; mIdx++) {
    const model = modelChain[mIdx];
    const isFallback = mIdx > 0;

    for (let attempt = 0; attempt <= GEMINI_CONFIG.maxRetriesPerModel; attempt++) {
      totalAttempts++;
      try {
        const response = await ai.models.generateContent({
          ...params,
          model,
        });
        return {
          response,
          telemetry: {
            modelUsed: model,
            fallbackUsed: isFallback,
            attempts: totalAttempts,
            warnings,
          },
        };
      } catch (err) {
        lastError = err;
        const { retryable, notFound, status } = isRetryableError(err);

        if (status === 400 && String((err as Error)?.message || '').toLowerCase().includes('api_key_invalid')) {
          throw new GeminiForensicError(
            'Configured GEMINI_API_KEY was rejected as invalid. Please check Settings > Secrets.',
            401,
            'API_KEY_INVALID'
          );
        }

        if (notFound) {
          warnings.push(`Model "${model}" unavailable (404/unsupported); switching to next fallback model.`);
          break; // skip retries on this model and try next fallback
        }

        if (retryable && attempt < GEMINI_CONFIG.maxRetriesPerModel) {
          const serverDelayMs = parseRetryDelayMs(err);
          const expDelayMs = GEMINI_CONFIG.baseBackoffMs * Math.pow(2, attempt);
          const jitterMs = Math.floor(Math.random() * 350);
          const waitMs = Math.min(serverDelayMs ?? expDelayMs + jitterMs, 15000);
          if (serverDelayMs) {
            lastRetryAfterSec = Math.ceil(serverDelayMs / 1000);
          }
          warnings.push(`Transient limit on "${model}" (attempt ${attempt + 1}); backed off ${waitMs}ms.`);
          await sleep(waitMs);
          continue;
        }

        if (retryable) {
          warnings.push(`Exhausted retries on "${model}"; trying next configured fallback.`);
          break;
        }

        // Non-retryable error (e.g., bad schema or invalid payload)
        throw new GeminiForensicError(
          `Gemini analysis error on model "${model}": ${String((err as Error)?.message || err)}`,
          status >= 400 && status < 600 ? status : 500,
          'GEMINI_REQUEST_FAILED',
          lastRetryAfterSec
        );
      }
    }
  }

  const finalMsg = String((lastError as Error)?.message || lastError || 'All configured Gemini models failed.');
  throw new GeminiForensicError(
    `Forensic AI inference failed after trying [${modelChain.join(', ')}]: ${finalMsg}`,
    503,
    'GEMINI_UNAVAILABLE',
    lastRetryAfterSec
  );
}

export async function verifyGeminiConfigStatus(): Promise<{
  apiKeyConfigured: boolean;
  primaryModel: string;
  fallbackModels: string[];
  transcribeModel: string;
}> {
  const key = process.env.GEMINI_API_KEY;
  return {
    apiKeyConfigured: Boolean(key && key !== 'MY_GEMINI_API_KEY'),
    primaryModel: GEMINI_CONFIG.primaryModel,
    fallbackModels: GEMINI_CONFIG.fallbackModels,
    transcribeModel: GEMINI_CONFIG.transcribeModel,
  };
}
