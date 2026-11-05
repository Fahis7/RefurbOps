import { read } from "@/server/store";
import { handle, snapshot } from "@/server/http";

export const dynamic = "force-dynamic";

// GET /api/state – full state + dashboard stats
export async function GET() {
  return handle(async () => snapshot(await read()));
}
