import { EventEmitter } from "events";
import { Response } from "express";
import { logger } from "../lib/logger";

/**
 * Singleton SSE service. Controllers call emit(); the stream endpoint
 * subscribes clients and tears them down on disconnect.
 */
class SSEService {
    private emitter = new EventEmitter();

    constructor() {
        this.emitter.setMaxListeners(200);
    }

    /** Register a client response for a meeting stream */
    subscribe(meetingId: string, res: Response) {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "X-Accel-Buffering": "no",
        });
        res.write(": connected\n\n");

        const connectedAt = Date.now();
        const clients = this.emitter.listenerCount(meetingId);
        logger.info({ meetingId, clients: clients + 1 }, "sse connect");

        const handler = (data: object) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        this.emitter.on(meetingId, handler);

        const heartbeat = setInterval(() => {
            res.write(": heartbeat\n\n");
        }, 25_000);

        res.on("close", () => {
            clearInterval(heartbeat);
            this.emitter.off(meetingId, handler);
            const duration = Math.round((Date.now() - connectedAt) / 1000);
            const remaining = this.emitter.listenerCount(meetingId);
            logger.info({ meetingId, durationSec: duration, clients: remaining }, "sse disconnect");
        });
    }

    /** Emit an event to all clients watching a meeting */
    emit(meetingId: string, event: string, payload: object) {
        this.emitter.emit(meetingId, { event, ...payload });
    }
}

export const sseService = new SSEService();
