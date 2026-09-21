import { useCallback, useEffect, useState } from "react";

// A ~40-line router, because the app has exactly two areas and pulling in
// react-router for that would cost more than it explains.
//
// Path-based rather than hash-based, so /admin is a real bookmarkable URL.
// That has a deployment cost: the host must serve index.html for unknown
// paths (vercel.json does this) and Vite's base must not be relative, or
// assets under /admin resolve to /admin/assets/... and 404.

const BASE = import.meta.env.BASE_URL || "/";

// Normalises "/sub/admin/" to "/admin" so routes read the same whether the app
// is served from the root or from a sub-path.
function toRoute(pathname) {
  let p = pathname;
  if (BASE !== "/" && p.startsWith(BASE)) p = "/" + p.slice(BASE.length);
  p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

function toHref(route) {
  if (BASE === "/") return route;
  return (BASE.replace(/\/$/, "") + route) || "/";
}

export const ROUTES = {
  home: "/",
  admin: "/admin",
  // One-time superadmin creation. Deliberately not linked from anywhere: the
  // person who mints a setup code is told the URL alongside it.
  setup: "/admin/setup",
};

export function useRoute() {
  const [route, setRoute] = useState(() => toRoute(window.location.pathname));

  useEffect(() => {
    // Back/forward buttons. pushState does not fire popstate, so navigate()
    // updates the state itself.
    const onPop = () => setRoute(toRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const href = toHref(to);
    if (window.location.pathname === href) {
      // Still sync state: a redirect may be correcting a route the component
      // tree disagrees with even though the URL already matches.
      setRoute(toRoute(href));
      return;
    }
    window.history[replace ? "replaceState" : "pushState"]({}, "", href);
    setRoute(toRoute(href));
  }, []);

  return {
    route,
    navigate,
    isAdminRoute: route === ROUTES.admin || route.startsWith(ROUTES.admin + "/"),
    isSetupRoute: route === ROUTES.setup,
  };
}

// For anchors, so a middle-click or "open in new tab" still works.
export function href(route) {
  return toHref(route);
}
