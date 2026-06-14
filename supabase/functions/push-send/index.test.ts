/**
 * push-send Edge Function 핸들러 단위 테스트 (Deno test)
 * 대상: supabase/functions/push-send/handler.ts (미구현) — 모두 red여야 함
 * plan: docs/plans/v1.1-remote-push (federated-toasting-wigderson)
 *
 * 실행: deno test supabase/functions/push-send/
 *
 * 핸들러를 순수 함수로 분리하여 fake deps 주입으로 테스트한다.
 * 외부 API(Expo Push)·DB 호출 없이 의존성 역전(DI)으로 완전한 단위 테스트 가능.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  handlePushSend,
  chunk,
  sanitizeField,
  buildMessages,
  extractInvalidTokens,
  summarize,
  type PushSendDeps,
  type PushTokenRow,
  type ExpoTicket,
} from './handler.ts';

// ────────────────────────────────────────────────────────────
// Fake deps helpers
// ────────────────────────────────────────────────────────────

const THREE_TOKENS: PushTokenRow[] = [
  { expo_token: 'ExponentPushToken[a]', platform: 'ios' },
  { expo_token: 'ExponentPushToken[b]', platform: 'android' },
  { expo_token: 'ExponentPushToken[c]', platform: 'ios' },
];

function makeDeps(overrides: Partial<PushSendDeps> = {}): PushSendDeps {
  return {
    isAdmin: (_req) => true,
    fetchTokens: async (_filter) => THREE_TOKENS,
    sendExpo: async (messages) =>
      messages.map((): ExpoTicket => ({ status: 'ok', id: 'ticket-id' })),
    deleteTokens: async (_tokens) => {},
    ...overrides,
  };
}

function makeRequest(body: unknown = { title: '안녕', body: '오늘도 학습!' }): Request {
  return new Request('http://localhost/push-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': 'secret' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// ────────────────────────────────────────────────────────────
// 1. 관리자 인증
// ────────────────────────────────────────────────────────────

Deno.test('isAdmin false → 401 unauthorized', async () => {
  const res = await handlePushSend(makeRequest(), makeDeps({ isAdmin: () => false }));
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, 'unauthorized');
});

Deno.test('isAdmin true → 인증 통과(401 아님)', async () => {
  const res = await handlePushSend(makeRequest(), makeDeps());
  assertEquals(res.status, 200);
});

Deno.test('OPTIONS preflight → 200', async () => {
  const req = new Request('http://localhost/push-send', { method: 'OPTIONS' });
  const res = await handlePushSend(req, makeDeps());
  assertEquals(res.status, 200);
});

// ────────────────────────────────────────────────────────────
// 2. 바디 검증
// ────────────────────────────────────────────────────────────

Deno.test('잘못된 JSON → 400 invalid_json', async () => {
  const res = await handlePushSend(makeRequest('{not json'), makeDeps());
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'invalid_json');
});

Deno.test('title 누락 → 400 missing_fields', async () => {
  const res = await handlePushSend(makeRequest({ body: '본문' }), makeDeps());
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'missing_fields');
});

Deno.test('body 누락 → 400 missing_fields', async () => {
  const res = await handlePushSend(makeRequest({ title: '제목' }), makeDeps());
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'missing_fields');
});

Deno.test('title 공백뿐 → 400 missing_fields', async () => {
  const res = await handlePushSend(makeRequest({ title: '   ', body: '본문' }), makeDeps());
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'missing_fields');
});

Deno.test('title 비문자열 → 400 invalid_fields', async () => {
  const res = await handlePushSend(makeRequest({ title: 123, body: '본문' }), makeDeps());
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'invalid_fields');
});

Deno.test('title 100자 초과 → 400 invalid_fields', async () => {
  const res = await handlePushSend(
    makeRequest({ title: 'a'.repeat(101), body: '본문' }),
    makeDeps(),
  );
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'invalid_fields');
});

Deno.test('body 500자 초과 → 400 invalid_fields', async () => {
  const res = await handlePushSend(
    makeRequest({ title: '제목', body: 'a'.repeat(501) }),
    makeDeps(),
  );
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'invalid_fields');
});

Deno.test('잘못된 tier → 400 invalid_fields', async () => {
  const res = await handlePushSend(
    makeRequest({ title: '제목', body: '본문', tier: 'platinum' }),
    makeDeps(),
  );
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'invalid_fields');
});

Deno.test('유효 tier(silver) → 통과 + fetchTokens 필터로 전달', async () => {
  let received: { tier: string | null } | null = null;
  const deps = makeDeps({
    fetchTokens: async (filter) => {
      received = filter;
      return THREE_TOKENS;
    },
  });
  const res = await handlePushSend(
    makeRequest({ title: '제목', body: '본문', tier: 'silver' }),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(received, { tier: 'silver' });
});

Deno.test('tier 미지정 → fetchTokens에 tier:null 전달', async () => {
  let received: { tier: string | null } | null = null;
  const deps = makeDeps({
    fetchTokens: async (filter) => {
      received = filter;
      return THREE_TOKENS;
    },
  });
  await handlePushSend(makeRequest({ title: '제목', body: '본문' }), deps);
  assertEquals(received, { tier: null });
});

// ────────────────────────────────────────────────────────────
// 3. 발송 흐름
// ────────────────────────────────────────────────────────────

Deno.test('토큰 0개 → 200 sent:0, sendExpo 미호출', async () => {
  let sendCalls = 0;
  const deps = makeDeps({
    fetchTokens: async () => [],
    sendExpo: async (m) => {
      sendCalls++;
      return m.map((): ExpoTicket => ({ status: 'ok' }));
    },
  });
  const res = await handlePushSend(makeRequest(), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { sent: 0, failed: 0, invalidated: 0 });
  assertEquals(sendCalls, 0);
});

Deno.test('정상 발송 3토큰 전부 ok → sent:3, invalidated:0', async () => {
  let sentMessages: { to: string; title: string; body: string }[] = [];
  const deps = makeDeps({
    sendExpo: async (m) => {
      sentMessages = m;
      return m.map((): ExpoTicket => ({ status: 'ok', id: 'x' }));
    },
  });
  const res = await handlePushSend(makeRequest({ title: 'T', body: 'B' }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { sent: 3, failed: 0, invalidated: 0 });
  // 메시지가 토큰별로 to·title·body 채워졌는지
  assertEquals(sentMessages.length, 3);
  assertEquals(sentMessages[0].to, 'ExponentPushToken[a]');
  assertEquals(sentMessages[0].title, 'T');
  assertEquals(sentMessages[0].body, 'B');
});

Deno.test('일부 DeviceNotRegistered → 해당 토큰만 삭제 + invalidated 카운트', async () => {
  let deleted: string[] = [];
  const deps = makeDeps({
    // 가운데(b) 토큰만 무효
    sendExpo: async (_m) => [
      { status: 'ok', id: 'x' },
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok', id: 'y' },
    ],
    deleteTokens: async (tokens) => {
      deleted = tokens;
    },
  });
  const res = await handlePushSend(makeRequest(), deps);
  assertEquals(await res.json(), { sent: 2, failed: 1, invalidated: 1 });
  assertEquals(deleted, ['ExponentPushToken[b]']);
});

Deno.test('DeviceNotRegistered 아닌 에러는 삭제하지 않음', async () => {
  let deleteCalls = 0;
  const deps = makeDeps({
    sendExpo: async (_m) => [
      { status: 'ok', id: 'x' },
      { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } },
      { status: 'ok', id: 'y' },
    ],
    deleteTokens: async () => {
      deleteCalls++;
    },
  });
  const res = await handlePushSend(makeRequest(), deps);
  assertEquals(await res.json(), { sent: 2, failed: 1, invalidated: 0 });
  assertEquals(deleteCalls, 0); // 삭제 대상 없으면 호출조차 안 함
});

Deno.test('100개 초과 → sendExpo 청크 분할 호출(100+50)', async () => {
  const many: PushTokenRow[] = Array.from({ length: 150 }, (_, i) => ({
    expo_token: `ExponentPushToken[${i}]`,
    platform: 'ios',
  }));
  const chunkSizes: number[] = [];
  const deps = makeDeps({
    fetchTokens: async () => many,
    sendExpo: async (m) => {
      chunkSizes.push(m.length);
      return m.map((): ExpoTicket => ({ status: 'ok', id: 'x' }));
    },
  });
  const res = await handlePushSend(makeRequest(), deps);
  assertEquals(await res.json(), { sent: 150, failed: 0, invalidated: 0 });
  assertEquals(chunkSizes, [100, 50]);
});

Deno.test('청크 발송 throw는 격리(해당 청크 실패, 나머지 진행)', async () => {
  const many: PushTokenRow[] = Array.from({ length: 150 }, (_, i) => ({
    expo_token: `ExponentPushToken[${i}]`,
    platform: 'ios',
  }));
  let call = 0;
  const deps = makeDeps({
    fetchTokens: async () => many,
    sendExpo: async (m) => {
      call++;
      if (call === 1) throw new Error('network');
      return m.map((): ExpoTicket => ({ status: 'ok', id: 'x' }));
    },
  });
  const res = await handlePushSend(makeRequest(), deps);
  // 1청크(100) 실패, 2청크(50) 성공
  assertEquals(await res.json(), { sent: 50, failed: 100, invalidated: 0 });
});

Deno.test('deleteTokens 실패는 응답을 깨지 않음(best-effort)', async () => {
  const deps = makeDeps({
    sendExpo: async (_m) => [
      { status: 'ok', id: 'x' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok', id: 'y' },
    ],
    deleteTokens: async () => {
      throw new Error('db down');
    },
  });
  const res = await handlePushSend(makeRequest(), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { sent: 2, failed: 1, invalidated: 1 });
});

Deno.test('응답에 토큰 값이 노출되지 않는다', async () => {
  const deps = makeDeps({
    sendExpo: async (_m) => [
      { status: 'ok', id: 'x' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok', id: 'y' },
    ],
  });
  const res = await handlePushSend(makeRequest(), deps);
  const text = JSON.stringify(await res.json());
  assertEquals(text.includes('ExponentPushToken'), false);
});

// ────────────────────────────────────────────────────────────
// 4. 순수 헬퍼 단위
// ────────────────────────────────────────────────────────────

Deno.test('chunk: size 단위 분할', () => {
  assertEquals(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assertEquals(chunk([], 2), []);
  assertEquals(chunk([1, 2], 5), [[1, 2]]);
});

Deno.test('sanitizeField: 제어문자→공백, trim, 길이 cap', () => {
  assertEquals(sanitizeField('  hi there  ', 100), 'hi there');
  assertEquals(sanitizeField('aaaaaaaaaa', 5), 'aaaaa');
  assertEquals(sanitizeField('정상', 100), '정상');
});

Deno.test('buildMessages: 토큰별 to·title·body·sound', () => {
  const msgs = buildMessages(THREE_TOKENS, 'T', 'B');
  assertEquals(msgs.length, 3);
  assertEquals(msgs[1], {
    to: 'ExponentPushToken[b]',
    title: 'T',
    body: 'B',
    sound: 'default',
  });
});

Deno.test('extractInvalidTokens: DeviceNotRegistered만 인덱스 정렬로 수집', () => {
  const tickets: ExpoTicket[] = [
    { status: 'ok', id: 'x' },
    { status: 'error', details: { error: 'DeviceNotRegistered' } },
    { status: 'error', details: { error: 'MessageRateExceeded' } },
  ];
  assertEquals(extractInvalidTokens(THREE_TOKENS, tickets), ['ExponentPushToken[b]']);
});

Deno.test('extractInvalidTokens: 길이 불일치 시 안전하게 매칭분만', () => {
  const tickets: ExpoTicket[] = [{ status: 'error', details: { error: 'DeviceNotRegistered' } }];
  assertEquals(extractInvalidTokens(THREE_TOKENS, tickets), ['ExponentPushToken[a]']);
});

Deno.test('summarize: ok/error 카운트', () => {
  const tickets: ExpoTicket[] = [
    { status: 'ok' },
    { status: 'ok' },
    { status: 'error', details: { error: 'DeviceNotRegistered' } },
  ];
  assertEquals(summarize(tickets), { ok: 2, error: 1 });
});
