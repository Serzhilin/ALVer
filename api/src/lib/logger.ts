import pino from "pino";

export const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    // Pretty-print in dev; plain JSON in production (docker logs / log aggregators)
    ...(process.env.NODE_ENV !== "production" && {
        transport: { target: "pino-pretty", options: { colorize: true, ignore: "pid,hostname" } },
    }),
});
