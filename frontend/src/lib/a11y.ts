/** Small accessibility helpers: page titles, focus on navigation, country names. */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function usePageTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · PassReady` : "PassReady";
  }, [title]);
}

/** Move focus to <main> after a route change so screen readers announce the new page. */
export function useFocusMainOnNavigate(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const main = document.getElementById("main");
    if (main) {
      main.focus();
    }
    window.scrollTo({ top: 0 });
  }, [pathname]);
}

const regionNames: Intl.DisplayNames | null =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["de"], { type: "region" })
    : null;

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}
