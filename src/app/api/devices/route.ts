import { transact } from "@/server/store";
import { body, handle, snapshot } from "@/server/http";
import { addDevice } from "@/domain/service";
import type { NewDeviceInput } from "@/domain/types";

// POST /api/devices – intake a new device (validated in domain/service.ts)
export async function POST(req: Request) {
  return handle(async () => {
    const input = await body<Partial<NewDeviceInput>>(req);
    const now = new Date().toISOString();
    const { state } = await transact((s) => ({ state: addDevice(s, input, now) }));
    return snapshot(state, { createdId: state.devices[0].id });
  });
}
