"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  StreamEvent,
  WsCommandAck,
  WsRpcRequest,
  RunCreateRequest,
} from "@loomic/shared";
import { getServerBaseUrl } from "../lib/env";

type EventCallback = (event: StreamEvent) => void;
type RPCHandler = (
  params: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export type WebSocketHandle = {
  connected: boolean;
  startRun: (
    payload: RunCreateRequest,
    onAck?: (ack: WsCommandAck) => void,
  ) => void;
  cancelRun: (runId: string) => void;
  onEvent: (cb: EventCallback) => () => void;
  registerRPC: (method: string, handler: RPCHandler) => () => void;
  resumeCanvas: (canvasId: string, onAck?: (ack: WsCommandAck) => void) => void;
};

export function useWebSocket(
  getToken: () => string | null,
): WebSocketHandle {
  const wsRef = useRef<WebSocket | null>(null);
  const connectionIdRef = useRef(
    (() => {
      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem("ws_connection_id");
        if (stored) return stored;
        const id = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem("ws_connection_id", id);
        return id;
      }
      return typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    })(),
  );
  const [connected, setConnected] = useState(false);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);

  const eventListeners = useRef<Set<EventCallback>>(new Set());
  const ackListeners = useRef<
    Map<string, (ack: WsCommandAck) => void>
  >(new Map());
  const rpcHandlers = useRef<Map<string, RPCHandler>>(new Map());

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(
    (connectFn: () => void, immediate = false) => {
      if (disposed.current || reconnectTimer.current) return;
      const delay = immediate
        ? 0
        : Math.min(30_000, 1000 * 2 ** reconnectAttempt.current);
      const attempt = reconnectAttempt.current + 1;
      reconnectAttempt.current = attempt;
      console.log(`[ws] scheduling reconnect attempt ${attempt} in ${delay}ms`);
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        connectFn();
      }, delay);
    },
    [],
  );

  const connect = useCallback(() => {
    const token = getToken();
    if (disposed.current) return;
    // Skip if already connected -- prevents React Strict Mode double-mount
    // from replacing an active connection mid-stream
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }
    // Close any existing connection before creating a new one
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect from old socket
      wsRef.current.close();
      wsRef.current = null;
    }
    if (!token) {
      // Token not yet available (auth loading) -- retry shortly
      scheduleReconnect(connect, true);
      return;
    }

    const serverBase = getServerBaseUrl();
    const wsUrl =
      serverBase.replace(/^http/, "ws") +
      `/api/ws?token=${encodeURIComponent(token)}&connectionId=${encodeURIComponent(connectionIdRef.current)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[ws] connected, connectionId:", connectionIdRef.current);
      clearReconnectTimer();
      setConnected(true);
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string) as Record<string, unknown>;
      } catch (err) {
        console.warn("[ws] failed to parse incoming message:", err);
        return;
      }

      if (msg.type === "event") {
        const streamEvent = msg.event as StreamEvent;
        // Defensive: skip malformed events without proper structure
        if (!streamEvent || typeof streamEvent !== "object") {
          console.warn("[ws] received malformed stream event:", msg);
          return;
        }
        for (const cb of eventListeners.current) {
          try {
            cb(streamEvent);
          } catch (listenerErr) {
            // Prevent one listener's error from breaking others
            console.error("[ws] event listener threw:", listenerErr);
          }
        }
      } else if (msg.type === "command.ack") {
        const cb = ackListeners.current.get(msg.action as string);
        if (cb) {
          ackListeners.current.delete(msg.action as string);
          try {
            cb(msg as unknown as WsCommandAck);
          } catch (ackErr) {
            console.error("[ws] ack listener threw:", ackErr);
          }
        }
      } else if (msg.type === "rpc.request") {
        void handleRpcRequest(ws, msg as unknown as WsRpcRequest);
      }
      // Unknown message types are silently ignored -- server may add new types
    };

    ws.onclose = (event) => {
      // Only handle close for the CURRENT connection.
      // React Strict Mode creates two connections; when the server replaces
      // the old one, its close event fires after remount resets disposed=false.
      // Without this guard, we'd enter a reconnect loop.
      if (wsRef.current !== ws) return;

      setConnected(false);
      wsRef.current = null;

      if (event.code === 4001) {
        console.warn("[ws] Auth rejected, will retry with fresh token");
      }

      if (!disposed.current) {
        scheduleReconnect(connect);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [clearReconnectTimer, getToken, scheduleReconnect]);

  async function handleRpcRequest(ws: WebSocket, req: WsRpcRequest) {
    const handler = rpcHandlers.current.get(req.method);
    if (!handler) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "rpc.response",
            id: req.id,
            error: `No handler for method: ${req.method}`,
          }),
        );
      }
      return;
    }

    try {
      const result = await handler(req.params);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "rpc.response", id: req.id, result }),
        );
      }
    } catch (error) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "rpc.response",
            id: req.id,
            error:
              error instanceof Error ? error.message : "RPC handler failed",
          }),
        );
      }
    }
  }

  useEffect(() => {
    disposed.current = false;
    connect();
    return () => {
      disposed.current = true;
      clearReconnectTimer();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [clearReconnectTimer, connect]);

  // A desktop app may lose the API while sleeping or switching networks. The
  // browser does not always emit a useful WebSocket close in those cases, so
  // explicitly kick the same reconnect state machine when the network returns
  // or the page becomes visible again.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reconnectIfNeeded = () => {
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        clearReconnectTimer();
        scheduleReconnect(connect, true);
      }
    };
    window.addEventListener("online", reconnectIfNeeded);
    document.addEventListener("visibilitychange", reconnectIfNeeded);
    return () => {
      window.removeEventListener("online", reconnectIfNeeded);
      document.removeEventListener("visibilitychange", reconnectIfNeeded);
    };
  }, [clearReconnectTimer, connect, scheduleReconnect]);

  const sendCommand = useCallback(
    (action: string, payload: Record<string, unknown>): boolean => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("[ws] command dropped -- not connected, readyState:", ws?.readyState);
        return false;
      }
      try {
        ws.send(JSON.stringify({ type: "command", action, payload }));
        return true;
      } catch (err) {
        // Guard against serialization errors (e.g. circular refs in payload)
        console.error("[ws] failed to send command:", action, err);
        return false;
      }
    },
    [],
  );

  const startRun = useCallback(
    (
      payload: RunCreateRequest,
      onAck?: (ack: WsCommandAck) => void,
    ) => {
      if (onAck) {
        ackListeners.current.set("agent.run", onAck);
      }
      const sent = sendCommand(
        "agent.run",
        payload as unknown as Record<string, unknown>,
      );
      if (!sent) {
        // Remove the dangling ack listener so callers don't hang forever
        ackListeners.current.delete("agent.run");
      }
    },
    [sendCommand],
  );

  const cancelRun = useCallback(
    (runId: string) => {
      sendCommand("agent.cancel", { runId });
    },
    [sendCommand],
  );

  const resumeCanvas = useCallback(
    (canvasId: string, onAck?: (ack: WsCommandAck) => void) => {
      if (onAck) {
        ackListeners.current.set("canvas.resume", onAck);
      }
      const sent = sendCommand("canvas.resume", { canvasId, lastSeq: 0 });
      if (!sent) {
        ackListeners.current.delete("canvas.resume");
      }
    },
    [sendCommand],
  );

  const onEvent = useCallback((cb: EventCallback) => {
    eventListeners.current.add(cb);
    return () => {
      eventListeners.current.delete(cb);
    };
  }, []);

  const registerRPC = useCallback(
    (method: string, handler: RPCHandler) => {
      rpcHandlers.current.set(method, handler);
      return () => {
        rpcHandlers.current.delete(method);
      };
    },
    [],
  );

  return { connected, startRun, cancelRun, onEvent, registerRPC, resumeCanvas };
}
