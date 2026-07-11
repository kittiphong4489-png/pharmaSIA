import { useEffect, useRef, useCallback, useState } from "react";

type EventHandler = (data: any) => void;

interface UseEventStreamOptions {
  onEvent?: (event: string, data: any) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function useEventStream(
  events: Record<string, EventHandler> = {},
  options: UseEventStreamOptions = {}
) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventsRef = useRef(events);
  const optionsRef = useRef(options);

  // Keep refs up to date
  eventsRef.current = events;
  optionsRef.current = options;

  const connect = useCallback(() => {
    const token = localStorage.getItem("pharma_token");
    if (!token) {
      setConnected(false);
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const es = new EventSource(`/api/events/stream?token=${encodeURIComponent(token)}`);

      es.addEventListener("connected", () => {
        setConnected(true);
        optionsRef.current.onConnected?.();
      });

      es.onerror = () => {
        setConnected(false);
        optionsRef.current.onDisconnected?.();
        es.close();

        // Auto-reconnect after 5s
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };

      // Generic message handler (only for unnamed events)
      es.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          // Only handle if there's no named event listener for this
          if (!eventsRef.current[msg.type || "message"]) {
            if (eventsRef.current["message"]) {
              eventsRef.current["message"](data);
            }
          }
        } catch {}
      };

      // Handle specific events
      for (const eventName of Object.keys(events)) {
        es.addEventListener(eventName, (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            eventsRef.current[eventName]?.(data);
          } catch {}
        });
      }

      eventSourceRef.current = es;
    } catch {
      setConnected(false);
      // Retry on failure
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 10000);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connect]);

  return { connected };
}
