// Builds demo-dist/index.html: one self-contained file (JS + CSS inlined) that runs
// the full UI with the in-browser backend. Used for the shareable demo link.
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = await build({
  entryPoints: [path.join(root, "src/demo/main.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  target: "es2020",
  alias: { "@": path.join(root, "src") },
  // The browser has no `process`: inline every env var the client code reads.
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_DEMO_MODE": '"1"',
    "process.env.NEXT_PUBLIC_VERCEL_ENV": '""',
    // No server in the single-file demo: the AI assistant shows an explanation instead of calling /api/ai/ask.
    "process.env.NEXT_PUBLIC_STATIC_DEMO": '"1"',
  },
  logLevel: "warning",
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = await readFile(path.join(root, "src/app/globals.css"), "utf8");

// Same no-flash theme script as src/app/layout.tsx: bundle src/client/theme.ts and read the constant,
// so there is one source of truth instead of a hand-copied script.
const themeBuild = await build({
  entryPoints: [path.join(root, "src/client/theme.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  logLevel: "warning",
});
const themeModule = await import(`data:text/javascript;base64,${Buffer.from(themeBuild.outputFiles[0].text).toString("base64")}`);
const themeScript = themeModule.THEME_INIT_SCRIPT.replace(/<\/script/gi, "<\\/script");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RefurbOps – refurbished electronics operations (demo)</title>
<script>${themeScript}</script>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;

await mkdir(path.join(root, "demo-dist"), { recursive: true });
await writeFile(path.join(root, "demo-dist/index.html"), html);
console.log(`demo-dist/index.html written (${Math.round(html.length / 1024)} KB)`);
