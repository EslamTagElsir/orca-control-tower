import { useEffect, useState } from "react";

/**
 * True once the client is fully hydrated AND the browser has painted at least
 * one frame.
 *
 * The extra frame matters: route components are lazily code-split, so their
 * subtrees hydrate after the shell. With a fast transport (direct browser mode,
 * or an immediate connection refusal falling back to fixtures) a query started
 * during shell hydration can resolve before a lazy subtree hydrates, producing
 * a server/client mismatch. Waiting a frame keeps every tree identical to the
 * SSR output on its first client render.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let frame = 0;
    const raf =
      typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame
        : null;
    if (raf) {
      frame = raf(() => {
        frame = raf(() => setHydrated(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = setTimeout(() => setHydrated(true), 0);
    return () => clearTimeout(timer);
  }, []);

  return hydrated;
}
