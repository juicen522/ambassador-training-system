import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { calculateAmbassadorFee, computeDurationHours } from '../lib/ambassadorFee.js';
import {
  getAllAmbassadorPendingManualCounts,
  getAllAmbassadorPointsTotals,
  getAmbassadorPendingManualCount,
  getAmbassadorTotalPoints,
  getPendingRequestCount,
  getSystemPendingManualCount,
  pointsFromRequestRow,
  requiresManualPoints,
} from '../lib/ambassadorPoints.js';

const router = Router();

const REGULAR_ROUTE =
  '声白迎客轩-香山园外围-鼎新苑-精思苑-丝亭-谦和苑-蓉湖-绮彩楼（含三个展厅）-云裳楼外围-餐厅（含乌篷船）';

const COUNTABLE_STATUSES = ['completed'];

function isUserAssigned(db, requestId, userId) {
  return Boolean(
    db
      .prepare(
        'SELECT 1 FROM service_request_assignments WHERE request_id = ? AND user_id = ?',
      )
      .get(requestId, userId),
  );
}

function loadAssignments(db, requestId) {
  return db
    .prepare(
      `SELECT sra.user_id AS id, u.name
       FROM service_request_assignments sra
       JOIN users u ON u.id = sra.user_id
       WHERE sra.request_id = ?
       ORDER BY u.name`,
    )
    .all(requestId)
    .map((r) => ({ id: r.id, name: r.name }));
}

function loadSupervisorRecipients(db, requestId) {
  return db
    .prepare(
      `SELECT srsd.user_id AS id, u.name
       FROM service_request_supervisor_dispatches srsd
       JOIN users u ON u.id = srsd.user_id
       WHERE srsd.request_id = ?
       ORDER BY u.name`,
    )
    .all(requestId)
    .map((r) => ({ id: r.id, name: r.name }));
}

function syncSupervisorDispatch(db, requestId, ambassadorIds, nowIso) {
  db.prepare(
    'DELETE FROM service_request_supervisor_dispatches WHERE request_id = ?',
  ).run(requestId);
  if (!Array.isArray(ambassadorIds) || ambassadorIds.length === 0) return;

  const placeholders = ambassadorIds.map(() => '?').join(',');
  const managers = db
    .prepare(
      `SELECT DISTINCT manager_id AS id
       FROM users
       WHERE id IN (${placeholders})
         AND manager_id IS NOT NULL
         AND manager_id != ''`,
    )
    .all(...ambassadorIds)
    .map((r) => r.id)
    .filter((id) => !ambassadorIds.includes(id));
  if (managers.length === 0) return;

  const insert = db.prepare(
    `INSERT INTO service_request_supervisor_dispatches
      (request_id, user_id, dispatched_at)
     VALUES (?, ?, ?)`,
  );
  for (const uid of managers) {
    insert.run(requestId, uid, nowIso);
  }
}

function rowToRequest(row, ambassadors = [], supervisorRecipients = []) {
  return {
    id: row.id,
    status: row.status,
    initiatorName: row.initiator_name,
    department: row.department,
    costCenter: row.cost_center,
    startAt: row.start_at,
    endAt: row.end_at,
    plannedDurationHours: row.duration_hours,
    actualDurationHours:
      row.actual_duration_hours != null ? Number(row.actual_duration_hours) : null,
    durationHours:
      row.actual_duration_hours != null
        ? Number(row.actual_duration_hours)
        : row.duration_hours,
    language: row.language,
    dayType: row.day_type,
    actualDurationReportedAt: row.actual_duration_reported_at ?? null,
    actualDurationReportedBy: row.actual_duration_reported_by ?? null,
    ...(() => {
      const pt = pointsFromRequestRow(row);
      return {
        servicePoints: pt.points,
        pointsManualRequired: pt.manualRequired,
        manualPoints: pt.manualPoints,
      };
    })(),
    visitorCount: row.visitor_count,
    ambassadorCount: row.ambassador_count,
    estimatedFee: row.estimated_fee,
    routeType: row.route_type,
    routeDetail: row.route_detail,
    visitGroup: row.visit_group,
    visitReason: row.visit_reason,
    equipment: row.equipment,
    remarks: row.remarks,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    returnNotice: row.return_notice ?? null,
    returnedAt: row.returned_at ?? null,
    ambassadors,
    supervisorRecipients,
  };
}

function enrichRequest(db, row) {
  return rowToRequest(
    row,
    loadAssignments(db, row.id),
    loadSupervisorRecipients(db, row.id),
  );
}

function parseBody(body) {
  return {
    initiatorName: String(body.initiatorName ?? '').trim(),
    department: String(body.department ?? '').trim(),
    costCenter: String(body.costCenter ?? '').trim(),
    startAt: body.startAt ? String(body.startAt) : '',
    endAt: body.endAt ? String(body.endAt) : '',
    durationHours:
      body.durationHours != null && body.durationHours !== ''
        ? Number(body.durationHours)
        : null,
    language: body.language === 'en' ? 'en' : 'zh',
    dayType: ['workday', 'holiday', 'weekend'].includes(body.dayType)
      ? body.dayType
      : body.dayType === 'festival'
        ? 'weekend'
        : 'workday',
    visitorCount: Number(body.visitorCount) || 0,
    ambassadorCount: Number(body.ambassadorCount) || 1,
    routeType: body.routeType === 'custom' ? 'custom' : 'regular',
    routeDetail:
      body.routeType === 'custom'
        ? String(body.routeDetail ?? '').trim()
        : REGULAR_ROUTE,
    visitGroup: String(body.visitGroup ?? '').trim(),
    visitReason: body.visitReason ? String(body.visitReason) : '',
    equipment: ['bee', 'bluetooth', 'none'].includes(body.equipment)
      ? body.equipment
      : 'none',
    remarks: String(body.remarks ?? '').trim(),
  };
}

function validateForSubmit(data) {
  const errors = [];
  if (!data.initiatorName) errors.push('请填写需求部门发起人');
  if (!data.department) errors.push('请选择需求部门');
  if (!data.startAt) errors.push('请选择讲解开始时间');
  if (!data.endAt) errors.push('请选择讲解结束时间');
  if (!data.visitGroup) errors.push('请填写参观团体');
  if (!data.visitorCount) errors.push('请填写访客人数');
  if (!data.ambassadorCount) errors.push('请填写需要大使人数');
  if (data.routeType === 'custom' && !data.routeDetail) errors.push('请填写定制路线说明');
  const hours =
    data.durationHours ??
    computeDurationHours(data.startAt, data.endAt);
  if (hours <= 0) errors.push('讲解结束时间须晚于开始时间');
  return { errors, hours };
}

router.get('/meta', authRequired, (_req, res) => {
  const db = getDb();
  const departments = db
    .prepare('SELECT id, name, cost_center_hint FROM departments ORDER BY name')
    .all();
  res.json({
    regularRoute: REGULAR_ROUTE,
    departments,
    dayTypes: [
      { id: 'workday', label: '工作日' },
      { id: 'holiday', label: '节假日' },
      { id: 'weekend', label: '周末' },
    ],
  });
});

router.post('/calculate-fee', authRequired, (req, res) => {
  const data = parseBody(req.body);
  const hours =
    data.durationHours ?? computeDurationHours(data.startAt, data.endAt);
  const fee = calculateAmbassadorFee({
    durationHours: hours,
    language: data.language,
    dayType: data.dayType,
    ambassadorCount: data.ambassadorCount,
  });
  res.json({ durationHours: hours, ...fee });
});

router.get('/admin/ambassador-stats', authRequired, adminRequired, (_req, res) => {
  const db = getDb();
  const pointsByUser = getAllAmbassadorPointsTotals(db);
  const pendingManualByUser = getAllAmbassadorPendingManualCounts(db);
  const placeholders = COUNTABLE_STATUSES.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.role,
              COUNT(DISTINCT CASE WHEN r.status IN (${placeholders}) THEN sra.request_id END) AS service_count,
              COALESCE(SUM(
                CASE WHEN r.status IN (${placeholders})
                THEN COALESCE(r.actual_duration_hours, 0) ELSE 0 END
              ), 0) AS total_hours
       FROM users u
       LEFT JOIN service_request_assignments sra ON sra.user_id = u.id
       LEFT JOIN service_requests r ON r.id = sra.request_id
       WHERE u.role IN ('certified', 'admin')
       GROUP BY u.id
       ORDER BY total_hours DESC, u.name ASC`,
    )
    .all(...COUNTABLE_STATUSES, ...COUNTABLE_STATUSES);

  const totalVisitCount = db
    .prepare(`SELECT COUNT(*) AS c FROM service_requests WHERE status = 'completed'`)
    .get().c;

  const ambassadors = rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    serviceCount: r.service_count,
    totalHours: Math.round(r.total_hours * 10) / 10,
    totalPoints: pointsByUser.get(r.id) ?? 0,
    pendingManualCount: pendingManualByUser.get(r.id) ?? 0,
  }));
  const totalPointsAll = ambassadors.reduce((sum, a) => sum + a.totalPoints, 0);

  res.json({
    totalVisitCount,
    totalPointsAll,
    ambassadors,
  });
});

router.get('/admin/pending-badge', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  res.json({
    pendingRequests: getPendingRequestCount(db),
    pendingManualPoints: getSystemPendingManualCount(db),
  });
});

router.get('/admin/list', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const status = String(req.query.status ?? '').trim();
  const department = String(req.query.department ?? '').trim();
  const ambassadorId = String(req.query.ambassadorId ?? '').trim();

  let sql = `
    SELECT DISTINCT r.*, u.name AS created_by_name
    FROM service_requests r
    LEFT JOIN users u ON u.id = r.created_by
    LEFT JOIN service_request_assignments sra ON sra.request_id = r.id
    WHERE r.status != 'draft'
  `;
  const params = [];

  if (status && status !== 'all') {
    sql += ' AND r.status = ?';
    params.push(status);
  }
  if (department) {
    sql += ' AND r.department = ?';
    params.push(department);
  }
  if (ambassadorId) {
    sql += ' AND sra.user_id = ?';
    params.push(ambassadorId);
  }
  if (q) {
    sql += ` AND (
      LOWER(r.initiator_name) LIKE ? OR
      LOWER(r.department) LIKE ? OR
      LOWER(r.visit_group) LIKE ? OR
      LOWER(r.remarks) LIKE ? OR
      LOWER(COALESCE(u.name, '')) LIKE ?
    )`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  sql += ' ORDER BY COALESCE(r.submitted_at, r.created_at) DESC';

  const rows = db.prepare(sql).all(...params);
  const departments = db
    .prepare(
      `SELECT DISTINCT department AS name FROM service_requests WHERE department != '' ORDER BY department`,
    )
    .all();

  const totalCompletedCount = db
    .prepare(`SELECT COUNT(*) AS c FROM service_requests WHERE status = 'completed'`)
    .get().c;

  res.json({
    requests: rows.map((row) => enrichRequest(db, row)),
    departments: departments.map((d) => d.name),
    totalCompletedCount,
    pendingRequests: getPendingRequestCount(db),
    pendingManualPoints: getSystemPendingManualCount(db),
  });
});

router.get('/', authRequired, (req, res) => {
  const db = getDb();
  const isAdmin = req.user?.role === 'admin';
  const rows = isAdmin
    ? db
        .prepare(
          `SELECT r.*, u.name AS created_by_name
           FROM service_requests r
           LEFT JOIN users u ON u.id = r.created_by
           ORDER BY COALESCE(r.submitted_at, r.created_at) DESC`,
        )
        .all()
    : db
        .prepare(
          `SELECT r.*, u.name AS created_by_name
           FROM service_requests r
           LEFT JOIN users u ON u.id = r.created_by
           WHERE r.created_by = ?
           ORDER BY COALESCE(r.submitted_at, r.created_at) DESC`,
        )
        .all(req.user.sub);

  res.json({ requests: rows.map((row) => enrichRequest(db, row)) });
});

router.get('/assignments/mine/report', authRequired, (req, res) => {
  if (!['certified', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: '仅正式大使可查看服务报表' });
  }
  const db = getDb();
  const userId = req.user.sub;
  const placeholders = COUNTABLE_STATUSES.map(() => '?').join(',');

  const rows = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name
       FROM service_requests r
       INNER JOIN service_request_assignments sra ON sra.request_id = r.id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE sra.user_id = ?
         AND r.status IN ('accepted', 'completed')
       ORDER BY r.start_at DESC`,
    )
    .all(userId);

  let totalHours = 0;
  let completedCount = 0;
  let pendingCount = 0;

  const records = rows.map((row) => {
    const request = enrichRequest(db, row);
    if (row.status === 'completed') {
      completedCount += 1;
      totalHours += Number(row.actual_duration_hours) || 0;
    }
    if (row.status === 'accepted') {
      pendingCount += 1;
    }
    return request;
  });

  const totalPoints = getAmbassadorTotalPoints(db, userId);
  const pendingManualCount = getAmbassadorPendingManualCount(db, userId);

  res.json({
    summary: {
      totalPoints,
      totalHours: Math.round(totalHours * 10) / 10,
      completedCount,
      pendingCount,
      pendingManualCount,
      totalAssigned: rows.length,
    },
    records,
  });
});

router.get('/returned-count', authRequired, (req, res) => {
  const db = getDb();
  const returned = db
    .prepare(
      `SELECT COUNT(*) AS c FROM service_requests
       WHERE created_by = ?
         AND status = 'draft'
         AND return_notice IS NOT NULL
         AND return_notice != ''`,
    )
    .get(req.user.sub);
  const pending = db
    .prepare(
      `SELECT COUNT(*) AS c FROM service_requests
       WHERE created_by = ? AND status = 'pending'`,
    )
    .get(req.user.sub);
  res.json({
    count: returned?.c ?? 0,
    pending: pending?.c ?? 0,
  });
});

router.get('/assignments/mine', authRequired, (req, res) => {
  if (!['certified', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: '仅正式大使可查看讲解任务' });
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name
       FROM service_requests r
       INNER JOIN service_request_assignments sra ON sra.request_id = r.id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE sra.user_id = ?
         AND r.status IN ('accepted', 'completed')
       ORDER BY r.start_at DESC`,
    )
    .all(req.user.sub);

  res.json({ requests: rows.map((row) => enrichRequest(db, row)) });
});

router.patch('/:id/reject-assignment', authRequired, (req, res) => {
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM service_requests WHERE id = ?')
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: '需求单不存在' });

  if (!['certified', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: '仅服务大使可拒绝派单' });
  }
  if (!isUserAssigned(db, req.params.id, req.user.sub)) {
    return res.status(403).json({ error: '您未被指派为该场讲解的服务大使' });
  }
  if (!['pending', 'accepted'].includes(existing.status)) {
    return res.status(400).json({ error: '当前状态不可拒绝派单' });
  }

  const reason = String(req.body?.reason ?? '').trim();
  const now = new Date().toISOString();
  const note = reason
    ? `【大使拒绝派单】${reason}`
    : '【大使拒绝派单】请管理员重新安排服务大使';

  db.prepare('DELETE FROM service_request_assignments WHERE request_id = ?').run(
    req.params.id,
  );
  db.prepare(
    `UPDATE service_requests
     SET status = 'pending',
         actual_duration_hours = NULL,
         actual_duration_reported_at = NULL,
         actual_duration_reported_by = NULL,
         remarks = CASE
           WHEN remarks IS NULL OR remarks = '' THEN ?
           ELSE remarks || char(10) || ?
         END,
         updated_at = ?
     WHERE id = ?`,
  ).run(note, note, now, req.params.id);

  const row = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name
       FROM service_requests r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = ?`,
    )
    .get(req.params.id);

  res.json({ request: enrichRequest(db, row) });
});

router.patch('/:id/report-visit', authRequired, (req, res) => {
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM service_requests WHERE id = ?')
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: '需求单不存在' });

  if (!['certified', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: '仅服务大使可填报实际参观时长' });
  }
  if (!isUserAssigned(db, req.params.id, req.user.sub)) {
    return res.status(403).json({ error: '您未被指派为该场讲解的服务大使' });
  }
  if (existing.status !== 'accepted' && existing.status !== 'completed') {
    return res.status(400).json({ error: '当前状态不可填报参观时长，请待管理员派单后再填写' });
  }

  const hours = Number(req.body?.actualDurationHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return res.status(400).json({ error: '请填写有效的实际参观时长（小时）' });
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE service_requests
     SET actual_duration_hours = ?, actual_duration_reported_at = ?,
         actual_duration_reported_by = ?, status = 'completed', updated_at = ?
     WHERE id = ?`,
  ).run(hours, now, req.user.sub, now, req.params.id);

  const row = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name
       FROM service_requests r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = ?`,
    )
    .get(req.params.id);

  res.json({ request: enrichRequest(db, row) });
});

router.patch('/:id/cancel', authRequired, (req, res) => {
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM service_requests WHERE id = ?')
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: '需求单不存在' });

  if (req.user.role !== 'admin' && existing.created_by !== req.user.sub) {
    return res.status(403).json({ error: '无权取消该需求单' });
  }
  if (!['draft', 'pending'].includes(existing.status)) {
    return res.status(400).json({ error: '当前状态不可取消' });
  }

  const now = new Date().toISOString();
  db.prepare('DELETE FROM service_request_assignments WHERE request_id = ?').run(
    req.params.id,
  );
  db.prepare(
    `UPDATE service_requests
     SET status = 'cancelled',
         submitted_at = NULL,
         actual_duration_hours = NULL,
         actual_duration_reported_at = NULL,
         actual_duration_reported_by = NULL,
         return_notice = NULL,
         returned_at = NULL,
         updated_at = ?
     WHERE id = ?`,
  ).run(now, req.params.id);

  const row = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name
       FROM service_requests r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = ?`,
    )
    .get(req.params.id);

  res.json({ request: enrichRequest(db, row) });
});

router.patch('/:id/return-to-creator', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM service_requests WHERE id = ?')
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: '需求单不存在' });

  if (!['pending', 'accepted'].includes(existing.status)) {
    return res.status(400).json({ error: '仅待处理或已派单的需求可退回' });
  }
  if (!existing.created_by) {
    return res.status(400).json({ error: '该需求无发起人账号，无法退回' });
  }

  const reason = String(req.body?.reason ?? '').trim();
  const notice = reason
    ? `您的讲解服务需求已被管理员退回，请修改后重新提交。退回说明：${reason}`
    : '您的讲解服务需求已被管理员退回，请修改后重新提交。';

  const now = new Date().toISOString();
  const remarkNote = reason
    ? `【管理员退回需求】${reason}`
    : '【管理员退回需求】请发起人修改后重新提交';

  db.prepare('DELETE FROM service_request_assignments WHERE request_id = ?').run(
    req.params.id,
  );
  db.prepare(
    `UPDATE service_requests
     SET status = 'draft',
         submitted_at = NULL,
         actual_duration_hours = NULL,
         actual_duration_reported_at = NULL,
         actual_duration_reported_by = NULL,
         return_notice = ?,
         returned_at = ?,
         remarks = CASE
           WHEN remarks IS NULL OR remarks = '' THEN ?
           ELSE remarks || char(10) || ?
         END,
         updated_at = ?
     WHERE id = ?`,
  ).run(notice, now, remarkNote, remarkNote, now, req.params.id);

  const row = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name
       FROM service_requests r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = ?`,
    )
    .get(req.params.id);

  res.json({
    request: enrichRequest(db, row),
    notice: { message: notice, returnedAt: now },
  });
});

router.get('/:id', authRequired, (req, res) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name
       FROM service_requests r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = ?`,
    )
    .get(req.params.id);

  if (!row) return res.status(404).json({ error: '需求单不存在' });
  if (req.user.role !== 'admin' && row.created_by !== req.user.sub) {
    return res.status(403).json({ error: '无权查看该需求单' });
  }
  res.json({ request: enrichRequest(db, row) });
});

router.patch('/:id/admin', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM service_requests WHERE id = ?')
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: '需求单不存在' });

  const { status, ambassadorIds, manualPoints } = req.body ?? {};
  const now = new Date().toISOString();

  if (manualPoints !== undefined) {
    if (!requiresManualPoints(existing.day_type)) {
      return res.status(400).json({ error: '仅节假日记录可填写人工积分' });
    }
    if (manualPoints === null || manualPoints === '') {
      db.prepare(
        'UPDATE service_requests SET manual_points = NULL, updated_at = ? WHERE id = ?',
      ).run(now, req.params.id);
    } else {
      const n = Math.round(Number(manualPoints));
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: '积分须为非负整数' });
      }
      db.prepare(
        'UPDATE service_requests SET manual_points = ?, updated_at = ? WHERE id = ?',
      ).run(n, now, req.params.id);
    }
  }

  if (Array.isArray(ambassadorIds)) {
    const ids = ambassadorIds
      .filter((id) => typeof id === 'string' && id.trim())
      .map((id) => id.trim());

    db.prepare('DELETE FROM service_request_assignments WHERE request_id = ?').run(
      req.params.id,
    );

    if (ids.length > 0) {
      const valid = db
        .prepare(`SELECT id FROM users WHERE id IN (${ids.map(() => '?').join(',')})`)
        .all(...ids)
        .map((r) => r.id);
      const insert = db.prepare(
        'INSERT INTO service_request_assignments (request_id, user_id, assigned_at) VALUES (?, ?, ?)',
      );
      for (const uid of valid) {
        insert.run(req.params.id, uid, now);
      }
      syncSupervisorDispatch(db, req.params.id, valid, now);
      const rowBeforeStatus = db
        .prepare('SELECT status FROM service_requests WHERE id = ?')
        .get(req.params.id);
      if (rowBeforeStatus?.status === 'pending') {
        db.prepare(
          'UPDATE service_requests SET status = ?, updated_at = ? WHERE id = ?',
        ).run('accepted', now, req.params.id);
      }
    } else {
      syncSupervisorDispatch(db, req.params.id, [], now);
    }
  }

  const latest = db
    .prepare('SELECT * FROM service_requests WHERE id = ?')
    .get(req.params.id);

  if (status && ['pending', 'accepted', 'completed', 'cancelled'].includes(status)) {
    if (status === 'accepted') {
      const assigned = loadAssignments(db, req.params.id);
      if (assigned.length === 0) {
        return res.status(400).json({ error: '派单给大使前请至少指定一位服务大使' });
      }
    }
    if (status === 'completed') {
      const row = latest ?? existing;
      if (row.actual_duration_hours == null) {
        return res
          .status(400)
          .json({ error: '请待服务大使填报实际参观时长后再标记为已完成' });
      }
    }
    db.prepare('UPDATE service_requests SET status = ?, updated_at = ? WHERE id = ?').run(
      status,
      now,
      req.params.id,
    );
  }

  const row = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name
       FROM service_requests r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = ?`,
    )
    .get(req.params.id);

  res.json({ request: enrichRequest(db, row) });
});

router.post('/', authRequired, (req, res) => {
  const submit = Boolean(req.body?.submit);
  const data = parseBody(req.body);
  const { errors, hours } = validateForSubmit(data);

  if (submit && errors.length > 0) {
    return res.status(400).json({ error: errors[0], errors });
  }

  const fee = calculateAmbassadorFee({
    durationHours: hours || data.durationHours || 0,
    language: data.language,
    dayType: data.dayType,
    ambassadorCount: data.ambassadorCount,
  });

  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = submit ? 'pending' : 'draft';

  db.prepare(
    `INSERT INTO service_requests (
      id, status, initiator_name, department, cost_center,
      start_at, end_at, duration_hours, language, day_type,
      visitor_count, ambassador_count, estimated_fee,
      route_type, route_detail, visit_group, visit_reason,
      equipment, remarks, created_by, created_at, updated_at, submitted_at,
      return_notice, returned_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      NULL, NULL
    )`,
  ).run(
    id,
    status,
    data.initiatorName,
    data.department,
    data.costCenter,
    data.startAt,
    data.endAt,
    hours || data.durationHours,
    data.language,
    data.dayType,
    data.visitorCount,
    data.ambassadorCount,
    fee.totalFee,
    data.routeType,
    data.routeDetail,
    data.visitGroup,
    data.visitReason,
    data.equipment,
    data.remarks,
    req.user.sub,
    now,
    now,
    submit ? now : null,
  );

  const row = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name
       FROM service_requests r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = ?`,
    )
    .get(id);

  res.status(201).json({ request: enrichRequest(db, row) });
});

router.patch('/:id', authRequired, (req, res) => {
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM service_requests WHERE id = ?')
    .get(req.params.id);

  if (!existing) return res.status(404).json({ error: '需求单不存在' });
  if (req.user.role !== 'admin' && existing.created_by !== req.user.sub) {
    return res.status(403).json({ error: '无权修改该需求单' });
  }
  if (existing.status !== 'draft' && existing.status !== 'pending') {
    return res.status(400).json({ error: '当前状态不可编辑' });
  }

  const submit = Boolean(req.body?.submit);
  const data = parseBody({ ...existing, ...req.body });
  const { errors, hours } = validateForSubmit(data);

  if (submit && errors.length > 0) {
    return res.status(400).json({ error: errors[0], errors });
  }

  const fee = calculateAmbassadorFee({
    durationHours: hours || data.durationHours || 0,
    language: data.language,
    dayType: data.dayType,
    ambassadorCount: data.ambassadorCount,
  });

  const now = new Date().toISOString();
  const status = submit ? 'pending' : existing.status === 'pending' ? 'pending' : 'draft';

  db.prepare(
    `UPDATE service_requests SET
      status = ?, initiator_name = ?, department = ?, cost_center = ?,
      start_at = ?, end_at = ?, duration_hours = ?, language = ?, day_type = ?,
      visitor_count = ?, ambassador_count = ?, estimated_fee = ?,
      route_type = ?, route_detail = ?, visit_group = ?, visit_reason = ?,
      equipment = ?, remarks = ?, updated_at = ?,
      submitted_at = CASE WHEN ? = 1 THEN COALESCE(submitted_at, ?) ELSE submitted_at END,
      return_notice = CASE WHEN ? = 1 THEN NULL ELSE return_notice END,
      returned_at = CASE WHEN ? = 1 THEN NULL ELSE returned_at END
     WHERE id = ?`,
  ).run(
    status,
    data.initiatorName,
    data.department,
    data.costCenter,
    data.startAt,
    data.endAt,
    hours || data.durationHours,
    data.language,
    data.dayType,
    data.visitorCount,
    data.ambassadorCount,
    fee.totalFee,
    data.routeType,
    data.routeDetail,
    data.visitGroup,
    data.visitReason,
    data.equipment,
    data.remarks,
    now,
    submit ? 1 : 0,
    now,
    submit ? 1 : 0,
    submit ? 1 : 0,
    req.params.id,
  );

  const row = db
    .prepare(
      `SELECT r.*, u.name AS created_by_name
       FROM service_requests r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = ?`,
    )
    .get(req.params.id);

  res.json({ request: enrichRequest(db, row) });
});

export default router;
