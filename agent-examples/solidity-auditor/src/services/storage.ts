import { createHash } from 'crypto';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { config } from '../config.js';
import type { TaskResult } from '../types.js';

const storageDir = config.STORAGE_DIR;
const tasksDir = path.join(storageDir, 'tasks');

async function ensureDirs(): Promise<void> {
  if (!existsSync(tasksDir)) {
    await mkdir(tasksDir, { recursive: true });
  }
}

export function hashContent(content: string): string {
  return '0x' + createHash('sha256').update(content).digest('hex');
}

export async function saveTask(task: TaskResult): Promise<void> {
  await ensureDirs();
  const filePath = path.join(tasksDir, `${task.taskId}.json`);
  await writeFile(filePath, JSON.stringify(task, null, 2));
}

export async function getTask(taskId: string): Promise<TaskResult | null> {
  await ensureDirs();
  const filePath = path.join(tasksDir, `${taskId}.json`);
  try {
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data) as TaskResult;
  } catch {
    return null;
  }
}

export async function getAllTasks(): Promise<TaskResult[]> {
  await ensureDirs();
  const { readdir } = await import('fs/promises');
  const files = await readdir(tasksDir);
  const tasks: TaskResult[] = [];
  for (const file of files) {
    if (file.endsWith('.json')) {
      const data = await readFile(path.join(tasksDir, file), 'utf-8');
      tasks.push(JSON.parse(data) as TaskResult);
    }
  }
  return tasks.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
