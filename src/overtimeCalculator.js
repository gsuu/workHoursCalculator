const DAY_MINUTES = 1440;
const DAILY_LIMIT = 480;
const WEEKLY_LIMIT = 2400;
const LUNCH_START = 690;
const LUNCH_END = 750;

export const HOLIDAY_SET = new Set([
  "2025-01-01",
  "2025-01-27",
  "2025-01-28",
  "2025-01-29",
  "2025-01-30",
  "2025-03-01",
  "2025-03-03",
  "2025-05-05",
  "2025-05-06",
  "2025-06-06",
  "2025-08-15",
  "2025-10-03",
  "2025-10-05",
  "2025-10-06",
  "2025-10-07",
  "2025-10-08",
  "2025-10-09",
  "2025-12-25",
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-03-01",
  "2026-03-02",
  "2026-05-01",
  "2026-05-05",
  "2026-05-24",
  "2026-05-25",
  "2026-06-06",
  "2026-07-17",
  "2026-08-15",
  "2026-08-17",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-10-03",
  "2026-10-05",
  "2026-10-09",
  "2026-12-25",
  "2027-01-01",
  "2027-02-06",
  "2027-02-07",
  "2027-02-08",
  "2027-02-09",
  "2027-03-01",
  "2027-05-05",
  "2027-05-13",
  "2027-06-06",
  "2027-07-17",
  "2027-08-15",
  "2027-08-16",
  "2027-09-14",
  "2027-09-15",
  "2027-09-16",
  "2027-10-03",
  "2027-10-04",
  "2027-10-09",
  "2027-10-11",
  "2027-12-25",
  "2027-12-27"
]);

export const toTimeMinutes = (value) => {
  if (!value || !value.includes(":")) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

export const formatHourMinute = (minutes) => {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}시간 ${safe % 60}분`;
};

export const formatWeightedHours = (minutes) => (minutes / 60).toFixed(2);

export const parseDateValue = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getDateKey = (value) => {
  const date = value instanceof Date ? value : parseDateValue(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatDateOnly = (value) => getDateKey(value);

export const getCalendarDayKind = (date) => {
  const key = getDateKey(date);
  if (!key) return "";
  if (HOLIDAY_SET.has(key)) return "holiday";
  const day = date.getDay();
  if (day === 0) return "sunday";
  if (day === 6) return "saturday";
  return "";
};

export const getWorkTypeMeta = (value) => {
  const date = parseDateValue(value);
  if (!date) return null;

  const day = date.getDay();

  if (day === 0 || HOLIDAY_SET.has(value)) {
    return {
      mode: "holiday",
      label: "휴일",
      description: "일요일과 공휴일은 휴일 기준으로 계산합니다."
    };
  }

  if (day === 6) {
    return {
      mode: "offday",
      label: "휴무일",
      description: "토요일은 휴무일 근무 기준으로 계산합니다."
    };
  }

  return {
    mode: "ordinary",
    label: "평일",
    description: "평일 근무 기준으로 계산합니다."
  };
};

export const getWorkTypeMetaByMode = (mode) => {
  if (mode === "holiday") {
    return {
      mode: "holiday",
      label: "휴일",
      description: "일요일과 공휴일은 휴일 기준으로 계산합니다."
    };
  }

  if (mode === "offday") {
    return {
      mode: "offday",
      label: "휴무일",
      description: "토요일은 휴무일 근무 기준으로 계산합니다."
    };
  }

  return {
    mode: "ordinary",
    label: "평일",
    description: "평일 근무 기준으로 계산합니다."
  };
};

export const isNightMinute = (minute) => {
  const normalized = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return normalized >= 1320 || normalized < 360;
};

export const getShiftWindow = (start, end) => {
  const nextDay = end <= start;
  const finish = nextDay ? end + DAY_MINUTES : end;
  return {
    start,
    end: finish,
    raw: finish - start,
    nextDay
  };
};

export const buildIntervals = (start, end) => {
  const points = [start, end];

  for (
    let day = Math.floor(start / DAY_MINUTES) - 1;
    day <= Math.floor(end / DAY_MINUTES) + 1;
    day += 1
  ) {
    const nightStart = day * DAY_MINUTES + 1320;
    const nightEnd = day * DAY_MINUTES + 1800;
    if (nightStart > start && nightStart < end) points.push(nightStart);
    if (nightEnd > start && nightEnd < end) points.push(nightEnd);
  }

  const sorted = [...new Set(points)].sort((a, b) => a - b);

  return sorted
    .slice(0, -1)
    .map((point, index) => {
      const next = sorted[index + 1];
      if (next <= point) return null;

      return {
        start: point,
        end: next,
        tag: isNightMinute((point + next) / 2) ? "night" : "day"
      };
    })
    .filter(Boolean);
};

export const getAutomaticBreakMinutes = (start, end) => {
  for (
    let day = Math.floor(start / DAY_MINUTES);
    day <= Math.floor((end - 1) / DAY_MINUTES);
    day += 1
  ) {
    const lunchStart = day * DAY_MINUTES + LUNCH_START;
    const lunchEnd = day * DAY_MINUTES + LUNCH_END;
    if (start <= lunchStart && end >= lunchEnd) return 60;
  }

  return 0;
};

export const getLunchBreakState = (start, end) => {
  if (start === null || end === null) {
    return {
      applied: false,
      label: "11:30~12:30"
    };
  }

  const shift = getShiftWindow(start, end);
  const applied = getAutomaticBreakMinutes(shift.start, shift.end) === 60;

  return {
    applied,
    label: applied ? "11:30~12:30 자동 차감" : "점심 휴게 미포함"
  };
};

export const applyBreak = (intervals, breakMinutes) => {
  const adjusted = intervals.map((interval) => ({ ...interval }));
  let remaining = breakMinutes;

  for (const tag of ["day", "night"]) {
    for (const interval of adjusted) {
      if (remaining <= 0) break;
      if (interval.tag !== tag) continue;

      const length = interval.end - interval.start;
      const used = Math.min(length, remaining);
      interval.start += used;
      remaining -= used;
    }
  }

  return adjusted.filter((interval) => interval.end > interval.start);
};

export const sumIntervals = (intervals) =>
  intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);

export const classifyHoliday = (intervals) => {
  let remainingDaily = DAILY_LIMIT;
  let dayWithin = 0;
  let nightWithin = 0;
  let dayOver = 0;
  let nightOver = 0;

  for (const interval of intervals) {
    const length = interval.end - interval.start;
    const within = Math.min(length, remainingDaily);
    const over = length - within;

    if (interval.tag === "night") {
      nightWithin += within;
      nightOver += over;
    } else {
      dayWithin += within;
      dayOver += over;
    }

    remainingDaily = Math.max(remainingDaily - within, 0);
  }

  const weighted = dayWithin * 1.5 + (nightWithin + dayOver) * 2 + nightOver * 2.5;

  return {
    total: dayWithin + nightWithin + dayOver + nightOver,
    weighted,
    weekday150: 0,
    weekday200: 0,
    weekendHolidayWeighted: weighted,
    overtimeTotal: 0,
    nightTotal: nightWithin + nightOver,
    holidayWorkMinutes: dayWithin + nightWithin + dayOver + nightOver,
    leaveGrantMinutes: weighted,
    holidayOvertimeMinutes: dayWithin + dayOver,
    holidayNightMinutes: nightWithin + nightOver,
    holidayOvertimeGrantMinutes: dayWithin * 1.5 + dayOver * 2,
    holidayNightGrantMinutes: nightWithin * 2 + nightOver * 2.5
  };
};

export const classifyNormal = (intervals, priorWeekMinutes, mode) => {
  const total = sumIntervals(intervals);
  const overtime = Math.min(
    total,
    Math.max(Math.max(total - DAILY_LIMIT, 0), Math.max(priorWeekMinutes + total - WEEKLY_LIMIT, 0))
  );

  let regularRemain = total - overtime;
  let regularDay = 0;
  let regularNight = 0;
  let overtimeDay = 0;
  let overtimeNight = 0;

  for (const interval of intervals) {
    const length = interval.end - interval.start;
    const regular = Math.min(length, regularRemain);
    const over = length - regular;

    if (interval.tag === "night") {
      regularNight += regular;
      overtimeNight += over;
    } else {
      regularDay += regular;
      overtimeDay += over;
    }

    regularRemain = Math.max(regularRemain - regular, 0);
  }

  const ordinaryGrant = (regularNight + overtimeDay) * 1.5 + overtimeNight * 2;
  const offdayGrant = (regularDay + overtimeDay) * 1.5 + (regularNight + overtimeNight) * 2;
  const weighted = mode === "offday"
    ? offdayGrant
    : regularDay * 1 + ordinaryGrant;

  return {
    total,
    weighted,
    weekday150: mode === "ordinary" ? regularNight + overtimeDay : 0,
    weekday200: mode === "ordinary" ? overtimeNight : 0,
    weekendHolidayWeighted: mode === "ordinary" ? 0 : weighted,
    overtimeTotal: mode === "ordinary" ? overtimeDay + overtimeNight : 0,
    nightTotal: regularNight + overtimeNight,
    holidayWorkMinutes: mode === "ordinary" ? 0 : total,
    leaveGrantMinutes: mode === "ordinary" ? ordinaryGrant : weighted,
    holidayOvertimeMinutes: mode === "ordinary" ? 0 : regularDay + overtimeDay,
    holidayNightMinutes: mode === "ordinary" ? 0 : regularNight + overtimeNight,
    holidayOvertimeGrantMinutes: mode === "ordinary" ? 0 : (regularDay + overtimeDay) * 1.5,
    holidayNightGrantMinutes: mode === "ordinary" ? 0 : (regularNight + overtimeNight) * 2
  };
};

export const calculateEntry = (entry, priorWeekMinutes = 0) => {
  const meta = entry.workModeOverride
    ? getWorkTypeMetaByMode(entry.workModeOverride)
    : getWorkTypeMeta(entry.date);
  const blankView = {
    error: "",
    total: 0,
    weighted: 0,
    weekday150: 0,
    weekday200: 0,
    weekendHolidayWeighted: 0,
    overtimeTotal: 0,
    nightTotal: 0,
    holidayWorkMinutes: 0,
    leaveGrantMinutes: 0,
    holidayOvertimeMinutes: 0,
    holidayNightMinutes: 0,
    holidayOvertimeGrantMinutes: 0,
    holidayNightGrantMinutes: 0,
    workMode: meta?.mode ?? null,
    workModeLabel: meta?.label ?? "",
    workModeDescription: meta?.description ?? "",
    lunchBreakApplied: false,
    lunchBreakLabel: "11:30~12:30"
  };

  try {
    const start = toTimeMinutes(entry.start);
    const end = toTimeMinutes(entry.end);
    const lunchBreak = getLunchBreakState(start, end);

    if (!meta) throw new Error("날짜를 먼저 입력해 주세요.");
    if (start === null || end === null) {
      throw new Error("출근과 퇴근 시간은 HH:MM 형식으로 입력해 주세요.");
    }
    if (start === end) {
      throw new Error("출근과 퇴근 시간이 같을 수 없습니다.");
    }

    const shift = getShiftWindow(start, end);
    const breakMinutes = getAutomaticBreakMinutes(shift.start, shift.end);

    if (breakMinutes > shift.raw) {
      throw new Error("휴게시간이 전체 근무시간보다 길 수 없습니다.");
    }

    const worked = applyBreak(buildIntervals(shift.start, shift.end), breakMinutes);
    const result =
      meta.mode === "holiday"
        ? classifyHoliday(worked)
        : classifyNormal(worked, priorWeekMinutes, meta.mode);

    return {
      error: "",
      total: result.total,
      weighted: result.weighted,
      weekday150: result.weekday150,
      weekday200: result.weekday200,
      weekendHolidayWeighted: result.weekendHolidayWeighted,
      overtimeTotal: result.overtimeTotal,
      nightTotal: result.nightTotal,
      holidayWorkMinutes: result.holidayWorkMinutes,
      leaveGrantMinutes: result.leaveGrantMinutes,
      holidayOvertimeMinutes: result.holidayOvertimeMinutes,
      holidayNightMinutes: result.holidayNightMinutes,
      holidayOvertimeGrantMinutes: result.holidayOvertimeGrantMinutes,
      holidayNightGrantMinutes: result.holidayNightGrantMinutes,
      workMode: meta.mode,
      workModeLabel: meta.label,
      workModeDescription: meta.description,
      lunchBreakApplied: lunchBreak.applied,
      lunchBreakLabel: lunchBreak.label
    };
  } catch (error) {
    return {
      ...blankView,
      error: error instanceof Error ? error.message : "계산 중 오류가 발생했습니다."
    };
  }
};

export const calculateSummaryStats = (views) => {
  const stats = {
    weekday150Minutes: 0,
    weekday200Minutes: 0,
    weekendHolidayWeightedMinutes: 0,
    weekday150Count: 0,
    weekday200Count: 0,
    weekendHolidayCount: 0
  };

  for (const view of views) {
    if (!view.entry.date || view.error) continue;

    stats.weekday150Minutes += view.weekday150;
    stats.weekday200Minutes += view.weekday200;
    stats.weekendHolidayWeightedMinutes += view.weekendHolidayWeighted;

    if (view.weekday150 > 0) stats.weekday150Count += 1;
    if (view.weekday200 > 0) stats.weekday200Count += 1;
    if (view.weekendHolidayWeighted > 0) stats.weekendHolidayCount += 1;
  }

  return {
    ...stats,
    weekday150Hours: Math.floor(stats.weekday150Minutes / 60),
    weekday150RemainMinutes: Math.round(stats.weekday150Minutes % 60),
    weekday200Hours: Math.floor(stats.weekday200Minutes / 60),
    weekday200RemainMinutes: Math.round(stats.weekday200Minutes % 60),
    weekendHolidayWeightedText: formatWeightedHours(stats.weekendHolidayWeightedMinutes)
  };
};
