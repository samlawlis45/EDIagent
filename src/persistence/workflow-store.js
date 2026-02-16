import crypto from 'node:crypto';
import { getDb } from './db.js';

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function createWorkflowRun(input) {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = nowIso();

  db.prepare(`
    INSERT INTO workflow_runs
      (id, workflow, adapter, project_id, partner_name, status, approval_mode, input_json, created_at)
    VALUES
      (@id, @workflow, @adapter, @projectId, @partnerName, @status, @approvalMode, @inputJson, @createdAt)
  `).run({
    id,
    workflow: input.workflow,
    adapter: input.adapter,
    projectId: input.projectId ?? null,
    partnerName: input.partnerName ?? null,
    status: 'running',
    approvalMode: input.approvalMode,
    inputJson: JSON.stringify(input.input),
    createdAt
  });

  return { id, createdAt };
}

export function completeWorkflowRun(runId, summary) {
  const db = getDb();
  const completedAt = nowIso();

  db.prepare(`
    UPDATE workflow_runs
    SET status = @status,
        go_live_recommendation = @goLiveRecommendation,
        blocking_reasons_json = @blockingReasonsJson,
        output_json = @outputJson,
        completed_at = @completedAt
    WHERE id = @id
  `).run({
    id: runId,
    status: summary.status,
    goLiveRecommendation: summary.goLiveRecommendation ?? null,
    blockingReasonsJson: JSON.stringify(summary.blockingReasons ?? []),
    outputJson: JSON.stringify(summary.output ?? null),
    completedAt
  });

  return completedAt;
}

export function updateWorkflowRunInput(runId, nextInput) {
  const db = getDb();
  db.prepare(`
    UPDATE workflow_runs
    SET input_json = @inputJson
    WHERE id = @id
  `).run({
    id: runId,
    inputJson: JSON.stringify(nextInput)
  });
}

function getNextStepAttempt(runId, stepName) {
  const db = getDb();
  const row = db.prepare(`
    SELECT MAX(attempt) AS max_attempt
    FROM workflow_steps
    WHERE workflow_run_id = ? AND step_name = ?
  `).get(runId, stepName);
  return Number(row?.max_attempt ?? 0) + 1;
}

export function createWorkflowStep(runId, stepName) {
  const db = getDb();
  const id = crypto.randomUUID();
  const startedAt = nowIso();
  const attempt = getNextStepAttempt(runId, stepName);

  db.prepare(`
    INSERT INTO workflow_steps
      (id, workflow_run_id, step_name, attempt, status, started_at)
    VALUES
      (@id, @runId, @stepName, @attempt, 'running', @startedAt)
  `).run({
    id,
    runId,
    stepName,
    attempt,
    startedAt
  });

  return { id, startedAt, attempt };
}

export function completeWorkflowStep(stepId, status, output = null, error = null) {
  const db = getDb();
  const completedAt = nowIso();
  db.prepare(`
    UPDATE workflow_steps
    SET status = @status,
        output_json = @outputJson,
        error = @error,
        completed_at = @completedAt
    WHERE id = @id
  `).run({
    id: stepId,
    status,
    outputJson: JSON.stringify(output),
    error,
    completedAt
  });
}

export function createWorkflowEvent(runId, eventType, eventData) {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO workflow_events
      (id, workflow_run_id, event_type, event_data_json, created_at)
    VALUES
      (@id, @runId, @eventType, @eventDataJson, @createdAt)
  `).run({
    id,
    runId,
    eventType,
    eventDataJson: JSON.stringify(eventData ?? {}),
    createdAt
  });
}

export function getWorkflowRunById(runId) {
  const db = getDb();
  const run = db.prepare(`SELECT * FROM workflow_runs WHERE id = ?`).get(runId);
  if (!run) return null;

  const steps = db.prepare(`
    SELECT * FROM workflow_steps
    WHERE workflow_run_id = ?
    ORDER BY started_at ASC, attempt ASC
  `).all(runId);

  const events = db.prepare(`
    SELECT * FROM workflow_events
    WHERE workflow_run_id = ?
    ORDER BY created_at ASC
  `).all(runId);

  return {
    id: run.id,
    workflow: run.workflow,
    adapter: run.adapter,
    projectId: run.project_id,
    partnerName: run.partner_name,
    status: run.status,
    approvalMode: run.approval_mode,
    goLiveRecommendation: run.go_live_recommendation,
    blockingReasons: parseJson(run.blocking_reasons_json, []),
    input: parseJson(run.input_json, {}),
    output: parseJson(run.output_json, null),
    createdAt: run.created_at,
    completedAt: run.completed_at,
    steps: steps.map((step) => ({
      id: step.id,
      stepName: step.step_name,
      attempt: step.attempt,
      status: step.status,
      output: parseJson(step.output_json, null),
      startedAt: step.started_at,
      completedAt: step.completed_at,
      error: step.error
    })),
    events: events.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      eventData: parseJson(event.event_data_json, {}),
      createdAt: event.created_at
    }))
  };
}

export function listWorkflowRuns(args = {}) {
  const {
    limit = 50,
    status,
    projectId,
    from,
    to
  } = args;
  const db = getDb();
  const where = [];
  const params = [];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (projectId) {
    where.push('project_id = ?');
    params.push(projectId);
  }
  if (from) {
    where.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('created_at <= ?');
    params.push(to);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT
      id,
      workflow,
      adapter,
      project_id,
      partner_name,
      status,
      approval_mode,
      go_live_recommendation,
      blocking_reasons_json,
      created_at,
      completed_at
    FROM workflow_runs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params, Math.min(Math.max(limit, 1), 200));

  return rows.map((run) => ({
    id: run.id,
    workflow: run.workflow,
    adapter: run.adapter,
    projectId: run.project_id,
    partnerName: run.partner_name,
    status: run.status,
    approvalMode: run.approval_mode,
    goLiveRecommendation: run.go_live_recommendation,
    blockingReasons: parseJson(run.blocking_reasons_json, []),
    createdAt: run.created_at,
    completedAt: run.completed_at
  }));
}

export function getLatestStepStates(runId) {
  const db = getDb();
  const steps = db.prepare(`
    SELECT *
    FROM workflow_steps
    WHERE workflow_run_id = ?
    ORDER BY started_at ASC, attempt ASC
  `).all(runId);

  const latestByStep = new Map();
  for (const step of steps) {
    latestByStep.set(step.step_name, step);
  }
  return latestByStep;
}
