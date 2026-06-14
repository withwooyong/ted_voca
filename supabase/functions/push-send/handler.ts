/**
 * push-send — 순수 핸들러 + 헬퍼 (의존성 역전, DI 가능)
 * plan: docs/plans/v1.1-remote-push (federated-toasting-wigderson)
 *
 * 관리자가 호출하면 수집된 push_tokens 에 Expo Push API 로 캠페인 푸시를 발송하고,
 * 무효 토큰(DeviceNotRegistered)을 자동 정리한다.
 *
 * 외부 의존(관리자 인증·토큰 조회·Expo 발송·토큰 삭제)을 PushSendDeps 로 주입받아
 * 핸들러 자체는 부수효과 없이 단위 테스트 가능하다.
 * 실제 deps 조립은 index.ts(Deno serve 진입점)에서 수행한다.
 *
 * 보안 요점:
 *  - isAdmin 이 시크릿 헤더를 검증 → 미인증 401 (fail-closed)
 *  - 응답·로그에 토큰 값을 절대 노출하지 않는다(요약 카운트만 반환)
 *  - title/body 는 sanitizeField 로 제어문자 제거·길이 검증
 *  - 발송/삭제는 best-effort: 청크 발송 throw·삭제 실패가 전체 응답을 500으로 깨지 않게 격리
 */

export type PushTokenRow = { expo_token: string; platform: string | null };

export type ExpoMessage = { to: string; title: string; body: string; sound: 'default' };

/** Expo Push API 티켓(응답 data[] 원소). status='error' 시 details.error 에 사유 코드. */
export type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

export type PushSendDeps = {
  /** 시크릿 헤더 등으로 관리자 검증. false 면 401. */
  isAdmin: (req: Request) => boolean;
  /** 대상 토큰 조회. tier 가 있으면 해당 리그 티어(이번 주)만. */
  fetchTokens: (filter: { tier: string | null }) => Promise<PushTokenRow[]>;
  /** Expo Push API 발송(청크 1개, ≤100). 실패 시 throw(핸들러가 청크 격리). */
  sendExpo: (messages: ExpoMessage[]) => Promise<ExpoTicket[]>;
  /** 무효 토큰 삭제. 실패해도 응답엔 영향 없음(best-effort). */
  deleteTokens: (expoTokens: string[]) => Promise<void>;
};

const TITLE_MAX = 100;
const BODY_MAX = 500;
const EXPO_CHUNK = 100; // Expo Push API: 요청당 최대 100 메시지
const VALID_TIERS = ['bronze', 'silver', 'gold'];
/** ticket 에러 중 토큰 영구 삭제 대상. 일시 장애 코드(MessageRateExceeded 등)는 보존. */
const INVALID_TOKEN_ERROR = 'DeviceNotRegistered';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** 배열을 size 단위로 분할. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** 제어문자(C0/DEL)→공백, trim, 길이 cap. 저장·발송 시 2차 피해 표면 축소. */
export function sanitizeField(s: string, max: number): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  return out.trim().slice(0, max);
}

/** 토큰 행 → Expo 메시지(to=expo_token, 공통 title/body, sound:'default'). */
export function buildMessages(
  rows: PushTokenRow[],
  title: string,
  body: string,
): ExpoMessage[] {
  return rows.map((r) => ({ to: r.expo_token, title, body, sound: 'default' }));
}

/**
 * 티켓을 토큰과 **인덱스 정렬**로 대응시켜 DeviceNotRegistered 인 토큰만 수집.
 * 다른 에러(일시 장애)는 보존한다. 티켓 수가 토큰 수와 다르면 겹치는 구간만 안전 매칭.
 */
export function extractInvalidTokens(
  rows: PushTokenRow[],
  tickets: ExpoTicket[],
): string[] {
  const invalid: string[] = [];
  const n = Math.min(rows.length, tickets.length);
  for (let i = 0; i < n; i++) {
    const t = tickets[i];
    if (t.status === 'error' && t.details?.error === INVALID_TOKEN_ERROR) {
      invalid.push(rows[i].expo_token);
    }
  }
  return invalid;
}

/** 티켓 ok/error 카운트. */
export function summarize(tickets: ExpoTicket[]): { ok: number; error: number } {
  let ok = 0;
  let error = 0;
  for (const t of tickets) {
    if (t.status === 'ok') ok++;
    else error++;
  }
  return { ok, error };
}

/**
 * 핸들러 메인 흐름:
 *  1. OPTIONS → 200 (CORS 는 index.ts 에서 헤더 병합)
 *  2. isAdmin 검사(401)
 *  3. body 파싱(400 invalid_json) → 4. 검증(400 missing/invalid_fields)
 *  5. fetchTokens(0개면 조기 200)
 *  6. 청크별 발송(throw 격리) → 티켓 누적
 *  7. 무효 토큰 정리(best-effort)
 *  8. 200 요약 { sent, failed, invalidated }
 */
export async function handlePushSend(
  req: Request,
  deps: PushSendDeps,
): Promise<Response> {
  // 1. preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  // 2. 관리자 인증 (fail-closed)
  if (!deps.isAdmin(req)) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  // 3. body 파싱
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const rawTitle = body.title;
  const rawBody = body.body;
  const rawTier = body.tier;

  // 4a. 필수 필드 존재
  if (rawTitle === undefined || rawTitle === null || rawBody === undefined || rawBody === null) {
    return jsonResponse({ error: 'missing_fields' }, 400);
  }
  // 4b. 타입
  if (typeof rawTitle !== 'string' || typeof rawBody !== 'string') {
    return jsonResponse({ error: 'invalid_fields' }, 400);
  }
  // 4c. 공백뿐 → 누락 취급
  if (rawTitle.trim() === '' || rawBody.trim() === '') {
    return jsonResponse({ error: 'missing_fields' }, 400);
  }
  // 4d. 길이 초과는 조용히 자르지 않고 거부(관리자가 인지하도록)
  if (rawTitle.length > TITLE_MAX || rawBody.length > BODY_MAX) {
    return jsonResponse({ error: 'invalid_fields' }, 400);
  }
  // 4e. tier 검증(선택)
  let tier: string | null = null;
  if (rawTier !== undefined && rawTier !== null) {
    if (typeof rawTier !== 'string' || !VALID_TIERS.includes(rawTier)) {
      return jsonResponse({ error: 'invalid_fields' }, 400);
    }
    tier = rawTier;
  }

  const title = sanitizeField(rawTitle, TITLE_MAX);
  const text = sanitizeField(rawBody, BODY_MAX);

  // 5. 대상 토큰 조회
  const rows = await deps.fetchTokens({ tier });
  if (rows.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, invalidated: 0 }, 200);
  }

  // 6. 청크별 발송 — 청크 throw 는 격리(해당 청크 전체를 실패로 카운트, 나머지 진행).
  const tickets: ExpoTicket[] = [];
  for (const part of chunk(rows, EXPO_CHUNK)) {
    const messages = buildMessages(part, title, text);
    try {
      const partTickets = await deps.sendExpo(messages);
      // 응답 티켓 수가 메시지 수와 다를 수 있어 토큰 정렬을 위해 길이를 맞춘다.
      for (let i = 0; i < part.length; i++) {
        tickets.push(partTickets[i] ?? { status: 'error', message: 'missing_ticket' });
      }
    } catch {
      // 청크 발송 실패: 해당 토큰 전부 error 로 기록(무효 토큰 정리 대상은 아님).
      for (let i = 0; i < part.length; i++) {
        tickets.push({ status: 'error', message: 'send_failed' });
      }
    }
  }

  // 7. 무효 토큰 정리(best-effort) — 삭제 실패가 응답을 깨지 않게 격리.
  const invalidTokens = extractInvalidTokens(rows, tickets);
  if (invalidTokens.length > 0) {
    try {
      await deps.deleteTokens(invalidTokens);
    } catch {
      // 무시 — 다음 발송 시 재시도됨
    }
  }

  // 8. 요약(토큰 값 미노출)
  const { ok, error } = summarize(tickets);
  return jsonResponse({ sent: ok, failed: error, invalidated: invalidTokens.length }, 200);
}
