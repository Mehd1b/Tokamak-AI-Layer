import { Router } from 'express';
import type { BaseAgent } from '../agents/BaseAgent.js';

export function createAgentRoutes(agents: Map<string, BaseAgent>): Router {
  const router = Router();

  // GET /api/agents - List all agents
  router.get('/', (_req, res) => {
    const agentList = Array.from(agents.values()).map((a) => a.getInfo());
    res.json({ agents: agentList, count: agentList.length });
  });

  // GET /api/agents/:id - Get agent details
  router.get('/:id', (req, res) => {
    const agent = agents.get(req.params.id);
    if (!agent) {
      res.status(404).json({ error: `Agent '${req.params.id}' not found` });
      return;
    }
    res.json(agent.getInfo());
  });

  // GET /api/agents/:id/registration - Get ERC-8004 registration file
  router.get('/:id/registration', (req, res) => {
    const agent = agents.get(req.params.id);
    if (!agent) {
      res.status(404).json({ error: `Agent '${req.params.id}' not found` });
      return;
    }
    res.json(agent.getRegistrationFile());
  });

  return router;
}
