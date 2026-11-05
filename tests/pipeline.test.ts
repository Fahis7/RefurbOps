import { describe, expect, it } from "vitest";
import { addDevice, approveAndList, completeRepair, grade, move, recordQC } from "@/domain/service";
import { checksFor, computeGrade } from "@/domain/qc";
import { suggestPrice } from "@/domain/pricing";
import { at, T0, withDevice } from "./helpers";

describe("intake validation", () => {
  it("rejects missing fields with a clear message", () => {
    const { state } = withDevice();
    expect(() => addDevice(state, { brand: "Apple" }, T0)).toThrow(/serial is required/);
  });

  it("rejects duplicate serial numbers", () => {
    const { state } = withDevice();
    expect(() => addDevice(state, { ...state.devices[0] }, T0)).toThrow(/already exists/);
  });
});

describe("stage transitions", () => {
  it("cannot skip stages", () => {
    const { state, id } = withDevice();
    expect(() => move(state, id, "QC", at(1))).toThrow(/Cannot move from RECEIVED to QC/);
  });

  it("can never be moved to SOLD by hand", () => {
    const { state, id } = withDevice();
    expect(() => move(state, id, "SOLD", at(1))).toThrow(/marketplace order/);
  });

  it("records every stage in history", () => {
    let { state, id } = withDevice();
    state = move(state, id, "GRADING", at(1));
    state = grade(state, id, { cosmeticScore: 4, batteryHealth: 88, needsRepair: true }, at(2));
    expect(state.devices[0].history.map((h) => h.stage)).toEqual(["RECEIVED", "GRADING", "REPAIR"]);
  });
});

describe("QC gate", () => {
  function inQC() {
    let { state, id } = withDevice();
    state = move(state, id, "GRADING", at(1));
    state = grade(state, id, { cosmeticScore: 4, batteryHealth: 88, needsRepair: false }, at(2));
    return { state, id };
  }

  it("blocks listing until every check has passed", () => {
    let { state, id } = inQC();
    const checks = checksFor("Smartphone");
    for (const c of checks.slice(0, -1)) state = recordQC(state, id, c.id, true);
    expect(() => approveAndList(state, id, ["backmarket"], at(3))).toThrow(/All QC checks must pass/);
  });

  it("blocks listing when a check failed", () => {
    let { state, id } = inQC();
    for (const c of checksFor("Smartphone")) state = recordQC(state, id, c.id, c.id !== "camera");
    expect(() => approveAndList(state, id, ["backmarket"], at(3))).toThrow(/All QC checks must pass/);
  });

  it("only applies checks relevant to the device type (no camera check for laptops)", () => {
    expect(checksFor("Laptop").map((c) => c.id)).not.toContain("camera");
    expect(checksFor("Laptop").map((c) => c.id)).toContain("keyboard");
  });

  it("resets the checklist when a device comes back from repair", () => {
    let { state, id } = inQC();
    state = recordQC(state, id, "camera", false);
    state = move(state, id, "REPAIR", at(3));
    state = completeRepair(state, id, { cost: 40, note: "Camera module" }, at(4));
    expect(state.devices[0].qc).toEqual([]);
    expect(state.devices[0].repairCost).toBe(40);
  });
});

describe("grading and pricing", () => {
  it.each([
    [5, 95, "A"],
    [5, 86, "B"], // perfect cosmetics but tired battery is not grade A
    [3, 90, "B"],
    [2, 99, "C"],
  ] as const)("cosmetic %i + battery %i%% → grade %s", (cosmetic, battery, expected) => {
    expect(computeGrade(cosmetic, battery)).toBe(expected);
  });

  it("battery replacement restores battery health and can upgrade the grade", () => {
    let { state, id } = withDevice({ batteryHealth: 78 });
    state = move(state, id, "GRADING", at(1));
    state = grade(state, id, { cosmeticScore: 5, batteryHealth: 78, needsRepair: true }, at(2));
    expect(state.devices[0].grade).toBe("C");
    state = completeRepair(state, id, { cost: 35, note: "Battery replacement" }, at(3));
    expect(state.devices[0].batteryHealth).toBe(100);
    expect(state.devices[0].grade).toBe("A");
  });

  it("prices cover cost and step down by grade", () => {
    const d = { costPrice: 300, repairCost: 50 };
    const [a, b, c] = (["A", "B", "C"] as const).map((g) => suggestPrice(d, g));
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(350); // never priced below total cost
    expect(a % 10).toBe(9); // psychological pricing: ends in 9
  });
});
