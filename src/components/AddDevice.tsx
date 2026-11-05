"use client";
import { useState } from "react";
import { STORAGE_OPTIONS_GB, type Category, type NewDeviceInput } from "@/domain/types";
import type { Api } from "@/client/api";
import type { Run } from "./DeviceDrawer";
import { formatStorage } from "./format";

const EMPTY: Partial<NewDeviceInput> = {
  serial: "",
  brand: "Apple",
  model: "",
  category: "Smartphone",
  storageGb: 128,
  color: "",
  supplier: "TradeIn Partner EU",
  costPrice: undefined,
  batteryHealth: 88,
};

const EXAMPLE: Partial<NewDeviceInput> = {
  serial: `35${Math.floor(100000000000 + Math.random() * 899999999999)}`,
  brand: "Apple",
  model: "iPhone 15",
  category: "Smartphone",
  storageGb: 128,
  color: "Pink",
  supplier: "Carrier Buyback FR",
  costPrice: 410,
  batteryHealth: 91,
};

export function AddDevice({ api, run, onCreated }: { api: Api; run: Run; onCreated: (id: string) => void }) {
  const [form, setForm] = useState<Partial<NewDeviceInput>>(EMPTY);
  const set = <K extends keyof NewDeviceInput>(k: K, v: NewDeviceInput[K] | undefined) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <div className="card form-card">
      <div className="row between">
        <h3>Device intake</h3>
        <button className="btn ghost small-btn" onClick={() => setForm({ ...EXAMPLE, serial: `35${Date.now()}` })}>
          Fill example
        </button>
      </div>
      <p className="muted small">Scan or type the device as it arrives from the supplier. Validated by the domain layer (src/domain/service.ts) – bad input is rejected with a clear message.</p>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await run(() => api.addDevice(form), (s) => `${s.createdId} received`);
          if (res?.createdId) {
            setForm(EMPTY);
            onCreated(res.createdId);
          }
        }}
      >
        <label className="field">
          IMEI / serial
          <input value={form.serial ?? ""} onChange={(e) => set("serial", e.target.value)} placeholder="e.g. 356789104523987" />
        </label>
        <label className="field">
          Category
          <select value={form.category} onChange={(e) => set("category", e.target.value as Category)}>
            <option>Smartphone</option>
            <option>Laptop</option>
            <option>Tablet</option>
          </select>
        </label>
        <label className="field">
          Brand
          <input value={form.brand ?? ""} onChange={(e) => set("brand", e.target.value)} />
        </label>
        <label className="field">
          Model
          <input value={form.model ?? ""} onChange={(e) => set("model", e.target.value)} placeholder="e.g. iPhone 15" />
        </label>
        <label className="field">
          Storage
          <select value={form.storageGb ?? 128} onChange={(e) => set("storageGb", Number(e.target.value))}>
            {STORAGE_OPTIONS_GB.map((gb) => (
              <option key={gb} value={gb}>
                {formatStorage(gb)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Colour
          <input value={form.color ?? ""} onChange={(e) => set("color", e.target.value)} />
        </label>
        <label className="field">
          Supplier
          <input value={form.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)} />
        </label>
        <label className="field">
          Purchase cost (€)
          <input type="number" value={form.costPrice ?? ""} onChange={(e) => set("costPrice", num(e.target.value))} />
        </label>
        <label className="field">
          Battery health (%)
          <input type="number" value={form.batteryHealth ?? ""} onChange={(e) => set("batteryHealth", num(e.target.value))} />
        </label>
        <div className="form-actions">
          <button className="btn primary" type="submit">
            Receive device
          </button>
        </div>
      </form>
    </div>
  );
}
