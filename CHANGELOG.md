# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/).

## [Unreleased]

### Added
- (없음)

---

## [2026-06-12] Session Summary

### Added
- P3 Grammar: 문법 퀴즈 3유형(어순 탭 배열·빈칸 선택·오류 찾기) + 오답 해설·규칙 보기 (`74f8da2`)
- 문법 사전 화면: CEFR 그룹 토픽 목록 + 상세 + 토픽 한정 출제 진입 (`74f8da2`)
- 문법 콘텐츠 파이프라인: batch 텍스트 → `grammar-pack.json` + `migrations/004_grammar.sql` 이중 출력, 20토픽/200문항(AI 초안, human review 필요), 파서 unittest 16 (`74f8da2`)
- `packages/shared/grammar.ts`: 어순 채점 정규화·칩 셔플(항등 회피)·세션 선택·약점 추천 — vitest 18케이스 (`74f8da2`)
- `WordOrderBuilder` 컴포넌트 (controlled 칩 배열) + 데이터 레이어 문법 dual-mode 확장 (`74f8da2`)
- migration 004: `quiz_attempts.grammar_question_id`, `quiz_type` enum 'grammar', `grammar_topics.tags`, `UNIQUE(topic_id, sort_order)` (`74f8da2`)
- P0~P1+P2 전체 초기 구축: Expo 앱 골격, SM-2 SRS, 어휘 퀴즈 3종, 레벨 테스트, 통계, 단어 시드 510, 테스트 인프라(vitest/jest-expo), 인터랙티브 프로토타입, P0~P6 작업계획서, ADR-0001~0003 (`4e7d761`)

### Changed
- learn 허브: 문법 잠금 해제 + weak_tags 기반 "Ted 추천" 카드 (`74f8da2`)
- 어휘 난이도 조절 입력(`getRecentResults`)에서 문법 attempt 제외 — 양 모드 (`74f8da2`)
- vocab/grammar 퀴즈 next()에 동기 더블탭 가드(finishingRef) — XP 이중 적립 방지 (`74f8da2`)

### Fixed
- 문법 콘텐츠 오류 9건: 생성기 검증이 칩 중복 등 6건, 코드리뷰가 한국어-영어 주어 불일치 등 3건 차단·수정 (`74f8da2`)

### Removed
- (없음)
