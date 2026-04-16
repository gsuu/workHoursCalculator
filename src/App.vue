<script setup>
import { computed, ref, watch } from "vue";

import { parseMonthlyResultFiles } from "./monthlyAttendanceImport.js";
import {
  PRELOADED_MONTHLY_PERIOD_LABEL,
  PRELOADED_MONTHLY_WORKERS
} from "./preloadedMonthlyWorkers.js";

const attendanceImportFile = ref(null);
const detailImportFile = ref(null);
const monthlyImportLoading = ref(false);
const monthlyImportError = ref("");
const monthlyWorkers = ref(PRELOADED_MONTHLY_WORKERS);
const monthlyPeriodLabel = ref(PRELOADED_MONTHLY_PERIOD_LABEL);
const previousCarryHoursMap = ref({});
const selectedPart = ref("all");
const selectedSort = ref("name");
const copyToastMessage = ref("");
const copyToastVisible = ref(false);

const HIWORKS_EXPORT_BASE_URL = "https://hr-work-api.office.hiworks.com/v4/excel/export/work-month";
const HIWORKS_NODE_ID = "12344";

const now = new Date();
const latestDownloadDate = new Date(now.getFullYear(), now.getMonth(), 0);
const latestDownloadYear = latestDownloadDate.getFullYear();
const latestDownloadMonth = latestDownloadDate.getMonth() + 1;
const defaultDownloadYear = latestDownloadYear;
const defaultDownloadMonth = latestDownloadMonth;

const selectedDownloadYear = ref(String(defaultDownloadYear));
const selectedDownloadMonth = ref(String(defaultDownloadMonth));

let copyToastTimer = null;

const formatMonthlyPeriodLabel = (year, month) => `${year}년 ${month}월`;

const downloadYearOptions = computed(() =>
  Array.from({ length: 3 }, (_, index) => String(latestDownloadYear - 2 + index))
);

const downloadMonthOptions = computed(() => {
  const selectedYear = Number(selectedDownloadYear.value);
  const maxMonth = selectedYear === latestDownloadYear ? latestDownloadMonth : 12;
  return Array.from({ length: maxMonth }, (_, index) => String(index + 1));
});

watch(selectedDownloadYear, () => {
  const maxMonth = Number(downloadMonthOptions.value.at(-1) || defaultDownloadMonth);
  if (Number(selectedDownloadMonth.value) > maxMonth) {
    selectedDownloadMonth.value = String(maxMonth);
  }
});

const openCopyToast = (message) => {
  if (copyToastTimer) {
    clearTimeout(copyToastTimer);
  }

  copyToastMessage.value = message;
  copyToastVisible.value = true;
  copyToastTimer = setTimeout(() => {
    copyToastVisible.value = false;
    copyToastTimer = null;
  }, 2600);
};

const buildHiworksExportUrl = (type) =>
  `${HIWORKS_EXPORT_BASE_URL}?filter[year]=${selectedDownloadYear.value}&filter[month]=${selectedDownloadMonth.value}&filter[node_id]=${HIWORKS_NODE_ID}&filter[type]=${type}`;

const openExternalPage = (url) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

const openAttendanceExport = () => {
  openExternalPage(buildHiworksExportUrl("work"));
};

const openDetailExport = () => {
  openExternalPage(buildHiworksExportUrl("detail"));
};

const copyReportEmail = async () => {
  try {
    await navigator.clipboard.writeText("jisuk@cttd.co.kr");
    openCopyToast("이메일 주소가 복사되었습니다.");
  } catch {
    openCopyToast("주소 복사에 실패했습니다. 다시 시도해 주세요.");
  }
};

const copyMonthlyTable = async () => {
  if (!filteredMonthlyRows.value.length) return;
  const headers = [
    "\uC6D4\uBCC4",
    "\uBC88\uD638",
    "Part",
    "\uD300\uC6D0\uBA85",
    "\uC804\uC6D4 \uC774\uC6D4 \uD734\uAC00(h)",
    "\uD3C9\uC77C \uC5F0\uC7A5\uADFC\uBB34(\uC2DC)",
    "\uD3C9\uC77C \uC5F0\uC7A5\uADFC\uBB34(\uBD84)",
    "\uD3C9\uC77C \uC57C\uAC04\uADFC\uBB34(\uC2DC)",
    "\uD3C9\uC77C \uC57C\uAC04\uADFC\uBB34(\uBD84)",
    "\uD734\uC77C/\uD734\uBB34\uC77C \uC5F0\uC7A5\uADFC\uBB34(\uC2DC)",
    "\uD734\uC77C/\uD734\uBB34\uC77C \uC5F0\uC7A5\uADFC\uBB34(\uBD84)",
    "\uD734\uC77C/\uD734\uBB34\uC77C \uC57C\uAC04\uADFC\uBB34(\uC2DC)",
    "\uD734\uC77C/\uD734\uBB34\uC77C \uC57C\uAC04\uADFC\uBB34(\uBD84)",
    "\uD658\uC0B0\uC2DC\uAC04(h)",
    "\uC774\uC6D4 \uD734\uAC00(h)",
    "\uC9C0\uAE09\uD734\uAC00(d)",
    "\uC5F0\uC7A5\uADFC\uBB34 \uC77C\uC218"
  ];
  if (showRemarkColumn.value) {
    headers.push("\uBE44\uACE0");
  }
  const lines = filteredMonthlyRows.value.map((row) => [
    monthlyPeriodLabel.value,
    String(row.number),
    row.part,
    row.name,
    row.previousCarryInput || "0",
    row.overtimeHoursText,
    row.overtimeRemainMinutesText,
    row.nightHoursText,
    row.nightRemainMinutesText,
    row.holidayOvertimeHoursText,
    row.holidayOvertimeRemainMinutesText,
    row.holidayNightHoursText,
    row.holidayNightRemainMinutesText,
    row.totalLeaveHoursText,
    row.carryLeaveHoursText,
    row.grantDaysText,
    String(row.overtimeDayCount),
    ...(showRemarkColumn.value ? [row.remarkText] : [])
  ].join("\t"));
  try {
    await navigator.clipboard.writeText([headers.join("\t"), ...lines].join("\n"));
    openCopyToast("\uC6D4\uBCC4 \uACB0\uACFC \uD45C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC5D1\uC140\uC5D0 \uBC14\uB85C \uBD99\uC5EC\uB123\uAE30 \uD558\uC138\uC694.");
  } catch {
    openCopyToast("\uACB0\uACFC \uD45C \uBCF5\uC0AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
  }
};

const escapeCsvCell = (value) => {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
};

const downloadMonthlyTableCsv = async () => {
  if (!filteredMonthlyRows.value.length) return;
  const headers = [
    "\uC6D4\uBCC4",
    "\uBC88\uD638",
    "Part",
    "\uD300\uC6D0\uBA85",
    "\uC804\uC6D4 \uC774\uC6D4 \uD734\uAC00(h)",
    "\uD3C9\uC77C \uC5F0\uC7A5\uADFC\uBB34(\uC2DC)",
    "\uD3C9\uC77C \uC5F0\uC7A5\uADFC\uBB34(\uBD84)",
    "\uD3C9\uC77C \uC57C\uAC04\uADFC\uBB34(\uC2DC)",
    "\uD3C9\uC77C \uC57C\uAC04\uADFC\uBB34(\uBD84)",
    "\uD734\uC77C/\uD734\uBB34\uC77C \uC5F0\uC7A5\uADFC\uBB34(\uC2DC)",
    "\uD734\uC77C/\uD734\uBB34\uC77C \uC5F0\uC7A5\uADFC\uBB34(\uBD84)",
    "\uD734\uC77C/\uD734\uBB34\uC77C \uC57C\uAC04\uADFC\uBB34(\uC2DC)",
    "\uD734\uC77C/\uD734\uBB34\uC77C \uC57C\uAC04\uADFC\uBB34(\uBD84)",
    "\uD658\uC0B0\uC2DC\uAC04(h)",
    "\uC774\uC6D4 \uD734\uAC00(h)",
    "\uC9C0\uAE09\uD734\uAC00(d)",
    "\uC5F0\uC7A5\uADFC\uBB34 \uC77C\uC218"
  ];
  if (showRemarkColumn.value) {
    headers.push("\uBE44\uACE0");
  }
  const rows = filteredMonthlyRows.value.map((row) => [
    monthlyPeriodLabel.value,
    String(row.number),
    row.part,
    row.name,
    row.previousCarryInput || "0",
    row.overtimeHoursText,
    row.overtimeRemainMinutesText,
    row.nightHoursText,
    row.nightRemainMinutesText,
    row.holidayOvertimeHoursText,
    row.holidayOvertimeRemainMinutesText,
    row.holidayNightHoursText,
    row.holidayNightRemainMinutesText,
    row.totalLeaveHoursText,
    row.carryLeaveHoursText,
    row.grantDaysText,
    String(row.overtimeDayCount),
    ...(showRemarkColumn.value ? [row.remarkText] : [])
  ]);
  const csv = [headers, ...rows]
    .map((line) => line.map(escapeCsvCell).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = selectedPart.value === "all"
      ? "\uC6D4\uBCC4\uACB0\uACFC\uD45C.csv"
      : `\uC6D4\uBCC4\uACB0\uACFC\uD45C_${selectedPart.value}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    openCopyToast("\uC6D4\uBCC4 \uACB0\uACFC \uD45C CSV\uAC00 \uB2E4\uC6B4\uB85C\uB4DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
  } catch {
    openCopyToast("CSV \uB2E4\uC6B4\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
  } finally {
    URL.revokeObjectURL(url);
  }
};

const parseNumberInput = (value) => {
  const number = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(number) ? number : 0;
};

const sanitizeDecimalInput = (value) => {
  const text = String(value ?? "").replace(/[^\d.]/g, "");
  if (!text) return "";

  const [integerPart, ...decimalParts] = text.split(".");
  if (decimalParts.length === 0) {
    return integerPart;
  }

  return `${integerPart}.${decimalParts.join("")}`;
};

const toFixedText = (value, digits = 2) => Number(value || 0).toFixed(digits);
const toPaddedText = (value) => String(Math.max(0, Math.trunc(value))).padStart(2, "0");
const toHalfDayFloor = (hours) => Math.floor(Math.max(0, hours) * 2 / 8) / 2;
const getGrantedLeaveHours = (grantDays) => grantDays * 8;
const formatIssueDates = (issueDates) => {
  if (!Array.isArray(issueDates) || issueDates.length === 0) return "";

  return issueDates
    .map((date) => {
      const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return String(date);
      return `${Number(match[2])}/${Number(match[3])}`;
    })
    .join(", ");
};

const partOptions = computed(() => {
  const parts = [...new Set(monthlyWorkers.value.map((worker) => worker.part).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
  return ["all", ...parts];
});

const monthlyRows = computed(() =>
  monthlyWorkers.value.map((worker, index) => {
    const previousCarryInput = previousCarryHoursMap.value[worker.employeeId] ?? "";
    const previousCarryHours = Math.max(0, parseNumberInput(previousCarryInput));
    const overtimeConvertedHours = worker.overtimeMinutes * 1.5 / 60;
    const nightConvertedHours = worker.nightMinutes * 2 / 60;
    const holidayOvertimeConvertedHours = worker.holidayOvertimeGrantMinutes / 60;
    const holidayNightConvertedHours = worker.holidayNightGrantMinutes / 60;
    const totalLeaveHours = previousCarryHours
      + overtimeConvertedHours
      + nightConvertedHours
      + holidayOvertimeConvertedHours
      + holidayNightConvertedHours;
    const grantDays = toHalfDayFloor(totalLeaveHours);
    const grantedLeaveHours = getGrantedLeaveHours(grantDays);
    const carryLeaveHours = Math.max(0, totalLeaveHours - grantedLeaveHours);

    return {
      ...worker,
      number: index + 1,
      previousCarryInput,
      overtimeHoursText: toPaddedText(Math.floor(worker.overtimeMinutes / 60)),
      overtimeRemainMinutesText: toPaddedText(worker.overtimeMinutes % 60),
      nightHoursText: toPaddedText(Math.floor(worker.nightMinutes / 60)),
      nightRemainMinutesText: toPaddedText(worker.nightMinutes % 60),
      holidayOvertimeHoursText: toPaddedText(Math.floor(worker.holidayOvertimeMinutes / 60)),
      holidayOvertimeRemainMinutesText: toPaddedText(worker.holidayOvertimeMinutes % 60),
      holidayNightHoursText: toPaddedText(Math.floor(worker.holidayNightMinutes / 60)),
      holidayNightRemainMinutesText: toPaddedText(worker.holidayNightMinutes % 60),
      totalLeaveHoursText: toFixedText(totalLeaveHours, 2),
      carryLeaveHoursText: toFixedText(carryLeaveHours, 2),
      grantDaysText: Number.isInteger(grantDays) ? String(grantDays) : grantDays.toFixed(1),
      remarkText:
        worker.issueCount > 0
          ? `수기 확인 필요 (${formatIssueDates(worker.issueDates) || `${worker.issueCount}일`})`
          : ""
    };
  })
);

const filteredMonthlyRows = computed(() => {
  const rows = selectedPart.value === "all"
    ? monthlyRows.value
    : monthlyRows.value.filter((row) => row.part === selectedPart.value);

  const sortedRows = [...rows].sort((left, right) => {
    if (selectedSort.value === "grantDays") {
      const leftValue = Number.parseFloat(left.grantDaysText) || 0;
      const rightValue = Number.parseFloat(right.grantDaysText) || 0;
      if (rightValue !== leftValue) return rightValue - leftValue;
      return left.name.localeCompare(right.name, "ko");
    }

    if (selectedSort.value === "overtimeDays") {
      if (right.overtimeDayCount !== left.overtimeDayCount) {
        return right.overtimeDayCount - left.overtimeDayCount;
      }
      return left.name.localeCompare(right.name, "ko");
    }

    return left.name.localeCompare(right.name, "ko");
  });

  return sortedRows.map((row, index) => ({
    ...row,
    number: index + 1
  }));
});

const showRemarkColumn = computed(() =>
  filteredMonthlyRows.value.some((row) => Boolean(row.remarkText))
);

const updateTextMap = (target, employeeId, value) => {
  target.value = {
    ...target.value,
    [employeeId]: value
  };
};

const updateCarryHoursInput = (employeeId, value) => {
  const trimmed = String(value ?? "");

  if (!trimmed) {
    updateTextMap(previousCarryHoursMap, employeeId, "");
    return;
  }

  updateTextMap(previousCarryHoursMap, employeeId, sanitizeDecimalInput(trimmed));
};

const loadMonthlyWorkers = async () => {
  if (!attendanceImportFile.value || !detailImportFile.value) {
    monthlyWorkers.value = [];
    monthlyImportError.value = "";
    selectedPart.value = "all";
    selectedSort.value = "name";
    return;
  }

  monthlyImportLoading.value = true;
  monthlyImportError.value = "";

  try {
    const parsed = await parseMonthlyResultFiles({
      attendanceFile: attendanceImportFile.value,
      detailFile: detailImportFile.value
    });
    monthlyWorkers.value = parsed.workers;
    if (parsed.monthInfo?.year && parsed.monthInfo?.month) {
      monthlyPeriodLabel.value = formatMonthlyPeriodLabel(parsed.monthInfo.year, parsed.monthInfo.month);
    }
    selectedPart.value = "all";
    selectedSort.value = "name";
  } catch (error) {
    monthlyWorkers.value = [];
    selectedPart.value = "all";
    selectedSort.value = "name";
    monthlyImportError.value = error instanceof Error
      ? error.message
      : "파일을 읽는 중 오류가 발생했습니다.";
  } finally {
    monthlyImportLoading.value = false;
  }
};

const updateMonthlyFile = async (type, event) => {
  const [file] = event.target.files ?? [];

  if (type === "attendance") {
    attendanceImportFile.value = file ?? null;
  } else {
    detailImportFile.value = file ?? null;
  }

  await loadMonthlyWorkers();
};
</script>

<template>
  <main>
    <section class="panel hero">
      <div class="hero-copy">
        <div class="logo-slot" aria-hidden="true">
          <svg viewBox="0 0 2666.667 499.921" role="img">
            <title>CTTD</title>
            <defs>
              <symbol id="logo-c" viewBox="0 0 488 509">
                <path d="M32 122c21-38 51-69 89-90S203 0 252 0c59 0 109 16 152 46 43 32 71 75 84 128H355c-10-20-24-36-43-48-17-10-39-16-61-16-39 0-68 14-92 40-23 26-35 60-35 104s12 79 35 106c24 25 53 38 92 38a108 108 0 0 0 105-64h132c-13 55-41 98-84 128s-93 47-152 47c-49 0-92-11-131-32-38-23-68-52-89-91S0 304 0 254s11-93 32-132" />
              </symbol>
              <symbol id="logo-t" viewBox="0 0 433 435">
                <path d="M433 267H268v168H164V267H0v-99h164V0h104v168h165z" />
              </symbol>
              <symbol id="logo-d" viewBox="0 0 449 500">
                <path d="M287 357c25-25 38-61 38-106 0-47-13-83-38-108s-62-39-108-39h-58v291h58c46 0 82-12 108-38m38-325c39 21 70 51 91 88 23 37 33 81 33 131s-10 92-33 130c-21 38-52 67-91 88-40 22-86 31-138 31H0V0h187c53 0 98 11 138 32" />
              </symbol>
              <symbol id="logo-basic" viewBox="0 0 2666.667 499.921">
                <use href="#logo-c" x="0" y="0" width="479.608" height="499.921"></use>
                <use href="#logo-t" x="781.050" y="38.818" width="425.809" height="425.784"></use>
                <use href="#logo-t" x="1484.900" y="38.818" width="425.809" height="425.784"></use>
                <use href="#logo-d" x="2225.465" y="5.604" width="441.201" height="490.817"></use>
              </symbol>
            </defs>
            <use href="#logo-basic"></use>
          </svg>
        </div>
        <h1>초과근무시간 계산기</h1>
      </div>
    </section>

    <section class="panel">
        <div class="head">
          <div>
            <h2>월별 파일 업로드</h2>
            <ol class="upload-steps">
              <li>하이웍스 -&gt; 인사/회계 -&gt; 인사근무 -&gt; 근무관리 -&gt; 전사 근무관리 -&gt; 근태현황 접속</li>
              <li>대상기간, 부서 선택</li>
              <li><b>근무결과(상세), 근무현황</b> 파일을 다운로드</li>
              <li>업로드</li>
            </ol>
            <div class="upload-note">
              <p>* 두 파일은 같은 월의 파일이어야 합니다.</p>
              <p>* 아래에서 바로 다운로드도 가능합니다.</p>
            </div>
          </div>
        </div>

      <div class="transfer-shell">
        <div class="transfer-rail">
          <section class="transfer-column transfer-column-download">
            <p class="transfer-kicker">파일 다운로드</p>
            <label class="transfer-month">
              <span>대상 월</span>
              <div class="transfer-month-controls">
                <select v-model="selectedDownloadYear">
                  <option
                    v-for="year in downloadYearOptions"
                    :key="year"
                    :value="year"
                  >
                    {{ year }}년
                  </option>
                </select>
                <select v-model="selectedDownloadMonth">
                  <option
                    v-for="month in downloadMonthOptions"
                    :key="month"
                    :value="month"
                  >
                    {{ month }}월
                  </option>
                </select>
              </div>
            </label>
            <div class="transfer-button-row">
              <button class="download-action-button" type="button" @click="openAttendanceExport">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 2.5v7m0 0 2.5-2.5M8 9.5 5.5 7M3 11.5h10v2H3z" />
                </svg>
                <span>근무현황 다운로드</span>
              </button>
              <button class="download-action-button" type="button" @click="openDetailExport">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 2.5v7m0 0 2.5-2.5M8 9.5 5.5 7M3 11.5h10v2H3z" />
                </svg>
                <span>근무결과(상세) 다운로드</span>
              </button>
            </div>
          </section>

          <div class="transfer-divider" aria-hidden="true"></div>

          <section class="transfer-column transfer-column-upload">
            <div class="transfer-upload-head">
              <p class="transfer-kicker">파일 업로드</p>
              <p class="transfer-copy">로컬에 저장된 동일 형식 파일을 바로 업로드할 수 있습니다.</p>
            </div>
            <div class="transfer-upload-list">
              <label class="transfer-upload-row">
                <span class="transfer-upload-label">근태현황 파일</span>
                <input class="transfer-upload-input" type="file" accept=".xls,.xlsx" @change="updateMonthlyFile('attendance', $event)">
                <small>{{ attendanceImportFile?.name ?? "선택된 파일이 없습니다." }}</small>
              </label>

              <label class="transfer-upload-row">
                <span class="transfer-upload-label">근무결과(상세) 파일</span>
                <input class="transfer-upload-input" type="file" accept=".xls,.xlsx" @change="updateMonthlyFile('detail', $event)">
                <small>{{ detailImportFile?.name ?? "선택된 파일이 없습니다." }}</small>
              </label>
            </div>
          </section>
        </div>
      </div>

      <p v-if="monthlyImportLoading" class="sub import-status">파일을 읽고 월별 결과를 계산하는 중입니다.</p>
      <p v-else-if="monthlyImportError" class="error import-error">{{ monthlyImportError }}</p>
    </section>

    <section v-if="monthlyRows.length > 0" class="panel">
      <div class="head">
        <div>
          <h2>월별 결과 표</h2>
          <p class="sub result-sub">업로드한 파일을 기준으로 작업자별 환산 결과를 보여줍니다.</p>
        </div>
      </div>
      <div class="table-toolbar">
        <div class="table-filters">
          <label class="table-filter">
            <span class="table-filter-label">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2.5 3.5h11m-9.5 4h8m-6 4h5" />
              </svg>
              <span>Part</span>
            </span>
            <select v-model="selectedPart">
              <option value="all">전체</option>
              <option
                v-for="part in partOptions.filter((part) => part !== 'all')"
                :key="part"
                :value="part"
              >
                {{ part }}
              </option>
            </select>
          </label>
          <label class="table-filter">
            <span class="table-filter-label">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 3.5v9m0 0-2-2m2 2 2-2M11 12.5v-9m0 0-2 2m2-2 2 2" />
              </svg>
              <span>정렬</span>
            </span>
            <select v-model="selectedSort">
              <option value="name">이름 순</option>
              <option value="grantDays">지급휴가 많은 순</option>
              <option value="overtimeDays">연장근무일수 많은 순</option>
            </select>
          </label>
        </div>
        <div class="table-actions">
          <button class="table-action-button" type="button" @click="copyMonthlyTable">copy</button>
          <button class="table-action-button" type="button" @click="downloadMonthlyTableCsv">download</button>
        </div>
      </div>

      <div class="monthly-table-wrap">
        <table class="monthly-table">
          <colgroup>
            <col style="width: 78px">
            <col style="width: 38px">
            <col style="width: 64px">
            <col style="width: 82px">
            <col style="width: 76px">
            <col style="width: 40px">
            <col style="width: 40px">
            <col style="width: 40px">
            <col style="width: 40px">
            <col style="width: 40px">
            <col style="width: 40px">
            <col style="width: 40px">
            <col style="width: 40px">
            <col style="width: 74px">
            <col style="width: 74px">
            <col style="width: 60px">
            <col style="width: 64px">
            <col v-if="showRemarkColumn" style="width: 116px">
          </colgroup>
          <thead>
            <tr>
              <th rowspan="2">월별</th>
              <th rowspan="2">번호</th>
              <th rowspan="2">Part</th>
              <th rowspan="2">팀원명</th>
              <th rowspan="2" class="group-carry">전월 이월 휴가(h)</th>
              <th colspan="2" class="group-overtime">평일 연장근무</th>
              <th colspan="2" class="group-night">평일 야간근무</th>
              <th colspan="2" class="group-holiday">휴일/휴무일 연장근무</th>
              <th colspan="2" class="group-holiday">휴일/휴무일 야간근무</th>
              <th rowspan="2" class="group-total">환산시간(h)</th>
              <th rowspan="2" class="group-result-carry">이월 휴가(h)</th>
              <th rowspan="2" class="group-highlight">지급휴가(d)</th>
              <th rowspan="2" class="group-issue">연장근무 일수</th>
              <th v-if="showRemarkColumn" rowspan="2" class="group-note">비고</th>
            </tr>
            <tr>
              <th class="group-overtime-sub time-head">시</th>
              <th class="group-overtime-sub time-head">분</th>
              <th class="group-night-sub time-head">시</th>
              <th class="group-night-sub time-head">분</th>
              <th class="group-holiday-sub time-head">시</th>
              <th class="group-holiday-sub time-head">분</th>
              <th class="group-holiday-sub time-head">시</th>
              <th class="group-holiday-sub time-head">분</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredMonthlyRows" :key="row.employeeId">
              <td class="cell-month">{{ monthlyPeriodLabel }}</td>
              <td>{{ row.number }}</td>
              <td class="cell-part">{{ row.part }}</td>
              <td>{{ row.name }}</td>
              <td class="cell-edit">
                <input
                  class="table-input number"
                  type="text"
                  inputmode="decimal"
                  :value="row.previousCarryInput"
                  placeholder="0"
                  @input="updateCarryHoursInput(row.employeeId, $event.target.value)"
                >
              </td>
              <td class="cell-overtime cell-time">{{ row.overtimeHoursText }}</td>
              <td class="cell-overtime cell-time">{{ row.overtimeRemainMinutesText }}</td>
              <td class="cell-night cell-time">{{ row.nightHoursText }}</td>
              <td class="cell-night cell-time">{{ row.nightRemainMinutesText }}</td>
              <td class="cell-holiday cell-time">{{ row.holidayOvertimeHoursText }}</td>
              <td class="cell-holiday cell-time">{{ row.holidayOvertimeRemainMinutesText }}</td>
              <td class="cell-holiday cell-time">{{ row.holidayNightHoursText }}</td>
              <td class="cell-holiday cell-time">{{ row.holidayNightRemainMinutesText }}</td>
              <td class="cell-total strong">{{ row.totalLeaveHoursText }}</td>
              <td class="cell-result-carry strong">{{ row.carryLeaveHoursText }}</td>
              <td class="cell-highlight strong">{{ row.grantDaysText }}</td>
              <td class="cell-issue strong">{{ row.overtimeDayCount }}</td>
              <td v-if="showRemarkColumn" class="cell-note">{{ row.remarkText }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="head">
        <div>
          <h2>근무 기준 안내</h2>
          <p class="sub">계산은 아래 기준으로 적용됩니다.</p>
        </div>
      </div>

      <div class="guide-table">
        <div class="guide-row guide-head">
          <strong>구분</strong>
          <strong>적용 기준</strong>
        </div>
        <div class="guide-row">
          <strong>평일 근무</strong>
          <span>1일 8시간 또는 1주 40시간 초과분을 연장근무로 보고, 22시부터 다음 날 6시까지를 야간근무로 계산합니다.</span>
        </div>
        <div class="guide-row">
          <strong>점심 휴게</strong>
          <span>근무 시간이 11:30~12:30 구간을 포함하면 점심 휴게 60분을 자동으로 차감합니다.</span>
        </div>
        <div class="guide-row">
          <strong>휴무일 근무</strong>
          <span>토요일은 휴무일로 보고 실제 근무시간을 1.5배, 야간분은 2.0배 기준으로 환산합니다.</span>
        </div>
        <div class="guide-row">
          <strong>휴일 근무</strong>
          <span>일요일과 공휴일은 휴일 기준을 적용하고 8시간 이내 1.5배, 8시간 초과분은 2.0배, 야간은 별도 가산합니다.</span>
        </div>
        <div class="guide-row">
          <strong>지급휴가(d)</strong>
          <span>환산시간을 8시간 = 1일 기준으로 계산하고, 0.5일 단위로 지급합니다. 이월 휴가는 4시간 미만만 유지됩니다.</span>
        </div>
      </div>

      <ul class="foot-list">
        <li class="foot-item">
          근로기준법 제50조, 제55조, 제56조 기준입니다. 상시 5인 이상 사업장과 일반적인 근로시간제를 전제로 합니다.
        </li>
        <li class="foot-item">
          오류가 있을 경우 <a class="report-link" href="mailto:jisuk@cttd.co.kr?subject=%EC%98%A4%EB%A5%98%20%EC%8B%A0%EA%B3%A0">여기</a>로 알려주세요.
          메일이 열리지 않는 경우 👉🏻<button class="report-copy-button" type="button" @click="copyReportEmail">주소 복사</button>
        </li>
      </ul>
    </section>

    <transition name="toast-fade">
      <div v-if="copyToastVisible" class="copy-toast" role="alert" aria-live="assertive">
        <strong>copy</strong>
        <p>{{ copyToastMessage }}</p>
      </div>
    </transition>
  </main>
</template>

<style>
:root {
  --bg: #fafafa;
  --card: #ffffff;
  --line: #e7e7eb;
  --text: #09090b;
  --muted: #71717a;
  --soft: #f6f6f7;
  --danger: #ef4444;
  --radius-lg: 14px;
  --radius-md: 10px;
  --radius-sm: 8px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif;
  background: #ffffff;
  color: var(--text);
}

button,
input {
  font: inherit;
}

main {
  width: min(1320px, calc(100% - 24px));
  margin: 20px auto 36px;
  display: block;
}

.panel + .panel {
  margin-top: 60px;
}

.panel {
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.hero {
  background: transparent;
}

.hero + .panel {
  margin-top: 30px;
}

.hero-copy {
  display: grid;
  gap: 8px;
}

.logo-slot {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  width: 64px;
  height: 12px;
  color: var(--text);
  overflow: visible;
}

.logo-slot svg {
  width: 100%;
  height: 100%;
  max-width: 100%;
  display: block;
  fill: currentColor;
  overflow: visible;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: clamp(26px, 4vw, 36px);
  line-height: 1.04;
  letter-spacing: -0.04em;
}

.hero p,
.sub,
.foot {
  color: var(--muted);
}

.hero p,
.sub {
  font-size: 13px;
  line-height: 1.6;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.head h2 {
  font-size: 18px;
  letter-spacing: -0.02em;
}

.result-sub {
  margin-bottom: 14px;
}

.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
}

.table-filters {
  display: inline-flex;
  align-items: center;
  gap: 20px;
}

.table-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.table-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
}

.table-filter span {
  color: var(--text);
  white-space: nowrap;
}

.table-filter-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  white-space: nowrap;
}

.table-filter-label svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 1.5;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.table-filter select {
  min-width: 96px;
  min-height: 30px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  color: var(--text);
  font: inherit;
}

.cell-month {
  white-space: nowrap;
}

.table-action-button {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.table-action-button:hover {
  background: #f6f6f7;
}

.transfer-shell {
  padding: 18px 20px;
  border: 1px solid #ececf1;
  border-radius: 16px;
  background: #fbfbfc;
}

.transfer-rail {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) auto minmax(0, 1.35fr);
  gap: 22px;
  align-items: start;
}

.transfer-column {
  display: grid;
  gap: 12px;
  align-content: start;
}

.transfer-divider {
  width: 1px;
  align-self: stretch;
  background: #ececf1;
}

.transfer-kicker {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.transfer-copy {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}

.transfer-month {
  display: grid;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
}

.transfer-month span {
  color: var(--text);
}

.transfer-month-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.transfer-month-controls select {
  min-width: 82px;
  min-height: 34px;
  padding: 0 30px 0 12px;
  border: 1px solid #d9dbe2;
  border-radius: 999px;
  background: #ffffff;
  color: var(--text);
  font: inherit;
}

.transfer-button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.download-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #d9dbe2;
  border-radius: 999px;
  background: #ffffff;
  color: var(--text);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.download-action-button:hover {
  background: #f4f5f7;
}

.download-action-button svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 1.5;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: 0 0 auto;
}

.transfer-upload-head {
  display: grid;
  gap: 5px;
}

.transfer-upload-list {
  display: grid;
  gap: 10px;
}

.upload-steps {
  margin: 10px 0 0;
  padding-left: 18px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}

.upload-steps li + li {
  margin-top: 2px;
}

.upload-note {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.transfer-upload-row {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  align-items: center;
  gap: 8px 12px;
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
}

.transfer-upload-label {
  color: var(--text);
}

.transfer-upload-row small {
  grid-column: 2;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}

.transfer-upload-input,
.table-input {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: #ffffff;
  color: var(--text);
}

.transfer-upload-input::file-selector-button {
  margin-right: 10px;
  padding: 7px 10px;
  border: 1px solid #d9dbe2;
  border-radius: 999px;
  background: #ffffff;
  color: var(--text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.transfer-upload-input::-webkit-file-upload-button {
  margin-right: 10px;
  padding: 7px 10px;
  border: 1px solid #d9dbe2;
  border-radius: 999px;
  background: #ffffff;
  color: var(--text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.table-input {
  min-height: 34px;
  padding: 6px 8px;
  font-size: 12px;
  background: #ffffff;
}

.table-input.number {
  appearance: textfield;
  -moz-appearance: textfield;
  border: none;
  box-shadow: none;
  text-align: right;
}

.table-input.number::-webkit-outer-spin-button,
.table-input.number::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

.table-input.number:focus,
.table-input.number:focus-visible {
  outline: none;
  border: none;
  box-shadow: none;
}

.import-status,
.import-error {
  margin-top: 10px;
}

.error {
  color: var(--danger);
  font-size: 12px;
}

.monthly-table-wrap {
  margin-top: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow-x: auto;
  background: #fff;
}

.monthly-table {
  width: 100%;
  min-width: 0;
  border-collapse: collapse;
  table-layout: fixed;
}

.monthly-table th,
.monthly-table td {
  padding: 7px 6px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  font-size: 11px;
  text-align: center;
  vertical-align: middle;
}

.monthly-table td {
  white-space: nowrap;
}

.monthly-table .cell-part {
  white-space: normal;
  word-break: break-word;
  line-height: 1.4;
}

.monthly-table tbody td {
  background: #fafafb;
}

.monthly-table th {
  background: #f5f5f5;
  font-weight: 700;
  white-space: normal;
  line-height: 1.35;
  word-break: keep-all;
}

.monthly-table .group-overtime,
.monthly-table .group-night,
.monthly-table .group-holiday,
.monthly-table .group-total,
.monthly-table .group-carry,
.monthly-table .group-issue,
.monthly-table .group-note {
  background: #f1f1f3;
}

.monthly-table thead .group-overtime {
  background: #e8f1fb;
}

.monthly-table thead .group-overtime-sub {
  background: #e8f1fb;
}

.monthly-table thead .group-night {
  background: #f0ebfb;
}

.monthly-table thead .group-night-sub {
  background: #f0ebfb;
}

.monthly-table thead .group-holiday {
  background: #fbeaea;
}

.monthly-table thead .group-holiday-sub {
  background: #fbeaea;
}

.monthly-table thead .group-total {
  background: #eeeeef;
}

.monthly-table thead .group-carry {
  background: #f8f1da;
}

.monthly-table thead .group-result-carry {
  background: #eaf5ea;
}

.monthly-table thead .group-issue {
  background: #eeeeef;
}

.monthly-table thead .group-note {
  background: #eeeeef;
}

.monthly-table thead .group-highlight {
  background: #e3f4e5;
  border-top: 2px solid #7bb57f;
  border-left: 2px solid #7bb57f;
  border-right: 2px solid #7bb57f;
}

.monthly-table .group-overtime-sub,
.monthly-table .group-night-sub,
.monthly-table .group-holiday-sub,
.monthly-table .cell-overtime,
.monthly-table .cell-night,
.monthly-table .cell-holiday,
.monthly-table .cell-issue,
.monthly-table .cell-total {
  background: #fafafb;
}

.monthly-table .cell-carry {
  background: #fff8e4;
}

.monthly-table .cell-result-carry {
  background: #f2faf2;
}

.monthly-table .cell-note {
  background: #fafafb;
  color: var(--muted);
  white-space: normal;
  line-height: 1.45;
  text-align: left;
}

.monthly-table .cell-highlight {
  background: #f1fbf2;
  border-left: 2px solid #7bb57f;
  border-right: 2px solid #7bb57f;
}

.monthly-table .cell-edit {
  background: #ffffff;
}

.monthly-table .strong {
  font-weight: 700;
}

.monthly-table tbody tr:last-child td {
  border-bottom: none;
}

.monthly-table tbody tr:last-child .cell-highlight {
  border-bottom: 2px solid #7bb57f;
}

.monthly-table th:last-child,
.monthly-table td:last-child {
  border-right: none;
}

.monthly-table .time-head,
.monthly-table .cell-time {
  width: 40px;
  min-width: 40px;
  padding-left: 4px;
  padding-right: 4px;
}

.guide-table {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.guide-row {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 14px;
  padding: 12px 14px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  line-height: 1.6;
}

.guide-row:first-child {
  border-top: none;
}

.guide-head {
  background: var(--soft);
}

.foot-list {
  margin: 12px 0 0;
  padding-left: 18px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.foot-item + .foot-item {
  margin-top: 4px;
}

.report-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.report-copy-button {
  margin-left: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.copy-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 20;
  display: grid;
  gap: 6px;
  width: min(360px, calc(100vw - 32px));
  padding: 14px 16px;
  background: #fffdf6;
  border: 1px solid #f0d16b;
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(9, 9, 11, 0.12);
}

.copy-toast strong {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a6400;
}

.copy-toast p {
  font-size: 13px;
  line-height: 1.5;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 900px) {
  .guide-row {
    grid-template-columns: 1fr;
  }

  .transfer-shell {
    padding: 16px;
  }

  .transfer-rail {
    grid-template-columns: 1fr;
  }

  .transfer-divider {
    display: none;
  }

  .transfer-upload-row {
    grid-template-columns: 1fr;
  }

  .transfer-upload-row small {
    grid-column: auto;
  }
}

@media (max-width: 620px) {
  main {
    width: min(100% - 16px, 1320px);
  }

  .panel {
    padding: 15px;
  }

  .head {
    flex-direction: column;
    align-items: stretch;
  }

  .table-actions {
    flex-wrap: wrap;
  }

  .table-toolbar,
  .table-filters {
    flex-direction: column;
    align-items: stretch;
  }

  .transfer-rail {
    gap: 16px;
  }

  .transfer-shell {
    padding: 14px;
  }

  .transfer-month-controls,
  .transfer-button-row,
  .transfer-upload-row {
    width: 100%;
  }

  .download-action-button {
    width: 100%;
  }

  .download-actions {
    justify-content: flex-start;
  }
}
</style>


