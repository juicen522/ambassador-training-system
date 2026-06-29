import { computeDurationHours } from './ambassadorFee.js';

/** 冬季（11月–次年5月）按时长基础积分 */
const WINTER_BASE = [
  { maxHours: 1, points: 55 },
  { maxHours: 2, points: 80 },
  { maxHours: 3, points: 105 },
  { maxHours: Infinity, points: 130 },
];

const SUMMER_MULTIPLIER = 1.2;
const ENGLISH_MULTIPLIER = 1.5;

/** 周末公休日双倍积分；法定节假日积分需人工核算（薪酬三倍不纳入自动规则） */
const DAY_MULTIPLIERS = {
  workday: 1,
  weekend: 2,
};

/** 仅参观完成且已填报实际时长后计入积分 */
export const COUNTABLE_POINT_STATUSES = ['completed'];

export const MANUAL_POINTS_LABEL = '需人工核算';

/**
 * @param {string} dayType
 */
export function requiresManualPoints(dayType) {
  const raw = dayType === 'festival' ? 'weekend' : dayType;
  return raw === 'holiday';
}

/**
 * @param {Date} date
 */
export function isSummerSeason(date) {
  const month = date.getMonth() + 1;
  return month >= 6 && month <= 10;
}

/**
 * @param {number} hours
 * @param {'winter'|'summer'} season
 */
export function basePointsForDuration(hours, season = 'winter') {
  const h = Math.max(0, Number(hours) || 0);
  let base = WINTER_BASE[0].points;
  for (const tier of WINTER_BASE) {
    if (h < tier.maxHours) {
      base = tier.points;
      break;
    }
  }
  if (season === 'summer') {
    base = Math.round(base * SUMMER_MULTIPLIER);
  }
  return base;
}

/**
 * 自动计分（不含法定节假日）
 * @param {{
 *   durationHours: number,
 *   language?: 'zh'|'en',
 *   dayType?: 'workday'|'holiday'|'weekend'|string,
 *   startAt?: string,
 * }} params
 */
export function calculateAutoServicePoints(params) {
  const hours = Math.max(0, Number(params.durationHours) || 0);
  const start = params.startAt ? new Date(params.startAt) : new Date();
  const season = isSummerSeason(start) ? 'summer' : 'winter';
  let points = basePointsForDuration(hours, season);

  if (params.language === 'en') {
    points = Math.round(points * ENGLISH_MULTIPLIER);
  }

  const rawDay = params.dayType === 'festival' ? 'weekend' : params.dayType;
  const dayMul = DAY_MULTIPLIERS[rawDay] ?? 1;
  points = Math.round(points * dayMul);

  return points;
}

function rowHours(row) {
  if (
    row.actual_duration_hours != null &&
    row.actual_duration_hours !== '' &&
    Number(row.actual_duration_hours) >= 0
  ) {
    return Number(row.actual_duration_hours);
  }
  if (row.status === 'completed') {
    return null;
  }
  if (row.duration_hours != null && row.duration_hours !== '') {
    return Number(row.duration_hours);
  }
  return computeDurationHours(row.start_at, row.end_at);
}

/**
 * @param {{
 *   durationHours: number,
 *   language?: 'zh'|'en',
 *   dayType?: string,
 *   startAt?: string,
 *   manualPoints?: number|null,
 * }} params
 * @returns {{ points: number|null, manualRequired: boolean, manualPoints: number|null }}
 */
export function resolveServicePoints(params) {
  if (requiresManualPoints(params.dayType)) {
    const stored =
      params.manualPoints != null && params.manualPoints !== ''
        ? Math.round(Number(params.manualPoints))
        : null;
    if (stored != null && Number.isFinite(stored) && stored >= 0) {
      return { points: stored, manualRequired: true, manualPoints: stored };
    }
    return { points: null, manualRequired: true, manualPoints: null };
  }
  const auto = calculateAutoServicePoints(params);
  return { points: auto, manualRequired: false, manualPoints: null };
}

/**
 * @param {{ duration_hours?: number|null, start_at?: string, end_at?: string, language?: string, day_type?: string, manual_points?: number|null }} row
 */
export function pointsFromRequestRow(row) {
  return resolveServicePoints({
    durationHours: rowHours(row),
    language: row.language === 'en' ? 'en' : 'zh',
    dayType: row.day_type,
    startAt: row.start_at,
    manualPoints: row.manual_points,
  });
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 */
export function getAmbassadorTotalPoints(db, userId) {
  const placeholders = COUNTABLE_POINT_STATUSES.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT r.status, r.duration_hours, r.actual_duration_hours,
              r.start_at, r.end_at, r.language, r.day_type, r.manual_points
       FROM service_requests r
       INNER JOIN service_request_assignments sra ON sra.request_id = r.id
       WHERE sra.user_id = ? AND r.status IN (${placeholders})`,
    )
    .all(userId, ...COUNTABLE_POINT_STATUSES);

  return rows.reduce((sum, row) => {
    const { points } = pointsFromRequestRow(row);
    if (points == null) return sum;
    return sum + points;
  }, 0);
}

/** @param {import('better-sqlite3').Database} db */
export function getAllAmbassadorPointsTotals(db) {
  const users = db
    .prepare(`SELECT id FROM users WHERE role IN ('certified', 'admin')`)
    .all();
  const map = new Map();
  for (const u of users) {
    map.set(u.id, getAmbassadorTotalPoints(db, u.id));
  }
  return map;
}

/**
 * 节假日已接受/已完成但未填写人工积分的场次数
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 */
export function getAmbassadorPendingManualCount(db, userId) {
  const placeholders = COUNTABLE_POINT_STATUSES.map(() => '?').join(',');
  return (
    db
      .prepare(
        `SELECT COUNT(DISTINCT r.id) AS c
         FROM service_requests r
         INNER JOIN service_request_assignments sra ON sra.request_id = r.id
         WHERE sra.user_id = ?
           AND r.status IN (${placeholders})
           AND r.day_type = 'holiday'
           AND r.manual_points IS NULL`,
      )
      .get(userId, ...COUNTABLE_POINT_STATUSES).c ?? 0
  );
}

/** 全站待人工核算积分的订单数（与前台 isPendingManualRecord 一致） */
export function getSystemPendingManualCount(db) {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c
         FROM service_requests r
         WHERE r.status NOT IN ('draft', 'cancelled')
           AND r.day_type = 'holiday'
           AND r.manual_points IS NULL`,
      )
      .get().c ?? 0
  );
}

/** @param {import('better-sqlite3').Database} db */
export function getPendingRequestCount(db) {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM service_requests WHERE status = 'pending'`,
      )
      .get().c ?? 0
  );
}

/** @param {import('better-sqlite3').Database} db */
export function getAllAmbassadorPendingManualCounts(db) {
  const users = db
    .prepare(`SELECT id FROM users WHERE role IN ('certified', 'admin')`)
    .all();
  const map = new Map();
  for (const u of users) {
    map.set(u.id, getAmbassadorPendingManualCount(db, u.id));
  }
  return map;
}
