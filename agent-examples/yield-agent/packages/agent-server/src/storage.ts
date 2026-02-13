import { writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { TaskRecord } from "./context.js";
import type { DataSnapshot } from "@tal-yield-agent/agent-core";

const STORAGE_DIR = process.env.STORAGE_DIR ?? ".data";
const TASKS_DIR = path.join(STORAGE_DIR, "tasks");
const SNAPSHOTS_DIR = path.join(STORAGE_DIR, "snapshots");

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

// ============ Tasks ============

export async function saveTask(task: TaskRecord, inputText: string): Promise<void> {
  await ensureDir(TASKS_DIR);
  const data = { ...task, _inputText: inputText };
  await writeFile(path.join(TASKS_DIR, `${task.taskId}.json`), JSON.stringify(data, null, 2));
}

export async function loadTask(taskId: string): Promise<{ task: TaskRecord; inputText: string } | null> {
  try {
    const raw = await readFile(path.join(TASKS_DIR, `${taskId}.json`), "utf-8");
    const data = JSON.parse(raw);
    const { _inputText, ...task } = data;
    return { task: task as TaskRecord, inputText: _inputText ?? "" };
  } catch {
    return null;
  }
}

export async function loadAllTasks(): Promise<Array<{ task: TaskRecord; inputText: string }>> {
  await ensureDir(TASKS_DIR);
  const files = await readdir(TASKS_DIR);
  const results: Array<{ task: TaskRecord; inputText: string }> = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(TASKS_DIR, file), "utf-8");
      const data = JSON.parse(raw);
      const { _inputText, ...task } = data;
      results.push({ task: task as TaskRecord, inputText: _inputText ?? "" });
    } catch {
      // skip corrupt files
    }
  }
  return results;
}

// ============ Snapshots ============

export async function saveSnapshot(snapshot: DataSnapshot): Promise<void> {
  await ensureDir(SNAPSHOTS_DIR);
  await writeFile(
    path.join(SNAPSHOTS_DIR, `${snapshot.snapshotId}.json`),
    JSON.stringify(snapshot),
  );
}

export async function loadSnapshot(snapshotId: string): Promise<DataSnapshot | null> {
  try {
    const raw = await readFile(path.join(SNAPSHOTS_DIR, `${snapshotId}.json`), "utf-8");
    return JSON.parse(raw) as DataSnapshot;
  } catch {
    return null;
  }
}
