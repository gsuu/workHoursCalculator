// Excel 원본 없이 기존 preloadedMonthlyWorkers.js 를 다시 계산한다.
//
// 계산/추론/플래그 로직(monthlyAttendanceImport.js)을 고친 뒤 사전계산(preloaded) 데이터에
// 반영하기 위한 마이그레이션 도구. App.vue 는 런타임 재계산을 하지 않고 이 파일 값을 그대로
// 표시하므로, 로직 수정만으로는 화면이 바뀌지 않는다. 이 스크립트로 데이터를 재생성해야 한다.
//
// 동작:
//  - 각 dailyRecord 의 raw 펀치(recordedStart/recordedEnd) + 상세표 값(detail*) + 규칙(detailRuleText)
//    으로 attendance records / detailRules / detailEmployees 를 복원해 assembleMonthlyResult 로 재계산.
//  - issueText 가 있는 기록(수기 확인 등)은 규칙 텍스트가 충실히 복원되지 않으므로(역전 펀치가
//    21시간 교대처럼 왜곡됨) 재계산하지 않고 원본 그대로 보존한다.
//
// 충실성 확인: 로직을 바꾸기 전에 한번 돌리면 원본과 zero diff 가 나와야 한다(복원이 정확하다는 증거).
//
// 사용: node scripts/regenerate-preloaded-from-existing.mjs [--output src/preloadedMonthlyWorkers.js]

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { assembleMonthlyResult } from "../src/monthlyAttendanceImport.js";

const OUTPUT_DEFAULT = "src/preloadedMonthlyWorkers.js";

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`값이 필요합니다: --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
};

const isIssueRecord = (record) => Boolean(record.issueText);

const reconstructInputs = (dataset) => {
  const detailEmployees = new Map();
  const detailRules = new Map();
  const records = [];

  for (const worker of dataset.workers) {
    detailEmployees.set(worker.employeeId, {
      employeeId: worker.employeeId,
      name: worker.name,
      part: worker.part
    });

    for (const record of worker.dailyRecords) {
      // issue 기록은 규칙 텍스트가 없어 충실히 재실행할 수 없다 → 보존(아래 mergePreservedIssues).
      if (isIssueRecord(record)) continue;

      const key = `${worker.employeeId}:${record.date}`;
      detailRules.set(key, {
        ruleText: record.detailRuleText ?? "",
        overtimeMinutes: record.detailOvertimeMinutes ?? 0,
        nightMinutes: record.detailNightMinutes ?? 0,
        holidayMinutes: record.detailHolidayMinutes ?? 0
      });

      // raw 펀치(recordedStart/recordedEnd)를 입력으로 쓴다. start/end 는 이미 보정된 값이라 사용 금지.
      records.push({
        employeeId: worker.employeeId,
        name: worker.name,
        part: worker.part,
        date: record.date,
        start: record.recordedStart ?? "",
        end: record.recordedEnd ?? "",
        halfLeaveLabel: record.halfLeaveLabel ?? "",
        halfLeavePosition: record.halfLeavePosition ?? ""
      });
    }
  }

  return { detailEmployees, detailRules, records };
};

const mergePreservedIssues = (regenWorkers, originalWorkers) => {
  const originalById = new Map(originalWorkers.map((worker) => [worker.employeeId, worker]));

  return regenWorkers.map((worker) => {
    const original = originalById.get(worker.employeeId);
    const issueRecords = (original?.dailyRecords ?? []).filter(isIssueRecord);
    if (!issueRecords.length) return worker;

    // 재계산된(비 issue) 날짜와 보존된 issue 날짜는 서로소이므로 단순 합집합 후 날짜순 정렬.
    const dailyRecords = [...worker.dailyRecords, ...issueRecords]
      .sort((left, right) => left.date.localeCompare(right.date));
    const issueDates = [...new Set([...(worker.issueDates ?? []), ...issueRecords.map((record) => record.date)])]
      .sort((left, right) => left.localeCompare(right));

    return {
      ...worker,
      issueCount: (worker.issueCount ?? 0) + issueRecords.length,
      issueDates,
      dailyRecords
    };
  });
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(args.output ?? OUTPUT_DEFAULT);

  const moduleUrl = `${pathToFileURL(outputPath).href}?t=${Date.now()}`;
  const existing = await import(moduleUrl);
  const datasets = existing.PRELOADED_MONTHLY_DATASETS;
  if (!Array.isArray(datasets) || !datasets.length) {
    throw new Error("기존 PRELOADED_MONTHLY_DATASETS 를 찾을 수 없습니다.");
  }

  const rebuilt = datasets.map((dataset) => {
    const { detailEmployees, detailRules, records } = reconstructInputs(dataset);
    const monthInfo = { year: dataset.monthInfo.year, month: dataset.monthInfo.month };
    const result = assembleMonthlyResult({
      detailEmployees,
      detailRules,
      records,
      monthInfo,
      sourceCount: records.length
    });
    const workers = mergePreservedIssues(result.workers, dataset.workers);
    return {
      periodLabel: dataset.periodLabel,
      monthInfo,
      workers
    };
  });

  const output = [
    `export const PRELOADED_MONTHLY_DATASETS = ${JSON.stringify(rebuilt, null, 2)};`,
    "",
    "const latest = PRELOADED_MONTHLY_DATASETS[PRELOADED_MONTHLY_DATASETS.length - 1] ?? null;",
    "",
    "export const PRELOADED_MONTHLY_PERIOD_LABEL = latest?.periodLabel ?? \"\";",
    "",
    "export const PRELOADED_MONTHLY_WORKERS = latest?.workers ?? [];",
    ""
  ].join("\n");

  await fs.writeFile(outputPath, output, "utf8");
  console.log(`재계산 완료: ${rebuilt.map((dataset) => dataset.periodLabel).join(", ")}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
