/**
 * Entry point for the static, shareable demo (npm run build:demo).
 * Same <App/>, but backed by demoApi (browser-only) instead of the HTTP API.
 */
import { createRoot } from "react-dom/client";
import { App } from "@/components/App";
import { demoApi } from "@/client/demoApi";

createRoot(document.getElementById("root")!).render(<App api={demoApi} />);
