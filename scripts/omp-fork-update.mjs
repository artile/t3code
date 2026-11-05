import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import * as NodePath from "node:path";
const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const run = (cmd, args) =>
  NodeChildProcess.execFileSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
const apply = process.argv.includes("--apply");
if (process.argv.slice(2).some((arg) => !["--apply", "--check"].includes(arg)))
  throw new Error("Use --check (default) or --apply.");
const releases = JSON.parse(
  run("gh", [
    "api",
    "repos/pingdotgg/t3code/releases?per_page=30",
    "--jq",
    "map({tag_name,prerelease,draft,published_at})",
  ]),
);
const release = releases
  .filter((item) => item.prerelease && !item.draft && /^v[0-9].*-nightly[.]/.test(item.tag_name))
  .sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
if (!release) throw new Error("No published upstream nightly was found.");
run("git", ["fetch", "upstream", "tag", release.tag_name]);
const sha = run("git", ["rev-parse", `${release.tag_name}^{commit}`]);
try {
  run("git", ["merge-base", "--is-ancestor", sha, "HEAD"]);
  console.log(`Already includes ${release.tag_name} (${sha}).`);
  process.exit(0);
} catch {}
console.log(`Available: ${release.tag_name} (${sha}).`);
if (!apply) {
  console.log("Run pnpm fork:update --apply to merge it into omp-nightly.");
  process.exit(0);
}
if (run("git", ["branch", "--show-current"]) !== "omp-nightly")
  throw new Error("Switch to omp-nightly before updating.");
if (run("git", ["status", "--porcelain"]))
  throw new Error("Commit or move local changes before updating.");
run("git", ["branch", `backup/omp-nightly-${Date.now()}`]);
run("git", ["merge", "--no-ff", "--no-edit", release.tag_name]);
const pin = NodePath.resolve(root, "omp-fork.toml");
NodeFS.writeFileSync(
  pin,
  NodeFS.readFileSync(pin, "utf8")
    .replace(/^nightly_tag = .*$/m, `nightly_tag = "${release.tag_name}"`)
    .replace(/^nightly_commit = .*$/m, `nightly_commit = "${sha}"`),
);
run("git", ["add", "omp-fork.toml"]);
run("git", ["commit", "-m", `chore(fork): pin ${release.tag_name}`]);
console.log(
  "Merged upstream. Run pnpm install, pnpm exec vp run check:changed, then pnpm fork:build. The running installation was not replaced.",
);
