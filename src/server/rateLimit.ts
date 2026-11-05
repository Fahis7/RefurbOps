import "server-only";

/**
 * Best-effort fixed-window rate limit, in memory. On serverless every instance has its own memory, so this
 * slows down casual abuse but is NOT a cost cap – the real cap is the monthly spend limit in the Anthropic Console.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, nowMs: number): boolean => {
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= nowMs) hits.delete(k); // keep memory bounded
    const h = hits.get(key);
    if (!h || h.resetAt <= nowMs) {
      hits.set(key, { count: 1, resetAt: nowMs + windowMs });
      return true;
    }
    h.count += 1;
    return h.count <= limit;
  };
}

/** Client IP as seen behind Vercel / a proxy (first x-forwarded-for entry). */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
