import test from "node:test";
import assert from "node:assert/strict";

import { calculateEntry, calculateSummaryStats } from "./overtimeCalculator.js";

const buildView = (entry) => ({
  entry,
  ...calculateEntry(entry)
});

test("평일 기본 근무는 점심 60분 차감 후 정규 근무로 계산된다", () => {
  const result = calculateEntry({
    date: "2026-04-15",
    start: "09:00",
    end: "18:00"
  });

  assert.equal(result.error, "");
  assert.equal(result.workMode, "ordinary");
  assert.equal(result.total, 480);
  assert.equal(result.weighted, 480);
  assert.equal(result.weekday150, 0);
  assert.equal(result.weekday200, 0);
  assert.equal(result.lunchBreakApplied, true);
});

test("평일 연장 근무는 150% 구간으로 집계된다", () => {
  const result = calculateEntry({
    date: "2026-04-15",
    start: "09:00",
    end: "23:00"
  });

  assert.equal(result.error, "");
  assert.equal(result.total, 780);
  assert.equal(result.weighted, 960);
  assert.equal(result.weekday150, 240);
  assert.equal(result.weekday200, 60);
});

test("평일 야간 연장 근무는 150%와 200%가 분리 계산된다", () => {
  const result = calculateEntry({
    date: "2026-04-15",
    start: "18:00",
    end: "06:00"
  });

  assert.equal(result.error, "");
  assert.equal(result.total, 720);
  assert.equal(result.weighted, 1080);
  assert.equal(result.weekday150, 240);
  assert.equal(result.weekday200, 240);
  assert.equal(result.lunchBreakApplied, false);
});

test("휴일 8시간 근무는 150% 환산으로 계산된다", () => {
  const result = calculateEntry({
    date: "2026-05-05",
    start: "09:00",
    end: "18:00"
  });

  assert.equal(result.error, "");
  assert.equal(result.workMode, "holiday");
  assert.equal(result.total, 480);
  assert.equal(result.weighted, 720);
  assert.equal(result.weekendHolidayWeighted, 720);
});

test("휴일 야간 포함 근무는 휴일 기준 가산으로 계산된다", () => {
  const result = calculateEntry({
    date: "2026-05-05",
    start: "18:00",
    end: "06:00"
  });

  assert.equal(result.error, "");
  assert.equal(result.total, 720);
  assert.equal(result.weighted, 1440);
  assert.equal(result.weekendHolidayWeighted, 1440);
});

test("토요일은 휴무일로 분류된다", () => {
  const result = calculateEntry({
    date: "2026-04-18",
    start: "09:00",
    end: "18:00"
  });

  assert.equal(result.error, "");
  assert.equal(result.workMode, "offday");
  assert.equal(result.total, 480);
  assert.equal(result.weekendHolidayWeighted, 480);
});

test("점심시간을 포함하지 않는 근무는 자동 휴게가 적용되지 않는다", () => {
  const result = calculateEntry({
    date: "2026-04-15",
    start: "14:00",
    end: "18:00"
  });

  assert.equal(result.error, "");
  assert.equal(result.total, 240);
  assert.equal(result.lunchBreakApplied, false);
});

test("시간 형식이 잘못되면 오류를 반환한다", () => {
  const result = calculateEntry({
    date: "2026-04-15",
    start: "9",
    end: "18:00"
  });

  assert.notEqual(result.error, "");
  assert.equal(result.total, 0);
});

test("날짜가 없으면 오류를 반환한다", () => {
  const result = calculateEntry({
    date: "",
    start: "09:00",
    end: "18:00"
  });

  assert.notEqual(result.error, "");
  assert.equal(result.total, 0);
});

test("출근과 퇴근 시간이 같으면 오입력으로 처리한다", () => {
  const result = calculateEntry({
    date: "2026-04-15",
    start: "18:00",
    end: "18:00"
  });

  assert.equal(result.error, "출근과 퇴근 시간이 같을 수 없습니다.");
  assert.equal(result.total, 0);
});

test("심야만 포함된 짧은 익일 근무도 평일 야간으로 계산된다", () => {
  const result = calculateEntry({
    date: "2026-04-15",
    start: "23:00",
    end: "01:00"
  });

  assert.equal(result.error, "");
  assert.equal(result.total, 120);
  assert.equal(result.weighted, 180);
  assert.equal(result.weekday150, 120);
  assert.equal(result.weekday200, 0);
});

test("11:30~12:30만 근무하면 점심시간과 겹쳐 실근로 0분이 된다", () => {
  const result = calculateEntry({
    date: "2026-04-15",
    start: "11:30",
    end: "12:30"
  });

  assert.equal(result.error, "");
  assert.equal(result.total, 0);
  assert.equal(result.weighted, 0);
  assert.equal(result.lunchBreakApplied, true);
});

test("공휴일 날짜는 자동으로 휴일로 판정된다", () => {
  const result = calculateEntry({
    date: "2027-10-11",
    start: "09:00",
    end: "18:00"
  });

  assert.equal(result.error, "");
  assert.equal(result.workMode, "holiday");
  assert.equal(result.weekendHolidayWeighted, 720);
});

test("존재하지 않는 시간은 오류를 반환한다", () => {
  const result = calculateEntry({
    date: "2026-04-15",
    start: "24:00",
    end: "25:00"
  });

  assert.notEqual(result.error, "");
  assert.equal(result.total, 0);
});

test("합계 통계는 평일 150/200과 휴일 환산을 정확히 누적한다", () => {
  const views = [
    buildView({ date: "2026-04-15", start: "09:00", end: "23:00" }),
    buildView({ date: "2026-04-15", start: "18:00", end: "06:00" }),
    buildView({ date: "2026-05-05", start: "09:00", end: "18:00" })
  ];

  const summary = calculateSummaryStats(views);

  assert.equal(summary.weekday150Minutes, 480);
  assert.equal(summary.weekday200Minutes, 300);
  assert.equal(summary.weekendHolidayWeightedMinutes, 720);
  assert.equal(summary.weekday150Hours, 8);
  assert.equal(summary.weekday150RemainMinutes, 0);
  assert.equal(summary.weekday200Hours, 5);
  assert.equal(summary.weekday200RemainMinutes, 0);
  assert.equal(summary.weekday150Count, 2);
  assert.equal(summary.weekday200Count, 2);
  assert.equal(summary.weekendHolidayCount, 1);
  assert.equal(summary.weekendHolidayWeightedText, "12.00");
});
