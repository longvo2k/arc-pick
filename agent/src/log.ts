import pino from "pino";
export const log = pino({ level: process.env.LOG_LEVEL ?? "info", formatters: { level: (l) => ({ level: l }) } });
