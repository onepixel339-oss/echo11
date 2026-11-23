/**
 * ECHO — application root (client).
 * Boot → hydration → onboarding gate → shell.
 */

"use client";

import React from "react";
import { useTheme } from "next-themes";
import { I18nProvider, useI18n } from "@/lib/echo/i18n";
import { useEchoStore } from "@/lib/echo/store";
import { EchoLogo } from "./EchoLogo";
import { AppShell } from "./AppShell";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

function BootScreen() {
  return (
    <div className="echo-paper flex min-h-screen flex-col items-center justify-center gap-5">
      <EchoLogo
        size={72}
        className="text-echo-accent echo-breathe drop-shadow-[0_0_22px_rgba(255,126,84,0.45)]"
      />
      <p className="echo-display text-sm font-semibold tracking-[0.3em] text-foreground">ECHO</p>
    </div>
  );
}

function StorageErrorScreen() {
  return (
    <div className="echo-paper flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="h-10 w-10 text-echo-gold" />
      <h1 className="echo-display text-xl font-semibold">ECHO needs local storage</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {/* deliberately not translated: settings not yet loaded reliably */}
        IndexedDB is unavailable (private browsing mode or blocked storage). Your map and
        library can&apos;t be saved in this mode. Try a normal browsing window.
      </p>
      <Button variant="outline" onClick={() => location.reload()}>
        Retry
      </Button>
    </div>
  );
}

function ThemedApp() {
  const settings = useEchoStore((s) => s.settings);
  const { theme, setTheme } = useTheme();
  React.useEffect(() => {
    if (settings.theme && theme !== settings.theme) {
      setTheme(settings.theme);
    }
  }, [settings.theme]);

  return (
    <I18nProvider
      lang={settings.language}
      onLangChange={(l) => void useEchoStore.getState().setLanguage(l)}
    >
      <AppShell />
    </I18nProvider>
  );
}

export default function EchoApp() {
  const hydrated = useEchoStore((s) => s.hydrated);
  const storageOk = useEchoStore((s) => s.storageOk);

  React.useEffect(() => {
    void useEchoStore.getState().hydrate();
  }, []);

  // PWA: offline app shell (network-first, so never stale).
  // Production only — a service worker's cache-first static strategy fights
  // the dev server (stale chunks after edits), so dev runs clean without it.
  React.useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator &&
      window.location.protocol.startsWith("http")
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    } else if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
      // dev: never leave a production SW controlling this origin
      navigator.serviceWorker.getRegistrations().then((rs) => {
        rs.forEach((r) => void r.unregister());
      }).catch(() => undefined);
    }
  }, []);

  if (!hydrated) return <BootScreen />;
  if (!storageOk) return <StorageErrorScreen />;
  return <ThemedApp />;
}

/** small helper used by screens for translated page headers */
export function usePageTitle() {
  const { t } = useI18n();
  return t;
}
