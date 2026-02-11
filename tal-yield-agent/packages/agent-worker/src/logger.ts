import pino from "pino";

export function createWorkerLogger(level = "info") {
  return pino({
    name: "tal-yield-agent-worker",
    level,
  });
}

export type Logger = ReturnType<typeof createWorkerLogger>;
