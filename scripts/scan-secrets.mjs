import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const trackedOrUntracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .filter((path) => path !== "scripts/scan-secrets.mjs");

const patterns = [
  {
    name: "private key",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  { name: "OpenAI key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  {
    name: "Supabase service role JWT",
    regex:
      /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  },
  {
    name: "assigned service role",
    regex: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?!example-|\$\{|<)[^\s]+/,
  },
  {
    name: "assigned API key",
    regex: /(?:OPENAI_API_KEY|API_KEY)\s*=\s*(?!example-|\$\{|<)[^\s]+/,
  },
];

const findings = [];
for (const path of trackedOrUntracked) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    if (pattern.regex.test(content)) findings.push(`${path}: ${pattern.name}`);
  }
}

if (findings.length > 0) {
  console.error(`Potential secrets detected:\n${findings.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${trackedOrUntracked.length} files).`);
}
