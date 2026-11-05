import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";
import * as NodePath from "node:path";
const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const child = NodeChildProcess.spawn(
  NodePath.resolve(root, "node_modules/.bin/vp"),
  [
    "run",
    "dev",
    "--share",
    "--home-dir",
    NodePath.resolve(root, ".t3"),
    "--no-seed",
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
