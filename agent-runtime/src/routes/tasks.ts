import { Router } from 'express';
import type { BaseAgent } from '../agents/BaseAgent.js';
import type { TaskSubmission } from '../types.js';
import { getTask, getAllTasks } from '../services/storage.js';

export function createTaskRoutes(agents: Map<string, BaseAgent>): Router {
  const router = Router();

  // POST /api/tasks - Submit a new task
  router.post('/', async (req, res, next) => {
    try {
      const { agentId, input } = req.body as TaskSubmission;

      if (!agentId) {
        res.status(400).json({ error: 'agentId is required' });
        return;
      }

      if (!input?.text) {
        res.status(400).json({ error: 'input.text is required' });
        return;
      }

      const agent = agents.get(agentId);
      if (!agent) {
        res.status(404).json({ error: `Agent '${agentId}' not found. Available: ${Array.from(agents.keys()).join(', ')}` });
        return;
      }

      console.log(`[TASK] Executing task for agent '${agentId}' (${input.text.length} chars)`);
      const result = await agent.execute(input);
      console.log(`[TASK] Task ${result.taskId} completed with status: ${result.status}`);

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/tasks - List recent tasks
  router.get('/', async (_req, res, next) => {
    try {
      const tasks = await getAllTasks();
      res.json({ tasks, count: tasks.length });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/tasks/:id - Get task by ID
  router.get('/:id', async (req, res, next) => {
    try {
      const task = await getTask(req.params.id);
      if (!task) {
        res.status(404).json({ error: `Task '${req.params.id}' not found` });
        return;
      }
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
