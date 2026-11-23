/**
 * ECHO — client hook: auto-translate a title's NAME and SYNOPSIS into Arabic.
 *
 * Fires ONLY when the interface language is Arabic and the provider text
 * carries no Arabic letters (titleAr/synopsisAr from the provider win without
 * any network call). ONE POST per title per session carrying both texts —
 * results live in a module cache, and the server adds its own 24 h cache on
 * top, so the free upstreams are hit at most once per title per process/day.
 *
 * The translated NAME is reported back through onTitleTranslated so the
 * caller can persist it as MediaItem.titleAr (then every card shows it,
 * offline included). Machine-translated names can occasionally miss, so the
 * UI always keeps the original name one tap away.
 */

import React from "react";

const ARABIC_RE = /[\u0600-\u06FF]/;

interface SessionEntry {
  title?: string;
  synopsis?: string;
}

/** Session-level cache: reopening the same title never re-requests. */
const sessionCache = new Map<string, SessionEntry>();

export function useArabicTranslation(opts: {
  localId: string | null;
  title: string | undefined;
  /** provider-supplied Arabic name (wins over machine translation) */
  titleAr: string | undefined;
  synopsis: string | undefined;
  /** provider-supplied Arabic synopsis (wins over machine translation) */
  synopsisAr: string | undefined;
  lang: "ar" | "en";
  /** called once with the machine-translated name (persist as titleAr) */
  onTitleTranslated?: (titleAr: string) => void;
}): {
  title: string | null;
  synopsis: string | null;
  loading: boolean;
} {
  const { localId, title, titleAr, synopsis, synopsisAr, lang } = opts;
  const [entry, setEntry] = React.useState<SessionEntry>({});
  const [loading, setLoading] = React.useState(false);

  // keep the callback in a ref so callers may pass inline closures without
  // retriggering the translation effect on every render
  const onTitleTranslatedRef = React.useRef(opts.onTitleTranslated);
  React.useEffect(() => {
    onTitleTranslatedRef.current = opts.onTitleTranslated;
  });

  React.useEffect(() => {
    // reset whenever the target title or language changes
    setEntry({});
    setLoading(false);
    if (!localId) return;

    const wantTitle = Boolean(title) && lang === "ar" && !titleAr && needsArabic(title!);
    const wantSynopsis =
      Boolean(synopsis) && lang === "ar" && !synopsisAr && needsArabic(synopsis!);
    if (!wantTitle && !wantSynopsis) return;

    // the cache only short-circuits when it covers EVERYTHING still wanted —
    // a partial entry (e.g. the name landed but the synopsis upstream hiccuped)
    // must be allowed to re-request its missing parts
    const cached = sessionCache.get(localId);
    const cacheCovers =
      Boolean(cached) &&
      (!wantTitle || Boolean(cached!.title)) &&
      (!wantSynopsis || Boolean(cached!.synopsis));
    if (cacheCovers && cached) {
      setEntry(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // ONE request carries both texts (order matches the response array)
        const texts = [wantTitle ? title!.slice(0, 300) : "", wantSynopsis ? synopsis!.slice(0, 1200) : ""];
        const res = await fetch("/api/echo/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ texts: texts.filter(Boolean) }),
        });
        if (!res.ok) return; // 429 or upstream hiccup → originals stay
        const data = (await res.json()) as { ok?: boolean; translations?: unknown };
        if (!data.ok || !Array.isArray(data.translations)) return;

        let cursor = 0;
        const gotTitle = wantTitle ? String(data.translations[cursor++] ?? "") : "";
        const gotSynopsis = wantSynopsis ? String(data.translations[cursor] ?? "") : "";

        const result: SessionEntry = {};
        if (wantTitle && gotTitle && gotTitle !== title && ARABIC_RE.test(gotTitle)) {
          result.title = gotTitle;
        }
        if (wantSynopsis && gotSynopsis && gotSynopsis !== synopsis) {
          result.synopsis = gotSynopsis;
        }
        if (!cancelled && (result.title || result.synopsis)) {
          // merge with any earlier partial entry so successes accumulate
          const merged: SessionEntry = { ...(sessionCache.get(localId) ?? {}), ...result };
          sessionCache.set(localId, merged);
          setEntry(merged);
          if (result.title) onTitleTranslatedRef.current?.(result.title);
        }
      } catch {
        /* offline / aborted → the original texts simply stay */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [localId, title, titleAr, synopsis, synopsisAr, lang]);

  return { title: entry.title ?? null, synopsis: entry.synopsis ?? null, loading };
}

function needsArabic(text: string): boolean {
  return text.length > 0 && !ARABIC_RE.test(text);
}
