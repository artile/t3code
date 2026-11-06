import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone Node CLI has no Effect runtime.
if (process.platform !== "darwin") throw new Error("The fork service uses macOS launchd.");

const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const label = "com.artile.t3code-omp-fork";
const domain = `gui/${process.getuid()}`;
const target = `${domain}/${label}`;
const plist = NodePath.join(NodeOS.homedir(), "Library/LaunchAgents", `${label}.plist`);
const logs = NodePath.join(root, ".t3/service");
const action = process.argv[2] ?? "status";

if (
  process.argv.length > 3 ||
  !["install", "start", "stop", "restart", "status", "uninstall"].includes(action)
)
  throw new Error("Use install, start, stop, restart, status, or uninstall.");

const launchctl = (args, required = true) => {
  const result = NodeChildProcess.spawnSync("/bin/launchctl", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (required && result.status !== 0)
    throw new Error(result.stderr.trim() || `launchctl exited ${result.status}`);
  return result;
};
const loaded = () => launchctl(["print", target], false).status === 0;
const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char],
  );
const args = [
  process.execPath,
  NodePath.join(root, "apps/server/dist/bin.mjs"),
  "serve",
  "--base-dir",
  NodePath.join(root, ".t3"),
  "--port",
  "13773",
  "--tailscale-serve",
  "--tailscale-serve-port",
  "5733",
];

if (action === "install") {
  if (!NodeFS.existsSync(args[1])) throw new Error("Run pnpm fork:build first.");
  if (loaded()) launchctl(["bootout", target]);
  NodeFS.mkdirSync(NodePath.dirname(plist), { recursive: true });
  NodeFS.mkdirSync(logs, { recursive: true });
  NodeFS.writeFileSync(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map((arg) => `<string>${xml(arg)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(process.env.PATH ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin")}</string></dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>15</integer>
<key>StandardOutPath</key><string>${xml(NodePath.join(logs, "stdout.log"))}</string>
<key>StandardErrorPath</key><string>${xml(NodePath.join(logs, "stderr.log"))}</string>
</dict></plist>
`,
    { mode: 0o600 },
  );
  NodeChildProcess.execFileSync("/usr/bin/plutil", ["-lint", plist], { stdio: "ignore" });
  launchctl(["bootstrap", domain, plist]);
} else if (action === "start") {
  if (!loaded()) launchctl(["bootstrap", domain, plist]);
} else if (action === "restart") {
  launchctl(["kickstart", "-k", target]);
} else if (action === "stop" || action === "uninstall") {
  if (loaded()) launchctl(["bootout", target]);
  if (action === "uninstall") NodeFS.rmSync(plist, { force: true });
}

const status = launchctl(["print", target], false);
console.log(
  status.status === 0
    ? `${label}: ${status.stdout
        .split("\n")
        .filter((line) => /^\t(state|pid|last exit code) = /.test(line))
        .map((line) => line.trim())
        .join(", ")}`
    : `${label}: stopped`,
);
console.log(`Logs: ${logs}`);
