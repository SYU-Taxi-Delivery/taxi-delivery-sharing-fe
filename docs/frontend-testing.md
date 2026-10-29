# 프론트엔드 테스트 준비·추적 (#14)

기존 Vitest·React Testing Library·jsdom과 CI를 사용한다. 화면 상태·사용자 조작·요청 결과의
대응을 검증하며 실제 학교 계정, 서버 권한, DB 저장·동시성 성공을 대신하지 않는다.
서비스 행동 명세는 [테스트케이스 초안](test-cases.md), 실제 실행 결과는 각 기능 README와
작업 PR의 검증 기록을 함께 본다.

2026-10-30 실행 기록: `pnpm typecheck`, `pnpm lint`,
`pnpm test --maxWorkers=1 --no-file-parallelism`(40파일·860건), `pnpm build`가 통과했다.
이 수치는 전체 요구사항 TC의 완료율이나 실제 API 통합 성공률이 아니다.

이슈 #14의 FE 준비 범위는 기존 실행 환경 유지, 공통 fixture, 대표 기능·권한·시간·오류
검증 파일, TC 연결과 실행/격리 안내다. 관리자까지 테스트 파일을 연결했으며 테스트 성공은
해당 커밋에서 실행한 결과로 판단한다. 실제 API와 서버/수동 검증은 아래 대기 표에 남긴다.

## 실행

```sh
pnpm typecheck
pnpm exec vitest run src/test/feature-readiness.test.ts
pnpm exec vitest run src/features/auth src/features/my
pnpm exec vitest run src/features/posts src/features/participation src/features/comments
pnpm exec vitest run src/features/admin
pnpm test --maxWorkers=1 --no-file-parallelism
pnpm format:check
pnpm lint
pnpm build
```

첫 명령은 Next 라우트 타입 생성과 TypeScript 검사를 함께 실행한다. 마지막 전체 테스트는
각 기능뿐 아니라 API 유틸·시작 화면·개발 경로 차단도 포함한다. CI는 기존
`format:check → lint → typecheck → test → build` 순서를 유지한다. 테스트 프레임워크,
MSW, coverage 패키지·수치 목표, 실제 계정 접속을 추가하지 않는다.

## 대표 TC와 자동화 파일

아래는 구현된 FE 검증을 찾아 실행하는 연결표다. TC ID가 테스트 이름에 있더라도 그 TC의
BE-I/FLOW까지 통과했다는 뜻은 아니다. `~`·`/`로 축약된 이름은 해당 테스트의 실제
입력·상태·역할 변형과 assertion을 읽는다. 표의 ID 전체를 일괄 완료 처리하지 않는다.

| 기능·이슈             | 연결 TC의 대표 FE 범위                                                                                                                                                                                      | 실행 파일                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 인증·접근 제어 #5     | AUTH-001 입력/성공/실패, AUTH-002 만료·로그아웃 실패, AUTH-003 사용자 전환, `AC-AUTH-004-06~07` 로그인·역할 제한                                                                                            | [auth.test.ts](../src/features/auth/auth.test.ts), [AuthProvider.test.tsx](../src/features/auth/AuthProvider.test.tsx), [RequireAuth.test.tsx](../src/features/auth/RequireAuth.test.tsx), [LoginScreen.test.tsx](../src/features/auth/LoginScreen.test.tsx), [SignupScreen.test.tsx](../src/features/auth/SignupScreen.test.tsx) |
| 비밀번호 재설정 #29   | `AC-AUTH-001-06`, 재설정 요청·완료·사용 불가 링크의 화면 대응, 기본 미연동 처리                                                                                                                             | [passwordReset.test.ts](../src/features/auth/passwordReset.test.ts), [PasswordResetScreen.test.tsx](../src/features/auth/PasswordResetScreen.test.tsx)                                                                                                                                                                            |
| 모집 목록 #6          | `AC-DISC-001-01/04~05`, `AC-DISC-002-01~04`, `AC-TAXI-003-01`, `AC-DELIVERY-003-01`, `AC-UI-PAGE-01~02`                                                                                                     | [posts.test.ts](../src/features/posts/posts.test.ts), [PostListScreen.test.tsx](../src/features/posts/PostListScreen.test.tsx)                                                                                                                                                                                                    |
| 모집 상세·신고 #7     | `AC-DISC-004-01~06`, `AC-REPORT-001-05~09`, `AC-REPORT-002-04`, 역할별 명단·외부 링크·신고 확인/오류                                                                                                        | [postDetail.test.ts](../src/features/posts/detail/postDetail.test.ts), [PostDetailScreen.test.tsx](../src/features/posts/detail/PostDetailScreen.test.tsx)                                                                                                                                                                        |
| 작성·수정 #8          | `AC-POST-001-01~03`, `AC-POST-002-05/09~12`, `AC-POST-004-02~03`, `AC-UI-FORM-02`, `AC-DISC-005-10~13` 후보 표시·확인/재시도                                                                                | [postDraft.test.ts](../src/features/posts/form/postDraft.test.ts), [PostFormScreen.test.tsx](../src/features/posts/form/PostFormScreen.test.tsx), [DatePicker.test.tsx](../src/features/posts/form/DatePicker.test.tsx), [TimePicker.test.tsx](../src/features/posts/form/TimePicker.test.tsx)                                    |
| 참여·취소 #9          | `AC-JOIN-005-01~04`, JOIN-006 확인·중복·T-10 경계, JOIN-007~008 인원/상태 대응                                                                                                                              | [participation.test.ts](../src/features/participation/participation.test.ts), [useParticipation.test.tsx](../src/features/participation/useParticipation.test.tsx), [ParticipationPanel.test.tsx](../src/features/participation/ParticipationPanel.test.tsx)                                                                      |
| 마이페이지 #10        | `AC-MY-003-02~03` 탭 경합·오류 재시도, `AC-MY-004-01` 상태 표시, `AC-MY-001-04/002-03` 대응 최소 tombstone 표시                                                                                             | [myHistory.test.ts](../src/features/my/myHistory.test.ts), [useMyHistory.test.tsx](../src/features/my/useMyHistory.test.tsx), [MyHistoryScreen.test.tsx](../src/features/my/MyHistoryScreen.test.tsx)                                                                                                                             |
| 댓글 #11              | `AC-COORD-002-02/04`, `AC-COORD-001-06/09`, `AC-COORD-003-02/04`, 길이·상태·입력 보존·응답 유실 대응                                                                                                        | [comments.test.ts](../src/features/comments/comments.test.ts), [CommentsPanel.test.tsx](../src/features/comments/CommentsPanel.test.tsx)                                                                                                                                                                                          |
| 관리자 #12            | `AC-ADMIN-001-01/03` 목록 우선순위·접근 제한, `AC-ADMIN-002-01` 상세·최소 투영, `AC-ADMIN-004-01` 처리자/시각·독립 신고 처리, ADMIN-003 대응 숨김 결과·확인창·콘텐츠 제거, 401/403·응답 유실·이전 요청 격리 | [admin.test.ts](../src/features/admin/admin.test.ts), [AdminScreen.test.tsx](../src/features/admin/AdminScreen.test.tsx). UI와 결과 모델을 검증하며 실제 서버 조치·참여 일괄 취소·감사 기록은 별도다.                                                                                                                             |
| 기능 간 공통 규칙 #14 | 참여 T-10과 댓글 T 구분, 서울 시각·등록 T+10 경계, 삭제 이력 최소 투영                                                                                                                                      | [feature-readiness.test.ts](../src/test/feature-readiness.test.ts)                                                                                                                                                                                                                                                                |

API 어댑터의 DTO·오류 매핑은 각 기능의 `*Api.test.ts`와
[api.test.ts](../src/lib/api.test.ts)·[backend.test.ts](../src/lib/backend.test.ts)에서 별도로 검사한다.
개발 경로의 운영 404도 `src/app/*-preview` 테스트와 운영 서버 확인을 구분해 기록한다.

## fixture·시각·모의 응답 규칙

- [공통 fixture](../src/test/fixtures.ts)는 합성 STUDENT/ADMIN과 고정 `+09:00` 서버 시각,
  기준시각 T, 새로운 TAXI/DELIVERY 상세 값을 제공한다. `postFixture()`를 매번 호출해
  변경 가능한 배열·상태를 테스트 사이에 공유하지 않는다. 실제 이메일·학번·운영 ID를 넣지 않는다.
- 기존 기능 테스트의 작은 도메인 fixture는 그대로 유지한다. 모든 타입·관계·상태를 한
  거대한 factory에 넣거나 준비 이슈 때문에 기존 테스트를 일괄 재작성하지 않는다.
- 작성자도 인원에 포함한다. JOINED는 최소 2명, FULL은 정원과 현재 인원을 맞추고,
  참여 취소와 모집 취소·관리자 삭제를 구분한다. 삭제 이력에는 원래 제목·장소·명단·URL을
  표시하지 않는다. 정상 fixture를 복제한 뒤 해당 테스트가 다루는 값만 바꾼다.
- 정책 함수에는 고정 `nowMs`를 전달한다. 타이머를 쓰는 화면은 fake timer와 고정 시스템
  시각을 사용하고 `performance.now()`의 경과도 함께 전진시킨다. 완료 후 실제 타이머를
  복원한다. 서버 시계와 브라우저 시계가 다를 때는 서버 시계가 기준이다.
- 참여/취소는 T-10분-1초와 정확히 T-10분, 댓글은 T-1ms와 정확히 T,
  신규 등록은 기준시각이 현재보다 10분을 초과하는지를 구분한다. 서울 날짜/시각은
  ISO offset과 `Asia/Seoul` 표시를 확인하며 PC의 현지 timezone에 기대지 않는다.
- 화면 테스트는 operation에 성공·확인된 거절·401/403·충돌·응답 유실을 각각 주입한다.
  `fetch` 모의는 기존 API 유틸/adapter 검증에 사용한다. 추측한 URI나 미연동 API를
  테스트 성공을 위해 실제 구현처럼 추가하지 않는다.
- 응답 유실은 성공·실패로 단정하거나 자동 변경 요청을 재전송하지 않는다. 서버 확인 전
  삭제 완료 표시를 하지 않고, 실패에는 입력을 보존하며, 재조회 후 결과를 확인한다.
- 요소는 label·role·사용자에게 보이는 이름으로 찾는다. 오류 설명·알림, 중복 제출,
  확인창의 초기 포커스·취소·복귀는 컴포넌트 assertion과 실제 브라우저 조작을 구분한다.

## API·수동 검증 대기

| 항목                     | 이 테스트 준비에서 확인하는 부분                  | 남겨 둔 검증                                                                     |
| ------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| 실제 인증·권한           | 모의 401/403, 역할별 화면·상태 제거               | 학교 계정·세션 쿠키·CSRF·서버 인가·role 위조 차단                                |
| 참여 경합·오류           | 성공/거절에 따른 UI·인원·재조회 대응              | 실제 DB 정합성·마지막 자리 경쟁·트랜잭션 롤백                                    |
| 유사 모집 ±30분          | 반환된 후보 표시, 새로 작성 선택, 실패/재시도     | 검색 API의 ±30분·날짜·유형·OPEN 조건. 현재 adapter는 API 미제공으로 빈 결과 반환 |
| 관리자 soft delete       | 응답에 따른 조치 안내·화면 차단·tombstone 투영    | 실제 soft delete·진행 중 참여 일괄 취소·FINISHED 관계 보존·감사 기록             |
| 재설정·댓글·신고         | 화면 콜백의 성공/거절/응답 유실 처리              | 실제 메일·토큰 수명·저장·서버 순서/중복·최종 권한                                |
| 모바일·키보드·스크린리더 | 이미 수행한 브라우저 검증은 기능 README/PR에 기록 | 실제 기기·스크린리더와 전체 사용 흐름은 별도 MAN/FLOW 기록                       |

자동 테스트의 성공 건수와 실행일은 실행한 커밋의 실제 로그에서 기록한다. 이 연결표나
테스트 준비 완료를 근거로 전체 P0/P1, 서버 통합, 미실행 MAN/FLOW를 완료 처리하지 않는다.
