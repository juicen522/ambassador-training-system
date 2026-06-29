export type ChatRole = 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

import { apiFetch } from './api';

export async function sendKnowledgeBasedChat(
  knowledgeContext: string,
  messages: ChatTurn[],
): Promise<string> {
  const data = await apiFetch('/chat', {
    method: 'POST',
    body: JSON.stringify({ knowledgeContext, messages }),
  });
  return data.reply ?? '（无回复）';
}

export async function checkAiServiceAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return false;
    const data = (await res.json()) as { aiConfigured?: boolean };
    return Boolean(data.aiConfigured);
  } catch {
    return false;
  }
}
