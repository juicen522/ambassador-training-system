import crypto from 'crypto';

export const KNOWLEDGE_EXAM_QUESTION_LIMIT = 100;

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function getPrimaryPublishedBank(db, type) {
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

function replaceBankQuestionsFromSource(db, sourceBankId, targetBankId) {
  db.prepare('DELETE FROM quiz_questions WHERE bank_id = ?').run(targetBankId);

  const rows = db
    .prepare(
      `SELECT question, options_json, correct_index, correct_indexes_json,
              question_type, answer_text, score, category, sort_order, enabled
       FROM quiz_questions
       WHERE bank_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(sourceBankId);

  const insert = db.prepare(`
    INSERT INTO quiz_questions (
      id, bank_id, question, options_json, correct_index, correct_indexes_json,
      question_type, answer_text, score, category, sort_order, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  rows.forEach((row, index) => {
    insert.run(
      newId('qq'),
      targetBankId,
      row.question,
      row.options_json,
      row.correct_index,
      row.correct_indexes_json,
      row.question_type,
      row.answer_text,
      row.score,
      row.category,
      row.sort_order ?? index,
      row.enabled,
    );
  });

  db.prepare(`UPDATE quiz_banks SET updated_at = datetime('now') WHERE id = ?`).run(targetBankId);
  return rows.length;
}

/**
 * 将源题库的全部题目同步到已发布的周测卷与培训测试（知识答题）卷。
 */
export function syncExamBanksFromSource(db, sourceBankId) {
  const source = db.prepare('SELECT * FROM quiz_banks WHERE id = ?').get(sourceBankId);
  if (!source) {
    const err = new Error('源题库不存在');
    err.status = 404;
    throw err;
  }

  const sourceCount = db
    .prepare('SELECT COUNT(*) as c FROM quiz_questions WHERE bank_id = ?')
    .get(sourceBankId).c;
  if (sourceCount === 0) {
    const err = new Error('源题库没有题目，无法同步');
    err.status = 400;
    throw err;
  }

  const weeklyTarget = getPrimaryPublishedBank(db, 'weekly');
  const knowledgeTarget = getPrimaryPublishedBank(db, 'knowledge');
  if (!weeklyTarget) {
    const err = new Error('未找到已发布的周测卷，请先在周测中创建并发布一卷');
    err.status = 400;
    throw err;
  }
  if (!knowledgeTarget) {
    const err = new Error('未找到已发布的培训测试卷，请先在知识答题中创建并发布一卷');
    err.status = 400;
    throw err;
  }

  const run = db.transaction(() => {
    const weeklyCount = replaceBankQuestionsFromSource(db, sourceBankId, weeklyTarget.id);
    const knowledgeCount = replaceBankQuestionsFromSource(db, sourceBankId, knowledgeTarget.id);
    db.prepare(
      `UPDATE quiz_banks SET question_limit = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(KNOWLEDGE_EXAM_QUESTION_LIMIT, knowledgeTarget.id);
    return { weeklyCount, knowledgeCount };
  });

  const { weeklyCount, knowledgeCount } = run();

  return {
    sourceBankId,
    sourceTitle: source.title,
    weeklyBankId: weeklyTarget.id,
    weeklyTitle: weeklyTarget.title,
    knowledgeBankId: knowledgeTarget.id,
    knowledgeTitle: knowledgeTarget.title,
    questionCount: sourceCount,
    weeklyCount,
    knowledgeCount,
    knowledgeExamLimit: KNOWLEDGE_EXAM_QUESTION_LIMIT,
  };
}

/**
 * 若存在题量明显多于已发布考试卷的主题库，自动同步一次（用于迁移/修复）。
 */
export function syncExamBanksFromLargestPoolIfNeeded(db) {
  const largest = db
    .prepare(
      `SELECT bank_id, COUNT(*) as c
       FROM quiz_questions
       GROUP BY bank_id
       ORDER BY c DESC
       LIMIT 1`,
    )
    .get();
  if (!largest || largest.c < 10) return null;

  const weeklyPublished = getPrimaryPublishedBank(db, 'weekly');
  const knowledgePublished = getPrimaryPublishedBank(db, 'knowledge');
  if (!weeklyPublished || !knowledgePublished) return null;

  const weeklyCount = db
    .prepare('SELECT COUNT(*) as c FROM quiz_questions WHERE bank_id = ?')
    .get(weeklyPublished.id).c;
  const knowledgeCount = db
    .prepare('SELECT COUNT(*) as c FROM quiz_questions WHERE bank_id = ?')
    .get(knowledgePublished.id).c;

  const sourceIsWeekly = largest.bank_id === weeklyPublished.id;
  const sourceIsKnowledge = largest.bank_id === knowledgePublished.id;
  if (sourceIsWeekly && sourceIsKnowledge) return null;

  const needSync =
    largest.c > weeklyCount || largest.c > knowledgeCount || knowledgeCount < KNOWLEDGE_EXAM_QUESTION_LIMIT;
  if (!needSync) return null;

  if (
    largest.bank_id === weeklyPublished.id &&
    weeklyCount >= largest.c &&
    knowledgeCount >= largest.c &&
    knowledgePublished.question_limit >= KNOWLEDGE_EXAM_QUESTION_LIMIT
  ) {
    return null;
  }

  return syncExamBanksFromSource(db, largest.bank_id);
}
