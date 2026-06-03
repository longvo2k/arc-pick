import pino from "pino";
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["payload.permitSig", "payload.userSig"],
  formatters: { level: (label) => ({ level: label }) },
});
