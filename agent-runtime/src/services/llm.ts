import OpenAI from 'openai';
import { config } from '../config.js';

const client = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  ...(config.OPENAI_BASE_URL ? { baseURL: config.OPENAI_BASE_URL } : {}),
});

// Codex and some legacy models use the completions API, not chat
function isChatModel(model: string): boolean {
  const completionOnlyPatterns = ['codex', 'davinci', 'babbage', 'curie', 'ada'];
  const lower = model.toLowerCase();
  return !completionOnlyPatterns.some((p) => lower.includes(p));
}

async function chatComplete(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await client.chat.completions.create({
    model: config.LLM_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response');
  }
  return content;
}

async function textComplete(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const prompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
  const response = await client.completions.create({
    model: config.LLM_MODEL,
    prompt,
    temperature: 0.3,
    max_tokens: 4096,
  });

  const content = response.choices[0]?.text;
  if (!content) {
    throw new Error('LLM returned empty response');
  }
  return content.trim();
}

export async function complete(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const useChat = isChatModel(config.LLM_MODEL);

  try {
    console.log(
      `[LLM] Calling ${config.LLM_MODEL} via ${useChat ? 'chat' : 'completions'} API (${userPrompt.length} chars input)`,
    );

    const content = useChat
      ? await chatComplete(systemPrompt, userPrompt)
      : await textComplete(systemPrompt, userPrompt);

    console.log(`[LLM] Response received (${content.length} chars)`);
    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[LLM] Error: ${msg}`);

    // If chat endpoint fails with "not a chat model", retry with completions
    if (useChat && msg.includes('not a chat model')) {
      console.log(`[LLM] Retrying with completions API...`);
      return textComplete(systemPrompt, userPrompt);
    }

    if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_api_key')) {
      throw new Error(`LLM authentication failed. Check your OPENAI_API_KEY in .env`);
    }
    if (msg.includes('model_not_found') || msg.includes('does not exist')) {
      throw new Error(`Model "${config.LLM_MODEL}" not found. Check LLM_MODEL in .env`);
    }
    if (msg.includes('429')) {
      throw new Error(`Rate limited or quota exceeded. Check your OpenAI billing.`);
    }
    throw new Error(`LLM call failed: ${msg}`);
  }
}
