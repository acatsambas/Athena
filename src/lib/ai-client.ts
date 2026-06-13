/**
 * @module ai-client
 * @description Multi-provider AI client supporting OpenAI, Anthropic, and Google Gemini.
 * Reads API key and provider selection from localStorage and communicates
 * with each provider's REST API directly via fetch.
 */

/** Supported AI provider identifiers. */
export type AIProvider = "openai" | "anthropic" | "gemini";

/** localStorage key for the user's API key. */
const API_KEY_STORAGE_KEY = "athena_api_key";

/** localStorage key for the selected AI provider/model. */
const PROVIDER_STORAGE_KEY = "athena_ai_model";

/**
 * Retrieves the API key stored in localStorage.
 * @returns The API key string.
 * @throws {Error} If no API key is found.
 */
function getApiKey(): string {
  const key = localStorage.getItem(API_KEY_STORAGE_KEY);
  if (!key) {
    throw new Error(
      "No API key found. Please set your API key in Settings before using AI features."
    );
  }
  return key;
}

/**
 * Retrieves the selected AI provider from localStorage.
 * @returns The provider identifier.
 * @throws {Error} If no provider is configured or the value is invalid.
 */
function getProvider(): AIProvider {
  const provider = localStorage.getItem(PROVIDER_STORAGE_KEY);
  if (!provider) {
    throw new Error(
      "No AI provider selected. Please choose a provider in Settings."
    );
  }
  if (!["openai", "anthropic", "gemini"].includes(provider)) {
    throw new Error(
      `Unknown AI provider "${provider}". Supported providers: openai, anthropic, gemini.`
    );
  }
  return provider as AIProvider;
}

// ---------------------------------------------------------------------------
// Provider-specific request implementations
// ---------------------------------------------------------------------------

/**
 * Sends a prompt to the OpenAI Chat Completions API.
 * @param apiKey - The OpenAI API key.
 * @param prompt - The user prompt.
 * @param systemPrompt - Optional system-level instruction.
 * @returns The assistant's response text.
 */
async function callOpenAI(
  apiKey: string,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenAI API error (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Sends a prompt to the Anthropic Messages API.
 * @param apiKey - The Anthropic API key.
 * @param prompt - The user prompt.
 * @param systemPrompt - Optional system-level instruction.
 * @returns The assistant's response text.
 */
async function callAnthropic(
  apiKey: string,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Anthropic API error (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  const textBlock = data.content?.find(
    (block: { type: string }) => block.type === "text"
  );
  return textBlock?.text ?? "";
}

/**
 * Sends a prompt to the Google Gemini generateContent API.
 * @param apiKey - The Google AI API key.
 * @param prompt - The user prompt.
 * @param systemPrompt - Optional system-level instruction.
 * @returns The model's response text.
 */
async function callGemini(
  apiKey: string,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  const body: Record<string, unknown> = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  };

  if (systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Gemini API error (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates text content from the configured AI provider.
 *
 * Reads the provider and API key from localStorage, dispatches the request
 * to the appropriate REST API, and returns the model's response as a string.
 *
 * @param prompt - The user-facing prompt / question to send.
 * @param systemPrompt - Optional system-level instruction to guide the model's behaviour.
 * @returns The model's text response.
 *
 * @example
 * ```ts
 * const explanation = await generateContent(
 *   "Explain fractions to a 7-year-old",
 *   "You are a friendly maths tutor."
 * );
 * ```
 */
export async function generateContent(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  try {
    const apiKey = getApiKey();
    const provider = getProvider();

    switch (provider) {
      case "openai":
        return await callOpenAI(apiKey, prompt, systemPrompt);
      case "anthropic":
        return await callAnthropic(apiKey, prompt, systemPrompt);
      case "gemini":
        return await callGemini(apiKey, prompt, systemPrompt);
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`AI request failed: ${String(error)}`);
  }
}

/**
 * Generates content and parses the response as JSON.
 *
 * Strips Markdown fenced-code-block wrappers (` ```json ... ``` `) that
 * models sometimes add around JSON output before parsing.
 *
 * @typeParam T - The expected shape of the parsed JSON object.
 * @param prompt - The user-facing prompt that should elicit a JSON response.
 * @param systemPrompt - Optional system-level instruction. Consider asking
 *   the model to "respond with valid JSON only" here.
 * @returns The parsed JSON object typed as `T`.
 *
 * @example
 * ```ts
 * interface Question { question: string; options: string[]; answer: number }
 * const questions = await generateJSON<Question[]>(
 *   "Generate 3 addition questions as JSON",
 *   "Respond with a JSON array only."
 * );
 * ```
 */
export async function generateJSON<T>(
  prompt: string,
  systemPrompt?: string
): Promise<T> {
  const raw = await generateContent(prompt, systemPrompt);

  // Strip optional Markdown code fences around JSON
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(
      `Failed to parse AI response as JSON. Raw response:\n${raw}`
    );
  }
}
