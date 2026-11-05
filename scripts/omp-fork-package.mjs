import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import * as NodePath from "node:path";
const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const destination = NodePath.resolve(root, "apps/server/dist/client");
NodeFS.rmSync(destination, { recursive: true, force: true });
NodeFS.cpSync(NodePath.resolve(root, "apps/web/dist"), destination, { recursive: true });
console.log("Packaged the fork web client beside the built server.");
