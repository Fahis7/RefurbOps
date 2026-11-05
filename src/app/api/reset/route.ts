import { reset } from "@/server/store";
import { handle, snapshot } from "@/server/http";

// POST /api/reset – reload demo data
export async function POST() {
  return handle(async () => snapshot(await reset()));
}
