/**
 * 使用已配置的 OpenAI 兼容 API，将非结构化试题文本解析为导入行。
 */
import { normalizeQuestionType } from './quizImportShared.js';

const SYSTEM_PROMPT = `你是培训系统题库结构化助手。用户会粘贴 Word/Excel 导出的试题原文（格式可能混乱）。
请识别每一道题，输出严格 JSON（不要 markdown 代码块），格式：
{
  "questions": [
    {
      "question": "题干",
      "questionType": "single|multiple|boolean|text",
      "options": ["选项A文字", "选项B文字"],
      "answer": "A 或 A,C 或 对/错",
      "answerText": "问答题参考答案，非 text 题型留空",
      "score": 1,
      "category": ""
    }
  ]
}
规则：
- questionType：单选=single，多选=multiple（答案多个字母），判断=boolean，简答=text
- options：选择题至少 2 项；判断题用 ["正确","错误"]
- answer：用选项字母 A/B/C/D，多选用逗号或连写如 AC；判断写 对/错 或 A/B
- 不要编造题目；无法识别的条目跳过
- 本段内每一道题都必须输出，不要省略、不要写「其余略」
- 只输出 JSON`;

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function mapAiQuestion(item) {
  const options = Array.isArray(item?.options)
    ? item.options.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const kind = normalizeQuestionType(item?.questionType || 'single');
  return {
    question: String(item?.question || '').trim(),
    questionType: kind,
    options,
    optionA: options[0] || '',
    optionB: options[1] || '',
    optionC: options[2] || '',
    optionD: options[3] || '',
    answer: String(item?.answer || '').trim(),
    answerText: String(item?.answerText || '').trim(),
    score: Math.max(1, Number(item?.score) || 1),
    category: String(item?.category || '').trim(),
  };
}

/** 单次 AI 输出 token 上限（题量大时需配合分段，避免 JSON 在约 20+ 题处被截断） */
const AI_OUTPUT_MAX_TOKENS = 16384;

export async function callAiJson(ai, userContent, maxTokens = AI_OUTPUT_MAX_TOKENS) {
  const response = await fetch(`${ai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ai.apiKey}`,
    },
    body: JSON.stringify({
      model: ai.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI 服务错误（${response.status}）${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('AI 未返回内容');
  const parsed = extractJsonObject(content);
  if (parsed) return parsed;
  const salvaged = salvageTruncatedQuestions(content);
  if (salvaged.length > 0) return { questions: salvaged };
  throw new Error('AI 返回格式无法解析为 JSON（输出可能被截断，将自动分段重试）');
}

/** 每段字符上限（偏小，避免单段题过多导致模型输出 JSON 被截断） */
const CHUNK_SIZE = 5500;

function estimateQuestionCount(text) {
  const numbered = text.match(/^(\d{1,3})[\.、\)]\s/mg);
  if (numbered && numbered.length > 0) return numbered.length;
  const answers = text.match(/^(?:答案|参考答案|正确答案)[:：]/gim);
  return answers?.length ?? 0;
}

function splitTextIntoChunks(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const breakAt = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'));
      if (breakAt > CHUNK_SIZE * 0.4) end = start + breakAt;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks.length > 0 ? chunks : [text];
}

function salvageTruncatedQuestions(rawContent) {
  const raw = String(rawContent || '');
  const arrStart = raw.indexOf('"questions"');
  if (arrStart < 0) return [];
  const bracket = raw.indexOf('[', arrStart);
  if (bracket < 0) return [];
  const slice = raw.slice(bracket);
  const objects = [];
  const re = /\{[^{}]*"question"\s*:\s*"([^"]*)"[^{}]*\}/g;
  let m;
  while ((m = re.exec(slice)) !== null) {
    try {
      const obj = JSON.parse(m[0]);
      if (obj?.question) objects.push(obj);
    } catch {
      /* skip malformed */
    }
  }
  return objects;
}

async function parseChunkWithAi(ai, chunkText, index, total) {
  const hint =
    total > 1
      ? `（共 ${total} 段，当前第 ${index + 1} 段；只解析本段文字中的题目，段内题目必须全部列出）\n\n`
      : '';
  const data = await callAiJson(ai, hint + chunkText);
  return Array.isArray(data?.questions) ? data.questions : [];
}

export async function parseQuizTextWithAi(rawText, ai) {
  const text = String(rawText || '').trim();
  if (!text) return [];

  const est = estimateQuestionCount(text);
  const needChunk = text.length > CHUNK_SIZE || est > 12;
  const chunks = needChunk ? splitTextIntoChunks(text) : [text];

  const merged = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const list = await parseChunkWithAi(ai, chunks[i], i, chunks.length);
    list.forEach((q) => {
      const row = mapAiQuestion(q);
      if (row.question) merged.push(row);
    });
  }
  return merged;
}
