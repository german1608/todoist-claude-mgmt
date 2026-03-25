// ---------------------------------------------------------------------------
// Structured logger with level, timestamps, and context
// ---------------------------------------------------------------------------

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "\x1b[90m", // gray
  [LogLevel.INFO]: "\x1b[36m", // cyan
  [LogLevel.WARN]: "\x1b[33m", // yellow
  [LogLevel.ERROR]: "\x1b[31m", // red
};

const RESET = "\x1b[0m";

let currentLevel: LogLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(
  level: LogLevel,
  component: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (level < currentLevel) return;

  const color = LOG_LEVEL_COLORS[level];
  const levelName = LOG_LEVEL_NAMES[level];
  const ts = formatTimestamp();
  const prefix = `${color}[${ts}] [${levelName}]${RESET} [${component}]`;

  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export function createLogger(component: string): Logger {
  return {
    debug: (msg, data) => log(LogLevel.DEBUG, component, msg, data),
    info: (msg, data) => log(LogLevel.INFO, component, msg, data),
    warn: (msg, data) => log(LogLevel.WARN, component, msg, data),
    error: (msg, data) => log(LogLevel.ERROR, component, msg, data),
  };
}
