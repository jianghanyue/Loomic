import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rawVersion = process.argv[2] ?? process.env.DESKTOP_VERSION;
const version = rawVersion?.replace(/^v/, "");

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(
    "Usage: pnpm --filter @loomic/desktop set-version -- <semver> (for example, 1.2.3)",
  );
  process.exit(1);
}

const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
packageJson.version = version;
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`Updated ${packagePath} to version ${version}`);
