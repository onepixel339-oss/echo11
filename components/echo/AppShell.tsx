/**
 * ECHO — app shell: responsive navigation (side on desktop, bottom on
 * mobile), demo banner, offline pill, overlays (details drawer, add dialog).
 */

"use client";

import React from "react";
import { Orbit, Compass, MessagesSquare, LibraryBig, Dna, Settings2, WifiOff, FlaskConical, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEchoStore, type View } from "@/lib/echo/store";
import { useI18n } from "@/lib/echo/i18n";
import { EchoLogo } from "./EchoLogo";
import { MapScreen } from "./screens/MapScreen";
import { DiscoverScreen } from "./screens/DiscoverScreen";
import { AskScreen } from "./screens/AskScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { TasteScreen } from "./screens/TasteScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { OnboardingFlow } from "./OnboardingFlow";
import { DetailsDrawer } from "./DetailsDrawer";
import { AddTitleDialog } from "./AddTitleDialog";

const NAV: { view: View; icon: React.ElementType }[] = [
  { view: "map", icon: Orbit },
  { view: "discover", icon: Compass },
  { view: "ask", icon: MessagesSquare },
  { view: "library", icon: LibraryBig },
  { view: "taste", icon: Dna },
  { view: "settings", icon: Settings2 },
];

function useOnline() {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function DemoBanner() {
  const { t } = useI18n();
  const demoMode = useEchoStore((s) => s.settings.demoMode);
  const exitDemo = useEchoStore((s) => s.exitDemo);
  if (!demoMode) return null;
  return (
    <div className="border-b border-echo-gold/30 bg-echo-gold/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-xs">
        <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-echo-gold">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden />
          {t("demo.badge")}
        </span>
        <span className="min-w-[180px] flex-1 text-muted-foreground">
          <span className="line-clamp-2">{t("demo.banner")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <button
            className="rounded-md border border-border px-3 py-1.5 font-medium text-foreground transition hover:bg-secondary"
            onClick={() => void exitDemo(true)}
          >
            {t("demo.keep")}
          </button>
          <button
            className="rounded-md border border-echo-gold/50 px-3 py-1.5 font-medium text-echo-gold transition hover:bg-echo-gold/10"
            onClick={() => void exitDemo(false)}
          >
            {t("demo.exit")}
          </button>
        </span>
      </div>
    </div>
  );
}

export function AppShell() {
  const { t } = useI18n();
  const view = useEchoStore((s) => s.view);
  const setView = useEchoStore((s) => s.setView);
  const bootOnboarding = useEchoStore((s) => s.bootedWithOnboarding);
  const mounted = React.useRef(false);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    mounted.current = true;
    setReady(true);
  }, []);
  const online = useOnline();

  const screen = bootOnboarding ? (
    <OnboardingFlow />
  ) : (
    <>
      {view === "map" && <MapScreen />}
      {view === "discover" && <DiscoverScreen />}
      {view === "ask" && <AskScreen />}
      {view === "library" && <LibraryScreen />}
      {view === "taste" && <TasteScreen />}
      {view === "settings" && <SettingsScreen />}
    </>
  );

  return (
    <div className={cn("echo-paper min-h-screen", ready && "echo-rise")}>
      {/* mobile header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <EchoLogo size={24} className="text-echo-accent" />
          <span className="echo-display text-base font-bold tracking-[0.12em] text-foreground">
            ECHO
          </span>
          <span className="ms-auto" />
          {!online && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/70 px-2 py-0.5 text-[11px] text-muted-foreground">
              <WifiOff className="h-3 w-3" aria-hidden />
              {t("app.offlineShort")}
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl">
        {/* desktop sidebar */}
        <nav
          aria-label="Primary"
          className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-0.5 border-e border-border px-3 py-6 md:flex"
        >
          <div className="mb-6 flex items-center gap-2.5 px-2">
            <EchoLogo size={30} className="text-echo-accent" />
            <div>
              <p className="echo-display text-lg font-bold tracking-[0.14em] text-foreground">
                ECHO
              </p>
              <p className="echo-overline mt-0.5">{t("app.tagline")}</p>
            </div>
          </div>
          {NAV.map(({ view: v, icon: Icon }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                view === v
                  ? "bg-echo-accent/12 text-echo-accent"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              {view === v && (
                <span
                  className="absolute start-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-echo-accent"
                  aria-hidden
                />
              )}
              <Icon
                className={cn("h-[18px] w-[18px]", view === v && "text-echo-accent")}
                aria-hidden
              />
              {t(`nav.${v}`)}
            </button>
          ))}
          <div className="mt-auto px-2 text-[11px] leading-relaxed text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <Waypoints className="h-3 w-3" aria-hidden />
              <span dir="ltr">{t("app.sourcesNote")}</span>
            </p>
            {!online && (
              <p className="mt-2 inline-flex items-center gap-1 text-echo-gold">
                <WifiOff className="h-3 w-3" aria-hidden />
                {t("app.offlineShort")}
              </p>
            )}
          </div>
        </nav>

        {/* main */}
        <main id="main" className="min-w-0 flex-1 pb-24 md:pb-10">
          {/* demo notice lives inside the content column so it never pushes
              the sticky sidebar below the fold */}
          <DemoBanner />
          {!bootOnboarding && (
            <div className="hidden items-baseline gap-3 px-6 pt-6 md:flex">
              <h1 className="echo-display text-2xl font-semibold text-foreground">
                {t(`nav.${view}`)}
              </h1>
              <span className="echo-overline">{t(`nav.sub.${view}`)}</span>
            </div>
          )}
          {screen}
        </main>
      </div>

      {/* mobile bottom nav */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
      >
        <div className="grid grid-cols-6">
          {NAV.map(({ view: v, icon: Icon }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "flex min-h-[54px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition",
                view === v ? "text-echo-accent" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {t(`nav.${v}`)}
            </button>
          ))}
        </div>
      </nav>

      {/* overlays */}
      <DetailsDrawer />
      <AddTitleDialog />
    </div>
  );
}
