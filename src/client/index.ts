import { httpApi, type Api } from "./api";
import { demoApi } from "./demoApi";

/**
 * Which backend the UI uses. NEXT_PUBLIC_* values are inlined at build time,
 * so changing them on Vercel needs a redeploy.
 *  - NEXT_PUBLIC_DEMO_MODE=1  → in-browser demo (set this on Vercel)
 *  - NEXT_PUBLIC_VERCEL_ENV   → fallback; only present when Vercel exposes system env vars
 */
const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "1" || !!process.env.NEXT_PUBLIC_VERCEL_ENV;

export const defaultApi: Api = demo ? demoApi : httpApi;
