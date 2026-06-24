import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function check(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args);
    const output = `${stdout}${stderr}`.trim();
    console.log(`${command}: ${output.split("\n")[0]}`);
  } catch (error) {
    console.error(`${command}: failed`);
    if (error.stderr || error.stdout) {
      console.error(`${error.stdout ?? ""}${error.stderr ?? ""}`.trim());
    } else {
      console.error(error.message);
    }
    process.exitCode = 1;
  }
}

await check("node", ["--version"]);
await check("npm", ["--version"]);
await check("ffmpeg", ["-version"]);
await check("yt-dlp", ["--version"]);
