import { describe, expect, it } from "vitest";
import { move, receiveOrder } from "@/domain/service";
import { at, listedDevice } from "./helpers";

const order = (id: string, marketplace: "backmarket" | "refurbed" | "amazon", orderId: string) => ({
  marketplace,
  orderId,
  deviceId: id,
  price: 400,
});

describe("marketplace order sync", () => {
  it("first order wins: device SOLD, sold listing marked, others delisted", () => {
    const { state, id } = listedDevice();
    const r = receiveOrder(state, order(id, "refurbed", "RE-1"), at(5));
    expect(r.outcome).toBe("PROCESSED");
    const d = r.state.devices[0];
    expect(d.stage).toBe("SOLD");
    expect(d.sale?.marketplace).toBe("refurbed");
    const statuses = Object.fromEntries(r.state.listings.map((l) => [l.marketplace, l.status]));
    expect(statuses).toEqual({ backmarket: "DELISTED", refurbed: "SOLD", amazon: "DELISTED" });
  });

  it("is idempotent: the same webhook delivered twice is processed once", () => {
    const { state, id } = listedDevice();
    const first = receiveOrder(state, order(id, "backmarket", "BM-7"), at(5));
    const second = receiveOrder(first.state, order(id, "backmarket", "BM-7"), at(5.1));
    expect(second.outcome).toBe("DUPLICATE");
    expect(second.state.devices).toEqual(first.state.devices);
  });

  it("blocks an oversell: a second order on another marketplace is rejected", () => {
    const { state, id } = listedDevice();
    const first = receiveOrder(state, order(id, "backmarket", "BM-1"), at(5));
    const second = receiveOrder(first.state, order(id, "amazon", "AM-1"), at(5));
    expect(second.outcome).toBe("REJECTED_OVERSELL");
    expect(second.state.devices[0].sale?.orderId).toBe("BM-1"); // sale unchanged
    expect(second.state.syncLog[0].level).toBe("error");
  });

  it("calculates the marketplace fee on the sale", () => {
    const { state, id } = listedDevice();
    const r = receiveOrder(state, order(id, "amazon", "AM-9"), at(5));
    expect(r.state.devices[0].sale?.fee).toBe(60); // 15% of 400
  });

  it("pulling a listed device back to QC delists it everywhere", () => {
    const { state, id } = listedDevice();
    const next = move(state, id, "QC", at(4));
    expect(next.listings.every((l) => l.status === "DELISTED")).toBe(true);
    const r = receiveOrder(next, order(id, "refurbed", "RE-2"), at(5));
    expect(r.outcome).toBe("REJECTED_OVERSELL");
  });
});
