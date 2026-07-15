// Event Types Enum
export enum EventType {
  ORDER_CREATED = "order.created",
  ORDER_STATUS_CHANGED = "order.status.changed",
  PAYMENT_CREATED = "payment.created",
  PAYMENT_CONFIRMED = "payment.confirmed",
  PACKING_STARTED = "packing.started",
  PACKING_COMPLETED = "packing.completed",
  BATCH_EXPIRY_SOON = "batch.expiry_soon",
  LOW_STOCK = "stock.low",
  OUT_OF_STOCK = "stock.out",
  TRANSACTION_RECORDED = "accounting.transaction",
  FORTE_SYNC_COMPLETED = "forte.sync_completed",
}

export interface PharmaSIAEvent {
  id: string;
  type: EventType;
  source: string;
  actorId?: number;
  timestamp: Date;
  payload: Record<string, any>;
}

// SSE Client management (living here for now)
export const sseClients = new Map<number, Set<any>>();

class EventBus {
  private handlers: Map<string, Set<Function>> = new Map();

  on(type: string, handler: Function): void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
  }

  off(type: string, handler: Function): void {
    this.handlers.get(type)?.delete(handler);
  }

  emit(event: PharmaSIAEvent): void {
    // Run handlers
    const handlers = this.handlers.get(event.type);
    if (handlers && handlers.size > 0) {
      handlers.forEach((h) => { try { h(event); } catch (e) { console.error(`[EventBus] Handler failed for ${event.type}:`, e); } });
    }
    // Log to console in dev
    if (process.env.NODE_ENV !== "production") {
      console.log(`[EventBus] ${event.type}`, event.payload);
    }

    // Dispatch to SSE clients — target user
    const targetUserId = event.payload?.userId;
    if (targetUserId) {
      const targetClients = sseClients.get(targetUserId);
      if (targetClients && targetClients.size > 0) {
        const message = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        targetClients.forEach((client: any) => {
          try { client.write(message); } catch { targetClients.delete(client); }
        });
      }
    }
    // Also dispatch to all admin/seller clients for critical events
    const adminEvents = [EventType.ORDER_CREATED, EventType.LOW_STOCK, EventType.OUT_OF_STOCK, EventType.BATCH_EXPIRY_SOON, EventType.PAYMENT_CREATED];
    if (adminEvents.includes(event.type)) {
      sseClients.forEach((clients, uid) => {
        if (uid !== targetUserId) {
          const msg = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          clients.forEach((client: any) => {
            try { client.write(msg); } catch { clients.delete(client); }
          });
        }
      });
    }
  }
}

export const eventBus = new EventBus();

/**
 * Helper to create a PharmaSIAEvent with auto-generated id and current timestamp.
 */
export function createEvent(
  type: EventType,
  source: string,
  payload: Record<string, any>,
  actorId?: number
): PharmaSIAEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    type,
    source,
    actorId,
    timestamp: new Date(),
    payload,
  };
}
