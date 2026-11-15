# 8주차 프론트엔드 수정·검증 — 2026-11-15

서상혁 담당 범위(모집글 UI·내 활동·프론트엔드 테스트). 이슈 #81.
FE 기준 main은 `d5401ff`(#80), 실제 통합에 사용한 BE main은
`97b5b432c6f3f95ef5fad85ae444fd543ba76093`이다.
기존 작업 폴더를 보존하고 별도 worktree의 `fix/#81`에서 작업했다.

## 수정 내용과 경로

| 문제                                                                  | 변경 후 동작                                                                                                                                                   | 코드                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 목록에 복귀해도 이전 인원·모집 상태가 남음                            | 화면이 보이는 상태의 focus/visibilitychange에서 재조회. 진행 중인 중복 조회는 합치고, 이전 조건의 늦은 응답은 무시. 조회 실패·401에는 기존 오류/만료 안내 사용 | `src/features/posts/usePostList.ts`              |
| 목록 마감 표시가 최대 30초 늦고 기기 시계 변경에 영향받음             | 기존 `serverTimeNow()`의 단조 증가 시계 재사용. 서버 신청 마감·일정 종료 경계에 타이머를 예약하고 화면 복귀에도 시각 갱신                                      | `src/features/posts/PostListScreen.tsx`          |
| 이전 서버 응답에 recruitmentStatus가 없으면 목록 마감이 갱신되지 않음 | 서버 시각이 있는 경우 기존 status·기한으로 마감/완료 표시. 작성자 CLOSED는 신청 기한 이후에도 유지하고 일정 정각에 완료 표시                                   | `src/features/posts/posts.ts`                    |
| 참여 거절 응답의 변경된 일정이 상세 상단에는 반영되지 않음            | 공개 최신 상태의 referenceTime도 상세 모델에 반영해 일정·신청 마감·참여 상태의 기준을 맞춤                                                                     | `src/features/posts/detail/PostDetailScreen.tsx` |

API 요청·응답 형식, 의존성, 환경변수 계약은 변경하지 않았다. 서버의 변경 요청·정원·권한
최종 판정은 그대로 따른다. 새 전역 상태나 임의의 인원 증감은 추가하지 않았다.

## 자동 검사

Node 24.18.0, pnpm 10.34.6, Windows. 아래 명령은 worktree에서 실행했다.

| 명령                                                                                                                                                     | 결과                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                         | 통과, lockfile 변경 없음          |
| `pnpm format:check`                                                                                                                                      | 통과                              |
| `pnpm lint`                                                                                                                                              | 통과                              |
| `pnpm typecheck`                                                                                                                                         | 통과                              |
| `pnpm exec vitest run src/features/posts src/features/my src/features/participation src/features/demo src/test/feature-readiness.test.ts --reporter=dot` | 25파일 / 733개 통과               |
| `pnpm test --maxWorkers=2 --reporter=dot`                                                                                                                | 51파일 / 1,155개 통과             |
| `pnpm build`                                                                                                                                             | 기본 Turbopack 프로덕션 빌드 통과 |
| `git diff --check`                                                                                                                                       | 통과                              |

기준 main은 1,142개 통과였고 회귀 테스트 13개를 추가했다. 수정 전 목록 갱신 7건,
이전 서버 기한 처리 2건, 상세 일정 갱신 1건의 실패를 확인했다. 나머지는 숨겨진 탭·중복
복귀 이벤트·401·작성자 마감 유지 등을 보완한다. 테스트 파일은 다음과 같다.

- `src/features/posts/PostListScreen.test.tsx`
- `src/features/posts/posts.test.ts`
- `src/features/posts/detail/PostDetailScreen.test.tsx`

첫 전체 실행은 1,154개 통과·기존 `PostSearch.test.tsx`의 추천 장소 테스트 1건이
5초 제한으로 실패했다. 빌드 등 병렬 작업을 마친 뒤 worker만 2개로 제한한 전체 실행에서
1,155개가 통과했다. 테스트 시간 제한이나 제품/CI 설정은 변경하지 않았다.
처음에는 외부 node_modules junction 때문에 Turbopack 빌드가 실패했으며, worktree 안에
lockfile대로 설치한 뒤 기본 빌드로 통과했다.

## 실제 FE·BE 통합 — 로컬 H2

백엔드 소스는 변경하지 않았다. `gradlew.bat bootJar --no-daemon`으로 빌드하고 demo
프로필을 `127.0.0.1:18088`에서 실행했다. demo는 일회성 H2 메모리 DB와 공개 합성 계정만
사용한다. FE는 `BACKEND_ORIGIN=http://127.0.0.1:18088`,
`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3108`로 개발 서버를 실행했다.

`node scripts/fe-be-integration.mjs http://127.0.0.1:3108` → **31/31 통과**.
최초 실행은 백엔드 기동 완료 전에 연결해 실패했으며, Tomcat의 기동 완료를 확인한 뒤
재실행했다. 스크립트와 판정 조건은 수정하지 않았다.

- 비로그인 401, 세션 로그인, 잘못된 비밀번호 401, CSRF 없는 로그인 403, 로그아웃 후 401
- 작성자 본인 참여/참여 취소 거절, 비참여자 명단 403·소통 링크 미노출
- 동일 학생 동시 중복 신청: 1건 성공·나머지 ALREADY_JOINED
- 마지막 1자리에 3명 동시 신청: 1건 성공·2건 POST_FULL, 오류 응답의 최신 인원·남은 자리
- 동일 모집 ID의 목록·상세·내 참여·내 작성 상태·인원·기한 일치
- 취소·중복 취소·취소 후 명단/링크 권한 회수·재참여 시 동일 participationId 유지
- 작성자 마감 후 기한 전 참여 취소 허용, 자리가 생겨도 재참여는 POST_CLOSED로 거절

## 실제 Chromium 화면 확인

위 H2 서버의 실제 API를 사용했다. 공개 프론트 데모의 모의 응답과 구분한다.

- 학생 로그인 → 모집 ID 1 목록 3자리 → 상세 현재 1/4명 → 참여 후 2/4명·명단 노출
- 내 활동의 같은 ID 2/4명 → 취소 확인창 → 성공 안내·지난 이력으로 이동
- 확인창 초기 초점은 돌아가기. Escape로 닫으면 참여 취소 버튼으로 복귀. 취소 성공 후
  해당 지난 이력 행으로 초점 이동
- 취소한 상세는 명단이 숨겨지고 다시 참여하기 표시. 재참여 후 2/4명, 목록도 2자리 남음
- 별도 탭의 실제 API로 취소한 뒤 목록에 focus 이벤트를 전달하면 이동 없이 3자리로 갱신
- 목록·상세에서 320/768/1024/1440px 가로 넘침 없음. 브라우저 콘솔 오류 0건

Playwright의 `bringToFront()`는 이 환경에서 focus/visibilitychange 이벤트를 발생시키지
않아 첫 자동 탭 복귀 확인은 시간 초과했다. 마지막 항목은 명시적으로 전달한 focus 이벤트와
실제 API 응답으로 확인했으며 OS 수준의 창/탭 복귀 검증으로 간주하지 않는다.

화면 증거:

- [참여 후 모바일](../output/playwright/week8-fe-20261115/joined-mobile.png)
- [재참여 후 데스크톱](../output/playwright/week8-fe-20261115/rejoined-desktop.png)

## 인증 화면 로고 후속 수정

`src/features/auth/AuthLayout.tsx`의 로고가 일반 문단이라 클릭·키보드 이동이 없었다.
공통 헤더를 `/` 링크로 바꿔 로그인·가입·비밀번호 재설정에서 첫 화면으로 돌아가게 했다.
데모 인증 화면에서도 로고는 실제 첫 화면으로 연결한다. 첫 화면에서는 같은 경로를 유지한다.
`src/features/auth/auth.module.css`에 44px 클릭 영역과 기존 색상의 키보드 포커스 표시를 적용했다.

- `pnpm typecheck`, `pnpm build`: 통과
- `pnpm test src/features/auth src/app/page.test.tsx --maxWorkers=2 --reporter=dot`: 10파일 / 209개 통과
- 수정한 TSX·CSS의 Prettier 검사, TSX의 ESLint 검사: 통과
- 로컬 브라우저: `/login` 로고 클릭 → `/` 소개 화면 확인, `/signup` Tab → 로고 초점·44px 영역·포커스 테두리 확인 → Enter → `/` 복귀
- 최초 sandbox 실행은 Corepack 다운로드 DNS 오류로 검사를 시작하지 못했다. 권한이 있는 실행에서 위 검사를 완료했다.

## 남은 확인과 담당 경계

- 운영 MySQL의 락·트랜잭션 롤백·데이터 마이그레이션·기존 사용자 데이터는 확인하지 않았다.
  위 동시성 결과는 H2 demo의 실제 HTTP 결과이며 운영 DB 보장이 아니다(손광빈 담당).
- 기한 정각·서울 날짜 경계·기기 시계 변경은 FE 고정 시계 테스트로 확인했다.
  실제 서버 정각 경쟁과 취소/작성자 마감 동시 실행의 DB 정합성은 별도다(손광빈·양태규 담당).
- 실제 학교 계정·메일·운영 배포·실기기·Safari/Firefox·스크린리더는 이번 검증에 포함하지 않았다.
- PR 제출까지 진행하며 main 직접 push·force push·병합·운영 배포는 하지 않는다.
