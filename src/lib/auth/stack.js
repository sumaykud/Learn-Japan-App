// Accounts are an optional layer. When the environment is not configured the
// whole feature switches off cleanly and the app runs in guest mode, which is
// what a fresh clone of the repository does.
const projectId = import.meta.env.VITE_STACK_PROJECT_ID;
const publishableClientKey = import.meta.env.VITE_STACK_PUBLISHABLE_CLIENT_KEY;

export const authConfigured = Boolean(projectId && publishableClientKey);

// Having one Stack value but not the other is always a mistake, and it fails
// silently: authConfigured goes false and the app drops back to guest mode with
// no landing page, no accounts and no admin — looking like the feature was
// never built rather than like a missing variable. Common cause is setting the
// two keys to different Vercel environments.
if (!authConfigured && (projectId || publishableClientKey)) {
  const missing = projectId ? "VITE_STACK_PUBLISHABLE_CLIENT_KEY" : "VITE_STACK_PROJECT_ID";
  console.warn(
    `[learn-japan] Accounts are switched OFF because ${missing} is missing from this build. ` +
      "All three VITE_ values must be present in the same environment — see .env.example."
  );
}

let appPromise = null;

// The Stack SDK is around 500 kB of JavaScript — more than the entire rest of
// the app. Importing it dynamically keeps it out of the initial bundle, so a
// guest (and any build with no auth configured) never downloads it at all.
export function getStackApp() {
  if (!authConfigured) return Promise.resolve(null);
  if (!appPromise) {
    appPromise = import("@stackframe/js")
      .then(({ StackClientApp }) => new StackClientApp({
        projectId,
        publishableClientKey,
        tokenStore: "cookie",
        urls: { home: "/" },
      }))
      .catch(() => {
        // Offline on first load, or the chunk failed to fetch. Reset so a
        // later attempt can retry instead of caching the failure forever.
        appPromise = null;
        return null;
      });
  }
  return appPromise;
}

// Stack returns rich error objects; the sign-in form only needs a sentence.
export function authErrorMessage(error) {
  const code = error?.errorCode || error?.code || "";
  switch (code) {
    case "EMAIL_PASSWORD_MISMATCH":
      return "That email and password do not match.";
    case "USER_WITH_EMAIL_ALREADY_EXISTS":
      return "An account with that email already exists. Try signing in instead.";
    case "PASSWORD_REQUIREMENTS_NOT_MET":
      return "That password is too weak. Use at least 8 characters.";
    case "USER_NOT_FOUND":
      return "No account found for that email.";
    default:
      return error?.message || "Something went wrong. Please try again.";
  }
}
