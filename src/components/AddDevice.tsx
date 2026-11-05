"use client";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { STORAGE_OPTIONS_GB, type Category, type Device, type NewDeviceInput } from "@/domain/types";
import { isValidImei, looksLikeImei, lookupByImei, suggestModels, withCheckDigit, type CatalogEntry } from "@/domain/catalog";
import type { Api } from "@/client/api";
import type { Run } from "./DeviceDrawer";
import { eur, formatStorage } from "./format";

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

// Brand, model, storage and colour come from the IMEI autofill (demo TAC 35000401 = iPhone 15).
const EXAMPLE: Partial<NewDeviceInput> = { supplier: "Carrier Buyback FR", costPrice: 410, batteryHealth: 91 };
const EXAMPLE_TAC = "35000401";

// Per-browser convenience only – the form works the same without it.
const SUPPLIER_KEY = "refurbops-last-supplier";
function readLastSupplier(): string | null {
  try {
    return window.localStorage.getItem(SUPPLIER_KEY);
  } catch {
    return null;
  }
}
function saveLastSupplier(supplier: string) {
  try {
    window.localStorage.setItem(SUPPLIER_KEY, supplier);
  } catch {
    /* storage unavailable – ignore */
  }
}

/** Fill brand, model, category, storage and colour from a catalog entry. Cost is never filled. */
const applyEntry = (entry: CatalogEntry, f: Partial<NewDeviceInput>): Partial<NewDeviceInput> => ({
  ...f,
  brand: entry.brand,
  model: entry.model,
  category: entry.category,
  storageGb: entry.storageOptions[0],
  color: entry.colors[0],
});

/** Catalog entry for a scanned IMEI – only when the checksum is valid and the TAC is known. */
const entryForSerial = (serial: string) => (isValidImei(serial.trim()) ? lookupByImei(serial.trim()) : null);

export function AddDevice({
  api,
  run,
  devices,
  onCreated,
  onOpen,
}: {
  api: Api;
  run: Run;
  devices: Device[];
  onCreated: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [form, setForm] = useState<Partial<NewDeviceInput>>(EMPTY);
  const [picked, setPicked] = useState<CatalogEntry | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(0);
  const uid = useId();
  const ids = { serial: `${uid}-serial`, model: `${uid}-model`, list: `${uid}-models`, cost: `${uid}-cost` };

  const set = <K extends keyof NewDeviceInput>(k: K, v: NewDeviceInput[K] | undefined) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v === "" ? undefined : Number(v));

  useEffect(() => {
    const last = readLastSupplier();
    if (last) setForm((f) => ({ ...f, supplier: last }));
  }, []);

  const pickModel = (entry: CatalogEntry) => {
    setForm((f) => applyEntry(entry, f));
    setPicked(entry);
    setListOpen(false);
  };

  /** Serial typed or scanned: autofill the model when it is a valid IMEI with a known TAC. */
  const setSerial = (serial: string, base?: Partial<NewDeviceInput>) => {
    const entry = entryForSerial(serial);
    setForm((f) => {
      const next = { ...(base ?? f), serial };
      return entry ? applyEntry(entry, next) : next;
    });
    if (entry) setPicked(entry);
    else if (base) setPicked(null);
    setDetected(entry ? `${entry.brand} ${entry.model}` : null);
  };

  const serial = (form.serial ?? "").trim();
  const imeiInvalid = looksLikeImei(serial) && !isValidImei(serial);
  const duplicate = serial ? devices.find((d) => d.serial === serial) : undefined;

  const suggestions = listOpen && form.model !== picked?.model ? suggestModels(form.model ?? "") : [];
  const showList = suggestions.length > 0;
  const activeIndex = Math.min(active, suggestions.length - 1);

  const onModelKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!showList) return setListOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (Math.min(i, suggestions.length - 1) + step + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && showList) {
      e.preventDefault(); // pick the suggestion instead of submitting the form
      pickModel(suggestions[activeIndex]);
    } else if (e.key === "Escape" && showList) {
      e.preventDefault();
      setListOpen(false);
    }
  };

  const storageOptions = picked?.storageOptions ?? STORAGE_OPTIONS_GB;

  return (
    <div className="card form-card">
      <div className="row between">
        <h3>Device intake</h3>
        <button
          className="btn ghost small-btn"
          onClick={() => setSerial(withCheckDigit(EXAMPLE_TAC + String(Date.now()).slice(-6)), { ...form, ...EXAMPLE })}
        >
          Fill example
        </button>
      </div>
      <p className="muted small">
        Scan the IMEI to autofill a known phone, or start typing the model. Validated by the domain layer (src/domain/service.ts) – bad
        input is rejected with a clear message.
      </p>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await run(() => api.addDevice(form), (s) => `${s.createdId} received`);
          if (res?.createdId) {
            if (form.supplier) saveLastSupplier(form.supplier);
            setForm({ ...EMPTY, supplier: form.supplier });
            setPicked(null);
            setDetected(null);
            onCreated(res.createdId);
          }
        }}
      >
        <div className="field">
          <label htmlFor={ids.serial}>IMEI / serial</label>
          <input
            id={ids.serial}
            value={form.serial ?? ""}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="e.g. 350001011234567"
            inputMode="text"
            autoComplete="off"
          />
          {duplicate && (
            <span className="field-hint bad">
              Already in stock as{" "}
              <button type="button" className="link" onClick={() => onOpen(duplicate.id)}>
                {duplicate.id}
              </button>
            </span>
          )}
          {imeiInvalid && <span className="field-hint warn">IMEI checksum is invalid – check the scan</span>}
          {detected && <span className="field-hint good">Detected: {detected}</span>}
        </div>
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
        <div className="field combo">
          <label htmlFor={ids.model}>Model</label>
          <input
            id={ids.model}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={ids.list}
            aria-activedescendant={showList ? `${ids.list}-${activeIndex}` : undefined}
            autoComplete="off"
            value={form.model ?? ""}
            placeholder="e.g. iPhone 15"
            onChange={(e) => {
              set("model", e.target.value);
              setPicked(null); // free text again: all storage sizes, any colour
              setDetected(null);
              setActive(0);
              setListOpen(true);
            }}
            onFocus={() => setListOpen(true)}
            onBlur={() => setListOpen(false)}
            onKeyDown={onModelKey}
          />
          {showList && (
            <ul className="suggest" role="listbox" id={ids.list} aria-label="Matching models">
              {suggestions.map((s, i) => (
                <li
                  key={`${s.brand} ${s.model}`}
                  id={`${ids.list}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={i === activeIndex ? "active" : ""}
                  onMouseEnter={() => setActive(i)}
                  // mousedown, not click: picking must happen before the input's blur closes the list
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickModel(s);
                  }}
                >
                  <span>
                    {s.brand} {s.model}
                  </span>
                  <span className="muted">{s.category}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="field">
          Storage
          <select value={form.storageGb ?? storageOptions[0]} onChange={(e) => set("storageGb", Number(e.target.value))}>
            {storageOptions.map((gb) => (
              <option key={gb} value={gb}>
                {formatStorage(gb)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Colour
          {picked ? (
            <select value={form.color ?? ""} onChange={(e) => set("color", e.target.value)}>
              {picked.colors.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          ) : (
            <input value={form.color ?? ""} onChange={(e) => set("color", e.target.value)} />
          )}
        </label>
        <label className="field">
          Supplier
          <input value={form.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)} />
        </label>
        <div className="field">
          <label htmlFor={ids.cost}>Purchase cost (€)</label>
          <input id={ids.cost} type="number" value={form.costPrice ?? ""} onChange={(e) => set("costPrice", num(e.target.value))} />
          {picked && <span className="field-hint muted">Typical cost {eur(picked.typicalCost)}</span>}
        </div>
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
