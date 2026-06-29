import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { getDb } from '../db/database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { fixUploadedFileName } from '../lib/filenameEncoding.js';
import { getAiRuntimeConfig } from '../settings.js';
import { parseQuizTextWithAi } from '../lib/quizAiParse.js';
import { extractQuizImportText } from '../lib/quizImportExtract.js';
import { optionsFromImportRow } from '../lib/quizImportShared.js';
import { parseInlineBracketQuiz } from '../lib/quizInlineParser.js';
import {
  KNOWLEDGE_EXAM_QUESTION_LIMIT,
  syncExamBanksFromSource,
} from '../lib/quizExamSync.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '../uploads/quiz-imports');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  defParamCharset: 'utf8',
});

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function parseOptions(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return null;
    }
  }
  return null;
}

function parseIndexes(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v >= 0)
      .sort((a, b) => a - b);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v >= 0)
          .sort((a, b) => a - b);
      }
    } catch {
      return [];
    }
  }
  return [];
}

function alphaToIndex(ch) {
  const code = String(ch || '').trim().toUpperCase().charCodeAt(0);
  return code >= 65 && code <= 90 ? code - 65 : -1;
}

function normalizeQuestionType(raw) {
  const t = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (['single', '单选', '单选题', '单项选择', '单项选择题'].includes(t)) return 'single';
  if (['multiple', 'multi', '多选', '多选题', '多项选择', '多项选择题'].includes(t)) return 'multiple';
  if (['boolean', 'judge', '判断', '判断题'].includes(t)) return 'boolean';
  if (['text', 'qa', '问答', '问答题', '简答', '简答题'].includes(t)) return 'text';
  return 'single';
}

function parseAnswerToken(token, optionsLen, options = []) {
  const text = String(token || '').trim();
  if (!text) return { correctIndex: -1, correctIndexes: [] };

  const optionList = Array.isArray(options) ? options.map((x) => String(x || '').trim()) : [];
  const textHits = [];
  optionList.forEach((opt, idx) => {
    if (!opt || opt.length < 2) return;
    if (text === opt || text.includes(opt)) textHits.push(idx);
  });
  if (textHits.length > 0) {
    const uniq = [...new Set(textHits)].sort((a, b) => a - b);
    return { correctIndex: uniq[0] ?? -1, correctIndexes: uniq };
  }

  const splitParts = text
    .split(/[、,，;；\s]+|(?:和|及|与|或者?)/)
    .map((p) => p.trim())
    .filter(Boolean);
  const letterParts = [];
  for (const part of splitParts) {
    const compact = part.replace(/[^A-Za-z0-9]/g, '');
    if (/^[A-D]+$/i.test(compact) && compact.length > 1) {
      compact
        .toUpperCase()
        .split('')
        .forEach((ch) => letterParts.push(ch));
      continue;
    }
    letterParts.push(part);
  }

  const idxs = letterParts
    .map((p) => {
      const n = Number(p);
      if (Number.isInteger(n) && n >= 1) return n - 1;
      const letter = String(p || '').trim().toUpperCase();
      if (letter.length === 1) return alphaToIndex(letter);
      return -1;
    })
    .filter((v) => Number.isInteger(v) && v >= 0 && v < optionsLen);
  const uniq = [...new Set(idxs)].sort((a, b) => a - b);
  return {
    correctIndex: uniq[0] ?? -1,
    correctIndexes: uniq,
  };
}

function inferQuestionKind(row, options, answerRaw) {
  let kind = normalizeQuestionType(row.questionType || 'single');
  if (kind === 'single' && options.length === 0 && answerRaw && !/^[A-D](?:[、,，\s]*[A-D])*$/i.test(answerRaw)) {
    kind = 'text';
  }
  if (kind === 'single' && /^[A-D](?:[、,，\s]+[A-D])+$/i.test(answerRaw)) {
    kind = 'multiple';
  }
  if (kind === 'single' && /^[A-D]{2,}$/i.test(answerRaw.replace(/[^A-Za-z]/g, ''))) {
    kind = 'multiple';
  }
  if (kind === 'single' && options.length > 0) {
    const parsed = parseAnswerToken(answerRaw, options.length, options);
    if (parsed.correctIndexes.length > 1) kind = 'multiple';
  }
  return kind;
}

function isSectionTitleLine(line) {
  const text = String(line || '').trim();
  if (!text) return true;
  return /^(单选题|多选题|判断题|问答题|简答题|测试题|考核题|第[一二三四五六七八九十\d]+部分)/.test(text);
}

function parseDocxChoiceBlocks(rawText) {
  const lines = String(rawText || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const rows = [];
  let sectionType = 'single';
  let i = 0;
  while (i < lines.length) {
    const q = lines[i];
    if (/单选/.test(q) && q.length <= 24 && !/[？?]/.test(q)) {
      sectionType = 'single';
      i += 1;
      continue;
    }
    if (/多选/.test(q) && q.length <= 24 && !/[？?]/.test(q)) {
      sectionType = 'multiple';
      i += 1;
      continue;
    }
    if (/判断/.test(q) && q.length <= 24 && !/[？?]/.test(q)) {
      sectionType = 'boolean';
      i += 1;
      continue;
    }
    if (/^(问答题|简答题)/.test(q) || (/问答|简答/.test(q) && q.length <= 24)) {
      sectionType = 'text';
      i += 1;
      continue;
    }
    if (!q || isSectionTitleLine(q) || /^([A-D])[\.、:：\)]/.test(q) || /^(答案|参考答案|正确答案|标准答案|【答案】)/.test(q)) {
      i += 1;
      continue;
    }
    const a = lines[i + 1] || '';
    const b = lines[i + 2] || '';
    const c = lines[i + 3] || '';
    const d = lines[i + 4] || '';
    if (!/^A[\.、:：\)]/i.test(a) || !/^B[\.、:：\)]/i.test(b) || !/^C[\.、:：\)]/i.test(c) || !/^D[\.、:：\)]/i.test(d)) {
      i += 1;
      continue;
    }
    const stripOpt = (lineText) => String(lineText || '').replace(/^[A-D][\.、:：\)]\s*/i, '').trim();
    let optionD = stripOpt(d);
    let answer = '';
    const inlineAns = /(答案|参考答案|正确答案|标准答案|【答案】)\s*[:：]\s*(.+)$/i.exec(optionD);
    if (inlineAns) {
      optionD = optionD.slice(0, inlineAns.index).trim();
      answer = String(inlineAns[2] || '').trim();
    } else {
      const next = lines[i + 5] || '';
      const nextAns = /^(答案|参考答案|正确答案|标准答案|【答案】)\s*[:：]?\s*(.+)$/i.exec(next);
      if (nextAns) {
        answer = String(nextAns[2] || '').trim();
      }
    }
    rows.push({
      question: q.replace(/^(\d+)[\.、\)]\s*/, '').trim(),
      questionType:
        /[A-D][、,，\s]+[A-D]/i.test(answer) || /[A-D]{2,}/i.test(answer)
          ? 'multiple'
          : sectionType,
      optionA: stripOpt(a),
      optionB: stripOpt(b),
      optionC: stripOpt(c),
      optionD,
      answer,
      answerText: '',
      score: 1,
      category: '',
    });
    i += answer ? 6 : 5;
  }
  return rows;
}

function rowsFromSmartText(rawText) {
  const text = String(rawText || '').replace(/\r/g, '\n');
  const lines = text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const structuredRows = parseDocxChoiceBlocks(text);
  if (structuredRows.length > 0) return structuredRows;

  const rows = [];
  let cur = null;
  const pushCur = () => {
    if (!cur || !String(cur.question || '').trim()) return;
    rows.push(cur);
  };
  const newRow = (question) => ({
    question: String(question || '').trim(),
    questionType: 'single',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    answer: '',
    answerText: '',
    score: 1,
    category: '',
  });

  for (const line of lines) {
    const qMatch = /^(\d+)[\.、\)]\s*(.+)$/.exec(line);
    if (qMatch) {
      pushCur();
      cur = newRow(qMatch[2]);
      continue;
    }

    if (!cur) {
      cur = newRow(line);
      continue;
    }

    const optMatch = /^([A-D])[\.、:：\)]\s*(.+)$/i.exec(line);
    if (optMatch) {
      const key = `option${optMatch[1].toUpperCase()}`;
      cur[key] = String(optMatch[2] || '').trim();
      continue;
    }

    const ansMatch = /^(?:答案|参考答案|正确答案|标准答案|【答案】)[:：]?\s*(.+)$/i.exec(line);
    if (ansMatch) {
      cur.answer = String(ansMatch[1] || '').trim();
      continue;
    }

    const typeMatch = /^(?:题型|类型|试题类型)[:：]?\s*(.+)$/i.exec(line);
    if (typeMatch) {
      cur.questionType = normalizeQuestionType(typeMatch[1]);
      continue;
    }

    const scoreMatch = /^(?:分值|分数|题目分值)[:：]?\s*(\d+)$/i.exec(line);
    if (scoreMatch) {
      cur.score = Number(scoreMatch[1]) || 1;
      continue;
    }

    const catMatch = /^(?:分类|知识点|章节)[:：]?\s*(.+)$/i.exec(line);
    if (catMatch) {
      cur.category = String(catMatch[1] || '').trim();
      continue;
    }

    // Continuation line: append to question stem by default.
    cur.question = `${cur.question}\n${line}`.trim();
  }
  pushCur();

  return rows
    .map((row) => {
      const opts = [row.optionA, row.optionB, row.optionC, row.optionD].filter((x) => String(x || '').trim());
      const ans = String(row.answer || '').trim();
      let kind = normalizeQuestionType(row.questionType || 'single');

      if (kind === 'single' && opts.length === 0 && ans && /^(对|错|正确|错误|true|false)$/i.test(ans)) {
        kind = 'boolean';
      }
      if (kind === 'single' && opts.length === 0 && ans && !/^[A-D](?:[、,，\s]*[A-D])*$/i.test(ans)) {
        kind = 'text';
      }
      if (kind === 'boolean' && opts.length === 0) {
        row.optionA = '正确';
        row.optionB = '错误';
        if (/^(错|错误|false)$/i.test(ans)) row.answer = 'B';
        else if (/^(对|正确|true)$/i.test(ans)) row.answer = 'A';
      }
      row.questionType = kind;
      return row;
    })
    .filter((row) => row.question);
}

function rowsFromExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const normalizeKey = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_（）()【】\[\]\-—:：]/g, '');
  const knownHeaderSet = new Set(
    [
      'question', '题目', '题干', '问题', '试题', '题干内容',
      'questionType', '题型', '类型', '试题类型',
      'optionA', 'A', '选项A', '选项1', '选项一', 'a选项',
      'optionB', 'B', '选项B', '选项2', '选项二', 'b选项',
      'optionC', 'C', '选项C', '选项3', '选项三', 'c选项',
      'optionD', 'D', '选项D', '选项4', '选项四', 'd选项',
      'answer', '答案', '正确答案', '标准答案',
      'answerText', '参考答案', '问答答案', '主观题答案',
      'score', '分值', '分数', '题目分值',
      'category', '分类', '知识点', '章节',
    ].map(normalizeKey),
  );
  const pick = (obj, keys) => {
    const map = new Map();
    Object.keys(obj || {}).forEach((k) => map.set(normalizeKey(k), obj[k]));
    for (const rawKey of keys) {
      const nk = normalizeKey(rawKey);
      if (!map.has(nk)) continue;
      const v = map.get(nk);
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  };
  const mapRow = (r) => ({
    question: pick(r, ['question', '题目', '题干', '问题', '试题', '题干内容']),
    questionType: normalizeQuestionType(pick(r, ['questionType', '题型', '类型', '试题类型'])),
    optionA: pick(r, ['optionA', 'A', '选项A', '选项1', '选项一', 'a选项']),
    optionB: pick(r, ['optionB', 'B', '选项B', '选项2', '选项二', 'b选项']),
    optionC: pick(r, ['optionC', 'C', '选项C', '选项3', '选项三', 'c选项']),
    optionD: pick(r, ['optionD', 'D', '选项D', '选项4', '选项四', 'd选项']),
    answer: pick(r, ['answer', '答案', '正确答案', '标准答案']),
    answerText: pick(r, ['answerText', '参考答案', '问答答案', '主观题答案']),
    score: pick(r, ['score', '分值', '分数', '题目分值']) || 1,
    category: pick(r, ['category', '分类', '知识点', '章节']),
  });
  const primary = rows.map(mapRow);
  if (primary.length > 0) return primary;

  // Fallback 1: locate real header row (some files have title rows before headers)
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!Array.isArray(matrix) || matrix.length === 0) return [];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(12, matrix.length); i += 1) {
    const row = Array.isArray(matrix[i]) ? matrix[i] : [];
    const hit = row.reduce(
      (acc, cell) => acc + (knownHeaderSet.has(normalizeKey(cell)) ? 1 : 0),
      0,
    );
    if (hit >= 2) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx >= 0) {
    const headers = (matrix[headerIdx] || []).map((h) => String(h || ''));
    const bodyRows = matrix.slice(headerIdx + 1).filter((r) =>
      Array.isArray(r) && r.some((c) => String(c || '').trim() !== ''),
    );
    const mapped = bodyRows.map((cells) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = cells[idx] ?? '';
      });
      return mapRow(obj);
    });
    if (mapped.length > 0) return mapped;
  }

  // Fallback 2: no headers, parse by fixed column order
  const pickQuestionColIndex = (cells) => {
    const maxScan = Math.min(4, cells.length);
    for (let i = 0; i < maxScan; i += 1) {
      const text = String(cells[i] ?? '').trim();
      if (!text) continue;
      // Skip pure serial number cells like "1", "2", "3"
      if (/^\d+$/.test(text)) continue;
      return i;
    }
    return 0;
  };
  const orderedRows = matrix
    .filter((r) => Array.isArray(r) && r.some((c) => String(c || '').trim() !== ''))
    .map((r) => {
      const q = pickQuestionColIndex(r);
      return {
        question: String(r[q] ?? '').trim(),
        questionType: normalizeQuestionType(r[q + 1]),
        optionA: String(r[q + 2] ?? '').trim(),
        optionB: String(r[q + 3] ?? '').trim(),
        optionC: String(r[q + 4] ?? '').trim(),
        optionD: String(r[q + 5] ?? '').trim(),
        answer: String(r[q + 6] ?? '').trim(),
        answerText: String(r[q + 7] ?? '').trim(),
        score: String(r[q + 8] ?? '').trim() || 1,
        category: String(r[q + 9] ?? '').trim(),
      };
    })
    .filter((r) => r.question);
  if (orderedRows.length > 0) return orderedRows;

  // Fallback 3: one-column or mixed text content, parse by question text patterns.
  const mergedText = matrix
    .filter((r) => Array.isArray(r))
    .map((r) => r.map((c) => String(c || '').trim()).filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n');
  return rowsFromSmartText(mergedText);
}

function rowsFromDocxText(rawText) {
  const inlineRows = parseInlineBracketQuiz(rawText);
  if (inlineRows.length > 0) return inlineRows;

  const structuredRows = parseDocxChoiceBlocks(rawText);
  if (structuredRows.length > 0) return structuredRows;

  const blocks = rawText
    .split(/\n\s*\n/g)
    .map((b) => b.trim())
    .filter(Boolean);
  const rows = [];
  for (const b of blocks) {
    const lines = b.split('\n').map((x) => x.trim()).filter(Boolean);
    const row = {
      question: '',
      questionType: 'single',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      answer: '',
      answerText: '',
      score: 1,
      category: '',
    };
    for (const line of lines) {
      if (line.startsWith('题目') || line.startsWith('Q:') || line.startsWith('Q：')) row.question = line.replace(/^题目[:：]?|^Q[:：]?/i, '').trim();
      else if (/^A[\.、:：]/i.test(line)) row.optionA = line.replace(/^A[\.、:：]/i, '').trim();
      else if (/^B[\.、:：]/i.test(line)) row.optionB = line.replace(/^B[\.、:：]/i, '').trim();
      else if (/^C[\.、:：]/i.test(line)) row.optionC = line.replace(/^C[\.、:：]/i, '').trim();
      else if (/^D[\.、:：]/i.test(line)) row.optionD = line.replace(/^D[\.、:：]/i, '').trim();
      else if (line.startsWith('答案')) row.answer = line.replace(/^答案[:：]?/, '').trim();
      else if (line.startsWith('题型')) row.questionType = normalizeQuestionType(line.replace(/^题型[:：]?/, '').trim());
      else if (line.startsWith('分值')) row.score = Number(line.replace(/^分值[:：]?/, '').trim()) || 1;
      else if (line.startsWith('分类')) row.category = line.replace(/^分类[:：]?/, '').trim();
    }
    if (row.question) rows.push(row);
  }
  if (rows.length > 0) return rows;
  return rowsFromSmartText(rawText);
}

function rowToBank(row, questionCount = 0) {
  const weeklySchedule =
    row.type === 'weekly'
      ? {
          publishWeekday: row.weekly_publish_weekday ?? 1,
          publishTime: row.weekly_publish_time ?? '08:30',
          endWeekday: row.weekly_end_weekday ?? 5,
          endTime: row.weekly_end_time ?? '17:30',
        }
      : undefined;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description ?? '',
    passPercent: row.pass_percent ?? 60,
    questionLimit: row.question_limit ?? 0,
    timeLimitMinutes: row.time_limit_minutes ?? 0,
    status: row.status === 'published' ? 'published' : 'draft',
    sortOrder: row.sort_order ?? 0,
    questionCount,
    weeklySchedule,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToQuestion(row, includeAnswer = false) {
  const options = parseOptions(row.options_json) ?? [];
  const kind = row.question_type || 'single';
  const base = {
    id: row.id,
    bankId: row.bank_id,
    question: row.question,
    options,
    questionType: kind,
    score: row.score ?? 1,
    category: row.category ?? '',
    sortOrder: row.sort_order ?? 0,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeAnswer) {
    return {
      ...base,
      correctIndex: row.correct_index,
      correctIndexes: parseIndexes(row.correct_indexes_json),
      answerText: row.answer_text ?? '',
    };
  }
  return base;
}

function countQuestions(db, bankId) {
  return db
    .prepare('SELECT COUNT(*) as c FROM quiz_questions WHERE bank_id = ? AND enabled = 1')
    .get(bankId).c;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseHHMM(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return { hour: 8, minute: 30 };
  const hour = Math.max(0, Math.min(23, Number(m[1]) || 0));
  const minute = Math.max(0, Math.min(59, Number(m[2]) || 0));
  return { hour, minute };
}

function getWeekStartMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function withWeekdayTime(weekStart, weekday, time) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + Math.max(0, Math.min(6, (weekday || 1) - 1)));
  const { hour, minute } = parseHHMM(time);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function calcWeeklyWindow(bankRow, now = new Date()) {
  const weekStart = getWeekStartMonday(now);
  const publishAt = withWeekdayTime(
    weekStart,
    bankRow.weekly_publish_weekday ?? 1,
    bankRow.weekly_publish_time ?? '08:30',
  );
  const endAt = withWeekdayTime(
    weekStart,
    bankRow.weekly_end_weekday ?? 5,
    bankRow.weekly_end_time ?? '17:30',
  );
  let status = 'upcoming';
  if (now >= publishAt && now <= endAt) status = 'active';
  else if (now > endAt) status = 'ended';
  return { weekStart, publishAt, endAt, status };
}

function ensureWeeklyHistory(db, bankRow, weeksBack = 12, weeksAhead = 2) {
  if (bankRow.type !== 'weekly') return [];
  const now = new Date();
  const thisWeek = getWeekStartMonday(now);
  const upsert = db.prepare(`
    INSERT INTO weekly_quiz_release_history
      (id, bank_id, week_start_date, published_at, ended_at, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(bank_id, week_start_date)
    DO UPDATE SET
      published_at=excluded.published_at,
      ended_at=excluded.ended_at,
      status=excluded.status,
      updated_at=datetime('now')
  `);

  for (let i = -weeksBack; i <= weeksAhead; i += 1) {
    const ws = new Date(thisWeek);
    ws.setDate(ws.getDate() + i * 7);
    const publishAt = withWeekdayTime(
      ws,
      bankRow.weekly_publish_weekday ?? 1,
      bankRow.weekly_publish_time ?? '08:30',
    );
    const endAt = withWeekdayTime(
      ws,
      bankRow.weekly_end_weekday ?? 5,
      bankRow.weekly_end_time ?? '17:30',
    );
    const status = now < publishAt ? 'upcoming' : now <= endAt ? 'active' : 'ended';
    upsert.run(
      `weekly-release-${bankRow.id}-${formatDateOnly(ws)}`,
      bankRow.id,
      formatDateOnly(ws),
      publishAt.toISOString(),
      endAt.toISOString(),
      status,
    );
  }

  return db
    .prepare(
      `SELECT week_start_date, published_at, ended_at, status, created_at, updated_at
       FROM weekly_quiz_release_history
       WHERE bank_id = ?
       ORDER BY week_start_date DESC
       LIMIT 20`,
    )
    .all(bankRow.id)
    .map((r) => ({
      weekStartDate: r.week_start_date,
      publishedAt: r.published_at,
      endedAt: r.ended_at,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
}

function pickPublishedBank(db, type, bankId) {
  if (bankId) {
    const row = db
      .prepare(
        `SELECT * FROM quiz_banks WHERE id = ? AND type = ? AND status = 'published'`,
      )
      .get(bankId, type);
    return row ?? null;
  }
  return (
    db
      .prepare(
        `SELECT * FROM quiz_banks
         WHERE type = ? AND status = 'published'
         ORDER BY sort_order ASC, updated_at DESC
         LIMIT 1`,
      )
      .get(type) ?? null
  );
}

function buildTakePayload(db, bankRow) {
  const rows = db
    .prepare(
      `SELECT * FROM quiz_questions
       WHERE bank_id = ? AND enabled = 1
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(bankRow.id);

  let questions = rows.map((r) => rowToQuestion(r, false));
  const fixedLimit =
    bankRow.type === 'weekly'
      ? bankRow.question_limit > 0
        ? bankRow.question_limit
        : 5
      : bankRow.type === 'knowledge'
        ? KNOWLEDGE_EXAM_QUESTION_LIMIT
        : bankRow.question_limit > 0
          ? bankRow.question_limit
          : 0;
  const limit = fixedLimit > 0 ? fixedLimit : 0;
  if (limit > 0 && questions.length > limit) {
    questions = shuffle(questions).slice(0, limit);
  } else {
    questions = shuffle(questions);
  }

  return {
    bank: {
      id: bankRow.id,
      type: bankRow.type,
      title: bankRow.title,
      description: bankRow.description ?? '',
      passPercent: bankRow.pass_percent ?? 60,
      timeLimitMinutes: bankRow.time_limit_minutes ?? 0,
      questionCount: questions.length,
    },
    questions,
  };
}

function gradeQuizSubmission(db, bank, bankId, answers) {
  let score = 0;
  let totalScore = 0;
  const details = [];

  for (const item of answers) {
    const qid = item?.questionId;
    const selected = Number(item?.selectedIndex);
    const selectedIndexes = parseIndexes(item?.selectedIndexes);
    const textAnswer = String(item?.textAnswer ?? '').trim();
    const row = db
      .prepare(
        'SELECT * FROM quiz_questions WHERE id = ? AND bank_id = ? AND enabled = 1',
      )
      .get(qid, bankId);
    if (!row) {
      details.push({ questionId: qid, correct: false, skipped: true });
      continue;
    }
    const type = row.question_type || 'single';
    const point = Math.max(1, Number(row.score) || 1);
    totalScore += point;
    let isCorrect = false;
    if (type === 'multiple') {
      const target = parseIndexes(row.correct_indexes_json);
      isCorrect =
        target.length > 0 &&
        target.length === selectedIndexes.length &&
        target.every((v, i) => v === selectedIndexes[i]);
    } else if (type === 'text') {
      const target = String(row.answer_text ?? '').trim();
      isCorrect = Boolean(target) && textAnswer.toLowerCase() === target.toLowerCase();
    } else {
      isCorrect = Number.isInteger(selected) && selected === row.correct_index;
    }
    if (isCorrect) score += point;
    details.push({
      questionId: qid,
      correct: isCorrect,
      questionType: type,
      score: point,
      correctIndex: row.correct_index,
      correctIndexes: parseIndexes(row.correct_indexes_json),
      answerText: row.answer_text ?? '',
    });
  }

  const percent = totalScore > 0 ? (score / totalScore) * 100 : 0;
  const passPercent = bank.type === 'weekly' ? 0 : bank.pass_percent ?? 60;
  const passed = bank.type === 'weekly' ? true : percent >= passPercent;

  return {
    score,
    total: totalScore,
    percent,
    passed,
    passPercent,
    details,
  };
}

function saveQuizAttempt(db, userId, bank, bankId, gradeResult) {
  const answered = gradeResult.details.filter((d) => !d.skipped);
  const correctCount = answered.filter((d) => d.correct).length;
  let weekStartDate = null;
  if (bank.type === 'weekly') {
    weekStartDate = formatDateOnly(calcWeeklyWindow(bank, new Date()).weekStart);
  }
  const id = newId('qa');
  db.prepare(
    `INSERT INTO quiz_attempts (
      id, user_id, bank_id, bank_type, bank_title,
      score, total_score, percent, passed,
      question_count, correct_count, week_start_date, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    id,
    userId,
    bankId,
    bank.type,
    bank.title ?? '',
    gradeResult.score,
    gradeResult.total,
    gradeResult.percent,
    gradeResult.passed ? 1 : 0,
    answered.length,
    correctCount,
    weekStartDate,
  );
  return id;
}

function roleLabel(role) {
  if (role === 'new') return '全新大使';
  if (role === 'certified') return '正式大使';
  if (role === 'admin') return '管理员';
  return role || '';
}

function queryQuizReports(db, filters) {
  const { type, search, from, to, userId } = filters;
  if (type !== 'weekly' && type !== 'knowledge') {
    const err = new Error('type 须为 weekly 或 knowledge');
    err.status = 400;
    throw err;
  }

  let sql = `
    SELECT
      a.id,
      a.user_id AS userId,
      u.name AS userName,
      u.username,
      u.role,
      m.name AS managerName,
      a.bank_id AS bankId,
      a.bank_type AS bankType,
      a.bank_title AS bankTitle,
      a.score,
      a.total_score AS totalScore,
      a.percent,
      a.passed,
      a.question_count AS questionCount,
      a.correct_count AS correctCount,
      a.week_start_date AS weekStartDate,
      a.submitted_at AS submittedAt
    FROM quiz_attempts a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN users m ON m.id = u.manager_id
    WHERE a.bank_type = ?
  `;
  const params = [type];

  if (userId) {
    sql += ' AND a.user_id = ?';
    params.push(userId);
  }
  if (search) {
    sql += ' AND (u.name LIKE ? OR u.username LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q);
  }
  if (from) {
    sql += ' AND a.submitted_at >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND a.submitted_at <= ?';
    params.push(to);
  }

  sql += ' ORDER BY a.submitted_at DESC, a.id DESC';
  return db.prepare(sql).all(...params).map((row) => ({
    ...row,
    passed: Boolean(row.passed),
    roleLabel: roleLabel(row.role),
  }));
}

function reportRowsForExport(rows, type) {
  return rows.map((row) => {
    const base = {
      大使姓名: row.userName,
      登录账号: row.username,
      角色: row.roleLabel,
      直属上级: row.managerName || '—',
      试卷名称: row.bankTitle,
      得分: row.score,
      满分: row.totalScore,
      正确率: `${Number(row.percent).toFixed(1)}%`,
      答题数: row.questionCount,
      正确数: row.correctCount,
      提交时间: row.submittedAt,
    };
    if (type === 'knowledge') {
      return {
        ...base,
        是否通过: row.passed ? '通过' : '未通过',
      };
    }
    return {
      周次起始: row.weekStartDate || '—',
      ...base,
    };
  });
}

function listPublishedBanksByType(db, type) {
  return db
    .prepare(
      `SELECT b.*,
        (SELECT COUNT(*) FROM quiz_questions q WHERE q.bank_id = b.id AND q.enabled = 1) as question_count
       FROM quiz_banks b
       WHERE b.type = ? AND b.status = 'published'
       ORDER BY b.sort_order ASC, b.updated_at DESC`,
    )
    .all(type);
}

/** 学员端：已发布的知识答题卷列表 */
router.get('/published/knowledge', authRequired, (_req, res) => {
  const db = getDb();
  const rows = listPublishedBanksByType(db, 'knowledge');
  res.json({
    banks: rows.map((row) =>
      rowToBank(row, row.question_count ?? countQuestions(db, row.id)),
    ),
  });
});

/** 学员端：已发布的每周测试列表 */
router.get('/published/weekly', authRequired, (_req, res) => {
  const db = getDb();
  const rows = listPublishedBanksByType(db, 'weekly');
  res.json({
    banks: rows.map((row) => {
      const base = rowToBank(row, row.question_count ?? countQuestions(db, row.id));
      const status = calcWeeklyWindow(row, new Date()).status;
      ensureWeeklyHistory(db, row);
      return { ...base, weeklyReleaseStatus: status };
    }),
  });
});

/** 学员端：获取答题卷（不含正确答案） */
router.get('/take/:type', authRequired, (req, res) => {
  const type = req.params.type;
  if (type !== 'knowledge' && type !== 'weekly') {
    return res.status(400).json({ error: '无效的题库类型' });
  }
  const db = getDb();
  const bankId = typeof req.query.bankId === 'string' ? req.query.bankId : null;
  const bankRow = pickPublishedBank(db, type, bankId);
  if (!bankRow) {
    return res.status(404).json({ error: '暂无已发布的测试' });
  }
  if (type === 'weekly') {
    const window = calcWeeklyWindow(bankRow, new Date());
    if (window.status !== 'active') {
      const tip = window.status === 'upcoming' ? '周测尚未到发布时间' : '本周周测已结束';
      return res.status(403).json({ error: tip });
    }
  }
  const payload = buildTakePayload(db, bankRow);
  if (payload.questions.length === 0) {
    return res.status(404).json({ error: '该测试暂无可用题目' });
  }
  res.json(payload);
});

/** 管理端：预览答题卷（可预览草稿卷） */
router.get('/admin/preview/:type', authRequired, adminRequired, (req, res) => {
  const type = req.params.type;
  if (type !== 'knowledge' && type !== 'weekly') {
    return res.status(400).json({ error: '无效的题库类型' });
  }
  const db = getDb();
  const bankId = typeof req.query.bankId === 'string' ? req.query.bankId : '';
  if (!bankId) return res.status(400).json({ error: '缺少 bankId' });
  const bankRow = db
    .prepare(`SELECT * FROM quiz_banks WHERE id = ? AND type = ?`)
    .get(bankId, type);
  if (!bankRow) {
    return res.status(404).json({ error: '题库不存在' });
  }
  const payload = buildTakePayload(db, bankRow);
  if (payload.questions.length === 0) {
    return res.status(404).json({ error: '该测试暂无可用题目' });
  }
  res.json(payload);
});

router.get('/admin/weekly/history', authRequired, adminRequired, (req, res) => {
  const bankId = typeof req.query.bankId === 'string' ? req.query.bankId : '';
  if (!bankId) return res.status(400).json({ error: '缺少 bankId' });
  const db = getDb();
  const bank = db.prepare(`SELECT * FROM quiz_banks WHERE id = ?`).get(bankId);
  if (!bank || bank.type !== 'weekly') {
    return res.status(404).json({ error: '周测题库不存在' });
  }
  const history = ensureWeeklyHistory(db, bank);
  const currentWindow = calcWeeklyWindow(bank, new Date());
  res.json({
    currentStatus: currentWindow.status,
    currentWindow: {
      weekStartDate: formatDateOnly(currentWindow.weekStart),
      publishedAt: currentWindow.publishAt.toISOString(),
      endedAt: currentWindow.endAt.toISOString(),
    },
    history,
  });
});

router.put('/admin/weekly/schedule/:bankId', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const bank = db.prepare(`SELECT * FROM quiz_banks WHERE id = ?`).get(req.params.bankId);
  if (!bank || bank.type !== 'weekly') {
    return res.status(404).json({ error: '周测题库不存在' });
  }
  const {
    publishWeekday = 1,
    publishTime = '08:30',
    endWeekday = 5,
    endTime = '17:30',
  } = req.body ?? {};
  const pw = Math.min(7, Math.max(1, Number(publishWeekday) || 1));
  const ew = Math.min(7, Math.max(1, Number(endWeekday) || 5));
  const pt = String(publishTime || '08:30');
  const et = String(endTime || '17:30');

  db.prepare(
    `UPDATE quiz_banks
     SET weekly_publish_weekday = ?, weekly_publish_time = ?,
         weekly_end_weekday = ?, weekly_end_time = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(pw, pt, ew, et, req.params.bankId);

  const updated = db.prepare(`SELECT * FROM quiz_banks WHERE id = ?`).get(req.params.bankId);
  ensureWeeklyHistory(db, updated);
  const window = calcWeeklyWindow(updated, new Date());
  const bankPayload = {
    ...rowToBank(updated, countQuestions(db, updated.id)),
    weeklyReleaseStatus: window.status,
  };
  res.json({ bank: bankPayload });
});

/** 学员端：提交答卷并阅卷 */
router.post('/submit', authRequired, (req, res) => {
  const { bankId, answers } = req.body ?? {};
  if (!bankId || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: '提交数据无效' });
  }
  const db = getDb();
  const bank = db.prepare('SELECT * FROM quiz_banks WHERE id = ?').get(bankId);
  if (!bank || bank.status !== 'published') {
    return res.status(404).json({ error: '测试不存在或未发布' });
  }
  const result = gradeQuizSubmission(db, bank, bankId, answers);
  const userId = req.user?.sub;
  if (userId) {
    try {
      saveQuizAttempt(db, userId, bank, bankId, result);
    } catch (err) {
      console.warn('[quiz-submit] save attempt failed:', err);
    }
  }
  res.json(result);
});

/** 管理端：考试报告列表 */
router.get('/admin/reports', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const reports = queryQuizReports(db, { type, search, from, to, userId });
    res.json({ reports });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '加载报告失败' });
  }
});

/** 管理端：导出考试报告 Excel */
router.get('/admin/reports/export', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const reports = queryQuizReports(db, { type, search, from, to, userId });
    const exportRows = reportRowsForExport(reports, type);
    const sheet = XLSX.utils.json_to_sheet(
      exportRows.length > 0
        ? exportRows
        : [
            type === 'weekly'
              ? {
                  周次起始: '',
                  大使姓名: '',
                  登录账号: '',
                  角色: '',
                  直属上级: '',
                  试卷名称: '',
                  得分: '',
                  满分: '',
                  正确率: '',
                  答题数: '',
                  正确数: '',
                  提交时间: '',
                }
              : {
                  大使姓名: '',
                  登录账号: '',
                  角色: '',
                  直属上级: '',
                  试卷名称: '',
                  得分: '',
                  满分: '',
                  正确率: '',
                  答题数: '',
                  正确数: '',
                  是否通过: '',
                  提交时间: '',
                },
          ],
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, type === 'weekly' ? '周测报告' : '培训测试报告');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const stamp = formatDateOnly(new Date());
    const filename =
      type === 'weekly' ? `周测报告_${stamp}.xlsx` : `培训测试报告_${stamp}.xlsx`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.send(buffer);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '导出失败' });
  }
});

/** 管理端预览：提交答卷并阅卷（允许草稿卷） */
router.post('/admin/preview/submit', authRequired, adminRequired, (req, res) => {
  const { bankId, answers } = req.body ?? {};
  if (!bankId || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: '提交数据无效' });
  }
  const db = getDb();
  const bank = db.prepare('SELECT * FROM quiz_banks WHERE id = ?').get(bankId);
  if (!bank) {
    return res.status(404).json({ error: '测试不存在' });
  }
  res.json(gradeQuizSubmission(db, bank, bankId, answers));
});

/** 管理端：题库列表 */
router.get('/admin/banks', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const type = req.query.type;
  let sql = `SELECT b.*,
    (SELECT COUNT(*) FROM quiz_questions q WHERE q.bank_id = b.id) as question_count
    FROM quiz_banks b`;
  const params = [];
  if (type === 'knowledge' || type === 'weekly') {
    sql += ' WHERE b.type = ?';
    params.push(type);
  }
  sql += ' ORDER BY b.type ASC, b.sort_order ASC, b.updated_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({
    banks: rows.map((row) => {
      const base = rowToBank(row, row.question_count ?? 0);
      if (row.type === 'weekly') {
        ensureWeeklyHistory(db, row);
        return { ...base, weeklyReleaseStatus: calcWeeklyWindow(row, new Date()).status };
      }
      return base;
    }),
  });
});

router.post('/admin/banks', authRequired, adminRequired, (req, res) => {
  const { type, title, description, passPercent, questionLimit, timeLimitMinutes, status, sortOrder } =
    req.body ?? {};
  if (type !== 'knowledge' && type !== 'weekly') {
    return res.status(400).json({ error: 'type 须为 knowledge 或 weekly' });
  }
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: '请填写标题' });
  }
  const db = getDb();
  const id = newId('quiz-bank');
  const defaultPass = type === 'weekly' ? 0 : 60;
  const defaultLimit = type === 'weekly' ? 5 : KNOWLEDGE_EXAM_QUESTION_LIMIT;
  const pass = type === 'weekly'
    ? 0
    : Number.isFinite(Number(passPercent))
      ? Number(passPercent)
      : defaultPass;
  const limit = type === 'weekly'
    ? Number.isFinite(Number(questionLimit))
      ? Math.max(1, Number(questionLimit))
      : 5
    : type === 'knowledge'
      ? KNOWLEDGE_EXAM_QUESTION_LIMIT
      : Number.isFinite(Number(questionLimit))
        ? Number(questionLimit)
        : defaultLimit;
  const timeMin = Number.isFinite(Number(timeLimitMinutes)) ? Number(timeLimitMinutes) : 0;
  const st = status === 'published' ? 'published' : 'draft';
  const order = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0;

  db.prepare(
    `INSERT INTO quiz_banks (id, type, title, description, pass_percent, question_limit, time_limit_minutes, status, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    type,
    String(title).trim(),
    String(description ?? '').trim(),
    Math.min(100, Math.max(0, pass)),
    Math.max(0, limit),
    Math.max(0, timeMin),
    st,
    order,
  );

  const row = db.prepare('SELECT * FROM quiz_banks WHERE id = ?').get(id);
  res.status(201).json({ bank: rowToBank(row, 0) });
});

router.put('/admin/banks/:id', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM quiz_banks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '题库不存在' });

  const { title, description, passPercent, questionLimit, timeLimitMinutes, status, sortOrder } =
    req.body ?? {};

  const nextTitle =
    title !== undefined ? String(title).trim() : existing.title;
  if (!nextTitle) return res.status(400).json({ error: '请填写标题' });

  const pass =
    passPercent !== undefined
      ? Math.min(100, Math.max(0, Number(passPercent) || 0))
      : existing.pass_percent;
  const limit =
    questionLimit !== undefined
      ? Math.max(0, Number(questionLimit) || 0)
      : existing.question_limit;
  const timeMin =
    timeLimitMinutes !== undefined
      ? Math.max(0, Number(timeLimitMinutes) || 0)
      : existing.time_limit_minutes;
  const st =
    status !== undefined
      ? status === 'published'
        ? 'published'
        : 'draft'
      : existing.status;
  const order =
    sortOrder !== undefined ? Number(sortOrder) || 0 : existing.sort_order;
  const nextPass = existing.type === 'weekly' ? 0 : pass;
  const nextLimit =
    existing.type === 'weekly'
      ? questionLimit !== undefined
        ? Math.max(1, Number(questionLimit) || 1)
        : existing.question_limit > 0
          ? existing.question_limit
          : 5
      : existing.type === 'knowledge'
        ? KNOWLEDGE_EXAM_QUESTION_LIMIT
        : limit;

  db.prepare(
    `UPDATE quiz_banks SET
      title = ?, description = ?, pass_percent = ?, question_limit = ?,
      time_limit_minutes = ?, status = ?, sort_order = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    nextTitle,
    description !== undefined ? String(description).trim() : existing.description,
    nextPass,
    nextLimit,
    timeMin,
    st,
    order,
    req.params.id,
  );

  const row = db.prepare('SELECT * FROM quiz_banks WHERE id = ?').get(req.params.id);
  res.json({ bank: rowToBank(row, countQuestions(db, row.id)) });
});

router.delete('/admin/banks/:id', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM quiz_banks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '题库不存在' });
  res.json({ ok: true });
});

router.get('/admin/banks/:bankId/questions', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const bank = db.prepare('SELECT * FROM quiz_banks WHERE id = ?').get(req.params.bankId);
  if (!bank) return res.status(404).json({ error: '题库不存在' });
  const rows = db
    .prepare(
      'SELECT * FROM quiz_questions WHERE bank_id = ? ORDER BY sort_order ASC, created_at ASC',
    )
    .all(req.params.bankId);
  res.json({ questions: rows.map((r) => rowToQuestion(r, true)) });
});

router.post('/admin/banks/:bankId/questions', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const bank = db.prepare('SELECT * FROM quiz_banks WHERE id = ?').get(req.params.bankId);
  if (!bank) return res.status(404).json({ error: '题库不存在' });

  const {
    question,
    options,
    correctIndex,
    correctIndexes,
    answerText,
    questionType,
    score,
    category,
    sortOrder,
    enabled,
  } = req.body ?? {};
  const opts = parseOptions(options);
  if (!question || !String(question).trim()) {
    return res.status(400).json({ error: '请填写题目' });
  }
  const kind = ['single', 'multiple', 'boolean', 'text'].includes(questionType)
    ? questionType
    : 'single';
  const point = Math.max(1, Number(score) || 1);
  let ci = Number(correctIndex);
  let cis = parseIndexes(correctIndexes);
  let text = String(answerText ?? '').trim();
  if (kind === 'single' || kind === 'boolean') {
    if (!opts || opts.length < 2) return res.status(400).json({ error: '至少需要 2 个选项' });
    if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) {
      return res.status(400).json({ error: '请选择正确答案' });
    }
  } else if (kind === 'multiple') {
    if (!opts || opts.length < 2) return res.status(400).json({ error: '至少需要 2 个选项' });
    cis = cis.filter((v) => v < opts.length);
    if (cis.length === 0) return res.status(400).json({ error: '多选题至少选择 1 个正确答案' });
    ci = cis[0];
  } else {
    if (!text) return res.status(400).json({ error: '请填写问答题参考答案' });
    ci = -1;
  }

  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM quiz_questions WHERE bank_id = ?')
    .get(req.params.bankId).m;
  const order =
    sortOrder !== undefined && Number.isFinite(Number(sortOrder))
      ? Number(sortOrder)
      : maxOrder + 1;

  const id = newId('qq');
  db.prepare(
    `INSERT INTO quiz_questions (
      id, bank_id, question, options_json, correct_index, correct_indexes_json,
      question_type, answer_text, score, category, sort_order, enabled
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    req.params.bankId,
    String(question).trim(),
    JSON.stringify(opts),
    ci,
    JSON.stringify(cis),
    kind,
    text,
    point,
    String(category ?? '').trim(),
    order,
    enabled === false ? 0 : 1,
  );

  db.prepare(`UPDATE quiz_banks SET updated_at = datetime('now') WHERE id = ?`).run(
    req.params.bankId,
  );

  const row = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(id);
  res.status(201).json({ question: rowToQuestion(row, true) });
});

router.put('/admin/questions/:id', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '题目不存在' });

  const {
    question,
    options,
    correctIndex,
    correctIndexes,
    answerText,
    questionType,
    score,
    category,
    sortOrder,
    enabled,
  } = req.body ?? {};
  let opts = parseOptions(existing.options_json);
  if (options !== undefined) {
    opts = parseOptions(options);
    if (!opts || opts.length < 2) {
      return res.status(400).json({ error: '至少需要 2 个选项' });
    }
  }

  const kind =
    questionType !== undefined
      ? ['single', 'multiple', 'boolean', 'text'].includes(questionType)
        ? questionType
        : 'single'
      : existing.question_type || 'single';
  let ci = correctIndex !== undefined ? Number(correctIndex) : existing.correct_index;
  let cis =
    correctIndexes !== undefined
      ? parseIndexes(correctIndexes)
      : parseIndexes(existing.correct_indexes_json);
  const text =
    answerText !== undefined ? String(answerText).trim() : String(existing.answer_text ?? '');
  const point = score !== undefined ? Math.max(1, Number(score) || 1) : Math.max(1, Number(existing.score) || 1);
  if (kind === 'single' || kind === 'boolean') {
    if (!opts || opts.length < 2) return res.status(400).json({ error: '至少需要 2 个选项' });
    if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) return res.status(400).json({ error: '请选择正确答案' });
    cis = [];
  } else if (kind === 'multiple') {
    if (!opts || opts.length < 2) return res.status(400).json({ error: '至少需要 2 个选项' });
    cis = cis.filter((v) => v < opts.length);
    if (cis.length === 0) return res.status(400).json({ error: '多选题至少选择 1 个正确答案' });
    ci = cis[0];
  } else {
    if (!text) return res.status(400).json({ error: '请填写问答题参考答案' });
    ci = -1;
    cis = [];
  }

  db.prepare(
    `UPDATE quiz_questions SET
      question = ?, options_json = ?, correct_index = ?, correct_indexes_json = ?,
      question_type = ?, answer_text = ?, score = ?, category = ?,
      sort_order = ?, enabled = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    question !== undefined ? String(question).trim() : existing.question,
    JSON.stringify(opts),
    ci,
    JSON.stringify(cis),
    kind,
    text,
    point,
    category !== undefined ? String(category).trim() : existing.category,
    sortOrder !== undefined ? Number(sortOrder) || 0 : existing.sort_order,
    enabled === false ? 0 : enabled === true ? 1 : existing.enabled,
    req.params.id,
  );

  db.prepare(`UPDATE quiz_banks SET updated_at = datetime('now') WHERE id = ?`).run(
    existing.bank_id,
  );

  const row = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(req.params.id);
  res.json({ question: rowToQuestion(row, true) });
});

router.delete('/admin/questions/:id', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT bank_id FROM quiz_questions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '题目不存在' });
  db.prepare('DELETE FROM quiz_questions WHERE id = ?').run(req.params.id);
  db.prepare(`UPDATE quiz_banks SET updated_at = datetime('now') WHERE id = ?`).run(
    existing.bank_id,
  );
  res.json({ ok: true });
});

router.post('/admin/banks/:bankId/questions/batch-delete', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const bank = db.prepare('SELECT * FROM quiz_banks WHERE id = ?').get(req.params.bankId);
  if (!bank) return res.status(404).json({ error: '题库不存在' });

  const { questionIds, all } = req.body ?? {};
  if (all === true) {
    const result = db
      .prepare('DELETE FROM quiz_questions WHERE bank_id = ?')
      .run(req.params.bankId);
    db.prepare(`UPDATE quiz_banks SET updated_at = datetime('now') WHERE id = ?`).run(
      req.params.bankId,
    );
    return res.json({ ok: true, deleted: result.changes });
  }

  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return res.status(400).json({ error: '请至少选择 1 道题目' });
  }
  const ids = [...new Set(questionIds.map((x) => String(x || '').trim()).filter(Boolean))];
  if (ids.length === 0) return res.status(400).json({ error: '请至少选择 1 道题目' });
  const placeholders = ids.map(() => '?').join(',');
  const result = db
    .prepare(
      `DELETE FROM quiz_questions
       WHERE bank_id = ? AND id IN (${placeholders})`,
    )
    .run(req.params.bankId, ...ids);
  db.prepare(`UPDATE quiz_banks SET updated_at = datetime('now') WHERE id = ?`).run(
    req.params.bankId,
  );
  res.json({ ok: true, deleted: result.changes });
});

router.get('/admin/banks/:bankId/import-files', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const bank = db.prepare('SELECT id FROM quiz_banks WHERE id = ?').get(req.params.bankId);
  if (!bank) return res.status(404).json({ error: '题库不存在' });
  const rows = db
    .prepare(
      `SELECT id, bank_id, original_name, storage_path, mime_type, file_size, imported_count, skipped_count, created_at
       FROM quiz_import_files
       WHERE bank_id = ?
       ORDER BY created_at DESC`,
    )
    .all(req.params.bankId);
  res.json({
    files: rows.map((r) => ({
      id: r.id,
      bankId: r.bank_id,
      originalName: r.original_name,
      storagePath: r.storage_path,
      mimeType: r.mime_type,
      fileSize: r.file_size,
      importedCount: r.imported_count,
      skippedCount: r.skipped_count,
      createdAt: r.created_at,
    })),
  });
});

function deleteImportFilesByIds(db, ids) {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT id, storage_path
       FROM quiz_import_files
       WHERE id IN (${placeholders})`,
    )
    .all(...ids);
  rows.forEach((row) => {
    const p = String(row.storage_path || '').trim();
    if (!p) return;
    const abs = path.isAbsolute(p) ? p : path.join(__dirname, '..', p);
    try {
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {
      // ignore file delete errors to avoid blocking metadata cleanup
    }
  });
  const result = db
    .prepare(`DELETE FROM quiz_import_files WHERE id IN (${placeholders})`)
    .run(...ids);
  return result.changes;
}

router.delete('/admin/import-files/:id', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: '缺少文件 id' });
  const deleted = deleteImportFilesByIds(db, [id]);
  if (deleted === 0) return res.status(404).json({ error: '文件不存在' });
  res.json({ ok: true, deleted });
});

router.post('/admin/import-files/batch-delete', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请至少选择 1 个文件' });
  }
  const normalized = [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))];
  if (normalized.length === 0) {
    return res.status(400).json({ error: '请至少选择 1 个文件' });
  }
  const deleted = deleteImportFilesByIds(db, normalized);
  res.json({ ok: true, deleted });
});

router.get('/admin/import-ai-status', authRequired, adminRequired, (_req, res) => {
  const ai = getAiRuntimeConfig();
  res.json({
    available: Boolean(ai),
    model: ai?.model ?? null,
  });
});

router.get('/admin/import-template', authRequired, adminRequired, (_req, res) => {
  const rows = [
    {
      题型: 'single',
      题目: '示例单选题：以下哪项属于礼仪规范？',
      选项A: '主动问候',
      选项B: '低头不语',
      选项C: '随意打断',
      选项D: '背对客人',
      答案: 'A',
      分值: 1,
      分类: '示例',
    },
    {
      题型: 'multiple',
      题目: '示例多选题：以下哪些属于接待流程？（可多选）',
      选项A: '微笑问候',
      选项B: '了解需求',
      选项C: '忽略反馈',
      选项D: '礼貌送别',
      答案: 'A,B,D',
      分值: 1,
      分类: '示例',
    },
    {
      题型: 'boolean',
      题目: '示例判断题：客人进店后应先问候。',
      选项A: '正确',
      选项B: '错误',
      选项C: '',
      选项D: '',
      答案: '对',
      分值: 1,
      分类: '示例',
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, '题库导入');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="quiz-import-template.xlsx"',
  );
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.send(buffer);
});

function recordQuizImportFile(db, bankId, fileMeta, importedCount, skippedCount) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const originalName = String(fileMeta.originalName || '').trim() || 'upload.bin';
  const ext = path.extname(originalName).toLowerCase() || '.bin';
  const storedName = `${newId('quiz-import')}${ext}`;
  const absStoredPath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(absStoredPath, fileMeta.buffer);
  const relStoredPath = path.relative(path.join(__dirname, '..'), absStoredPath);
  db.prepare(
    `INSERT INTO quiz_import_files
      (id, bank_id, original_name, storage_path, mime_type, file_size, imported_count, skipped_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId('qif'),
    bankId,
    originalName,
    relStoredPath,
    String(fileMeta.mimeType || ''),
    Number(fileMeta.size) || 0,
    importedCount,
    skippedCount,
  );
  db.prepare(`UPDATE quiz_banks SET updated_at = datetime('now') WHERE id = ?`).run(bankId);
}

router.post(
  '/admin/banks/:bankId/import',
  authRequired,
  adminRequired,
  upload.single('file'),
  async (req, res) => {
    const db = getDb();
    const bank = db.prepare('SELECT * FROM quiz_banks WHERE id = ?').get(req.params.bankId);
    if (!bank) return res.status(404).json({ error: '题库不存在' });
    if (!req.file) return res.status(400).json({ error: '请上传文件' });

    const originalName = fixUploadedFileName(req.file.originalname || '');
    const name = originalName.toLowerCase();
    const fileMeta = {
      originalName,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      size: req.file.size,
    };
    let rows = [];
    const parseMode = 'ai';
    const ai = getAiRuntimeConfig();

    if (
      !name.endsWith('.xlsx') &&
      !name.endsWith('.xls') &&
      !name.endsWith('.csv') &&
      !name.endsWith('.docx')
    ) {
      return res.status(400).json({ error: '仅支持 .docx/.xlsx/.xls/.csv' });
    }

    if (!ai) {
      return res.status(503).json({
        error:
          '题库导入仅支持 AI 解析。请在「培训管理 → 配置管理」填写 API Key 并保存，或配置 .env 中的 AI_API_KEY',
        parseMode: 'ai',
        aiAvailable: false,
        fileName: originalName,
      });
    }

    try {
      const rawText = await extractQuizImportText(req.file.buffer, name);
      if (!rawText.trim()) {
        recordQuizImportFile(db, req.params.bankId, fileMeta, 0, 0);
        return res.status(400).json({
          error: `「${originalName}」无法提取文本（若为 OneDrive 文件请先「始终保留在此设备」）`,
          parseMode: 'ai',
          fileName: originalName,
        });
      }
      rows = await parseQuizTextWithAi(rawText, ai);
    } catch (err) {
      recordQuizImportFile(db, req.params.bankId, fileMeta, 0, 0);
      return res.status(err.message?.includes('未配置') ? 503 : 502).json({
        error: `「${originalName}」${err instanceof Error ? err.message : 'AI 解析失败'}`,
        parseMode: 'ai',
        fileName: originalName,
      });
    }

    if (!rows.length) {
      recordQuizImportFile(db, req.params.bankId, fileMeta, 0, 0);
      return res.status(400).json({
        error: `「${originalName}」AI 未识别到有效题目，请检查文件内容或稍后重试`,
        parseMode: 'ai',
        aiAvailable: true,
        fileName: originalName,
      });
    }
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM quiz_questions WHERE bank_id = ?')
      .get(req.params.bankId).m;
    const insert = db.prepare(`
      INSERT INTO quiz_questions (
        id, bank_id, question, options_json, correct_index, correct_indexes_json,
        question_type, answer_text, score, category, sort_order, enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    let created = 0;
    const sampleReasons = [];
    rows.forEach((row, i) => {
      const question = String(row.question || '').trim();
      const addReason = (reason) => {
        if (sampleReasons.length < 15) {
          sampleReasons.push({
            row: i + 1,
            question: question.slice(0, 60),
            reason,
          });
        }
      };
      if (!question) {
        addReason('题目为空');
        return;
      }
      const options = optionsFromImportRow(row);
      const point = Math.max(1, Number(row.score) || 1);
      let correctIndex = -1;
      let correctIndexes = [];
      let answerText = String(row.answerText || '').trim();
      const answerRaw = String(row.answer || '').trim();
      let kind = inferQuestionKind(row, options, answerRaw);

      if (kind !== 'text') {
        if (kind === 'boolean' && options.length === 0) {
          options.push('正确', '错误');
        }
        if (options.length < 2) {
          addReason('选项不足 2 个');
          return;
        }
        const normalizedAnswer =
          kind === 'boolean'
            ? /^(错|错误|false)$/i.test(answerRaw)
              ? 'B'
              : /^(对|正确|true)$/i.test(answerRaw)
                ? 'A'
                : answerRaw
            : answerRaw;
        const parsed = parseAnswerToken(normalizedAnswer, options.length, options);
        correctIndex = parsed.correctIndex;
        correctIndexes =
          kind === 'multiple'
            ? parsed.correctIndexes
            : parsed.correctIndexes.length > 1
              ? parsed.correctIndexes
              : [];
        if (kind === 'single' && correctIndexes.length > 1) kind = 'multiple';
        if (kind !== 'multiple' && correctIndex < 0) {
          addReason('未识别到有效答案（单选/判断）');
          return;
        }
        if (kind === 'multiple' && correctIndexes.length === 0) {
          addReason('未识别到有效答案（多选）');
          return;
        }
      } else {
        if (!answerText) answerText = String(row.answer || '').trim();
        if (!answerText) {
          addReason('问答题缺少参考答案');
          return;
        }
      }
      insert.run(
        newId('qq'),
        req.params.bankId,
        question,
        JSON.stringify(kind === 'text' ? [] : options),
        correctIndex,
        JSON.stringify(correctIndexes),
        kind,
        answerText,
        point,
        String(row.category || '').trim(),
        maxOrder + i + 1,
      );
      created += 1;
    });

    if (created === 0) {
      recordQuizImportFile(db, req.params.bankId, fileMeta, 0, rows.length);
      return res.status(400).json({
        error: `「${originalName}」AI 识别到 ${rows.length} 行但无一题可入库，请检查选项/答案格式后重试`,
        parsedRows: rows.length,
        imported: 0,
        skippedRows: rows.length,
        sampleReasons,
        fileName: originalName,
      });
    }
    recordQuizImportFile(
      db,
      req.params.bankId,
      fileMeta,
      created,
      Math.max(0, rows.length - created),
    );

    let syncResult = null;
    try {
      syncResult = syncExamBanksFromSource(db, req.params.bankId);
    } catch (syncErr) {
      console.warn('[quiz-import] sync to exam banks failed:', syncErr);
    }

    res.json({
      ok: true,
      imported: created,
      parsedRows: rows.length,
      skippedRows: Math.max(0, rows.length - created),
      sampleReasons,
      parseMode,
      sync: syncResult,
      hint: syncResult
        ? `已同步 ${syncResult.questionCount} 道题至周测与培训测试（培训测试每次抽 ${KNOWLEDGE_EXAM_QUESTION_LIMIT} 题）`
        : '题量较大时会自动分段调用 AI；若未自动同步，请在题目列表点击「同步到周测与培训测试」',
    });
  },
);

router.post('/admin/banks/:bankId/sync-exams', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  try {
    const result = syncExamBanksFromSource(db, req.params.bankId);
    res.json({ ok: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || '同步失败' });
  }
});

export default router;
