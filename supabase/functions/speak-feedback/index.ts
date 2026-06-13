/**
 * speak-feedback — Deno serve 진입점 (실제 deps 조립).
 *
 * handler.ts의 순수 핸들러에 실제 의존성(Supabase 클라이언트·OpenAI)을 주입한다.
 * index.test.ts는 handler.ts만 import하므로, 이 파일의 외부 import가 테스트를 깨지 않는다.
 *
 * 보안:
 *  - OPENAI_API_KEY는 Deno.env에서만 읽고 절대 로그·응답에 노출하지 않는다.
 *  - getUser는 요청의 user JWT로 검증(anon 클라이언트 + Authorization 헤더).
 *  - usage 증가·attempt 저장은 service role 클라이언트(RLS 우회)로 수행.
 *  - 키 미설정 시 callLlm이 throw → 핸들러 폴백 경로 동작.
 *
 * 배포: supabase functions deploy speak-feedback
 * secret: supabase secrets set OPENAI_API_KEY=...
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handleSpeakFeedback,
  buildPrompt,
  type FeedbackDeps,
  type SpeakFeedback,
  type Verdict,
} from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

const DAILY_LIMIT = 10;
const OPENAI_MODEL = 'gpt-4o-mini';
const OPENAI_MAX_TOKENS = 300;
const OPENAI_TEMPERATURE = 0.3;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** service role 클라이언트 — RLS 우회 (usage 증가·attempt 저장). */
function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const VALID_VERDICTS: Verdict[] = ['natural', 'ok', 'awkward'];
const MAX_FEEDBACK_FIELD_LENGTH = 500;

/** LLM 출력 정제: 제어문자 제거 + 길이 cap. 저장·재사용 시 2차 피해 표면 축소. */
function sanitizeField(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    // 제어문자(C0 0x00-0x1F, DEL 0x7F)는 공백으로 치환
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out.trim().slice(0, MAX_FEEDBACK_FIELD_LENGTH);
}

function coerceFeedback(raw: unknown): SpeakFeedback {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const verdict = VALID_VERDICTS.includes(obj.verdict as Verdict)
    ? (obj.verdict as Verdict)
    : 'ok';
  const correction = typeof obj.correction === 'string' ? sanitizeField(obj.correction) : '';
  const alternative = typeof obj.alternative === 'string' ? sanitizeField(obj.alternative) : '';
  if (!correction) {
    throw new Error('LLM response missing correction');
  }
  return { verdict, correction, alternative };
}

const deps: FeedbackDeps = {
  getUser: async (authHeader) => {
    if (!authHeader) return null;
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return null;
    return { id: data.user.id };
  },

  checkAndIncrementUsage: async (userId, date) => {
    const client = serviceClient();
    // 원자적 검사·증가 — DB의 increment_speaking_usage RPC가
    // `UPDATE ... SET count = count + 1 WHERE count < limit`을 row lock으로 직렬화.
    // 동시 요청 레이스(TOCTOU)로 일일 한도를 넘기지 못하게 한다 (migration 006).
    const { data, error } = await client.rpc('increment_speaking_usage', {
      p_user: userId,
      p_date: date,
      p_limit: DAILY_LIMIT,
    });
    if (error) {
      // RPC 실패 시 보수적으로 차단(비용 폭탄 방지 우선).
      return { allowed: false, remaining: 0 };
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed: boolean; remaining: number }
      | null;
    if (!row) return { allowed: false, remaining: 0 };
    return { allowed: row.allowed, remaining: Math.max(0, row.remaining) };
  },

  callLlm: async (prompt) => {
    if (!OPENAI_API_KEY) {
      // 키 미설정 → throw → 핸들러 폴백. 키 값은 어디에도 노출하지 않는다.
      throw new Error('OPENAI_API_KEY not configured');
    }
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: OPENAI_MAX_TOKENS,
        temperature: OPENAI_TEMPERATURE,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      }),
    });
    if (!resp.ok) {
      // 응답 본문을 로그하지 않는다(키·요청 메타 유출 방지).
      throw new Error(`OpenAI request failed: ${resp.status}`);
    }
    const json = await resp.json();
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('Empty LLM content');
    return coerceFeedback(JSON.parse(content));
  },

  saveAttempt: async (row) => {
    const client = serviceClient();
    const r = row as {
      user_id: string;
      scenario_id: string | null;
      turn_order: number;
      user_text: string;
      feedback: unknown;
    };
    await client.from('speaking_attempts').insert({
      user_id: r.user_id,
      scenario_id: r.scenario_id,
      turn_order: r.turn_order,
      user_text: r.user_text,
      feedback: r.feedback,
    });
  },

  getExpectedTurn: async (scenarioSlug, turnOrder) => {
    const client = serviceClient();
    const { data: scenario } = await client
      .from('speaking_scenarios')
      .select('id')
      .eq('slug', scenarioSlug)
      .maybeSingle();
    if (!scenario) return null;
    const { data: turn } = await client
      .from('dialogue_turns')
      .select('text_en')
      .eq('scenario_id', scenario.id)
      .eq('turn_order', turnOrder)
      .maybeSingle();
    return {
      text_en: turn?.text_en ?? '',
      scenario_id: scenario.id as string,
    };
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  const res = await handleSpeakFeedback(req, deps);
  // CORS 헤더를 응답에 병합.
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});

// buildPrompt re-export (배포 환경에서 참조 가능하도록).
export { buildPrompt };
