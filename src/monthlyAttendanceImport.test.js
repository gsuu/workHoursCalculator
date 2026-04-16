import test from "node:test";
import assert from "node:assert/strict";

import {
  hasApprovedOvertime,
  inferDefaultEndTime,
  inferScheduledEndTimeFromRule,
  resolveRecordedEndTime
} from "./monthlyAttendanceImport.js";

test("퇴근 누락 시 8시대 출근은 17:00 퇴근으로 간주한다", () => {
  assert.equal(inferDefaultEndTime("08:00"), "17:00");
  assert.equal(inferDefaultEndTime("08:31"), "17:00");
});

test("퇴근 누락 시 9시대 출근은 18:00, 10시대 출근은 19:00 퇴근으로 간주한다", () => {
  assert.equal(inferDefaultEndTime("09:15"), "18:00");
  assert.equal(inferDefaultEndTime("10:59"), "19:00");
});

test("8시대, 9시대, 10시대가 아니면 기본 퇴근시간을 추정하지 않는다", () => {
  assert.equal(inferDefaultEndTime("07:55"), "");
  assert.equal(inferDefaultEndTime("11:00"), "");
  assert.equal(inferDefaultEndTime(""), "");
  assert.equal(inferDefaultEndTime("9"), "");
});

test("상세표 규칙이 있으면 실제 출근시각보다 규칙 기준 퇴근시각을 우선 사용한다", () => {
  assert.equal(inferScheduledEndTimeFromRule("9시출근"), "18:00");
  assert.equal(
    resolveRecordedEndTime({
      start: "14:00",
      end: "",
      ruleText: "9시출근"
    }),
    "18:00"
  );
});

test("야근 신청이 없어 상세표 연장/야간이 0이면 늦은 퇴근도 정규 퇴근시각까지만 인정한다", () => {
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

test("상세표에 연장 또는 야간 신청이 있으면 실제 퇴근시각을 유지한다", () => {
  assert.equal(
    resolveRecordedEndTime({
      start: "09:00",
      end: "20:00",
      ruleText: "9시출근",
      approvedOvertimeMinutes: 60,
      approvedNightMinutes: 0,
      approvedHolidayMinutes: 0
    }),
    "20:00"
  );
});

test("연장근무 일수는 상세표 승인값이 있을 때만 1일로 본다", () => {
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
