import test from "node:test";
import assert from "node:assert/strict";

import { validateDetailFile } from "./monthlyAttendanceImport.js";

const createWorkbookFile = async (sheets, name = "test.xls") => {
  const { default: XLSX } = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  for (const [sheetName, rows] of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xls" });

  return {
    name,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
};

test("근무결과 상세 검증은 근태현황과 사용자 목록이 다르면 실패한다", async () => {
  const detailFile = await createWorkbookFile([
    ["Sheet1", [
      ["(안내)"],
      ["- 연장근무: 정해진 소정근무시간을 초과하는 근무시간"],
      ["- 야간근무: 오후 10시부터 다음 날 오전 6시 사이에 근무한 시간"]
    ]],
    ["Sheet2", [
      ["이름", "홍길동", "", "", "", ""],
      ["사번", "CT9999", "", "", "", ""],
      ["소속", "CTTD", "", "", "", ""],
      ["날짜", "규칙", "소정", "연장", "야간", "휴일"],
      ["1(일)", "휴일", "00:00:00", "00:00:00", "00:00:00", "00:00:00"],
      ["2(월)", "9시출근", "08:00:00", "00:00:00", "00:00:00", "00:00:00"]
    ]]
  ]);

  await assert.rejects(
    () => validateDetailFile(detailFile, { year: 2026, month: 3 }, new Set(["CT1001"])),
    /사용자 정보가 일치하지 않습니다/
  );
});
