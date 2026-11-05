import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";
import * as NodePath from "node:path";
const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const child = NodeChildProcess.spawn(
  process.execPath,
  [
    NodePath.resolve(root, "apps/server/dist/bin.mjs"),
    "serve",
    "--base-dir",
    NodePath.resolve(root, ".t3"),
    "--port",
    "13773",
    "--tailscale-serve",
    "--tailscale-serve-port",
    "5733",
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
