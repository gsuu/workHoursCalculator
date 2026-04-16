import fs from "node:fs/promises";
import path from "node:path";

import { parseMonthlyResultFiles } from "../src/monthlyAttendanceImport.js";

const parseArgs = (argv) => {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`값이 필요합니다: --${key}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
};

const toArrayBuffer = (buffer) =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const createLocalFile = (filePath) => ({
  name: path.basename(filePath),
  async arrayBuffer() {
    const fileBuffer = await fs.readFile(filePath);
    return toArrayBuffer(fileBuffer);
  }
});

const ensureFileExists = async (filePath, label) => {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`${label} 파일을 찾을 수 없습니다: ${filePath}`);
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const attendancePath = path.resolve(args.attendance ?? "");
  const detailPath = path.resolve(args.detail ?? "");
  const outputPath = path.resolve(args.output ?? "src/preloadedMonthlyWorkers.js");

  if (!attendancePath || !detailPath) {
    throw new Error("--attendance, --detail 인자가 모두 필요합니다.");
  }

  await ensureFileExists(attendancePath, "근태현황");
  await ensureFileExists(detailPath, "근무결과(상세)");

  const parsed = await parseMonthlyResultFiles({
    attendanceFile: createLocalFile(attendancePath),
    detailFile: createLocalFile(detailPath)
  });

  if (!parsed.monthInfo?.year || !parsed.monthInfo?.month) {
    throw new Error("월 정보를 추출하지 못했습니다.");
  }

  const periodLabel = `${parsed.monthInfo.year}년 ${parsed.monthInfo.month}월`;
  const output = [
    `export const PRELOADED_MONTHLY_PERIOD_LABEL = ${JSON.stringify(periodLabel)};`,
    "",
    `export const PRELOADED_MONTHLY_WORKERS = ${JSON.stringify(parsed.workers, null, 2)};`,
    ""
  ].join("\n");

  await fs.writeFile(outputPath, output, "utf8");

  console.log(`기본 결과표 데이터 생성 완료: ${periodLabel}`);
  console.log(`- 근태현황: ${attendancePath}`);
  console.log(`- 근무결과(상세): ${detailPath}`);
  console.log(`- 출력 파일: ${outputPath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
