import fs from "node:fs";

const manifest = JSON.parse(
  fs.readFileSync("sources/ipa/manifest.json", "utf8"),
);
const index = manifest
  .map(({ id, title, year }) => ({ id, title, year }))
  .sort((a, b) => b.year - a.year);
fs.mkdirSync("public/data", { recursive: true });
fs.writeFileSync(
  "public/data/index.json",
  `${JSON.stringify(index, null, 2)}\n`,
);
console.log(`年度一覧: ${index.length}回`);
