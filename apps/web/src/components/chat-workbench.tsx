"use client";

import type { StreamEvent } from "@loomic/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { getServerBaseUrl } from "../lib/env";

type ToolActivity = {
  id: string;
  name: string;
  status: "running" | "completed";
  outputSummary?: string;
};

type TimelineItem = {
  id: number;
  label: string;
};

/**
 * Small standalone run monitor used by the lightweight workbench route and
 * tests. The main product chat uses the WebSocket-backed ChatSidebar; this
 * component keeps the direct HTTP/SSE run contract available for embeds and
 * diagnostics without duplicating the full chat surface.
 */
export function ChatWorkbench() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("idle");
  const [assistantResponse, setAssistantResponse] = useState("");
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const timelineId = useRef(0);

  const closeStream = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
  }, []);

  useEffect(() => closeStream, [closeStream]);

  const appendTimeline = useCallback((label: string) => {
    const id = timelineId.current + 1;
    timelineId.current = id;
    setTimeline((items) => [...items, { id, label }]);
  }, []);

  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      appendTimeline(event.type);

      switch (event.type) {
        case "message.delta":
          setAssistantResponse((value) => value + event.delta);
          break;
        case "tool.started":
          setToolActivities((items) => [
            ...items.filter((item) => item.id !== event.toolCallId),
            { id: event.toolCallId, name: event.toolName, status: "running" },
          ]);
          break;
        case "tool.completed":
          setToolActivities((items) => {
            const existing = items.find((item) => item.id === event.toolCallId);
            const completed: ToolActivity = {
              id: event.toolCallId,
              name: event.toolName,
              status: "completed",
              ...(event.outputSummary
                ? { outputSummary: event.outputSummary }
                : {}),
            };
            return existing
              ? items.map((item) =>
                  item.id === event.toolCallId
                    ? { ...item, ...completed }
                    : item,
                )
              : [...items, completed];
          });
          break;
        case "run.completed":
          setStatus("completed");
          closeStream();
          break;
        case "run.canceled":
          setStatus("canceled");
          closeStream();
          break;
        case "run.failed":
          setStatus("failed");
          setError(event.error.message);
          closeStream();
          break;
        default:
          break;
      }
    },
    [appendTimeline, closeStream],
  );

  const startRun = useCallback(async () => {
    closeStream();
    setError(null);
    setAssistantResponse("");
    setToolActivities([]);
    setTimeline([]);
    setStatus("starting");

    try {
      const response = await fetch(`${getServerBaseUrl()}/api/agent/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "session_workbench",
          conversationId: "conversation_workbench",
          prompt,
        }),
      });
      if (!response.ok)
        throw new Error(`Run request failed (${response.status})`);
      const data = (await response.json()) as { runId?: string };
      if (!data.runId)
        throw new Error("The run response did not include a runId.");

      const source = new EventSource(
        `${getServerBaseUrl()}/api/agent/runs/${data.runId}/events`,
      );
      streamRef.current = source;
      setStatus("running");
      source.onmessage = (message) => {
        try {
          handleStreamEvent(JSON.parse(message.data) as StreamEvent);
        } catch {
          setStatus("failed");
          setError("Failed to parse stream event.");
          closeStream();
        }
      };
      source.onerror = () => {
        setStatus("failed");
        setError("Failed to stream run events.");
        closeStream();
      };
    } catch (cause) {
      setStatus("failed");
      setError(cause instanceof Error ? cause.message : "Failed to start run.");
    }
  }, [closeStream, handleStreamEvent, prompt]);

  return (
    <div className="space-y-4">
      <form
        aria-label="chat composer"
        onSubmit={(event) => {
          event.preventDefault();
          void startRun();
        }}
        className="flex gap-2"
      >
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask Loomic to run a task"
          aria-label="prompt"
          className="min-w-0 flex-1 rounded-md border border-input px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          Start run
        </button>
      </form>

      <div role="status" className="text-xs text-muted-foreground">
        {status}
      </div>

      {error && (
        <div role="alert" className="text-sm text-destructive">
          {error}
        </div>
      )}

      <section aria-label="assistant response" className="space-y-1">
        <h2 className="text-sm font-semibold">Assistant response</h2>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {assistantResponse}
        </p>
      </section>

      <section aria-label="tool activity" className="space-y-1">
        <h2 className="text-sm font-semibold">Tool activity</h2>
        {toolActivities.map((activity) => (
          <div key={activity.id} className="flex gap-2 text-sm">
            <span>{activity.name}</span>
            <span className="text-muted-foreground">{activity.status}</span>
            {activity.outputSummary && <span>{activity.outputSummary}</span>}
          </div>
        ))}
      </section>

      <section aria-label="stream timeline" className="space-y-1">
        <h2 className="text-sm font-semibold">Stream timeline</h2>
        {timeline.map((item) => (
          <div key={item.id} className="text-xs text-muted-foreground">
            {item.label}
          </div>
        ))}
      </section>
    </div>
  );
}
