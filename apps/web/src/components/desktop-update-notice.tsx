"use client";

import { useEffect, useState } from "react";

import {
  type DesktopUpdateStatus,
  isDesktop,
  subscribeToUpdateStatus,
} from "@/lib/desktop";

export function DesktopUpdateNotice() {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);

  useEffect(() => {
    if (!isDesktop()) return;
    return subscribeToUpdateStatus(setStatus) ?? undefined;
  }, []);

  if (
    !status ||
    status.state === "disabled" ||
    status.state === "not-available"
  ) {
    return null;
  }

  if (status.state === "error") return null;

  return (
    <div className="fixed bottom-4 right-4 z-[10000] flex max-w-[min(420px,calc(100vw-2rem))] items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-xl">
      {status.state === "available" && (
        <>
          <span>
            发现 Loomic 新版本{status.version ? ` ${status.version}` : ""}
          </span>
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground"
            onClick={() => void window.loomicDesktop?.downloadUpdate()}
          >
            下载更新
          </button>
        </>
      )}
      {status.state === "checking" && <span>正在检查更新…</span>}
      {status.state === "downloading" && (
        <span>正在下载更新 {Math.round(status.percent ?? 0)}%</span>
      )}
      {status.state === "downloaded" && (
        <>
          <span>更新已准备好</span>
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground"
            onClick={() => void window.loomicDesktop?.installUpdate()}
          >
            重启更新
          </button>
        </>
      )}
    </div>
  );
}
