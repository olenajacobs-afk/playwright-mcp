import { execFileSync } from "node:child_process";
import path from "node:path";

const relativePath = "manual-tests/VS_manual_tests.md";
const absolutePath = path.resolve(process.cwd(), relativePath);

console.log("VS manual test suite:");
console.log(absolutePath);

try {
  const platform = process.platform;

  if (platform === "darwin") {
    execFileSync("open", [absolutePath], { stdio: "ignore" });
  } else if (platform === "win32") {
    execFileSync("cmd", ["/c", "start", "", absolutePath], { stdio: "ignore" });
  } else {
    execFileSync("xdg-open", [absolutePath], { stdio: "ignore" });
  }
} catch {
  // Printing the path is enough; opening is best-effort.
}
