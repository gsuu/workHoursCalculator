import * as XLSX from "xlsx";

import { calculateEntry, parseDateValue, toTimeMinutes } from "./overtimeCalculator.js";

const ATTENDANCE_START_COLUMN = 8;
const DETAIL_GROUP_START_COLUMN = 1;
const DETAIL_GROUP_WIDTH = 6;

const normalizeText = (value) => String(value ?? "").trim();
const hasText = (value) => normalizeText(value).length > 0;

const readWorkbook = (arrayBuffer) => XLSX.read(arrayBuffer, {
  type: "array",
  cellDates: false
});

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

const pickGuideRows = (workbook) => {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true
    });

    const guideRows = rows.slice(0, 6).map((row) => normalizeText(row?.[0]));
    const hasGuideTitle = guideRows.some((text) => text.includes("(안내)"));
    const hasDetailGuide = guideRows.some((text) => text.includes("연장근무"))
      && guideRows.some((text) => text.includes("야간근무"));

    if (hasGuideTitle && hasDetailGuide) {
      return rows;
    }
  }

  return [];
};

const toRows = (arrayBuffer) => {
  const workbook = readWorkbook(arrayBuffer);
  return pickDataRows(workbook);
};

const readFileRows = async (file) => file.arrayBuffer().then(toRows);
const readFileWorkbook = async (file) => file.arrayBuffer().then(readWorkbook);

const DETAIL_WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const findMonthInfoInRows = (rows) => {
  for (const row of rows) {
    for (const cell of row ?? []) {
      const text = normalizeText(cell);
      if (!text) continue;

      const compact = text.replace(/\s+/g, "");
      const match = compact.match(/(\d{4})\D*(\d{1,2})/);
      if (!match) continue;

      return {
        year: Number(match[1]),
        month: Number(match[2])
      };
    }
  }

  throw new Error("월 정보를 확인할 수 없습니다.");
};

export const validateAttendanceRows = (rows) => {
  const headerRow = rows[0] ?? [];
  const labelRow = rows[3] ?? [];

  const hasAttendanceHeader = [
    normalizeText(headerRow[0]),
    normalizeText(headerRow[1]),
    normalizeText(headerRow[2])
  ].join("|") === "이름|사번|소속";

  const hasStartLabel = normalizeText(labelRow[7]) === "출근";
  const hasMonthCell = hasText(headerRow[8]);

  if (!hasAttendanceHeader || !hasStartLabel || !hasMonthCell) {
    throw new Error("근태현황 파일 형식이 아닙니다.");
  }

  return findMonthInfoInRows(rows.slice(0, 4));
};

const extractAttendanceEmployeeIds = (rows) => {
  const employeeIds = new Set();

  for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 3) {
    const row = rows[rowIndex] ?? [];
    const name = normalizeText(row[0]);
    const employeeId = normalizeText(row[1]);

    if (!name || !employeeId) continue;
    employeeIds.add(employeeId);
  }

  return employeeIds;
};

export const validateDetailRows = (rows, monthInfo = null, guideSourceRows = rows) => {
  const guideRows = guideSourceRows.slice(0, 6).map((row) => normalizeText(row?.[0]));

  const hasGuideTitle = guideRows.some((text) => text.includes("(안내)"));
  const hasDetailGuide = guideRows.some((text) => text.includes("연장근무"))
    && guideRows.some((text) => text.includes("야간근무"));
  const hasDayRows = rows.some((row) => /^\d{1,2}/.test(normalizeText(row?.[0])));

  if (!hasGuideTitle || !hasDetailGuide || !hasDayRows) {
    throw new Error("근무결과(상세) 파일 형식이 아닙니다.");
  }

  if (!monthInfo?.year || !monthInfo?.month) {
    return;
  }

  let checkedDays = 0;

  for (const row of rows) {
    const firstCell = normalizeText(row?.[0]);
    const match = firstCell.match(/^(\d{1,2})\((.)\)$/);
    if (!match) continue;

    const day = Number(match[1]);
    const weekdayLabel = match[2];
    const date = new Date(monthInfo.year, monthInfo.month - 1, day);

    if (
      date.getFullYear() !== monthInfo.year
      || date.getMonth() !== monthInfo.month - 1
      || date.getDate() !== day
    ) {
      throw new Error("근무결과(상세) 파일의 날짜 정보가 올바르지 않습니다.");
    }

    if (DETAIL_WEEKDAY_LABELS[date.getDay()] !== weekdayLabel) {
      throw new Error("두 파일의 월 정보가 일치하지 않습니다.");
    }

    checkedDays += 1;
  }

  if (checkedDays === 0) {
    throw new Error("근무결과(상세) 파일의 날짜 정보를 확인할 수 없습니다.");
  }
};

const extractDetailEmployeeIds = (rows) => {
  const nameRow = rows[0] ?? [];
  const idRow = rows[1] ?? [];
  const employeeIds = new Set();

  for (
    let columnIndex = DETAIL_GROUP_START_COLUMN;
    columnIndex < nameRow.length;
    columnIndex += DETAIL_GROUP_WIDTH
  ) {
    const employeeId = normalizeText(idRow[columnIndex]);
    if (!employeeId) continue;
    employeeIds.add(employeeId);
  }

  return employeeIds;
};

const validateMatchingEmployeeIds = (attendanceEmployeeIds, detailEmployeeIds) => {
  if (!attendanceEmployeeIds?.size || !detailEmployeeIds?.size) {
    throw new Error("사용자 정보를 확인할 수 없습니다.");
  }

  for (const employeeId of detailEmployeeIds) {
    if (!attendanceEmployeeIds.has(employeeId)) {
      throw new Error("파일간 사용자 정보가 일치하지 않습니다.");
    }
  }
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
  const monthInfo = validateAttendanceRows(rows);
  const employeeIds = extractAttendanceEmployeeIds(rows);
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
    employeeIds,
    records
  };
};

const parseDetailRows = (rows, monthInfo) => {
  const detailMonthInfo = validateDetailRows(rows);
  if (
    detailMonthInfo.year !== monthInfo.year
    || detailMonthInfo.month !== monthInfo.month
  ) {
    throw new Error("두 파일의 월 정보가 일치하지 않습니다.");
  }
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

const parseValidatedDetailRows = (rows, monthInfo, guideRows) => {
  validateDetailRows(rows, monthInfo, guideRows);
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
      if (firstCell.includes("珥??⑷퀎")) break;

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

  const [attendanceRows, detailWorkbook] = await Promise.all([
    readFileRows(attendanceFile),
    readFileWorkbook(detailFile)
  ]);
  const detailRows = pickDataRows(detailWorkbook);
  const detailGuideRows = pickGuideRows(detailWorkbook);

  const attendance = parseAttendanceRows(attendanceRows);
  validateDetailRows(detailRows, attendance.monthInfo, detailGuideRows);
  validateMatchingEmployeeIds(attendance.employeeIds, extractDetailEmployeeIds(detailRows));
  const detailRules = parseValidatedDetailRows(detailRows, attendance.monthInfo, detailGuideRows);
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

export const validateAttendanceFile = async (attendanceFile) => {
  if (!attendanceFile) return;
  const attendanceRows = await readFileRows(attendanceFile);
  validateAttendanceRows(attendanceRows);
  return {
    monthInfo: findMonthInfoInRows(attendanceRows.slice(0, 4)),
    employeeIds: extractAttendanceEmployeeIds(attendanceRows)
  };
};

export const validateDetailFile = async (
  detailFile,
  attendanceMonthInfo = null,
  attendanceEmployeeIds = null
) => {
  if (!detailFile) return;
  const workbook = await readFileWorkbook(detailFile);
  const detailRows = pickDataRows(workbook);
  const detailGuideRows = pickGuideRows(workbook);
  validateDetailRows(detailRows, attendanceMonthInfo, detailGuideRows);
  if (attendanceEmployeeIds) {
    validateMatchingEmployeeIds(attendanceEmployeeIds, extractDetailEmployeeIds(detailRows));
  }
  return null;
};
