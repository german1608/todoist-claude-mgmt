import { loadConfig } from "./config.js";
import { Scheduler } from "./dispatcher/scheduler.js";
import { createLogger, setLogLevel, LogLevel } from "./utils/logger.js";

const log = createLogger("Main");

async function main(): Promise<void> {
  // Set log level from env
  const logLevel = (process.env["LOG_LEVEL"] ?? "info").toLowerCase();
  switch (logLevel) {
    case "debug":
      setLogLevel(LogLevel.DEBUG);
      break;
    case "warn":
      setLogLevel(LogLevel.WARN);
      break;
    case "error":
      setLogLevel(LogLevel.ERROR);
      break;
    default:
      setLogLevel(LogLevel.INFO);
  }

  log.info("=== Todoist-Claude Dispatcher ===");
  log.info("Loading configuration...");

  const config = loadConfig();

  log.info("Configuration loaded", {
    project: config.todoist.projectName,
    label: config.todoist.label,
    pollInterval: `${config.todoist.pollIntervalMs}ms`,
    maxSessions: config.claude.maxConcurrentSessions,
    permissionMode: config.claude.permissionMode,
  });

  const scheduler = new Scheduler(config);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down...`);
    await scheduler.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Initialize and start
  await scheduler.init();
  scheduler.start();

  log.info("Dispatcher is running. Press Ctrl+C to stop.");

  // Keep the process alive
  await new Promise(() => {
    // Never resolves — keeps the process running
  });
}

main().catch((err) => {
  log.error("Fatal error", { error: (err as Error).message });
  process.exit(1);
});
