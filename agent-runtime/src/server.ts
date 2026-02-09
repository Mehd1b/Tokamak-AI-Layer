import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { SummarizerAgent } from './agents/SummarizerAgent.js';
import { AuditorAgent } from './agents/AuditorAgent.js';
import { ValidatorAgent } from './agents/ValidatorAgent.js';
import { createAgentRoutes } from './routes/agents.js';
import { createTaskRoutes } from './routes/tasks.js';
import { createValidationRoutes } from './routes/validation.js';
import { errorHandler } from './middleware/errorHandler.js';
import type { BaseAgent } from './agents/BaseAgent.js';

// Initialize agents
const agents = new Map<string, BaseAgent>();
agents.set('summarizer', new SummarizerAgent());
agents.set('auditor', new AuditorAgent());
agents.set('validator', new ValidatorAgent());

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    agents: Array.from(agents.keys()),
    timestamp: new Date().toISOString(),
  });
});

// API info
app.get('/api', (_req, res) => {
  res.json({
    name: 'TAL Agent Runtime',
    version: '0.1.0',
    description: 'Tokamak AI Layer - Agent Execution Runtime',
    endpoints: {
      health: 'GET /health',
      agents: 'GET /api/agents',
      agentDetail: 'GET /api/agents/:id',
      agentRegistration: 'GET /api/agents/:id/registration',
      submitTask: 'POST /api/tasks',
      listTasks: 'GET /api/tasks',
      getTask: 'GET /api/tasks/:id',
      requestValidation: 'POST /api/validations/request',
      executeValidation: 'POST /api/validations/execute',
      getValidation: 'GET /api/validations/:requestHash',
      getAgentValidations: 'GET /api/validations/agent/:agentId',
    },
  });
});

// Routes
app.use('/api/agents', createAgentRoutes(agents));
app.use('/api/tasks', createTaskRoutes(agents));
app.use('/api/validations', createValidationRoutes(agents));

// Error handler
app.use(errorHandler);

// Start server
app.listen(config.PORT, config.HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          TAL Agent Runtime v0.1.0                    ║
╠══════════════════════════════════════════════════════╣
║  Server:  http://${config.HOST}:${config.PORT}${' '.repeat(Math.max(0, 32 - `http://${config.HOST}:${config.PORT}`.length))}     ║
║  Model:   ${config.LLM_MODEL}${' '.repeat(Math.max(0, 41 - config.LLM_MODEL.length))}║
║  Agents:  ${Array.from(agents.keys()).join(', ')}${' '.repeat(Math.max(0, 41 - Array.from(agents.keys()).join(', ').length))}║
╚══════════════════════════════════════════════════════╝
  `);
});

export { app, agents };
