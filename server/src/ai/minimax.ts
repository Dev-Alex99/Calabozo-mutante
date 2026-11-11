import { config } from '../config.js';

interface MiniMaxMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callMiniMax(
  messages: MiniMaxMessage[],
  temperature = 0.7,
  maxTokens = 750
): Promise<string> {
  if (!config.minimax.apiKey) {
    throw new Error('MiniMax API Key is not configured');
  }

  const url = `${config.minimax.baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.minimax.apiKey}`,
    },
    body: JSON.stringify({
      model: config.minimax.model,
      messages,
      temperature,
      thinking: {
        type: 'adaptive',
      },
      reasoning_effort: 'low',
      max_completion_tokens: maxTokens,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`MiniMax API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('MiniMax response missing message content');
  }

  return cleanJsonMarkdown(content);
}

export function cleanJsonMarkdown(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}
