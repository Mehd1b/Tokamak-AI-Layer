import pino from "pino";

export function createLogger(level = "info") {
  return pino({
    name: "tal-yield-agent-server",
    level,
    transport:
      process.env["NODE_ENV"] !== "production"
        ? { target: "pino/file", options: { destination: 1 } }
        : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
