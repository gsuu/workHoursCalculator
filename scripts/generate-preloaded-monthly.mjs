import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

const formatPeriodLabel = (year, month) => `${year}년 ${month}월`;

const inferMonthInfo = (label) => {
  const match = String(label ?? "").match(/(\d{4})\D*(\d{1,2})/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
};

const readExistingDatasets = async (filePath) => {
  try {
    await fs.access(filePath);
  } catch {
    return [];
  }

  const moduleUrl = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
  const existing = await import(moduleUrl);

  if (Array.isArray(existing.PRELOADED_MONTHLY_DATASETS) && existing.PRELOADED_MONTHLY_DATASETS.length) {
    return existing.PRELOADED_MONTHLY_DATASETS;
  }

  if (existing.PRELOADED_MONTHLY_PERIOD_LABEL && Array.isArray(existing.PRELOADED_MONTHLY_WORKERS)) {
    const monthInfo = inferMonthInfo(existing.PRELOADED_MONTHLY_PERIOD_LABEL);
    return [{
      periodLabel: existing.PRELOADED_MONTHLY_PERIOD_LABEL,
      monthInfo,
      workers: existing.PRELOADED_MONTHLY_WORKERS
    }];
  }

  return [];
};

const sortDatasets = (datasets) =>
  [...datasets].sort((a, b) => {
    const ay = a.monthInfo?.year ?? 0;
    const by = b.monthInfo?.year ?? 0;
    if (ay !== by) return ay - by;
    return (a.monthInfo?.month ?? 0) - (b.monthInfo?.month ?? 0);
  });

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

  const newDataset = {
    periodLabel: formatPeriodLabel(parsed.monthInfo.year, parsed.monthInfo.month),
    monthInfo: { year: parsed.monthInfo.year, month: parsed.monthInfo.month },
    workers: parsed.workers
  };

  const existing = await readExistingDatasets(outputPath);
  const merged = sortDatasets([
    ...existing.filter((dataset) => dataset.periodLabel !== newDataset.periodLabel),
    newDataset
  ]);

  const output = [
    `export const PRELOADED_MONTHLY_DATASETS = ${JSON.stringify(merged, null, 2)};`,
    "",
    "const latest = PRELOADED_MONTHLY_DATASETS[PRELOADED_MONTHLY_DATASETS.length - 1] ?? null;",
    "",
    "export const PRELOADED_MONTHLY_PERIOD_LABEL = latest?.periodLabel ?? \"\";",
    "",
    "export const PRELOADED_MONTHLY_WORKERS = latest?.workers ?? [];",
    ""
  ].join("\n");

  await fs.writeFile(outputPath, output, "utf8");

  console.log(`기본 결과표 데이터 갱신 완료: ${newDataset.periodLabel}`);
  console.log(`- 근태현황: ${attendancePath}`);
  console.log(`- 근무결과(상세): ${detailPath}`);
  console.log(`- 보존된 월: ${merged.map((dataset) => dataset.periodLabel).join(", ")}`);
  console.log(`- 출력 파일: ${outputPath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
