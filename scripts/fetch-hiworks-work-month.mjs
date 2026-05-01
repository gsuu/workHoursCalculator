import fs from "node:fs/promises";
import path from "node:path";

const LOGIN_URL = "https://auth-api.office.hiworks.com/office-web/login";
const EXPORT_URL = "https://hr-work-api.office.hiworks.com/v4/excel/export/work-month";
const TENANT_PAGE_BASE = "https://login.office.hiworks.com";
const DEFAULT_DOMAIN = "cttd.co.kr";

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`값이 필요합니다: --${key}`);
    }
    args[key] = value;
    index += 1;
  }
  return args;
};

const getPreviousMonth = () => {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
};

const mergeCookies = (...sources) => {
  const map = new Map();
  for (const source of sources) {
    if (!source) continue;
    for (const pair of source.split(";")) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const equalIndex = trimmed.indexOf("=");
      if (equalIndex < 1) continue;
      map.set(trimmed.slice(0, equalIndex), trimmed.slice(equalIndex + 1));
    }
  }
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
};

const cookieHeaderFromResponse = (response) => {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);

  return setCookies
    .filter(Boolean)
    .map((entry) => entry.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
};

const warmTenantCookies = async (domain) => {
  const url = `${TENANT_PAGE_BASE}/${encodeURIComponent(domain)}`;
  const response = await fetch(url, { redirect: "manual" });
  // 200, 301, 302 모두 정상으로 간주 — 쿠키만 회수
  if (![200, 301, 302].includes(response.status)) {
    const text = await response.text().catch(() => "");
    throw new Error(`테넌트 페이지 접근 실패: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  return cookieHeaderFromResponse(response);
};

const login = async ({ id, password, domain, warmCookieHeader }) => {
  const referer = `${TENANT_PAGE_BASE}/${encodeURIComponent(domain)}`;
  const response = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": TENANT_PAGE_BASE,
      "Referer": referer,
      ...(warmCookieHeader ? { Cookie: warmCookieHeader } : {})
    },
    body: JSON.stringify({ id, password, ip_security_level: "1" })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`로그인 실패: HTTP ${response.status} ${text.slice(0, 200)}`);
  }

  const loginCookies = cookieHeaderFromResponse(response);
  const merged = mergeCookies(warmCookieHeader, loginCookies);
  if (!merged) {
    throw new Error("로그인 응답에 Set-Cookie가 없습니다. 자격증명 또는 2FA 설정을 확인하세요.");
  }
  return merged;
};

const downloadExcel = async ({ cookieHeader, year, month, nodeId, type, outPath }) => {
  const url = `${EXPORT_URL}?filter[year]=${year}&filter[month]=${month}&filter[node_id]=${nodeId}&filter[type]=${type}`;
  const response = await fetch(url, { headers: { Cookie: cookieHeader } });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`다운로드 실패(${type}): HTTP ${response.status} ${text.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1024) {
    const head = buffer.toString("utf8", 0, Math.min(200, buffer.length));
    throw new Error(`다운로드된 파일이 비정상입니다(${type}, ${buffer.length}바이트): ${head}`);
  }

  await fs.writeFile(outPath, buffer);
  return outPath;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const id = process.env.HIWORKS_ID;
  const password = process.env.HIWORKS_PW;
  const nodeId = process.env.HIWORKS_NODE_ID || "12344";
  const domain = process.env.HIWORKS_DOMAIN || DEFAULT_DOMAIN;

  if (!id || !password) {
    throw new Error("HIWORKS_ID와 HIWORKS_PW 환경변수가 필요합니다.");
  }

  const previous = getPreviousMonth();
  const year = Number(args.year ?? previous.year);
  const month = Number(args.month ?? previous.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("year/month는 정수여야 하며 month는 1~12 범위여야 합니다.");
  }

  const outDir = path.resolve(args["out-dir"] ?? "./tmp-hiworks");
  await fs.mkdir(outDir, { recursive: true });

  console.log(`테넌트 페이지 워밍업: ${domain}`);
  const warmCookieHeader = await warmTenantCookies(domain);

  console.log(`로그인 중...`);
  const cookieHeader = await login({ id, password, domain, warmCookieHeader });
  console.log(`로그인 완료 (쿠키 ${cookieHeader.split(";").length}개 보관)`);

  console.log(`다운로드: ${year}년 ${month}월 (node_id=${nodeId})`);
  const attendancePath = path.join(outDir, `근태현황_${year}년${month}월.xls`);
  const detailPath = path.join(outDir, `근무결과(상세)_${year}년${month}월.xls`);

  await downloadExcel({ cookieHeader, year, month, nodeId, type: "work", outPath: attendancePath });
  await downloadExcel({ cookieHeader, year, month, nodeId, type: "detail", outPath: detailPath });

  console.log(`완료:`);
  console.log(`- ${attendancePath}`);
  console.log(`- ${detailPath}`);

  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(
      process.env.GITHUB_OUTPUT,
      `attendance=${attendancePath}\ndetail=${detailPath}\nyear=${year}\nmonth=${month}\n`
    );
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
