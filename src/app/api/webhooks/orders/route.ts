import { transact } from "@/server/store";
import { body, handle, snapshot } from "@/server/http";
import { receiveOrder } from "@/domain/service";
import { DomainError, type OrderEvent } from "@/domain/types";
import { MARKETPLACE_IDS } from "@/domain/pricing";
import type { OrderOutcome } from "@/domain/marketplace";

/**
 * POST /api/webhooks/orders – a marketplace tells us a device was bought.
 * In production each marketplace would have its own signed webhook (verify the
 * HMAC signature first); here the UI simulates them.
 * Orders run inside `transact`, which handles one write at a time – so two
 * simultaneous orders for the same device can never both succeed.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const o = await body<Partial<OrderEvent>>(req);
    if (!o.marketplace || !MARKETPLACE_IDS.includes(o.marketplace)) throw new DomainError("Unknown marketplace");
    if (!o.orderId || !o.deviceId || !(Number(o.price) > 0)) throw new DomainError("orderId, deviceId and price are required");
    const order: OrderEvent = { marketplace: o.marketplace, orderId: o.orderId, deviceId: o.deviceId, price: Number(o.price) };

    const { state, result } = await transact<OrderOutcome>((s) => {
      const r = receiveOrder(s, order, new Date().toISOString());
      return { state: r.state, result: r.outcome };
    });
    // 409 tells the marketplace we could not fulfil it (it should cancel the order).
    const res = snapshot(state, { outcome: result });
    return result === "REJECTED_OVERSELL" ? new Response(res.body, { status: 409, headers: res.headers }) : res;
  });
}
