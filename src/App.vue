<script setup>
import { computed, nextTick, ref } from "vue";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import { ko } from "date-fns/locale";
import {
  calculateEntry,
  calculateSummaryStats,
  formatDateOnly,
  getCalendarDayKind
} from "./overtimeCalculator.js";
import "@vuepic/vue-datepicker/dist/main.css";

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createEntry = () => ({
  id: createId(),
  date: "",
  start: "09:00",
  end: "18:00"
});

const entries = ref([createEntry()]);
const datePickerRefs = new Map();
const startInputRefs = new Map();
const copyToastMessage = ref("");
const copyToastVisible = ref(false);
let copyToastTimer = null;

const entryViews = computed(() =>
  entries.value.map((entry, index) => ({
    index: index + 1,
    entry,
    ...calculateEntry(entry)
  }))
);

const summaryStats = computed(() => calculateSummaryStats(entryViews.value));

const summaryCopyText = computed(() =>
  [
    String(summaryStats.value.weekday150Hours),
    String(summaryStats.value.weekday150RemainMinutes),
    String(summaryStats.value.weekday200Hours),
    String(summaryStats.value.weekday200RemainMinutes)
  ].join("\t")
);

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

const copySummaryStats = async () => {
  try {
    await navigator.clipboard.writeText(summaryCopyText.value);
    openCopyToast("평일 데이터가 복사 되었습니다. 구글 스프레드시트에 Ctrl+V 해서 붙여넣기 하세요.");
  } catch {
    openCopyToast("복사에 실패했습니다. 다시 시도해 주세요.");
  }
};

const copyReportEmail = async () => {
  try {
    await navigator.clipboard.writeText("jisuk@cttd.co.kr");
    openCopyToast("이메일 주소가 복사되었습니다.");
  } catch {
    openCopyToast("주소 복사에 실패했습니다. 다시 시도해 주세요.");
  }
};

const addEntry = () => {
  entries.value.push(createEntry());
};

const resetEntries = () => {
  entries.value = [createEntry()];
};

const removeEntry = (id) => {
  entries.value = entries.value.filter((entry) => entry.id !== id);
};

const formatTimeInput = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

const updateTimeInput = (entry, field, value) => {
  entry[field] = formatTimeInput(value);
};

const setStartInputRef = (entryId, element) => {
  if (element) {
    startInputRefs.set(entryId, element);
    return;
  }

  startInputRefs.delete(entryId);
};

const setDatePickerRef = (entryId, instance) => {
  if (instance) {
    datePickerRefs.set(entryId, instance);
    return;
  }

  datePickerRefs.delete(entryId);
};

const openDatePickerMenu = (entryId) => {
  datePickerRefs.get(entryId)?.openMenu?.();
};

const focusStartInput = async (entryId) => {
  await nextTick();
  const input = startInputRefs.get(entryId);
  input?.focus();
  input?.select?.();
};

const normalizeTimeInput = (entry, field) => {
  const value = String(entry[field] ?? "").trim();
  if (!value) {
    entry[field] = "";
    return;
  }

  const formatted = formatTimeInput(value);
  if (!/^\d{2}:\d{2}$/.test(formatted)) {
    entry[field] = formatted;
    return;
  }

  const [hours, minutes] = formatted.split(":").map(Number);
  if (hours > 23 || minutes > 59) {
    entry[field] = formatted;
    return;
  }

  entry[field] = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
</script>

<template>
  <main>
    <section class="panel hero">
      <div class="hero-head">
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
          <p>날짜와 시간만 입력하면 근무 유형과 점심 휴게가 자동으로 반영됩니다.</p>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="head">
        <div>
          <h2>근무 입력</h2>
          <p class="sub">입력한 근무를 왼쪽에서 관리하고 환산 통계는 오른쪽에서 바로 확인할 수 있습니다.</p>
        </div>
        <div class="toolbar">
          <button class="button secondary reset-button" type="button" @click="resetEntries">
            전체 초기화
          </button>
        </div>
      </div>

      <div class="input-layout">
        <div class="list">
          <div v-for="view in entryViews" :key="view.entry.id" class="entry-row">
            <article class="item">
              <div class="grid">
                <div class="field span3">
                  <VueDatePicker
                    :ref="(instance) => setDatePickerRef(view.entry.id, instance)"
                    v-model="view.entry.date"
                    @update:model-value="focusStartInput(view.entry.id)"
                    model-type="yyyy-MM-dd"
                    :locale="ko"
                    :format="formatDateOnly"
                    auto-apply
                    :teleport="true"
                    :hide-navigation="['time']"
                    :time-picker="false"
                    :enable-time-picker="false"
                    :hide-input-icon="true"
                    :clearable="false"
                    placeholder="연도-월-일"
                  >
                    <template #trigger>
                      <input
                        :value="formatDateOnly(view.entry.date)"
                        class="date-display-input"
                        type="text"
                        readonly
                        placeholder="연도-월-일"
                        autocomplete="off"
                        @mousedown.prevent.stop
                        @click.stop="openDatePickerMenu(view.entry.id)"
                        @focus="openDatePickerMenu(view.entry.id)"
                      >
                    </template>
                    <template #calendar-header="{ index, day }">
                      <span
                        :class="[
                          'calendar-header-label',
                          {
                            saturday: index === 5,
                            sunday: index === 6
                          }
                        ]"
                      >
                        {{ day }}
                      </span>
                    </template>
                    <template #day="{ day, date }">
                      <span
                        :class="[
                          'calendar-day-cell',
                          `is-${getCalendarDayKind(date)}`
                        ]"
                      >
                        {{ day }}
                      </span>
                    </template>
                  </VueDatePicker>
                </div>

                <label>
                  <span>출근</span>
                  <input
                    :ref="(element) => setStartInputRef(view.entry.id, element)"
                    :value="view.entry.start"
                    class="time-text-input"
                    type="text"
                    inputmode="numeric"
                    maxlength="5"
                    placeholder="09:00"
                    autocomplete="off"
                    @input="updateTimeInput(view.entry, 'start', $event.target.value)"
                    @blur="normalizeTimeInput(view.entry, 'start')"
                  >
                </label>

                <label>
                  <span>퇴근</span>
                  <input
                    :value="view.entry.end"
                    class="time-text-input"
                    type="text"
                    inputmode="numeric"
                    maxlength="5"
                    placeholder="18:00"
                    autocomplete="off"
                    @input="updateTimeInput(view.entry, 'end', $event.target.value)"
                    @blur="normalizeTimeInput(view.entry, 'end')"
                  >
                </label>

                <label>
                  <span>점심 휴게</span>
                  <div :class="['static-field', { inactive: !view.lunchBreakApplied }]">
                    {{ view.lunchBreakLabel }}
                  </div>
                </label>

                <div class="delete-cell">
                  <button
                    class="button danger icon-button"
                    type="button"
                    aria-label="입력 삭제"
                    @click="removeEntry(view.entry.id)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h2v8H7V9Zm4 0h2v8h-2V9Zm4 0h2v8h-2V9Z"
                        fill="currentColor"
                      />
                      <path
                        d="M6 7h12v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7Z"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <div class="entry-meta" v-if="view.workModeLabel && !view.error">
                  {{ view.workModeLabel }} 기준 · {{ view.workModeDescription }}
                </div>
                <div class="error">{{ view.error }}</div>
              </div>
            </article>
          </div>

          <div v-if="entryViews.length > 0" class="add-row">
            <button
              class="button primary icon-button bottom-add-button"
              type="button"
              aria-label="근무 추가"
              @click="addEntry"
            >
              +
            </button>
          </div>

          <div v-if="entryViews.length === 0" class="empty-state">
            <p>현재 입력된 근무가 없습니다.</p>
            <button class="button primary empty-add-button" type="button" @click="addEntry">
              근무 추가
            </button>
          </div>
        </div>

        <aside class="summary-panel">
          <div class="summary-head">
            <h3>환산 통계</h3>
            <p>구글 스프레드시트에 붙여넣기 쉽도록 가로 복사를 지원합니다.</p>
          </div>

          <div class="result-sheet">
            <div class="result-sheet-title with-action">
              <span>평일 계산된 데이터</span>
              <button class="button copy-button copy-accent" type="button" @click="copySummaryStats">
                copy
              </button>
            </div>
            <div class="result-four-grid result-four-head">
              <div class="result-group" style="grid-column: span 2;">연장(150%)</div>
              <div class="result-group" style="grid-column: span 2;">야간(200%)</div>
            </div>
            <div class="result-four-grid result-four-label">
              <div>시간</div>
              <div>분</div>
              <div>시간</div>
              <div>분</div>
            </div>
            <div class="result-four-grid result-four-value">
              <div>{{ summaryStats.weekday150Hours }}</div>
              <div>{{ summaryStats.weekday150RemainMinutes }}</div>
              <div>{{ summaryStats.weekday200Hours }}</div>
              <div>{{ summaryStats.weekday200RemainMinutes }}</div>
            </div>
            <div class="result-caption">
              <span>연장 적용 {{ summaryStats.weekday150Count }}건</span>
              <span>야간 적용 {{ summaryStats.weekday200Count }}건</span>
            </div>
          </div>

          <div class="result-sheet">
            <div class="result-sheet-title">휴일 계산된 데이터</div>
            <div class="result-single-head">휴일근무 총(h)</div>
            <div class="result-single-value">{{ summaryStats.weekendHolidayWeightedText }}</div>
            <div class="result-caption single">
              <span>휴일·휴무일 적용 {{ summaryStats.weekendHolidayCount }}건</span>
            </div>
          </div>

        </aside>
      </div>
    </section>

    <section class="panel">
      <div class="head">
        <div>
          <h2>근무 기준 안내</h2>
          <p class="sub">계산은 아래 기준으로 적용합니다.</p>
        </div>
      </div>

      <div class="guide-table">
        <div class="guide-row guide-head">
          <strong>구분</strong>
          <strong>적용 기준</strong>
        </div>
        <div class="guide-row">
          <strong>평일 근무</strong>
          <span>1일 8시간 또는 1주 40시간 초과분은 연장근로, 22시~06시는 야간근로로 계산합니다.</span>
        </div>
        <div class="guide-row">
          <strong>점심 휴게</strong>
          <span>근무 시간이 11:30~12:30 구간을 포함하면 점심 휴게 60분이 자동으로 차감됩니다.</span>
        </div>
        <div class="guide-row">
          <strong>휴무일 근무</strong>
          <span>토요일은 휴무일 근무로 보고, 일반적인 연장 및 야간 가산 기준으로 계산합니다.</span>
        </div>
        <div class="guide-row">
          <strong>휴일 근무</strong>
          <span>일요일과 공휴일은 휴일근무 기준을 적용하고, 8시간 이내 1.5배, 초과분 2배, 야간은 별도 가산합니다.</span>
        </div>
      </div>

      <p class="foot">
        근로기준법 제50조, 제55조, 제56조 기준입니다. 상시 5인 이상 사업장과 일반적인 근로시간제를 전제로 합니다.
      </p>

      <div class="report-row">
        <p class="report-text">
          오류가 있을 경우
          <a class="report-link" href="mailto:jisuk@cttd.co.kr?subject=%EC%98%A4%EB%A5%98%20%EC%8B%A0%EA%B3%A0">
            여기
          </a>
          로 알려주세요. 메일이 열리지 않는 경우
          <button class="report-copy-button" type="button" @click="copyReportEmail">주소 복사</button>
        </p>
      </div>
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
  background: var(--bg);
  color: var(--text);
}

button,
input,
select {
  font: inherit;
}

main {
  width: min(1080px, calc(100% - 24px));
  margin: 20px auto 36px;
  display: grid;
  gap: 14px;
}

.panel {
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 1px rgba(9, 9, 11, 0.03);
}

.hero {
  background:
    linear-gradient(180deg, rgba(9, 9, 11, 0.015), rgba(9, 9, 11, 0)),
    var(--card);
}

.hero-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.hero-copy {
  display: grid;
  gap: 8px;
}

.logo-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 18px;
  color: var(--text);
}

.logo-slot svg {
  width: 100%;
  height: 100%;
  display: block;
  fill: currentColor;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  font-size: clamp(26px, 4vw, 36px);
  line-height: 1.04;
  letter-spacing: -0.04em;
}

.hero p {
  max-width: 560px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.head h2 {
  font-size: 18px;
  letter-spacing: -0.02em;
}

.sub,
.foot {
  color: var(--muted);
}

.sub {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
}

.toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.primary {
  background: var(--text);
  color: #fff;
  border: 1px solid var(--text);
}

.secondary,
.danger {
  background: #fff;
  border: 1px solid var(--line);
}

.secondary {
  color: var(--text);
}

.danger {
  color: var(--muted);
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  min-width: 40px;
  height: 40px;
  padding: 0;
  line-height: 1;
}

.icon-button svg {
  width: 16px;
  height: 16px;
}

.reset-button,
.copy-button {
  min-height: 34px;
  padding: 0 10px;
  font-size: 12px;
}

.copy-button {
  min-height: 28px;
  padding: 0 8px;
  font-size: 11px;
}

.copy-accent {
  background: #ffd86b;
  color: #09090b;
  border: 1px solid #e5bf4d;
}

.input-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 18px;
  align-items: start;
}

.list {
  display: grid;
  gap: 0;
}

.entry-row {
  display: block;
  padding: 12px 0;
}

.entry-row + .entry-row {
  border-top: 1px solid var(--line);
}

.item {
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.grid {
  display: grid;
  grid-template-columns: 1.2fr repeat(3, minmax(0, 1fr)) auto;
  gap: 10px;
  align-items: end;
  width: min(100%, 920px);
  margin: 0 auto;
}

.add-row {
  display: flex;
  justify-content: center;
  padding: 12px 0 4px;
}

.bottom-add-button {
  border-radius: 999px;
}

.delete-cell {
  display: flex;
  align-items: end;
  justify-content: flex-end;
}

.entry-meta,
.error {
  grid-column: 1 / -1;
  min-height: 18px;
  font-size: 12px;
}

.entry-meta {
  color: var(--muted);
}

.error {
  color: var(--danger);
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 28px 20px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, #fbfbfb, #f7f7f8);
  text-align: center;
}

.empty-state p {
  color: var(--muted);
  font-size: 13px;
}

.empty-add-button {
  width: auto;
  min-width: 120px;
}

.summary-panel {
  position: sticky;
  top: 20px;
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, #fcfcfd, #f7f7f8);
}

.summary-head {
  display: grid;
  gap: 4px;
}

.summary-head h3 {
  font-size: 15px;
  letter-spacing: -0.02em;
}

.summary-head p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.result-sheet {
  display: grid;
  gap: 0;
  border: 1px solid #191919;
  background: #fff;
}

.result-sheet-title,
.result-single-head,
.result-group,
.result-four-label div,
.result-four-value div,
.result-single-value {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.result-sheet-title {
  min-height: 38px;
  padding: 8px 12px;
  border-bottom: 1px solid #191919;
  background: #ffe38c;
  font-size: 13px;
  font-weight: 700;
}

.result-sheet-title.with-action {
  justify-content: space-between;
  gap: 10px;
}

.result-four-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.result-group,
.result-four-label div,
.result-four-value div,
.result-single-head,
.result-single-value {
  min-height: 48px;
  padding: 8px;
  border-right: 1px solid #191919;
  border-bottom: 1px solid #191919;
  font-size: 12px;
}

.result-four-grid > :last-child,
.result-single-head,
.result-single-value {
  border-right: none;
}

.result-group,
.result-single-head {
  background: #f7f7f8;
  font-weight: 700;
}

.result-four-label div {
  min-height: 36px;
  background: #fff;
  font-weight: 600;
}

.result-four-value div,
.result-single-value {
  min-height: 44px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text);
}

.result-caption {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  color: var(--muted);
  font-size: 11px;
  line-height: 1.3;
}

.result-caption.single {
  grid-template-columns: 1fr;
}

.result-caption span {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 8px;
  border-top: 1px solid #191919;
  border-right: 1px solid #191919;
  text-align: center;
}

.result-caption span:last-child {
  border-right: none;
}

label {
  display: grid;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
}

.field {
  display: grid;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
}

label span,
.field span {
  color: var(--text);
}

input,
select {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: #fcfcfd;
  color: var(--text);
}

.dp__theme_light {
  --dp-border-color: var(--line);
  --dp-hover-color: #f5f6f8;
  --dp-primary-color: #09090b;
  --dp-primary-disabled-color: #71717a;
  --dp-border-radius: 8px;
  --dp-font-size: 0.875rem;
  --dp-cell-size: 30px;
  --dp-common-padding: 8px;
  --dp-menu-padding: 4px 6px;
  --dp-month-year-row-height: 30px;
  --dp-month-year-row-button-size: 22px;
  --dp-button-height: 28px;
  --dp-button-icon-height: 16px;
  --dp-calendar-header-cell-padding: 0.25rem;
  --dp-input-padding: 6px 10px;
  --dp-menu-min-width: 232px;
  font-family: "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif;
}

.dp__input {
  min-height: 40px;
  padding: 10px 12px;
  border-color: var(--line);
  border-radius: var(--radius-sm);
  background: #fcfcfd;
  color: var(--text);
  font-size: 12px;
  line-height: 1.2;
  font-weight: 400;
  font-family: "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif;
}

.dp__input_icon,
.dp__input_icons {
  display: none !important;
}

.dp__input_icon_pad,
.dp__input,
.dp__input_reg {
  padding-inline-start: 12px !important;
  padding-inline-end: 12px !important;
}

.dp__menu {
  border-color: var(--line);
  border-radius: 10px;
  box-shadow: 0 14px 28px rgba(9, 9, 11, 0.1);
  font-family: "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif;
  font-size: 12px;
}

.dp__calendar_header_item {
  justify-content: center;
}

.dp__month_year_wrap,
.dp__calendar,
.dp__inner_nav,
.dp__month_year_select,
.dp__calendar_header,
.dp__cell_inner {
  font-family: "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif;
}

[data-test-id="clear-input-value-btn"],
.dp--clear-btn {
  display: none !important;
}

[data-test-id="open-time-picker-btn"] {
  display: none !important;
}

.calendar-header-label,
.calendar-day-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.calendar-header-label.saturday,
.calendar-day-cell.is-saturday {
  color: #2563eb;
}

.calendar-header-label.sunday,
.calendar-day-cell.is-sunday,
.calendar-day-cell.is-holiday {
  color: #dc2626;
}

.calendar-day-cell.is-holiday {
  font-weight: 700;
}

.time-text-input {
  letter-spacing: 0.01em;
}

.static-field {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: #f3f3f5;
  color: var(--muted);
}

.static-field.inactive {
  background: #fcfcfd;
}

input:focus,
select:focus,
.button:focus {
  outline: 2px solid rgba(24, 24, 27, 0.12);
  outline-offset: 2px;
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

.guide-row strong {
  font-size: 12px;
}

.foot {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.6;
}

.report-row {
  display: flex;
  justify-content: flex-start;
  margin-top: 14px;
}

.report-text {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.report-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.report-copy-button {
  margin-left: 8px;
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
  color: var(--text);
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
  .hero-head,
  .guide-row {
    display: grid;
    grid-template-columns: 1fr;
  }

  .input-layout {
    grid-template-columns: 1fr;
  }

  .summary-panel {
    position: static;
  }

  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .delete-cell {
    grid-column: span 2;
    justify-content: flex-end;
  }
}

@media (max-width: 620px) {
  main {
    width: min(100% - 16px, 1080px);
  }

  .panel {
    padding: 15px;
  }

  .head,
  .hero-head {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .grid,
  .toolbar {
    grid-template-columns: 1fr;
  }

  .delete-cell,
  .entry-meta,
  .error {
    grid-column: span 1;
  }

  .button {
    width: 100%;
  }
}
</style>
