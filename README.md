# Ted Voca

Ted 브랜드의 React Native(Expo) 영어 학습 앱 — 말해보카형 풀스위트(어휘·문법·리스닝·회화).

## 구조

```
ted_voca/
├── apps/mobile/       # Expo 앱 (P0)
├── content/           # 단어팩 JSON 시드
├── docs/              # 마스터 계획서, 와이어프레임, phase plans
├── packages/shared/   # 공유 타입
├── scripts/           # 콘텐츠 생성 스크립트
└── supabase/          # DB 마이그레이션
```

## 빠른 시작

```bash
cd apps/mobile
cp .env.example .env   # Supabase 설정 (선택)
npm install
npm start
```

Supabase 미설정 시 **Dev Mock Auth**로 로컬에서 회원가입·온보딩·홈까지 테스트 가능합니다.

## 문서

- [MASTER-PLAN.md](docs/MASTER-PLAN.md)
- [P0 Foundation](docs/plans/p0-foundation.md)
- [와이어프레임](docs/design/wireframes.md)
- [인터랙티브 프로토타입](docs/prototype/index.html) — `open docs/prototype/index.html` (P0~P6 전체 동선 클릭 모형)

## 콘텐츠

```bash
python3 scripts/generate_toeic_seed.py
# → content/toeic-800-pack.json (510 words)
```

## Supabase

```bash
# supabase/migrations/001_initial_schema.sql 을 Supabase SQL Editor에서 실행
```
