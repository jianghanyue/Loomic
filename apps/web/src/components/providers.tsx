"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { AuthProvider } from "../lib/auth-context";
import { TierLimitToastProvider } from "./credits/tier-limit-toast";
import { DesktopUpdateNotice } from "./desktop-update-notice";
import { ToastProvider } from "./toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <ToastProvider>
          <TierLimitToastProvider>
            {children}
            <DesktopUpdateNotice />
          </TierLimitToastProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
