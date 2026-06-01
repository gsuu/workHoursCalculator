import test from "node:test";
import assert from "node:assert/strict";

import {
  assembleMonthlyResult,
  hasApprovedOvertime,
  inferDefaultEndTime,
  inferScheduledEndTimeFromRule,
  inferScheduledShiftLabelFromRule,
  inferScheduledStartTimeFromRule,
  isUnapprovedRangeInvalid,
  validateAttendanceRows,
  validateDetailRows,
  shouldIgnoreUnapprovedRecord,
  shouldUseScheduledRangeForUnapprovedRecord,
  resolveRecordedEndTime,
  resolveRecordedStartTime
} from "./monthlyAttendanceImport.js";

test("8시대 출근은 17:00 퇴근으로 간주한다", () => {
  assert.equal(inferDefaultEndTime("08:00"), "17:00");
  assert.equal(inferDefaultEndTime("08:31"), "17:00");
});

test("9시대와 10시대 출근은 각각 18:00, 19:00 퇴근으로 간주한다", () => {
  assert.equal(inferDefaultEndTime("09:15"), "18:00");
  assert.equal(inferDefaultEndTime("10:59"), "19:00");
});

test("규칙에서 정시 출근과 정시 퇴근 시각을 읽는다", () => {
  assert.equal(inferScheduledStartTimeFromRule("8시출근"), "08:00");
  assert.equal(inferScheduledStartTimeFromRule("9시출근"), "09:00");
  assert.equal(inferScheduledStartTimeFromRule("10시출근"), "10:00");
  assert.equal(inferScheduledEndTimeFromRule("8시출근"), "17:00");
  assert.equal(inferScheduledEndTimeFromRule("9시출근"), "18:00");
  assert.equal(inferScheduledEndTimeFromRule("10시출근"), "19:00");
});

test("30분 단위 출근 규칙(9시30분출근)도 근무 시간대를 읽는다", () => {
  assert.equal(inferScheduledStartTimeFromRule("9시30분출근"), "09:30");
  assert.equal(inferScheduledEndTimeFromRule("9시30분출근"), "18:30");
  assert.equal(inferScheduledShiftLabelFromRule("9시30분출근"), "9시30분출근");
  assert.equal(inferScheduledStartTimeFromRule("8시30분출근"), "08:30");
  assert.equal(inferScheduledEndTimeFromRule("8시30분출근"), "17:30");
});

test("출근 규칙이 없으면 빈 문자열을 반환한다", () => {
  assert.equal(inferScheduledStartTimeFromRule("자율출퇴근"), "");
  assert.equal(inferScheduledEndTimeFromRule("자율출퇴근"), "");
  assert.equal(inferScheduledShiftLabelFromRule(""), "");
});

test("단축근무 범위 규칙을 근무 시간대로 읽는다", () => {
  assert.equal(inferScheduledStartTimeFromRule("단축근무 9-16시"), "09:00");
  assert.equal(inferScheduledEndTimeFromRule("단축근무 9-16시"), "16:00");
  assert.equal(inferScheduledShiftLabelFromRule("단축근무 9-16시"), "단축근무 9-16시");
  assert.equal(inferScheduledStartTimeFromRule("단축근무10-17시"), "10:00");
  assert.equal(inferScheduledEndTimeFromRule("단축근무10-17시"), "17:00");
});

test("자율출퇴근은 출근 시각 기준 8시간(+점심) 근무로 보고 미승인 연장을 자른다", () => {
  // 14시 이전 출근 → 1시간 점심 인정 (출근 + 9시간)
  assert.equal(resolveRecordedEndTime({ start: "09:00", end: "22:00", ruleText: "자율출퇴근" }), "18:00");
  // 14시 이후 출근 → 점심 없음 (출근 + 8시간)
  assert.equal(resolveRecordedEndTime({ start: "15:00", end: "23:30", ruleText: "자율출퇴근" }), "23:00");
  // 정시 내 퇴근은 그대로 유지
  assert.equal(resolveRecordedEndTime({ start: "10:00", end: "17:00", ruleText: "자율출퇴근" }), "17:00");
  // 자율출퇴근은 이른 출근도 그대로(스케줄 시작을 출근 시각으로 본다)
  assert.equal(resolveRecordedStartTime({ start: "07:30", ruleText: "자율출퇴근" }), "07:30");
});

test("오후 반차처럼 늦게 출근하고 퇴근이 없으면 규칙상 퇴근 시각을 적용한다", () => {
  assert.equal(
    resolveRecordedEndTime({
      start: "14:00",
      end: "",
      ruleText: "9시출근"
    }),
    "18:00"
  );
});

test("미신청 평일은 이른 출근을 정시 출근으로 보정한다", () => {
  assert.equal(
    resolveRecordedStartTime({
      start: "08:00",
      ruleText: "9시출근",
      approvedOvertimeMinutes: 0,
      approvedNightMinutes: 0,
      approvedHolidayMinutes: 0
    }),
    "09:00"
  );
});

test("미신청 평일은 늦은 퇴근을 정시 퇴근으로 보정한다", () => {
  assert.equal(
    resolveRecordedEndTime({
      start: "09:00",
      end: "20:00",
      ruleText: "9시출근",
      approvedOvertimeMinutes: 0,
      approvedNightMinutes: 0,
      approvedHolidayMinutes: 0
    }),
    "18:00"
  );
});

test("승인된 연장 또는 야간이 있으면 실제 출퇴근 시각을 유지한다", () => {
  assert.equal(
    resolveRecordedStartTime({
      start: "08:00",
      ruleText: "9시출근",
      approvedOvertimeMinutes: 60,
      approvedNightMinutes: 0,
      approvedHolidayMinutes: 0
    }),
    "08:00"
  );

  assert.equal(
    resolveRecordedEndTime({
      start: "09:00",
      end: "20:00",
      ruleText: "9시출근",
      approvedOvertimeMinutes: 60,
      approvedNightMinutes: 0,
      approvedHolidayMinutes: 0
    }),
    "19:00"
  );
});

test("승인된 총 시간보다 실제 퇴근이 더 늦으면 계산은 승인 종료 시각까지만 반영한다", () => {
  assert.equal(
    resolveRecordedEndTime({
      start: "09:09",
      end: "23:35",
      ruleText: "9시출근",
      approvedOvertimeMinutes: 150,
      approvedNightMinutes: 30,
      approvedHolidayMinutes: 0
    }),
    "21:00"
  );
});

test("미신청인데 비정상 출근 기록이면 정시 출퇴근으로 보정한다", () => {
  assert.equal(
    shouldUseScheduledRangeForUnapprovedRecord({
      start: "18:10",
      end: "18:32",
      ruleText: "9시출근",
      approvedOvertimeMinutes: 0,
      approvedNightMinutes: 0,
      approvedHolidayMinutes: 0
    }),
    true
  );

  assert.equal(
    shouldUseScheduledRangeForUnapprovedRecord({
      start: "00:00",
      end: "00:00",
      ruleText: "9시출근",
      approvedOvertimeMinutes: 0,
      approvedNightMinutes: 0,
      approvedHolidayMinutes: 0
    }),
    true
  );
});

test("미신청 평일에서 보정 후 퇴근이 출근보다 이르면 수기 확인 대상으로 본다", () => {
  assert.equal(
    isUnapprovedRangeInvalid({
      start: "18:29",
      end: "18:00",
      ruleText: "9시출근",
      approvedOvertimeMinutes: 0,
      approvedNightMinutes: 0,
      approvedHolidayMinutes: 0
    }),
    true
  );
});

test("정시 출퇴근으로 보정되면 더 이상 이상치가 아니다", () => {
  assert.equal(
    isUnapprovedRangeInvalid({
      start: "09:00",
      end: "18:00",
      ruleText: "9시출근",
      approvedOvertimeMinutes: 0,
      approvedNightMinutes: 0,
      approvedHolidayMinutes: 0
    }),
    false
  );
});

test("미신청 자율출퇴근에서 퇴근이 출근보다 이르면 수기 확인 대상으로 본다", () => {
  // 자율출퇴근은 출근 시각 기준 근무시간대가 잡히므로 역전된 펀치(09:02 < 13:53)는 이상치다
  assert.equal(
    isUnapprovedRangeInvalid({ start: "13:53", end: "09:02", ruleText: "자율출퇴근" }),
    true
  );
  // 고정 근무시간대가 없는 휴일근무의 짧은 야간 교대(23:30~00:30)는 이상치로 보지 않는다
  assert.equal(
    isUnapprovedRangeInvalid({ start: "23:30", end: "00:30", ruleText: "휴일근무" }),
    false
  );
});

test("승인값이 없는 00:00 ~ 00:00 기록은 계산에서 제외한다", () => {
  assert.equal(
    shouldIgnoreUnapprovedRecord({
      start: "00:00",
      end: "00:00",
      approvedOvertimeMinutes: 0,
      approvedNightMinutes: 0,
      approvedHolidayMinutes: 0
    }),
    true
  );

  assert.equal(
    shouldIgnoreUnapprovedRecord({
      start: "00:00",
      end: "00:00",
      approvedOvertimeMinutes: 30,
      approvedNightMinutes: 0,
      approvedHolidayMinutes: 0
    }),
    false
  );
});

test("연장근무 일수는 상세표 승인값이 있을 때만 집계한다", () => {
  assert.equal(hasApprovedOvertime(null), false);
  assert.equal(
    hasApprovedOvertime({
      overtimeMinutes: 0,
      nightMinutes: 0,
      holidayMinutes: 0
    }),
    false
  );
  assert.equal(
    hasApprovedOvertime({
      overtimeMinutes: 30,
      nightMinutes: 0,
      holidayMinutes: 0
    }),
    true
  );
  assert.equal(
    hasApprovedOvertime({
      overtimeMinutes: 0,
      nightMinutes: 0,
      holidayMinutes: 60
    }),
    true
  );
});

test("임신기 단축근무 지정 사번의 단축근무 승인연장일은 자동집계 대신 수기 확인으로 표시한다", () => {
  const detailEmployees = new Map([
    ["CT19040030", { employeeId: "CT19040030", name: "박진아", part: "테스트" }]
  ]);
  const detailRules = new Map([
    ["CT19040030:2026-03-16", { ruleText: "단축근무10-17시", overtimeMinutes: 180, nightMinutes: 0, holidayMinutes: 0 }]
  ]);
  const records = [
    { employeeId: "CT19040030", name: "박진아", part: "테스트", date: "2026-03-16", start: "09:52", end: "20:04", halfLeaveLabel: "", halfLeavePosition: "" }
  ];

  const { workers } = assembleMonthlyResult({
    detailEmployees,
    detailRules,
    records,
    monthInfo: { year: 2026, month: 3 },
    sourceCount: records.length
  });

  assert.equal(workers[0].overtimeMinutes, 0);
  assert.equal(workers[0].issueCount, 1);
  assert.equal(workers[0].dailyRecords[0].issueText, "단축근무 수기확인");
});

test("지정되지 않은 사번은 동일한 단축근무 승인연장이어도 정상 자동집계한다", () => {
  const detailEmployees = new Map([
    ["CT00000000", { employeeId: "CT00000000", name: "대조군", part: "테스트" }]
  ]);
  const detailRules = new Map([
    ["CT00000000:2026-03-16", { ruleText: "단축근무10-17시", overtimeMinutes: 180, nightMinutes: 0, holidayMinutes: 0 }]
  ]);
  const records = [
    { employeeId: "CT00000000", name: "대조군", part: "테스트", date: "2026-03-16", start: "09:52", end: "20:04", halfLeaveLabel: "", halfLeavePosition: "" }
  ];

  const { workers } = assembleMonthlyResult({
    detailEmployees,
    detailRules,
    records,
    monthInfo: { year: 2026, month: 3 },
    sourceCount: records.length
  });

  assert.equal(workers[0].issueCount, 0);
  assert.ok(workers[0].overtimeMinutes > 0);
});

test("근태현황 검증은 근무결과(상세) 형식 파일을 거부한다", () => {
  const detailLikeRows = [
    ["(안내)"],
    ["- 연장근무: 정해진 소정근무시간을 초과하는 근무시간"],
    ["- 야간근무: 오후 10시부터 다음 날 오전 6시 사이에 근무한 시간"],
    [],
    [],
    []
  ];

  assert.throws(
    () => validateAttendanceRows(detailLikeRows),
    /근태현황 파일 형식이 아닙니다/
  );
});

test("근무결과(상세) 검증은 근태현황 형식 파일을 거부한다", () => {
  const attendanceLikeRows = [
    ["이름", "사번", "소속", "", "", "", "", "", "2026년3월"],
    ["", "", "", "", "", "", "", "", "1", "2"],
    ["", "", "", "", "", "", "", "", "일", "월"],
    ["홍길동", "CT0001", "UXUI", "", "", "", "", "출근", "09:00:00(O)", "09:00:00(O)"]
  ];

  assert.throws(
    () => validateDetailRows(attendanceLikeRows),
    /근무결과\(상세\) 파일 형식이 아닙니다/
  );
});
