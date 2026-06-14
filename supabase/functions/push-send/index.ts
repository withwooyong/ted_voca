/**
 * push-send — Deno serve 진입점 (실제 deps 조립).
 *
 * handler.ts 의 순수 핸들러에 실제 의존성(Supabase service role 클라이언트·Expo Push API)을 주입한다.
 * index.test.ts 는 handler.ts 만 import 하므로, 이 파일의 외부 import 가 테스트를 깨지 않는다.
 *
 * 보안:
 *  - PUSH_ADMIN_SECRET 은 Deno.env 에서만 읽고 절대 로그·응답에 노출하지 않는다.
 *  - 관리자 인증은 X-Admin-Secret 헤더의 **상수시간 비교**(타이밍 공격 완화). env 미설정 시 항상 거부(fail-closed).
 *  - 토큰 조회·삭제는 service role 클라이언트(RLS 우회)로 수행 — 대량 발송은 서비스 관리 작업.
 *  - 발송 대상 토큰 값은 응답·로그에 남기지 않는다(handler 가 요약 카운트만 반환).
 *
 * 배포: supabase functions deploy push-send
 * secret: supabase secrets set PUSH_ADMIN_SECRET=...
 * 호출:  curl -X POST "$URL/functions/v1/push-send" \
 *          -H "X-Admin-Secret: $SECRET" -H "Content-Type: application/json" \
 *          -d '{"title":"...","body":"...","tier":"silver"}'
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handlePushSend,
  type ExpoMessage,
  type ExpoTicket,
  type PushSendDeps,
  type PushTokenRow,
} from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PUSH_ADMIN_SECRET = Deno.env.get('PUSH_ADMIN_SECRET') ?? '';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-admin-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** service role 클라이언트 — RLS 우회(토큰 조회·삭제). */
function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * 상수시간 문자열 비교 — 길이 누설을 줄이기 위해 길이 먼저 확인 후 XOR 누적.
 * 비밀값 미설정(빈 문자열)이면 항상 false(fail-closed).
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const deps: PushSendDeps = {
  isAdmin: (req) => {
    if (!PUSH_ADMIN_SECRET) return false; // 비밀 미설정 → 전면 거부
    const provided = req.headers.get('X-Admin-Secret') ?? '';
    return constantTimeEqual(provided, PUSH_ADMIN_SECRET);
  },

  fetchTokens: async ({ tier }) => {
    const client = serviceClient();

    if (tier) {
      // 이번 주(UTC 월요일) 해당 tier 의 user_id 만 대상.
      // week_start 키는 007/008 SQL 의 date_trunc('week', now() AT TIME ZONE 'UTC') 와 동일해야 한다.
      const weekStart = isoUtcMonday();
      const { data: entries, error: eErr } = await client
        .from('league_entries')
        .select('user_id')
        .eq('week_start', weekStart)
        .eq('tier', tier);
      if (eErr) throw eErr;
      const ids = (entries ?? []).map((e: { user_id: string }) => e.user_id);
      if (ids.length === 0) return [];

      const { data, error } = await client
        .from('push_tokens')
        .select('expo_token, platform')
        .in('user_id', ids);
      if (error) throw error;
      return (data ?? []) as PushTokenRow[];
    }

    const { data, error } = await client
      .from('push_tokens')
      .select('expo_token, platform');
    if (error) throw error;
    return (data ?? []) as PushTokenRow[];
  },

  sendExpo: async (messages: ExpoMessage[]) => {
    const resp = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!resp.ok) {
      // 응답 본문을 로그하지 않는다(요청 메타 유출 방지).
      throw new Error(`Expo push request failed: ${resp.status}`);
    }
    const json = await resp.json();
    const tickets = json?.data;
    if (!Array.isArray(tickets)) {
      throw new Error('Expo push response missing data[]');
    }
    return tickets as ExpoTicket[];
  },

  deleteTokens: async (expoTokens: string[]) => {
    const client = serviceClient();
    // expo_token 은 디바이스 고유 → 토큰 값으로 삭제(여러 user_id 행이 있어도 모두 정리).
    await client.from('push_tokens').delete().in('expo_token', expoTokens);
  },
};

/** 이번 UTC 주의 월요일(ISO week start) YYYY-MM-DD — SQL date_trunc('week', ... 'UTC') 와 동치. */
function isoUtcMonday(): string {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=일 … 6=토
  const deltaToMonday = (dow + 6) % 7; // 월요일까지 거슬러 갈 일수
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - deltaToMonday),
  );
  return monday.toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  const res = await handlePushSend(req, deps);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});
