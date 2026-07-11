import { streamSSE } from "hono/streaming";
import { sseClients } from "../lib/eventBus";

/**
 * Register SSE connection for a user.
 * Expects a valid JWT token query param: ?token=xxx
 */
export async function handleSSE(c: any) {
  const token = c.req.query("token");
  if (!token) {
    return new Response('{"error":"Missing token"}', {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify token
  const { verifyToken } = await import("../lib/auth");
  const payload = await verifyToken(token);
  if (!payload) {
    return new Response('{"error":"Invalid token"}', {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = payload.id || payload.userId;

  return streamSSE(c, async (stream) => {
    // Register client
    if (!sseClients.has(userId)) {
      sseClients.set(userId, new Set());
    }
    const clients = sseClients.get(userId)!;
    clients.add(stream);

    // Send initial connection event
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ userId, timestamp: new Date().toISOString() }),
    });

    // Heartbeat every 30 seconds
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: "heartbeat",
          data: JSON.stringify({ ts: Date.now() }),
        });
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Clean up on disconnect
    stream.onAbort(() => {
      clearInterval(heartbeat);
      clients.delete(stream);
      if (clients.size === 0) {
        sseClients.delete(userId);
      }
    });
  });
}
