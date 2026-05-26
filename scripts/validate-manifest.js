const fs = require("fs");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const required = ["id", "name", "version", "minAppVersion", "description", "author", "isDesktopOnly"];
const missing = required.filter((key) => !(key in manifest));

if (missing.length) {
  console.error(`manifest.json missing required fields: ${missing.join(", ")}`);
  process.exit(1);
}

if (manifest.id !== "stellar-graph") {
  console.error("manifest id must remain stellar-graph for installed vault compatibility");
  process.exit(1);
}

console.log(`manifest ok: ${manifest.name} ${manifest.version}`);
