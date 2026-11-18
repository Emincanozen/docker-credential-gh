import { defaultExecutor } from "./gh";
import { run } from "./protocol";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "";
  const needsInput = command === "get" || command === "store" || command === "erase";
  const input = needsInput ? await readStdin() : "";
  const out = await run(command, input, {
    exec: defaultExecutor,
    ghBin: process.env.DOCKER_CREDENTIAL_GH_BIN || "gh",
  });
  if (out.stdout) process.stdout.write(out.stdout);
  if (out.stderr) process.stderr.write(out.stderr);
  process.exitCode = out.code;
}

void main();
