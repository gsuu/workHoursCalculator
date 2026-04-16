import * as XLSX from "xlsx";

import { calculateEntry, parseDateValue, toTimeMinutes } from "./overtimeCalculator.js";

const ATTENDANCE_START_COLUMN = 8;
const DETAIL_GROUP_START_COLUMN = 1;
const DETAIL_GROUP_WIDTH = 6;

const normalizeText = (value) => String(value ?? "").trim();

const pickDataRows = (workbook) => {
  let bestRows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true
    });

    const width = rows.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
    const bestWidth = bestRows.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);

    if (width > bestWidth) {
      bestRows = rows;
    }
  }

  return bestRows;
};

const toRows = (arrayBuffer) => {
  const workbook = XLSX.read(arrayBuffer, {
    type: "array",
    cellDates: false
  });
  return pickDataRows(workbook);
};

const extractMonthInfo = (value) => {
  const compact = normalizeText(value).replace(/\s+/g, "");
  const match = compact.match(/(\d{4})\D*(\d{1,2})/);
  if (!match) {
    throw new Error("월 정보를 해석할 수 없습니다.");
  }

  return {
    year: Number(match[1]),
    month: Number(match[2])
  };
};

const formatImportDate = (year, month, day) =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const extractRecordedTime = (value) => {
  const text = normalizeText(value);
  if (!text || text === "-") return "";
  const match = text.match(/(\d{2}:\d{2})(?::\d{2})?/);
  return match ? match[1] : "";
};

export const inferDefaultEndTime = (start) => {
  const text = normalizeText(start);
  const match = text.match(/^(\d{2}):(\d{2})$/);
  if (!match) return "";

  const hour = Number(match[1]);
  if (hour === 8) return "17:00";
  if (hour === 9) return "18:00";
  if (hour === 10) return "19:00";
  return "";
};

export const inferScheduledStartTimeFromRule = (ruleText) => {
  const text = normalizeText(ruleText);
  if (text.includes("8시출근")) return "08:00";
  if (text.includes("9시출근")) return "09:00";
  if (text.includes("10시출근")) return "10:00";
  return "";
};

export const inferScheduledEndTimeFromRule = (ruleText) => {
  const text = normalizeText(ruleText);
  if (text.includes("8시출근")) return "17:00";
  if (text.includes("9시출근")) return "18:00";
  if (text.includes("10시출근")) return "19:00";
  return "";
};

const getScheduledRange = (ruleText) => ({
  start: inferScheduledStartTimeFromRule(ruleText),
  end: inferScheduledEndTimeFromRule(ruleText)
});

const parseDetailDurationMinutes = (value) => {
  const text = normalizeText(value);
  const match = text.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return 0;

  return Number(match[1]) * 60 + Number(match[2]);
};

const getApprovedMinutes = ({
  approvedOvertimeMinutes = 0,
  approvedNightMinutes = 0,
  approvedHolidayMinutes = 0
}) => approvedOvertimeMinutes + approvedNightMinutes + approvedHolidayMinutes;

export const shouldIgnoreUnapprovedRecord = ({
  start,
  end,
  approvedOvertimeMinutes = 0,
  approvedNightMinutes = 0,
  approvedHolidayMinutes = 0
}) => {
  const approvedMinutes = getApprovedMinutes({
    approvedOvertimeMinutes,
    approvedNightMinutes,
    approvedHolidayMinutes
  });

  if (approvedMinutes > 0) {
    return false;
  }

  return start === "00:00" && end === "00:00";
};

export const shouldUseScheduledRangeForUnapprovedRecord = ({
  start,
  end,
  ruleText,
  approvedOvertimeMinutes = 0,
  approvedNightMinutes = 0,
  approvedHolidayMinutes = 0
}) => {
  const approvedMinutes = getApprovedMinutes({
    approvedOvertimeMinutes,
    approvedNightMinutes,
    approvedHolidayMinutes
  });

  if (approvedMinutes > 0) {
    return false;
  }

  const scheduledRange = getScheduledRange(ruleText);
  if (!scheduledRange.start || !scheduledRange.end) {
    return false;
  }

  const startMinutes = toTimeMinutes(start);
  const endMinutes = toTimeMinutes(end);
  const scheduledEndMinutes = toTimeMinutes(scheduledRange.end);
  if (startMinutes == null || endMinutes == null || scheduledEndMinutes == null) {
    return false;
  }

  if (start === "00:00" && end === "00:00") {
    return true;
  }

  if (startMinutes === endMinutes) {
    return true;
  }

  return startMinutes >= scheduledEndMinutes;
};

export const resolveRecordedStartTime = ({
  start,
  ruleText,
  approvedOvertimeMinutes = 0,
  approvedNightMinutes = 0,
  approvedHolidayMinutes = 0
}) => {
  const scheduledStart = inferScheduledStartTimeFromRule(ruleText);
  const approvedMinutes = getApprovedMinutes({
    approvedOvertimeMinutes,
    approvedNightMinutes,
    approvedHolidayMinutes
  });

  if (!scheduledStart || approvedMinutes > 0) {
    return start;
  }

  const startMinutes = toTimeMinutes(start);
  const scheduledStartMinutes = toTimeMinutes(scheduledStart);
  if (startMinutes == null || scheduledStartMinutes == null) {
    return start;
  }

  return startMinutes < scheduledStartMinutes ? scheduledStart : start;
};

export const resolveRecordedEndTime = ({
  start,
  end,
  ruleText,
  approvedOvertimeMinutes = 0,
  approvedNightMinutes = 0,
  approvedHolidayMinutes = 0
}) => {
  const scheduledEnd = inferScheduledEndTimeFromRule(ruleText);
  const approvedMinutes = getApprovedMinutes({
    approvedOvertimeMinutes,
    approvedNightMinutes,
    approvedHolidayMinutes
  });

  if (!end) {
    return scheduledEnd || inferDefaultEndTime(start);
  }

  if (!scheduledEnd || approvedMinutes > 0) {
    return end;
  }

  const endMinutes = toTimeMinutes(end);
  const scheduledEndMinutes = toTimeMinutes(scheduledEnd);
  if (endMinutes == null || scheduledEndMinutes == null) {
    return end;
  }

  return endMinutes > scheduledEndMinutes ? scheduledEnd : end;
};

export const isUnapprovedRangeInvalid = ({
  start,
  end,
  ruleText,
  approvedOvertimeMinutes = 0,
  approvedNightMinutes = 0,
  approvedHolidayMinutes = 0
}) => {
  const approvedMinutes = getApprovedMinutes({
    approvedOvertimeMinutes,
    approvedNightMinutes,
    approvedHolidayMinutes
  });

  if (approvedMinutes > 0) {
    return false;
  }

  const scheduledRange = getScheduledRange(ruleText);
  const scheduledStart = scheduledRange.start;
  const scheduledEnd = scheduledRange.end;
  if (!scheduledStart || !scheduledEnd) {
    return false;
  }

  const startMinutes = toTimeMinutes(start);
  const endMinutes = toTimeMinutes(end);
  if (startMinutes == null || endMinutes == null) {
    return false;
  }

  return endMinutes <= startMinutes;
};

export const hasApprovedOvertime = (detail) =>
  Boolean(
    detail
    && (
      detail.overtimeMinutes > 0
      || detail.nightMinutes > 0
      || detail.holidayMinutes > 0
    )
  );

const parseAttendanceRows = (rows) => {
  const monthInfo = extractMonthInfo(rows[0]?.[8]);
  const records = new Map();

  for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 3) {
    const row = rows[rowIndex] ?? [];
    const leaveRow = rows[rowIndex + 1] ?? [];
    const name = normalizeText(row[0]);
    const employeeId = normalizeText(row[1]);

    if (!name || !employeeId) continue;

    for (let columnIndex = ATTENDANCE_START_COLUMN; columnIndex < row.length; columnIndex += 1) {
      const dayValue = Number.parseInt(normalizeText(rows[1]?.[columnIndex]), 10);
      if (!Number.isInteger(dayValue)) continue;

      const start = extractRecordedTime(row[columnIndex]);
      const end = extractRecordedTime(leaveRow[columnIndex]);
      if (!start && !end) continue;

      const date = formatImportDate(monthInfo.year, monthInfo.month, dayValue);
      records.set(`${employeeId}:${date}`, {
        employeeId,
        name,
        part: normalizeText(row[2]),
        date,
        start,
        end
      });
    }
  }

  return {
    monthInfo,
    records
  };
};

const parseDetailRows = (rows, monthInfo) => {
  const rules = new Map();
  const nameRow = rows[0] ?? [];
  const idRow = rows[1] ?? [];

  for (
    let columnIndex = DETAIL_GROUP_START_COLUMN;
    columnIndex < nameRow.length;
    columnIndex += DETAIL_GROUP_WIDTH
  ) {
    const employeeId = normalizeText(idRow[columnIndex]);
    if (!employeeId) continue;

    for (let rowIndex = 5; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const firstCell = normalizeText(row[0]);
      if (!firstCell) continue;
      if (firstCell.includes("총 합계")) break;

      const dayMatch = firstCell.match(/^(\d{1,2})/);
      if (!dayMatch) continue;

      const day = Number(dayMatch[1]);
      const date = formatImportDate(monthInfo.year, monthInfo.month, day);
      const ruleText = normalizeText(row[columnIndex]);
      const overtimeMinutes = parseDetailDurationMinutes(row[columnIndex + 2]);
      const nightMinutes = parseDetailDurationMinutes(row[columnIndex + 3]);
      const holiday150Minutes = parseDetailDurationMinutes(row[columnIndex + 4]);
      const holiday200Minutes = parseDetailDurationMinutes(row[columnIndex + 5]);
      if (!ruleText && !overtimeMinutes && !nightMinutes && !holiday150Minutes && !holiday200Minutes) continue;

      rules.set(`${employeeId}:${date}`, {
        ruleText,
        overtimeMinutes,
        nightMinutes,
        holidayMinutes: holiday150Minutes + holiday200Minutes
      });
    }
  }

  return rules;
};

const resolveWorkModeOverride = (date, ruleText) => {
  const parsedDate = parseDateValue(date);
  if (!parsedDate) return null;

  const text = normalizeText(ruleText);
  if (text.includes("휴무")) return "offday";
  if (text.includes("휴일") || text.includes("공휴일") || text.includes("대체공휴일")) return "holiday";

  const day = parsedDate.getDay();
  if (day === 0) return "holiday";
  if (day === 6) return "offday";
  return "ordinary";
};

const formatMinutesLabel = (minutes) => {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const remainMinutes = safe % 60;
  return `${hours}시간 ${remainMinutes}분`;
};

const floorToHalfHour = (minutes) => Math.floor(Math.max(0, minutes) / 30) * 30;
const appendIssueDate = (worker, date) => {
  if (!date) return;
  const issueDates = worker.issueDates ?? [];
  if (!issueDates.includes(date)) {
    issueDates.push(date);
  }
  worker.issueDates = issueDates;
};

export const parseMonthlyResultFiles = async ({ attendanceFile, detailFile }) => {
  if (!attendanceFile || !detailFile) {
    throw new Error("근태현황과 근무결과(상세) 파일이 모두 필요합니다.");
  }

  const [attendanceRows, detailRows] = await Promise.all([
    attendanceFile.arrayBuffer().then(toRows),
    detailFile.arrayBuffer().then(toRows)
  ]);

  const attendance = parseAttendanceRows(attendanceRows);
  const detailRules = parseDetailRows(detailRows, attendance.monthInfo);
  const workerMap = new Map();

  for (const record of attendance.records.values()) {
    const detail = detailRules.get(`${record.employeeId}:${record.date}`) ?? null;
    const ruleText = detail?.ruleText ?? "";
    const workModeOverride = resolveWorkModeOverride(record.date, ruleText);
    let start = resolveRecordedStartTime({
      start: record.start,
      ruleText,
      approvedOvertimeMinutes: detail?.overtimeMinutes ?? 0,
      approvedNightMinutes: detail?.nightMinutes ?? 0,
      approvedHolidayMinutes: detail?.holidayMinutes ?? 0
    });
    let end = resolveRecordedEndTime({
      start,
      end: record.end,
      ruleText,
      approvedOvertimeMinutes: detail?.overtimeMinutes ?? 0,
      approvedNightMinutes: detail?.nightMinutes ?? 0,
      approvedHolidayMinutes: detail?.holidayMinutes ?? 0
    });
    const current = workerMap.get(record.employeeId) ?? {
      employeeId: record.employeeId,
      name: record.name,
      part: record.part,
      div: "",
      rank: "",
      nightMinutes: 0,
      overtimeMinutes: 0,
      holidayOvertimeMinutes: 0,
      holidayNightMinutes: 0,
      holidayWorkMinutes: 0,
      holidayOvertimeGrantMinutes: 0,
      holidayNightGrantMinutes: 0,
      holidayGrantMinutes: 0,
      leaveGrantMinutes: 0,
      overtimeDayCount: 0,
      issueCount: 0,
      issueDates: []
    };

    if (
      shouldIgnoreUnapprovedRecord({
        start: record.start,
        end: record.end,
        approvedOvertimeMinutes: detail?.overtimeMinutes ?? 0,
        approvedNightMinutes: detail?.nightMinutes ?? 0,
        approvedHolidayMinutes: detail?.holidayMinutes ?? 0
      })
    ) {
      workerMap.set(record.employeeId, current);
      continue;
    }

    if (!start || !end) {
      current.issueCount += 1;
      appendIssueDate(current, record.date);
      workerMap.set(record.employeeId, current);
      continue;
    }

    if (
      shouldUseScheduledRangeForUnapprovedRecord({
        start,
        end,
        ruleText,
        approvedOvertimeMinutes: detail?.overtimeMinutes ?? 0,
        approvedNightMinutes: detail?.nightMinutes ?? 0,
        approvedHolidayMinutes: detail?.holidayMinutes ?? 0
      })
    ) {
      const scheduledRange = getScheduledRange(ruleText);
      start = scheduledRange.start;
      end = scheduledRange.end;
    }

    if (
      isUnapprovedRangeInvalid({
        start,
        end,
        ruleText,
        approvedOvertimeMinutes: detail?.overtimeMinutes ?? 0,
        approvedNightMinutes: detail?.nightMinutes ?? 0,
        approvedHolidayMinutes: detail?.holidayMinutes ?? 0
      })
    ) {
      current.issueCount += 1;
      appendIssueDate(current, record.date);
      workerMap.set(record.employeeId, current);
      continue;
    }

    const result = calculateEntry({
      date: record.date,
      start,
      end,
      workModeOverride
    });

    if (result.error) {
      current.issueCount += 1;
      appendIssueDate(current, record.date);
      workerMap.set(record.employeeId, current);
      continue;
    }

    current.nightMinutes += result.nightTotal;
    current.overtimeMinutes += result.overtimeTotal;
    current.holidayOvertimeMinutes += result.holidayOvertimeMinutes;
    current.holidayNightMinutes += result.holidayNightMinutes;
    current.holidayWorkMinutes += result.holidayWorkMinutes;
    current.holidayOvertimeGrantMinutes += result.holidayOvertimeGrantMinutes;
    current.holidayNightGrantMinutes += result.holidayNightGrantMinutes;
    current.holidayGrantMinutes += result.workMode === "ordinary" ? 0 : result.leaveGrantMinutes;
    current.leaveGrantMinutes += result.leaveGrantMinutes;
    if (hasApprovedOvertime(detail)) {
      current.overtimeDayCount += 1;
    }
    workerMap.set(record.employeeId, current);
  }

  const workers = [...workerMap.values()]
    .map((worker) => {
      const roundedGrantMinutes = floorToHalfHour(worker.leaveGrantMinutes);

      return {
        ...worker,
        nightLabel: formatMinutesLabel(worker.nightMinutes),
        overtimeLabel: formatMinutesLabel(worker.overtimeMinutes),
        holidayOvertimeConvertedHours: Number((worker.holidayOvertimeGrantMinutes / 60).toFixed(3)),
        holidayNightConvertedHours: Number((worker.holidayNightGrantMinutes / 60).toFixed(3)),
        roundedGrantMinutes,
        leaveGrantLabel: formatMinutesLabel(roundedGrantMinutes)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return {
    workers,
    monthInfo: attendance.monthInfo,
    processedCount: workers.length,
    sourceCount: attendance.records.size
  };
};
