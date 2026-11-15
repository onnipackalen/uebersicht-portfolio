// worker.js - the Portfolio web app's engine: the widget's own Python
// (portfolio_tracker.py and its helpers) running in Pyodide in this Web
// Worker. positions.json and the cache live in /pw, kept in this browser's
// IndexedDB; nothing about the portfolio leaves the browser except the
// ticker symbols the price feed (/api/yf) is asked about.
//
// messages in:  {id, op: "boot"|"tick"|"refresh"|"history"|"helper"|"file", ...}
// messages out: {id, ok, result|error} and, while a job runs, JSON strings
//               {"progress": "fetch"|"history", "value": {...}}
"use strict";
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
importScripts(PYODIDE + "pyodide.js");

let py = null, wm = null;

const syncfs = (populate) => new Promise((res) => py.FS.syncfs(populate, (err) => res(err || null)));

async function boot(msg) {
  py = await loadPyodide({ indexURL: PYODIDE });
  await py.loadPackage(["tzdata"]);
  const FS = py.FS;
  FS.mkdirTree("/pw");
  FS.mount(FS.filesystems.IDBFS, {}, "/pw");
  await syncfs(true);
  const bundle = await (await fetch(msg.bundle, { cache: "no-cache" })).json();
  FS.mkdirTree("/app");
  for (const name of Object.keys(bundle.files)) FS.writeFile("/app/" + name, bundle.files[name]);
  py.runPython("import sys\nif '/app' not in sys.path: sys.path.insert(0, '/app')");
  wm = py.pyimport("web_main");
  wm._post = (s) => self.postMessage(s);
  const out = wm.setup(JSON.stringify({ locale: msg.locale || "en_US", version: bundle.version || "13.6", api: msg.api || "" }));
  await syncfs(false);
  return out;
}

const WRITES = new Set(["buy", "sell", "watch", "unwatch", "setting", "alert", "meta", "import", "setup"]);

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    let result;
    if (m.op === "boot") result = await boot(m);
    else if (m.op === "tick") result = wm.tick(!!m.fetch, !!m.hist);
    else if (m.op === "debug") result = wm.debug();
    else if (m.op === "refresh") { result = wm.refresh(); await syncfs(false); }
    else if (m.op === "history") { result = wm.history(); await syncfs(false); }
    else if (m.op === "helper") {
      result = wm.helper(JSON.stringify(m.args || []));
      if (WRITES.has((m.args || [])[0])) await syncfs(false);
      const d = wm.take_download();
      if (d) {
        const [name, bytes] = d.toJs();
        const copy = bytes.slice ? bytes.slice() : new Uint8Array(bytes);
        d.destroy();
        self.postMessage({ id: m.id, ok: true, result: String(result), download: { name: String(name), bytes: copy } });
        return;
      }
    } else if (m.op === "file") {
      py.FS.mkdirTree(m.path.replace(/\/[^/]*$/, ""));
      py.FS.writeFile(m.path, new Uint8Array(m.bytes));
      result = m.path;
    }
    else throw new Error("unknown op " + m.op);
    self.postMessage({ id: m.id, ok: true, result: String(result) });
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
  }
};
