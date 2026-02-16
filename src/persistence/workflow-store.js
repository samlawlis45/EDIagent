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

export function createWorkflowStep(runId, stepName) {
  const db = getDb();
  const id = crypto.randomUUID();
  const startedAt = nowIso();

  db.prepare(`
    INSERT INTO workflow_steps
      (id, workflow_run_id, step_name, status, started_at)
    VALUES
      (@id, @runId, @stepName, 'running', @startedAt)
  `).run({
    id,
    runId,
    stepName,
    startedAt
  });

  return { id, startedAt };
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
    ORDER BY started_at ASC
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

export function listWorkflowRuns(limit = 50) {
  const db = getDb();
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
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.min(Math.max(limit, 1), 200));

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

