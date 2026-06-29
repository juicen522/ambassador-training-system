import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import {
  migrateGarbledFileNames,
  migrateGarbledQuizImportFileNames,
} from '../lib/filenameEncoding.js';
import { migrateActivitiesCopywritingVi } from '../lib/viTypography.js';
import {
  KNOWLEDGE_EXAM_QUESTION_LIMIT,
  syncExamBanksFromLargestPoolIfNeeded,
} from '../lib/quizExamSync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

const basicTrainingStagesTemplate = [
  { id: 1, name: '大使见面会+讲解演示', duration: '1h', completed: false },
  { id: 2, name: '十如故事+讲解重点', duration: '1h', completed: false },
  { id: 3, name: '知识答题', duration: '30mins', completed: false },
  { id: 4, name: '讲解演练', duration: '1.5h', completed: false },
  { id: 5, name: '讲解考核', duration: '1.5h * 2', completed: false },
];

let db;

export function getDb() {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function seedUsers(_database) {
  /* 测试账号由 ensureSimulationFlowDemo 创建 */
}

function seedMaterials(database) {
  const count = database.prepare('SELECT COUNT(*) as c FROM materials').get().c;
  if (count > 0) return;

  const items = [
    ['seed-1', '园林植物识别指南', '植物识别', 'PDF', '详细介绍园内常见植物的特征、习性和讲解要点', 234],
    ['seed-2', '中国园林艺术发展史', '园林历史', 'PDF', '从古典园林到现代园林的发展脉络', 156],
    ['seed-3', '讲解员服务规范培训', '服务规范', '视频', '标准服务流程、礼仪规范及应急处理', 189],
    ['seed-4', '园林摄影点位图', '讲解技巧', '图片', '最佳拍摄角度和推荐讲解点位', 278],
    ['seed-5', '四季植物观赏指南', '植物识别', 'PDF', '不同季节的重点观赏植物和讲解重点', 312],
    ['seed-6', '游客安全管理要点', '安全知识', 'PDF', '常见安全隐患识别和应急处理流程', 201],
  ];

  const insert = database.prepare(`
    INSERT INTO materials (id, title, category, type, description, views, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  for (const row of items) {
    insert.run(...row);
  }
}

export function initDatabase() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('new', 'certified', 'admin')),
      progress_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS material_files (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      file_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_material_files_material ON material_files(material_id);

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT '',
      copywriting TEXT NOT NULL DEFAULT '',
      cover_image_name TEXT,
      cover_image_path TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_activities_sort_order
      ON activities(sort_order, created_at);

    CREATE TABLE IF NOT EXISTS activity_images (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      image_name TEXT NOT NULL,
      image_path TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_activity_images_activity
      ON activity_images(activity_id, sort_order, created_at);

    CREATE TABLE IF NOT EXISTS quiz_banks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('knowledge', 'weekly')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      pass_percent INTEGER NOT NULL DEFAULT 60,
      question_limit INTEGER NOT NULL DEFAULT 0,
      time_limit_minutes INTEGER NOT NULL DEFAULT 0,
      weekly_publish_weekday INTEGER NOT NULL DEFAULT 1,
      weekly_publish_time TEXT NOT NULL DEFAULT '08:30',
      weekly_end_weekday INTEGER NOT NULL DEFAULT 5,
      weekly_end_time TEXT NOT NULL DEFAULT '17:30',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_banks_type_status
      ON quiz_banks(type, status, sort_order);

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      bank_id TEXT NOT NULL REFERENCES quiz_banks(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      correct_indexes_json TEXT NOT NULL DEFAULT '[]',
      question_type TEXT NOT NULL DEFAULT 'single' CHECK(question_type IN ('single', 'multiple', 'boolean', 'text')),
      answer_text TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 1,
      category TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_questions_bank
      ON quiz_questions(bank_id, sort_order, created_at);

    CREATE TABLE IF NOT EXISTS weekly_quiz_release_history (
      id TEXT PRIMARY KEY,
      bank_id TEXT NOT NULL REFERENCES quiz_banks(id) ON DELETE CASCADE,
      week_start_date TEXT NOT NULL,
      published_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('upcoming', 'active', 'ended')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(bank_id, week_start_date)
    );

    CREATE INDEX IF NOT EXISTS idx_weekly_quiz_release_history_bank
      ON weekly_quiz_release_history(bank_id, week_start_date DESC);

    CREATE TABLE IF NOT EXISTS quiz_import_files (
      id TEXT PRIMARY KEY,
      bank_id TEXT NOT NULL REFERENCES quiz_banks(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      imported_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_import_files_bank
      ON quiz_import_files(bank_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bank_id TEXT NOT NULL REFERENCES quiz_banks(id) ON DELETE CASCADE,
      bank_type TEXT NOT NULL CHECK(bank_type IN ('knowledge', 'weekly')),
      bank_title TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      total_score INTEGER NOT NULL DEFAULT 0,
      percent REAL NOT NULL DEFAULT 0,
      passed INTEGER NOT NULL DEFAULT 0,
      question_count INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      week_start_date TEXT,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_type_submitted
      ON quiz_attempts(bank_type, submitted_at DESC);

    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_type
      ON quiz_attempts(user_id, bank_type, submitted_at DESC);
  `);

  migrateMaterialsHidden(database);
  migrateMaterialsSortOrder(database);
  migrateMaterialFileExtract(database);
  migrateActivitiesSortOrder(database);
  migrateActivityImagesSortOrder(database);
  migrateServiceRequests(database);
  migrateServiceRequestsDayType(database);
  migrateUsersManager(database);
  migrateServiceRequestAssignments(database);
  migrateServiceRequestSupervisorDispatches(database);
  migrateServiceRequestManualPoints(database);
  migrateServiceRequestActualDuration(database);
  migrateServiceRequestReturnFields(database);
  seedUsers(database);
  seedMaterials(database);
  seedActivities(database);
  seedDepartments(database);
  seedServiceRequestsMock(database);
  refreshDemoPendingBadgeSamples(database);
  ensureSimulationFlowDemo(database);
  syncDemoUsersOnly(database);
  syncWangFangAmbassadorData(database);
  assignOrphanServiceRequestsToAdmin(database);
  migrateAmbassadorTaskHygiene(database);
  migrateGarbledFileNames(database);
  migrateGarbledQuizImportFileNames(database);
  migrateActivitiesCopywritingVi(database);
  migrateQuizQuestionTypes(database);
  migrateQuizBanksExamRules(database);
  migrateKnowledgeExamQuestionLimit(database);
  migrateWeeklyQuizSchedule(database);
  seedQuizBanks(database);
  migrateSyncExamBanksFromLargestPool(database);
  seedQuizAttemptsMock(database);

  return database;
}

function formatDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekStartMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function seedQuizAttemptsMock(database) {
  const seeded = database
    .prepare(`SELECT 1 FROM quiz_attempts WHERE id LIKE 'qa-mock-%' LIMIT 1`)
    .get();
  if (seeded) return;

  const weeklyBank = database
    .prepare(`SELECT id, title FROM quiz_banks WHERE type = 'weekly' AND status = 'published' ORDER BY sort_order ASC LIMIT 1`)
    .get();
  const knowledgeBank = database
    .prepare(`SELECT id, title FROM quiz_banks WHERE type = 'knowledge' AND status = 'published' ORDER BY sort_order ASC LIMIT 1`)
    .get();
  if (!weeklyBank || !knowledgeBank) return;

  const insert = database.prepare(`
    INSERT INTO quiz_attempts (
      id, user_id, bank_id, bank_type, bank_title,
      score, total_score, percent, passed,
      question_count, correct_count, week_start_date, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const weeklyRows = [
    { userId: 'sim-ambassador', weeksAgo: 4, score: 4, total: 5, hour: 10, minute: 15 },
    { userId: 'sim-ambassador', weeksAgo: 3, score: 5, total: 5, hour: 9, minute: 42 },
    { userId: 'sim-ambassador', weeksAgo: 2, score: 3, total: 5, hour: 14, minute: 8 },
    { userId: 'sim-ambassador', weeksAgo: 1, score: 4, total: 5, hour: 11, minute: 30 },
    { userId: 'sim-ambassador', weeksAgo: 0, score: 5, total: 5, hour: 8, minute: 55 },
    { userId: 'demo-ambassador-002', weeksAgo: 3, score: 2, total: 5, hour: 16, minute: 20 },
    { userId: 'demo-ambassador-002', weeksAgo: 2, score: 3, total: 5, hour: 10, minute: 5 },
    { userId: 'demo-ambassador-002', weeksAgo: 1, score: 4, total: 5, hour: 9, minute: 18 },
    { userId: 'demo-ambassador-002', weeksAgo: 0, score: 4, total: 5, hour: 15, minute: 40 },
    { userId: 'demo-ambassador-003', weeksAgo: 4, score: 3, total: 5, hour: 13, minute: 12 },
    { userId: 'demo-ambassador-003', weeksAgo: 2, score: 4, total: 5, hour: 11, minute: 6 },
    { userId: 'demo-ambassador-003', weeksAgo: 0, score: 5, total: 5, hour: 8, minute: 48 },
    { userId: 'demo-ambassador-004', weeksAgo: 5, score: 5, total: 5, hour: 9, minute: 0 },
    { userId: 'demo-ambassador-004', weeksAgo: 3, score: 4, total: 5, hour: 10, minute: 22 },
    { userId: 'demo-ambassador-004', weeksAgo: 1, score: 5, total: 5, hour: 14, minute: 35 },
    { userId: 'demo-ambassador-004', weeksAgo: 0, score: 4, total: 5, hour: 16, minute: 10 },
    { userId: 'demo-ambassador-005', weeksAgo: 4, score: 4, total: 5, hour: 12, minute: 30 },
    { userId: 'demo-ambassador-005', weeksAgo: 2, score: 5, total: 5, hour: 9, minute: 55 },
    { userId: 'demo-ambassador-005', weeksAgo: 0, score: 5, total: 5, hour: 11, minute: 20 },
  ];

  let weeklyIdx = 0;
  for (const row of weeklyRows) {
    const weekStart = getWeekStartMonday(new Date());
    weekStart.setDate(weekStart.getDate() - row.weeksAgo * 7);
    const submitted = new Date(weekStart);
    submitted.setDate(submitted.getDate() + 2);
    submitted.setHours(row.hour, row.minute, 0, 0);
    const percent = (row.score / row.total) * 100;
    insert.run(
      `qa-mock-weekly-${String(++weeklyIdx).padStart(3, '0')}`,
      row.userId,
      weeklyBank.id,
      'weekly',
      weeklyBank.title,
      row.score,
      row.total,
      percent,
      1,
      row.total,
      row.score,
      formatDateOnly(weekStart),
      submitted.toISOString().replace('T', ' ').slice(0, 19),
    );
  }

  const knowledgeRows = [
    { userId: 'sim-ambassador', daysAgo: 12, score: 78, total: 100, passed: 1 },
    { userId: 'demo-ambassador-002', daysAgo: 8, score: 52, total: 100, passed: 0 },
    { userId: 'demo-ambassador-003', daysAgo: 15, score: 58, total: 100, passed: 0 },
    { userId: 'demo-ambassador-003', daysAgo: 3, score: 72, total: 100, passed: 1 },
    { userId: 'demo-ambassador-004', daysAgo: 20, score: 85, total: 100, passed: 1 },
    { userId: 'demo-ambassador-005', daysAgo: 6, score: 91, total: 100, passed: 1 },
    { userId: 'demo-ambassador-005', daysAgo: 45, score: 55, total: 100, passed: 0 },
  ];

  let knowledgeIdx = 0;
  for (const row of knowledgeRows) {
    const submitted = new Date();
    submitted.setDate(submitted.getDate() - row.daysAgo);
    submitted.setHours(10 + (knowledgeIdx % 5), 20 + knowledgeIdx * 3, 0, 0);
    const percent = row.score;
    const correct = row.score;
    insert.run(
      `qa-mock-knowledge-${String(++knowledgeIdx).padStart(3, '0')}`,
      row.userId,
      knowledgeBank.id,
      'knowledge',
      knowledgeBank.title,
      row.score,
      row.total,
      percent,
      row.passed,
      row.total,
      correct,
      null,
      submitted.toISOString().replace('T', ' ').slice(0, 19),
    );
  }

  console.log(
    `[db] seeded ${weeklyRows.length} weekly + ${knowledgeRows.length} knowledge quiz attempt mocks`,
  );
}

function seedQuizBanks(database) {
  const count = database.prepare('SELECT COUNT(*) as c FROM quiz_banks').get().c;
  if (count > 0) return;

  const bankWeekly = 'quiz-bank-weekly-default';
  const bankKnowledge = 'quiz-bank-knowledge-default';

  database
    .prepare(
      `INSERT INTO quiz_banks (id, type, title, description, pass_percent, question_limit, time_limit_minutes, status, sort_order)
       VALUES (?, 'weekly', '每周测试（示例）', '每次随机抽 5 题，每题 1 分。', 0, 5, 0, 'published', 0)`,
    )
    .run(bankWeekly);

  database
    .prepare(
      `INSERT INTO quiz_banks (id, type, title, description, pass_percent, question_limit, time_limit_minutes, status, sort_order)
       VALUES (?, 'knowledge', '知识答题（示例）', '共 100 题，达到 60 分通过。', 60, ${KNOWLEDGE_EXAM_QUESTION_LIMIT}, 120, 'published', 0)`,
    )
    .run(bankKnowledge);

  const weeklyQuestions = [
    ['苏州园林的代表作品是？', ['颐和园', '拙政园', '圆明园', '避暑山庄'], 1, '园林历史'],
    ['园林中"借景"的主要作用是？', ['节省成本', '扩大空间感', '便于管理', '增加光照'], 1, '讲解技巧'],
    ['讲解员在带团时应保持多少米的适当距离？', ['1-2米', '3-5米', '5-8米', '8-10米'], 1, '服务规范'],
    ['遇到游客突发疾病时，首先应该？', ['立即拨打120', '让游客休息', '继续讲解', '寻找家属'], 0, '安全知识'],
    ['春季园林主要观赏植物包括？', ['荷花', '菊花', '樱花', '梅花'], 2, '植物识别'],
  ];

  const insertQ = database.prepare(`
    INSERT INTO quiz_questions (
      id, bank_id, question, options_json, correct_index, correct_indexes_json,
      question_type, answer_text, score, category, sort_order, enabled
    )
    VALUES (?, ?, ?, ?, ?, '[]', 'single', '', 1, ?, ?, 1)
  `);

  weeklyQuestions.forEach((row, index) => {
    insertQ.run(
      `qq-weekly-${index + 1}`,
      bankWeekly,
      row[0],
      JSON.stringify(row[1]),
      row[2],
      row[3],
      index,
    );
  });

  const knowledgeQuestions = [
    ['中国古典园林中「借景」手法的主要目的是？', ['扩大空间感', '降低造价', '减少植物', '方便排水'], 0, '园林历史'],
    ['拙政园位于哪座城市？', ['杭州', '苏州', '南京', '扬州'], 1, '园林历史'],
    ['讲解时应使用的标准普通话属于？', ['方言表达', '规范普通话', '外语混用', '随意简称'], 1, '讲解技巧'],
    ['发现游客身体不适，第一步应？', ['联系医疗急救', '继续行程', '拍照留念', '解散团队'], 0, '安全知识'],
  ];

  knowledgeQuestions.forEach((row, index) => {
    insertQ.run(
      `qq-knowledge-${index + 1}`,
      bankKnowledge,
      row[0],
      JSON.stringify(row[1]),
      row[2],
      row[3],
      index,
    );
  });
}

function hasColumn(database, tableName, columnName) {
  const cols = database.prepare(`PRAGMA table_info(${tableName})`).all();
  return cols.some((c) => c.name === columnName);
}

function migrateQuizQuestionTypes(database) {
  if (!hasColumn(database, 'quiz_questions', 'correct_indexes_json')) {
    database.exec(
      `ALTER TABLE quiz_questions ADD COLUMN correct_indexes_json TEXT NOT NULL DEFAULT '[]'`,
    );
  }
  if (!hasColumn(database, 'quiz_questions', 'question_type')) {
    database.exec(
      `ALTER TABLE quiz_questions ADD COLUMN question_type TEXT NOT NULL DEFAULT 'single'`,
    );
  }
  if (!hasColumn(database, 'quiz_questions', 'answer_text')) {
    database.exec(
      `ALTER TABLE quiz_questions ADD COLUMN answer_text TEXT NOT NULL DEFAULT ''`,
    );
  }
  if (!hasColumn(database, 'quiz_questions', 'score')) {
    database.exec(
      `ALTER TABLE quiz_questions ADD COLUMN score INTEGER NOT NULL DEFAULT 1`,
    );
  }

  database.exec(`
    UPDATE quiz_questions
    SET question_type = CASE
      WHEN question_type IS NULL OR question_type = '' THEN 'single'
      WHEN question_type = 'judge' THEN 'boolean'
      ELSE question_type
    END
  `);
}

function migrateQuizBanksExamRules(database) {
  database.exec(`
    UPDATE quiz_banks
    SET question_limit = 5, pass_percent = 0
    WHERE type = 'weekly' AND status = 'published' AND (question_limit = 0 OR pass_percent = 60)
  `);
  database.exec(`
    UPDATE quiz_banks
    SET question_limit = ${KNOWLEDGE_EXAM_QUESTION_LIMIT}, pass_percent = 60
    WHERE type = 'knowledge' AND status = 'published' AND question_limit < ${KNOWLEDGE_EXAM_QUESTION_LIMIT}
  `);
}

function migrateKnowledgeExamQuestionLimit(database) {
  database
    .prepare(
      `UPDATE quiz_banks
       SET question_limit = ?
       WHERE type = 'knowledge' AND question_limit != ?`,
    )
    .run(KNOWLEDGE_EXAM_QUESTION_LIMIT, KNOWLEDGE_EXAM_QUESTION_LIMIT);
}

function migrateSyncExamBanksFromLargestPool(database) {
  try {
    const result = syncExamBanksFromLargestPoolIfNeeded(database);
    if (result) {
      console.log(
        `[quiz-sync] synced ${result.questionCount} questions from "${result.sourceTitle}" to weekly & knowledge exams`,
      );
    }
  } catch (err) {
    console.warn('[quiz-sync] auto sync skipped:', err);
  }
}

function migrateWeeklyQuizSchedule(database) {
  if (!hasColumn(database, 'quiz_banks', 'weekly_publish_weekday')) {
    database.exec(
      `ALTER TABLE quiz_banks ADD COLUMN weekly_publish_weekday INTEGER NOT NULL DEFAULT 1`,
    );
  }
  if (!hasColumn(database, 'quiz_banks', 'weekly_publish_time')) {
    database.exec(
      `ALTER TABLE quiz_banks ADD COLUMN weekly_publish_time TEXT NOT NULL DEFAULT '08:30'`,
    );
  }
  if (!hasColumn(database, 'quiz_banks', 'weekly_end_weekday')) {
    database.exec(
      `ALTER TABLE quiz_banks ADD COLUMN weekly_end_weekday INTEGER NOT NULL DEFAULT 5`,
    );
  }
  if (!hasColumn(database, 'quiz_banks', 'weekly_end_time')) {
    database.exec(
      `ALTER TABLE quiz_banks ADD COLUMN weekly_end_time TEXT NOT NULL DEFAULT '17:30'`,
    );
  }
}

function seedActivities(database) {
  const count = database.prepare('SELECT COUNT(*) as c FROM activities').get().c;
  if (count > 0) return;

  const items = [
    ['act-seed-1', '园林四季导览活动', '四季主题', '围绕园区四季景观设计讲解与互动打卡。', 'published', 0],
    ['act-seed-2', '十如故事分享会', '文化主题', '通过讲述十如故事，增强访客文化体验感。', 'draft', 1],
  ];

  const insert = database.prepare(`
    INSERT INTO activities (id, title, theme, copywriting, status, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  for (const row of items) {
    insert.run(...row);
  }
}

/** 仅保留流程模拟与考试报告演示账号 */
function syncDemoUsersOnly(database) {
  const keep = [
    'sim-admin',
    'sim-ambassador',
    'demo-ambassador-002',
    'demo-ambassador-003',
    'demo-ambassador-004',
    'demo-ambassador-005',
  ];
  const placeholders = keep.map(() => '?').join(',');

  database
    .prepare(
      `DELETE FROM service_request_assignments WHERE user_id NOT IN (${placeholders})`,
    )
    .run(...keep);

  database
    .prepare(
      `UPDATE service_requests SET created_by = 'sim-admin' WHERE created_by NOT IN (${placeholders})`,
    )
    .run(...keep);

  database
    .prepare(
      `UPDATE service_requests SET actual_duration_reported_by = NULL
       WHERE actual_duration_reported_by NOT IN (${placeholders})`,
    )
    .run(...keep);

  database
    .prepare(`DELETE FROM users WHERE id NOT IN (${placeholders})`)
    .run(...keep);
}

/** 将原「王芳(certified/3)」的参观指派与完成记录归并到 sim-ambassador */
function syncWangFangAmbassadorData(database) {
  const ambassadorId = 'sim-ambassador';
  const now = new Date().toISOString();

  database
    .prepare('UPDATE users SET name = ? WHERE id = ?')
    .run('王芳', ambassadorId);

  const wangFangRequestIds = [
    'mock-sr-001',
    'mock-sr-002',
    'mock-sr-003',
    'mock-sr-004',
    'mock-sr-011',
  ];

  const insertAssign = database.prepare(`
    INSERT OR IGNORE INTO service_request_assignments (request_id, user_id, assigned_at)
    VALUES (?, ?, ?)
  `);

  for (const requestId of wangFangRequestIds) {
    const row = database
      .prepare(
        `SELECT id FROM service_requests
         WHERE id = ? AND status IN ('accepted', 'completed')`,
      )
      .get(requestId);
    if (row) insertAssign.run(requestId, ambassadorId, now);
  }

  const placeholders = wangFangRequestIds.map(() => '?').join(',');
  database
    .prepare(
      `UPDATE service_requests
       SET actual_duration_reported_by = ?
       WHERE id IN (${placeholders})
         AND status = 'completed'
         AND (actual_duration_reported_by IS NULL OR actual_duration_reported_by = '3')`,
    )
    .run(ambassadorId, ...wangFangRequestIds);

  database
    .prepare(
      `UPDATE service_requests
       SET actual_duration_hours = duration_hours, updated_at = ?
       WHERE id IN (${placeholders})
         AND status = 'completed'
         AND actual_duration_hours IS NULL`,
    )
    .run(now, ...wangFangRequestIds);
}

/** 全流程模拟：管理员 + 大使账号，及一条待处理需求（仅首次创建） */
function ensureSimulationFlowDemo(database) {
  const hash = bcrypt.hashSync('123456', 10);

  const progressFor = (role, completedStages = 5) => {
    const stages = basicTrainingStagesTemplate.map((s, i) => ({
      ...s,
      completed: i < completedStages,
    }));
    const advanced = role === 'certified' ? 4 : role === 'admin' ? 2 : 0;
    return JSON.stringify({
      basicTrainingStages: stages,
      advancedCoursesCompleted: advanced,
      totalAdvancedCourses: 6,
    });
  };

  const upsertUser = database.prepare(`
    INSERT INTO users (id, username, password_hash, name, role, progress_json, manager_id)
    VALUES (@id, @username, @password_hash, @name, @role, @progress_json, @manager_id)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      password_hash = excluded.password_hash,
      name = excluded.name,
      role = excluded.role,
      progress_json = excluded.progress_json,
      manager_id = excluded.manager_id
  `);

  upsertUser.run({
    id: 'sim-admin',
    username: 'simulate_admin',
    password_hash: hash,
    name: '模拟·管理员',
    role: 'admin',
    progress_json: progressFor('admin'),
    manager_id: null,
  });

  upsertUser.run({
    id: 'sim-ambassador',
    username: 'simulate_ambassador',
    password_hash: hash,
    name: '王芳',
    role: 'certified',
    progress_json: progressFor('certified'),
    manager_id: 'sim-admin',
  });

  const demoAmbassadors = [
    {
      id: 'demo-ambassador-002',
      username: 'zhangming',
      name: '张明',
      role: 'new',
      completedStages: 2,
    },
    {
      id: 'demo-ambassador-003',
      username: 'lihua',
      name: '李华',
      role: 'new',
      completedStages: 3,
    },
    {
      id: 'demo-ambassador-004',
      username: 'chenjing',
      name: '陈静',
      role: 'certified',
      completedStages: 5,
    },
    {
      id: 'demo-ambassador-005',
      username: 'zhaolei',
      name: '赵磊',
      role: 'certified',
      completedStages: 5,
    },
  ];

  for (const row of demoAmbassadors) {
    upsertUser.run({
      id: row.id,
      username: row.username,
      password_hash: hash,
      name: row.name,
      role: row.role,
      progress_json: progressFor(row.role, row.completedStages),
      manager_id: 'sim-admin',
    });
  }

  const flowId = 'simulate-flow-001';
  const exists = database
    .prepare('SELECT 1 FROM service_requests WHERE id = ?')
    .get(flowId);
  if (exists) return;

  const route =
    '声白迎客轩-香山园外围-鼎新苑-精思苑-丝亭-谦和苑-蓉湖-绮彩楼（含三个展厅）-云裳楼外围-餐厅（含乌篷船）';
  const now = new Date().toISOString();
  const submitted = new Date(Date.now() - 86400000).toISOString();

  database
    .prepare(
      `INSERT INTO service_requests (
        id, status, initiator_name, department, cost_center,
        start_at, end_at, duration_hours, language, day_type,
        visitor_count, ambassador_count, estimated_fee,
        route_type, route_detail, visit_group, visit_reason,
        equipment, remarks, created_by, created_at, updated_at, submitted_at
      ) VALUES (
        ?, 'pending', ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )`,
    )
    .run(
      flowId,
      '流程模拟·需求发起人',
      'L&D 学习发展',
      '3908111035',
      '2026-06-10T02:00:00.000Z',
      '2026-06-10T04:00:00.000Z',
      2,
      'zh',
      'workday',
      20,
      1,
      200,
      'regular',
      route,
      '【流程模拟】园区参观体验团',
      '普通参观',
      'bee',
      '此为系统预置的模拟需求，供管理员派单、大使填报时长演练',
      'sim-admin',
      now,
      now,
      submitted,
    );
}

function migrateServiceRequests(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      cost_center_hint TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS service_requests (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft', 'pending', 'accepted', 'completed', 'cancelled')),
      initiator_name TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      cost_center TEXT NOT NULL DEFAULT '',
      start_at TEXT NOT NULL DEFAULT '',
      end_at TEXT NOT NULL DEFAULT '',
      duration_hours REAL,
      language TEXT NOT NULL DEFAULT 'zh' CHECK(language IN ('zh', 'en')),
      day_type TEXT NOT NULL DEFAULT 'workday'
        CHECK(day_type IN ('workday', 'holiday', 'weekend')),
      visitor_count INTEGER NOT NULL DEFAULT 0,
      ambassador_count INTEGER NOT NULL DEFAULT 1,
      estimated_fee REAL NOT NULL DEFAULT 0,
      route_type TEXT NOT NULL DEFAULT 'regular' CHECK(route_type IN ('regular', 'custom')),
      route_detail TEXT NOT NULL DEFAULT '',
      visit_group TEXT NOT NULL DEFAULT '',
      visit_reason TEXT NOT NULL DEFAULT '',
      equipment TEXT NOT NULL DEFAULT 'none'
        CHECK(equipment IN ('bee', 'bluetooth', 'none')),
      remarks TEXT NOT NULL DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      submitted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_service_requests_created_by
      ON service_requests(created_by);
    CREATE INDEX IF NOT EXISTS idx_service_requests_status
      ON service_requests(status);
  `);
}

function migrateServiceRequestsDayType(database) {
  const table = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='service_requests'",
    )
    .get();
  if (!table?.sql || !table.sql.includes('festival')) return;

  database.exec(`
    CREATE TABLE service_requests_migrated (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft', 'pending', 'accepted', 'completed', 'cancelled')),
      initiator_name TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      cost_center TEXT NOT NULL DEFAULT '',
      start_at TEXT NOT NULL DEFAULT '',
      end_at TEXT NOT NULL DEFAULT '',
      duration_hours REAL,
      language TEXT NOT NULL DEFAULT 'zh' CHECK(language IN ('zh', 'en')),
      day_type TEXT NOT NULL DEFAULT 'workday'
        CHECK(day_type IN ('workday', 'holiday', 'weekend')),
      visitor_count INTEGER NOT NULL DEFAULT 0,
      ambassador_count INTEGER NOT NULL DEFAULT 1,
      estimated_fee REAL NOT NULL DEFAULT 0,
      route_type TEXT NOT NULL DEFAULT 'regular' CHECK(route_type IN ('regular', 'custom')),
      route_detail TEXT NOT NULL DEFAULT '',
      visit_group TEXT NOT NULL DEFAULT '',
      visit_reason TEXT NOT NULL DEFAULT '',
      equipment TEXT NOT NULL DEFAULT 'none'
        CHECK(equipment IN ('bee', 'bluetooth', 'none')),
      remarks TEXT NOT NULL DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      submitted_at TEXT
    );

    INSERT INTO service_requests_migrated
    SELECT
      id, status, initiator_name, department, cost_center,
      start_at, end_at, duration_hours, language,
      CASE WHEN day_type = 'festival' THEN 'weekend' ELSE day_type END,
      visitor_count, ambassador_count, estimated_fee,
      route_type, route_detail, visit_group, visit_reason,
      equipment, remarks, created_by, created_at, updated_at, submitted_at
    FROM service_requests;

    DROP TABLE service_requests;
    ALTER TABLE service_requests_migrated RENAME TO service_requests;

    CREATE INDEX IF NOT EXISTS idx_service_requests_created_by
      ON service_requests(created_by);
    CREATE INDEX IF NOT EXISTS idx_service_requests_status
      ON service_requests(status);
  `);
}

function migrateServiceRequestManualPoints(database) {
  const cols = database.prepare('PRAGMA table_info(service_requests)').all();
  if (!cols.some((c) => c.name === 'manual_points')) {
    database.exec(
      'ALTER TABLE service_requests ADD COLUMN manual_points INTEGER',
    );
  }
}

function migrateServiceRequestActualDuration(database) {
  const cols = database.prepare('PRAGMA table_info(service_requests)').all();
  if (!cols.some((c) => c.name === 'actual_duration_hours')) {
    database.exec(`
      ALTER TABLE service_requests ADD COLUMN actual_duration_hours REAL;
      ALTER TABLE service_requests ADD COLUMN actual_duration_reported_at TEXT;
      ALTER TABLE service_requests ADD COLUMN actual_duration_reported_by TEXT
        REFERENCES users(id);
    `);
    database.exec(`
      UPDATE service_requests
      SET actual_duration_hours = duration_hours
      WHERE status = 'completed' AND actual_duration_hours IS NULL
    `);
  }
}

function migrateServiceRequestReturnFields(database) {
  const cols = database.prepare('PRAGMA table_info(service_requests)').all();
  if (!cols.some((c) => c.name === 'return_notice')) {
    database.exec(`
      ALTER TABLE service_requests ADD COLUMN return_notice TEXT;
      ALTER TABLE service_requests ADD COLUMN returned_at TEXT;
    `);
  }
}

function migrateServiceRequestAssignments(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS service_request_assignments (
      request_id TEXT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (request_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sra_user ON service_request_assignments(user_id);
  `);
}

function migrateUsersManager(database) {
  const cols = database.prepare('PRAGMA table_info(users)').all();
  if (!cols.some((c) => c.name === 'manager_id')) {
    database.exec(`
      ALTER TABLE users ADD COLUMN manager_id TEXT REFERENCES users(id);
    `);
  }
}

function migrateServiceRequestSupervisorDispatches(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS service_request_supervisor_dispatches (
      request_id TEXT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dispatched_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (request_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sr_supervisor_dispatch_user
      ON service_request_supervisor_dispatches(user_id);
  `);
}

function seedDepartments(database) {
  const count = database.prepare('SELECT COUNT(*) as c FROM departments').get().c;
  if (count > 0) return;

  const items = [
    ['dept-gle', '(GLE)|GLG|计划', '3905632001'],
    ['dept-hr', '人力资源部', '2388510000'],
    ['dept-ld', 'L&D 学习发展', '3908111035'],
    ['dept-ops', '运营部', '3905632001'],
    ['dept-guest', '访客接待', '3905632001'],
  ];

  const insert = database.prepare(
    'INSERT INTO departments (id, name, cost_center_hint) VALUES (?, ?, ?)',
  );
  for (const row of items) insert.run(...row);
}

/** 演示用：大使服务参观记录 + 指派，便于后台累计时长排行 */
export function seedServiceRequestsMock(database) {
  const exists = database
    .prepare("SELECT 1 FROM service_requests WHERE id LIKE 'mock-sr-%' LIMIT 1")
    .get();
  if (exists) return;

  const route =
    '声白迎客轩-香山园外围-鼎新苑-精思苑-丝亭-谦和苑-蓉湖-绮彩楼（含三个展厅）-云裳楼外围-餐厅（含乌篷船）';

  const insertReq = database.prepare(`
    INSERT INTO service_requests (
      id, status, initiator_name, department, cost_center,
      start_at, end_at, duration_hours, language, day_type,
      visitor_count, ambassador_count, estimated_fee,
      route_type, route_detail, visit_group, visit_reason,
      equipment, remarks, created_by, created_at, updated_at, submitted_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `);

  const insertAssign = database.prepare(`
    INSERT INTO service_request_assignments (request_id, user_id, assigned_at)
    VALUES (?, ?, ?)
  `);

  const mocks = [
    {
      id: 'mock-sr-001',
      status: 'completed',
      initiator: 'Ng Pui Ki Peggy',
      dept: '(GLE)|GLG|计划',
      cost: '3905632001',
      start: '2026-01-15T09:00:00.000Z',
      end: '2026-01-15T11:00:00.000Z',
      hours: 2,
      lang: 'zh',
      day: 'workday',
      visitors: 25,
      ambassadors: 1,
      fee: 100,
      group: 'GLE 管理层参观团',
      reason: '普通参观',
      equip: 'bee',
      remarks: '',
      createdBy: '2',
      submitted: '2026-01-10T08:00:00.000Z',
      assign: ['sim-ambassador'],
    },
    {
      id: 'mock-sr-002',
      status: 'completed',
      initiator: 'Zhou Siyao Sylvie',
      dept: '人力资源部',
      cost: '2388510000',
      start: '2026-02-08T14:00:00.000Z',
      end: '2026-02-08T15:30:00.000Z',
      hours: 1.5,
      lang: 'zh',
      day: 'workday',
      visitors: 18,
      ambassadors: 1,
      fee: 100,
      group: 'HR 新员工园区体验',
      reason: '研学',
      equip: 'none',
      remarks: '',
      createdBy: '2',
      submitted: '2026-02-01T09:00:00.000Z',
      assign: ['sim-ambassador'],
    },
    {
      id: 'mock-sr-003',
      status: 'completed',
      initiator: 'Tan Zi Yi',
      dept: 'L&D 学习发展',
      cost: '3908111035',
      start: '2026-02-20T08:45:00.000Z',
      end: '2026-02-20T11:00:00.000Z',
      hours: 2.2,
      lang: 'zh',
      day: 'workday',
      visitors: 32,
      ambassadors: 1,
      fee: 200,
      group: 'L&D 十如故事分享专场',
      reason: '普通参观',
      equip: 'bee',
      remarks: '指定王芳',
      createdBy: '1',
      submitted: '2026-02-12T10:00:00.000Z',
      assign: ['sim-ambassador'],
    },
    {
      id: 'mock-sr-004',
      status: 'completed',
      initiator: 'Daisy Liu',
      dept: '运营部',
      cost: '3905632001',
      start: '2026-03-05T10:00:00.000Z',
      end: '2026-03-05T12:30:00.000Z',
      hours: 2.5,
      lang: 'en',
      day: 'workday',
      visitors: 40,
      ambassadors: 2,
      fee: 800,
      group: '海外客户考察团',
      reason: '普通参观',
      equip: 'bluetooth',
      remarks: '双语讲解，双人配合',
      createdBy: '2',
      submitted: '2026-02-28T14:00:00.000Z',
      assign: ['sim-ambassador'],
    },
    {
      id: 'mock-sr-005',
      status: 'accepted',
      initiator: 'Li Wei',
      dept: '访客接待',
      cost: '3905632001',
      start: '2026-04-12T09:30:00.000Z',
      end: '2026-04-12T11:00:00.000Z',
      hours: 1.5,
      lang: 'zh',
      day: 'weekend',
      visitors: 22,
      ambassadors: 1,
      fee: 600,
      group: '周末公众开放日',
      reason: '普通参观',
      equip: 'bee',
      remarks: '',
      createdBy: '2',
      submitted: '2026-04-01T08:00:00.000Z',
      assign: ['sim-ambassador'],
    },
    {
      id: 'mock-sr-006',
      status: 'completed',
      initiator: 'Chen Jing',
      dept: '(GLE)|GLG|计划',
      cost: '3905632001',
      start: '2026-03-18T13:00:00.000Z',
      end: '2026-03-18T16:00:00.000Z',
      hours: 3,
      lang: 'zh',
      day: 'holiday',
      visitors: 15,
      ambassadors: 1,
      fee: 600,
      group: '清明节专题研学团',
      reason: '研学',
      equip: 'none',
      remarks: '',
      createdBy: '4',
      submitted: '2026-03-10T11:00:00.000Z',
      assign: ['sim-admin'],
    },
    {
      id: 'mock-sr-007',
      status: 'completed',
      initiator: 'Wang Ming',
      dept: '人力资源部',
      cost: '2388510000',
      start: '2026-01-22T15:00:00.000Z',
      end: '2026-01-22T16:30:00.000Z',
      hours: 1.5,
      lang: 'zh',
      day: 'workday',
      visitors: 12,
      ambassadors: 1,
      fee: 100,
      group: 'HR 文化之旅',
      reason: '普通参观',
      equip: 'bee',
      remarks: '',
      createdBy: '2',
      submitted: '2026-01-18T09:00:00.000Z',
      assign: ['sim-admin'],
    },
    {
      id: 'mock-sr-008',
      status: 'completed',
      initiator: 'Zhang Ming',
      dept: 'L&D 学习发展',
      cost: '3908111035',
      start: '2026-02-28T09:00:00.000Z',
      end: '2026-02-28T10:30:00.000Z',
      hours: 1.5,
      lang: 'zh',
      day: 'workday',
      visitors: 8,
      ambassadors: 1,
      fee: 100,
      group: '内部培训师踩线',
      reason: '其它',
      equip: 'none',
      remarks: '管理员兼讲',
      createdBy: '1',
      submitted: '2026-02-25T16:00:00.000Z',
      assign: ['sim-admin'],
    },
    {
      id: 'mock-sr-009',
      status: 'completed',
      initiator: 'Liu Qiang',
      dept: '运营部',
      cost: '3905632001',
      start: '2026-03-28T08:30:00.000Z',
      end: '2026-03-28T10:30:00.000Z',
      hours: 2,
      lang: 'zh',
      day: 'workday',
      visitors: 28,
      ambassadors: 1,
      fee: 200,
      group: '供应链伙伴参观',
      reason: '普通参观',
      equip: 'bee',
      remarks: '',
      createdBy: '4',
      submitted: '2026-03-20T10:00:00.000Z',
      assign: ['sim-admin'],
    },
    {
      id: 'mock-sr-010',
      status: 'completed',
      initiator: 'Zhao Min',
      dept: '访客接待',
      cost: '3905632001',
      start: '2026-04-02T14:00:00.000Z',
      end: '2026-04-02T15:00:00.000Z',
      hours: 1,
      lang: 'zh',
      day: 'workday',
      visitors: 10,
      ambassadors: 1,
      fee: 100,
      group: '政府考察预备团',
      reason: '普通参观',
      equip: 'none',
      remarks: '',
      createdBy: '6',
      submitted: '2026-03-30T08:00:00.000Z',
      assign: ['sim-admin'],
    },
    {
      id: 'mock-sr-011',
      status: 'completed',
      initiator: 'Sun Hao',
      dept: '(GLE)|GLG|计划',
      cost: '3905632001',
      start: '2026-04-18T09:00:00.000Z',
      end: '2026-04-18T12:00:00.000Z',
      hours: 3,
      lang: 'zh',
      day: 'weekend',
      visitors: 35,
      ambassadors: 1,
      fee: 600,
      group: 'GLE 家庭开放日',
      reason: '普通参观',
      equip: 'bee',
      remarks: '',
      createdBy: '2',
      submitted: '2026-04-10T12:00:00.000Z',
      assign: ['sim-ambassador'],
    },
    {
      id: 'mock-sr-012',
      status: 'pending',
      initiator: 'Wu Ying',
      dept: '人力资源部',
      cost: '2388510000',
      start: '2026-05-28T10:00:00.000Z',
      end: '2026-05-28T11:30:00.000Z',
      hours: 1.5,
      lang: 'en',
      day: 'workday',
      visitors: 20,
      ambassadors: 1,
      fee: 400,
      group: '待安排-外企参观',
      reason: '普通参观',
      equip: 'bluetooth',
      remarks: '待 L&D 指派大使',
      createdBy: '2',
      submitted: '2026-05-20T09:00:00.000Z',
      assign: [],
    },
  ];

  const now = new Date().toISOString();

  for (const m of mocks) {
    insertReq.run(
      m.id,
      m.status,
      m.initiator,
      m.dept,
      m.cost,
      m.start,
      m.end,
      m.hours,
      m.lang,
      m.day,
      m.visitors,
      m.ambassadors,
      m.fee,
      'regular',
      route,
      m.group,
      m.reason,
      m.equip,
      m.remarks,
      m.createdBy,
      m.submitted,
      m.submitted,
      m.submitted,
    );
    for (const uid of m.assign) {
      insertAssign.run(m.id, uid, m.submitted || now);
    }
  }

  console.log('[db] 已写入大使服务 mock 数据（mock-sr-001 ~ 012）');
}

/**
 * 将未指派大使的已完成参观记录归到管理员（sim-admin），并补齐填报人，
 * 以便「参观与积分」与管理员服务报表同步显示。待处理（pending）单不在此列。
 */
function assignOrphanServiceRequestsToAdmin(database) {
  const admin = database
    .prepare(`SELECT id FROM users WHERE id = 'sim-admin' LIMIT 1`)
    .get();
  if (!admin) return;

  const orphans = database
    .prepare(
      `SELECT r.id, r.status,
              COALESCE(r.submitted_at, r.updated_at, r.created_at) AS ts
       FROM service_requests r
       WHERE r.status = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM service_request_assignments sra WHERE sra.request_id = r.id
         )`,
    )
    .all();

  if (orphans.length === 0) return;

  const insertAssign = database.prepare(`
    INSERT OR IGNORE INTO service_request_assignments (request_id, user_id, assigned_at)
    VALUES (?, ?, ?)
  `);
  const syncCompleted = database.prepare(`
    UPDATE service_requests
    SET actual_duration_hours = COALESCE(actual_duration_hours, duration_hours),
        actual_duration_reported_by = COALESCE(actual_duration_reported_by, ?),
        actual_duration_reported_at = COALESCE(actual_duration_reported_at, ?),
        updated_at = datetime('now')
    WHERE id = ? AND status = 'completed'
  `);

  const now = new Date().toISOString();
  for (const row of orphans) {
    const at = row.ts || now;
    insertAssign.run(row.id, admin.id, at);
    if (row.status === 'completed') {
      syncCompleted.run(admin.id, at, row.id);
    }
  }

  console.log(
    `[db] 已将 ${orphans.length} 条未指派参观记录归到管理员（${admin.id}）`,
  );
}

/**
 * 待处理需求应由管理员在「需求处理」派单，不应出现在大使「我的讲解任务」。
 * 清除 pending 单的指派；演示数据 mock-sr-005 改派给正式大使。
 */
function migrateAmbassadorTaskHygiene(database) {
  const removed = database
    .prepare(
      `DELETE FROM service_request_assignments
       WHERE request_id IN (SELECT id FROM service_requests WHERE status = 'pending')`,
    )
    .run();

  const ambassador = database
    .prepare(`SELECT id FROM users WHERE id = 'sim-ambassador' LIMIT 1`)
    .get();
  if (ambassador) {
    database
      .prepare(
        `DELETE FROM service_request_assignments
         WHERE request_id = 'mock-sr-005' AND user_id = 'sim-admin'`,
      )
      .run();
    const mock005 = database
      .prepare(`SELECT id, status FROM service_requests WHERE id = 'mock-sr-005'`)
      .get();
    if (mock005?.status === 'pending') {
      database
        .prepare(
          `UPDATE service_requests SET status = 'accepted', updated_at = datetime('now') WHERE id = 'mock-sr-005'`,
        )
        .run();
    }
    if (mock005) {
      database
        .prepare(
          `INSERT OR IGNORE INTO service_request_assignments (request_id, user_id, assigned_at)
           VALUES ('mock-sr-005', ?, datetime('now'))`,
        )
        .run(ambassador.id);
    }
  }

  if (removed.changes > 0) {
    console.log(
      `[db] 已清除 ${removed.changes} 条待处理需求的错误派单（不应出现在大使任务）`,
    );
  }
}

/** 保证演示数据里始终有待处理订单、待核算积分，便于验证菜单角标 */
function refreshDemoPendingBadgeSamples(database) {
  database
    .prepare(
      `UPDATE service_requests
       SET status = 'pending', updated_at = datetime('now')
       WHERE id = 'mock-sr-012' AND status = 'cancelled'`,
    )
    .run();
  database
    .prepare(
      `UPDATE service_requests
       SET manual_points = NULL, updated_at = datetime('now')
       WHERE id = 'mock-sr-006'
         AND day_type = 'holiday'
         AND status = 'completed'
         AND manual_points IS NOT NULL`,
    )
    .run();
}

function migrateMaterialsHidden(database) {
  const cols = database.prepare('PRAGMA table_info(materials)').all();
  if (!cols.some((c) => c.name === 'hidden')) {
    database.exec(
      'ALTER TABLE materials ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0',
    );
  }
}

function migrateMaterialsSortOrder(database) {
  const cols = database.prepare('PRAGMA table_info(materials)').all();
  if (!cols.some((c) => c.name === 'sort_order')) {
    database.exec(
      'ALTER TABLE materials ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0',
    );
    const rows = database
      .prepare('SELECT id FROM materials ORDER BY created_at ASC')
      .all();
    const update = database.prepare(
      'UPDATE materials SET sort_order = ? WHERE id = ?',
    );
    rows.forEach((row, index) => update.run(index, row.id));
  }
}

function migrateMaterialFileExtract(database) {
  const hasCol = (name) =>
    database
      .prepare('PRAGMA table_info(material_files)')
      .all()
      .some((c) => c.name === name);
  if (!hasCol('extracted_text')) {
    database.exec(
      `ALTER TABLE material_files ADD COLUMN extracted_text TEXT NOT NULL DEFAULT ''`,
    );
  }
  if (!hasCol('extract_status')) {
    database.exec(
      `ALTER TABLE material_files ADD COLUMN extract_status TEXT NOT NULL DEFAULT 'pending'`,
    );
  }
  if (!hasCol('extract_error')) {
    database.exec(`ALTER TABLE material_files ADD COLUMN extract_error TEXT`);
  }
  if (!hasCol('extracted_at')) {
    database.exec(`ALTER TABLE material_files ADD COLUMN extracted_at TEXT`);
  }
}

function migrateActivitiesSortOrder(database) {
  const cols = database.prepare('PRAGMA table_info(activities)').all();
  if (!cols.some((c) => c.name === 'sort_order')) {
    database.exec(
      'ALTER TABLE activities ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0',
    );
    const rows = database
      .prepare('SELECT id FROM activities ORDER BY created_at ASC')
      .all();
    const update = database.prepare(
      'UPDATE activities SET sort_order = ? WHERE id = ?',
    );
    rows.forEach((row, index) => update.run(index, row.id));
  }
}

function migrateActivityImagesSortOrder(database) {
  const cols = database.prepare('PRAGMA table_info(activity_images)').all();
  if (cols.length === 0) return;
  if (!cols.some((c) => c.name === 'sort_order')) {
    database.exec(
      'ALTER TABLE activity_images ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0',
    );
    const rows = database
      .prepare('SELECT id FROM activity_images ORDER BY created_at ASC')
      .all();
    const update = database.prepare(
      'UPDATE activity_images SET sort_order = ? WHERE id = ?',
    );
    rows.forEach((row, index) => update.run(index, row.id));
  }
}

export function rowToUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    managerId: row.manager_id ?? null,
    managerName: row.manager_name ?? null,
    progress: JSON.parse(row.progress_json),
  };
}

export function rowToMaterial(row, files = []) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    type: row.type,
    description: row.description,
    hidden: Boolean(row.hidden),
    sortOrder: row.sort_order ?? 0,
    views: row.views,
    files: files.map((f) => ({
      id: f.id,
      fileName: f.file_name,
      fileSize: f.file_size,
      mimeType: f.mime_type,
      type: f.file_type,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
