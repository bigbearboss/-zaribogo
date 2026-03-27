const fs = require("fs");
const path = require("path");
const iconv = require("iconv-lite");

const inputPath = path.join(__dirname, "..", "data", "raw", "법정동코드_전체자료.txt");
const outputPath = path.join(__dirname, "..", "src", "engine", "data", "admCodeMap.ts");

// 원본 파일은 cp949/euc-kr인 경우가 많아서 Buffer로 읽은 뒤 디코딩
const buffer = fs.readFileSync(inputPath);

// 우선 cp949로 디코딩 시도
let raw = iconv.decode(buffer, "cp949");

// 혹시 UTF-8 파일이면 cp949 디코딩 결과가 이상할 수 있으니 간단 보정
if (!raw.includes("법정동코드") && !raw.includes("존재") && !raw.includes("폐지여부")) {
  raw = buffer.toString("utf-8");
}

const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

const result = [];

function isDongToken(token) {
  return /동$|읍$|면$|가$|리$/.test(token);
}

for (const line of lines) {
  // 헤더 건너뛰기
  if (line.includes("법정동코드") || line.includes("폐지여부")) continue;

  // 탭 우선, 탭이 없으면 다중 공백 fallback
  let parts = line.split("\t").map((v) => v.trim()).filter(Boolean);
  if (parts.length < 3) {
    parts = line.split(/\s{2,}/).map((v) => v.trim()).filter(Boolean);
  }
  if (parts.length < 3) continue;

  const code = parts[0];
  const fullName = parts[1];
  const status = parts[2];

  // 존재 행만 사용
  if (status !== "존재") continue;

  const tokens = fullName.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) continue;

  const sidoName = tokens[0];

  // dong 시작 위치 찾기
  const dongStartIndex = tokens.findIndex((t, idx) => idx >= 2 && isDongToken(t));
  if (dongStartIndex === -1) continue;

  const sigunguName = tokens.slice(1, dongStartIndex).join(" ");
  const dongName = tokens.slice(dongStartIndex).join(" ");

  if (!sidoName || !sigunguName || !dongName) continue;

  result.push({
    sidoName,
    sigunguName,
    dongName,
    admCd: code,
  });
}

// 중복 제거
const seen = new Set();
const deduped = result.filter((row) => {
  const key = `${row.sidoName}|${row.sigunguName}|${row.dongName}|${row.admCd}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const tsContent =
  "const admCodeMap = " +
  JSON.stringify(deduped, null, 2) +
  ";\n\nexport default admCodeMap;\n";

fs.writeFileSync(outputPath, tsContent, "utf-8");

console.log(`✅ admCodeMap.ts 생성 완료: ${deduped.length}건`);
console.log(`📄 output: ${outputPath}`);
console.log("🔎 sample:", deduped.slice(0, 5));