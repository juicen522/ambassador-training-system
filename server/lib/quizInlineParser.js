/**
 * 解析「题干（1分）[单选]A. xxB. yy（正确答案）C. zzD. ww」类排版（十如考核题等）
 */
import { normalizeQuestionType } from './quizImportShared.js';

const OPTION_RE =
  /([A-D])[\.、:：\)]\s*([^A-D]*?)(?:（正确答案）)?(?=[A-D][\.、:：\)]|$)/g;

const BLOCK_RE =
  /(.+?)（\d+分）\s*\[(单选|多选|判断)\]\s*([\s\S]*?)(?=(?:.+?（\d+分）\s*\[(?:单选|多选|判断)\])|$)/g;

function parseOptionsBlob(blob) {
  const options = [];
  const correctIndexes = [];
  const re = new RegExp(OPTION_RE.source, 'g');
  let m;
  while ((m = re.exec(blob)) !== null) {
    const idx = m[1].toUpperCase().charCodeAt(0) - 65;
    const hadCorrect = /（正确答案）/.test(m[2] || '') || m[0].includes('（正确答案）');
    const text = String(m[2] || '')
      .trim()
      .replace(/（正确答案）/g, '')
      .trim();
    if (!text) continue;
    options.push(text);
    if (hadCorrect) correctIndexes.push(idx);
  }
  return { options, correctIndexes: [...new Set(correctIndexes)].sort((a, b) => a - b) };
}

export function parseInlineBracketQuiz(rawText) {
  const text = String(rawText || '')
    .replace(/\r/g, '\n')
    .replace(/温故知新\s*[-－]\s*小测题目/g, '')
    .trim();
  if (!text) return [];

  const rows = [];
  const re = new RegExp(BLOCK_RE.source, BLOCK_RE.flags);
  let match;
  while ((match = re.exec(text)) !== null) {
    const question = String(match[1] || '')
      .trim()
      .replace(/\n+/g, ' ');
    const typeLabel = match[2];
    const { options, correctIndexes } = parseOptionsBlob(String(match[3] || ''));
    if (!question || options.length < 2) continue;

    let questionType = 'single';
    if (typeLabel === '多选') questionType = 'multiple';
    else if (typeLabel === '判断') questionType = 'boolean';

    let answer = '';
    if (questionType === 'multiple') {
      answer = correctIndexes.map((i) => String.fromCharCode(65 + i)).join(',');
    } else if (correctIndexes.length > 0) {
      answer = String.fromCharCode(65 + correctIndexes[0]);
    }

    rows.push({
      question,
      questionType: normalizeQuestionType(questionType),
      optionA: options[0] || '',
      optionB: options[1] || '',
      optionC: options[2] || '',
      optionD: options[3] || '',
      answer,
      answerText: '',
      score: 1,
      category: '',
      options,
    });
  }

  return rows;
}
