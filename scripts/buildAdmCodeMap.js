const fs = require("fs");
const path = require("path");

const inputPath = path.join(__dirname, "..", "data", "raw", "법정동코드_전체자료.txt");
const outputPath = path.join(__dirname, "..", "src", "engine", "data", "admCodeMap.json");

const raw = fs.readFileSync(inputPath, "utf-8");
const lines = raw.split("\n");

const result = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 3) continue;

  const code = parts[0];
  const status = parts[parts.length - 1];
  const name = parts.slice(1, parts.length - 1).join(" ");

  if (status !== "존재") continue;

  const tokens = name.split(" ");
  if (tokens.length < 3) continue;

  const sidoName = tokens[0];
  const sigunguName = tokens[1];
  const dongName = tokens.slice(2).join(" ");

  result.push({
    sidoName,
    sigunguName,
    dongName,
    admCd: code,
  });
}

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

console.log(`✅ admCodeMap.json 생성 완료: ${result.length}건`);
console.log(`📄 output: ${outputPath}`);