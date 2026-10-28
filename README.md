# SYU Taxi · Delivery Frontend

삼육대학교 택시·배달 공유 서비스의 프론트엔드입니다.
로그인·모집글·참여 API를 연결했으며, 미제공 API와 남은 계약은 [백엔드 연동 안내](docs/backend-integration.md)에 정리합니다.

## 기술 구성

- Next.js 16 / React 19 / TypeScript / App Router
- Tailwind CSS 4
- Vitest / React Testing Library / jsdom
- ESLint / Prettier
- GitHub Actions CI / Vercel 배포

Node.js 24.15 이상(24.x)과 pnpm 10.34.6을 사용합니다. 정확한 패키지 버전은
`package.json`과 `pnpm-lock.yaml`을 기준으로 합니다. Vercel에서 지원하는 pnpm 10을
선택했고, 최신 TypeScript 7 대신 현재 Next.js ESLint 도구가 지원하는 TypeScript 5.9를 사용합니다.
ESLint 9는 Next.js 기본 플러그인의 peer 범위에 맞춘 버전입니다.
현재 레지스트리에서 지원 종료 안내가 표시되므로, 플러그인의 ESLint 10 지원이 반영되면 함께 올려야 합니다.

## 시작하기

```sh
# Corepack을 사용할 경우
corepack enable
corepack prepare pnpm@10.34.6 --activate

pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Windows PowerShell에서는 환경변수 파일을 다음 명령으로 복사합니다.

```powershell
Copy-Item .env.example .env.local
```

Corepack이 없다면 `npm install --global pnpm@10.34.6`으로 pnpm을 설치합니다.
개발 서버는 <http://localhost:3000>에서 실행됩니다. API 주소가 비어 있어도 시작 화면과 빌드는 동작합니다.

## 명령어

| 명령어              | 역할                                        |
| ------------------- | ------------------------------------------- |
| `pnpm dev`          | 개발 서버                                   |
| `pnpm build`        | 프로덕션 빌드                               |
| `pnpm start`        | 빌드 결과 실행                              |
| `pnpm lint`         | ESLint 검사, 경고도 실패 처리               |
| `pnpm typecheck`    | Next.js 라우트 타입 생성 및 TypeScript 검사 |
| `pnpm test`         | 테스트 1회 실행                             |
| `pnpm test:watch`   | 테스트 감시 실행                            |
| `pnpm format`       | Prettier 포맷 적용                          |
| `pnpm format:check` | 포맷 검사                                   |

## 구조

```text
src/
  app/                 # 페이지, 레이아웃, 전역 스타일 및 404
  lib/api.ts           # fetch 기반 JSON REST 요청과 HTTP 오류
  test/setup.ts        # Testing Library 매처 및 테스트 정리
.github/
  ISSUE_TEMPLATE/      # 버그, 기능 제안, 일반 작업 이슈 양식
  pull_request_template.md
  workflows/ci.yml     # 포맷, 린트, 타입, 테스트, 빌드 검사
```

`@/`는 `src/`를 가리킵니다. 테스트는 대상 파일 옆의 `*.test.ts(x)`에 작성합니다.
컴포넌트나 기능 폴더는 실제 기능을 구현할 때 추가합니다.

## REST API 연동

같은 출처의 Next.js 프록시로 백엔드를 호출합니다. 로컬 `.env.local` 설정 예시는 다음과 같습니다.

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
BACKEND_ORIGIN=http://localhost:8080
```

`NEXT_PUBLIC_API_BASE_URL`은 브라우저에서 여는 **프론트엔드 origin**입니다. 어댑터가 이미
`/api/...` 경로를 사용하므로 끝에 `/api`를 붙이지 않습니다. `BACKEND_ORIGIN`은 Next.js가
`/api/*`와 `/logout`을 전달할 **백엔드 origin**이며 서버에서만 사용합니다.
위 주소는 로컬 실행 예시로, 실제 사용 환경의 주소로 바꿉니다. 백엔드 주소가 없으면 프록시를 만들지 않습니다.
`NEXT_PUBLIC_*`는 빌드 시 브라우저 번들에 포함됩니다. 비밀 값이나 토큰을 넣지 마세요.
설정은 프로젝트 루트의 `.env.local`에서 읽습니다. 환경변수를 바꾸면 개발 서버를 다시 시작하고,
배포 환경에서는 다시 빌드·배포합니다.

- `apiFetch` 경로는 `/`로 시작하며, 브라우저 요청은 기본적으로 세션 쿠키를 포함합니다.
- JSON 응답을 반환하고, 204 등 빈 성공 응답은 `undefined`를 반환합니다.
- HTTP 실패는 상태 코드와 응답 원문을 담은 `ApiError`를 발생시킵니다.
- 잘못된 JSON, 네트워크 오류, 요청 취소는 원래 오류를 그대로 전달합니다.
- 기본 `Accept`는 `application/json`, 캐시는 `no-store`이며 호출자가 변경할 수 있습니다.
- 요청 본문과 `Content-Type`은 호출자가 설정합니다. `FormData`의 `Content-Type`은 직접 설정하지 않습니다.
- `backendGet`은 성공 envelope와 서버 시각을 확인하고, `backendSend`는 변경 요청에 CSRF 토큰을 붙입니다.
  서버가 `CSRF_INVALID`로 거절한 요청만 토큰 재조회 후 한 번 재시도하며 네트워크 실패는 재전송하지 않습니다.
- 같은 출처의 프록시를 사용하면 브라우저의 백엔드 직접 호출과 CORS 허용 설정이 필요하지 않습니다.
- 현재 사용자 조회 API가 없어 로그인 응답을 브라우저에 기억하고 인증 요청으로 세션 유효 여부만 확인합니다.
  현재 서버 사용자의 ID·역할을 재조회하는 기능은 남아 있습니다.
- 제네릭 타입은 런타임 응답 검증을 대신하지 않습니다. 각 기능의 어댑터와 화면 모델에서 검증합니다.

엔드포인트·응답 형식과 미연결 기능은 [백엔드 연동 안내](docs/backend-integration.md)를 참고하세요.

## 테스트와 CI

시작 화면 렌더링과 API 요청 유틸의 성공·오류·빈 응답·설정 검증을 테스트합니다.
API 테스트는 네트워크를 모킹하며 실제 백엔드나 비밀 환경변수가 필요하지 않습니다.
Vitest는 비동기 Server Component 테스트를 지원하지 않으므로, 해당 화면이 추가되면 E2E 검증을 따로 구성합니다.

서비스 요구사항별 행동·권한·상태·시간·입력 경계와 Figma 차이는
[테스트케이스 초안](docs/test-cases.md)에 정리합니다. 초안의 서비스 케이스는 미구현·미실행이며,
기존 보일러플레이트 테스트 결과와 구분합니다. 자동화 연결은 테스트 준비 이슈 #14에서 진행합니다.

GitHub Actions는 `main` push, PR, 수동 실행에서 다음 검사를 수행합니다.

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI와 이슈·PR 템플릿은 GitHub에 적용되어 있습니다.
이슈 양식은 버그 신고, 기능 제안, 일반 작업을 제공하며 지정된 필수 항목을 입력합니다.
기존에 없는 라벨이나 담당자를 자동 지정하지 않습니다.

## 협업 규칙

### 브랜치명

브랜치명은 소문자 작업 유형과 관련 GitHub 이슈 번호를 사용합니다.

```text
<type>/#<이슈번호>
```

예시: `feat/#1`, `fix/#2`, `chore/#3`.

### 일반 커밋 메시지

작업 브랜치의 일반 커밋 메시지는 소문자 작업 유형, 콜론과 공백, 작업 설명 순서로 작성합니다.

```text
<type>: 작업 설명
```

예시:

```text
feat: 프론트엔드 보일러플레이트 구현
```

브랜치와 커밋 유형은 작업에 맞게 `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`를 사용합니다.
각 커밋은 한 작업을 담습니다.

### PR 제목과 Squash merge 커밋

PR 제목과 Squash merge의 최종 커밋 제목은 대문자 작업 유형을 대괄호로 감싸 작성합니다.
일반 작업 커밋의 소문자 유형과 콜론 형식과 구분합니다.

```text
[TYPE] 작업 설명
```

예시: `[FEAT] 기능 구현`, `[CHORE] 프론트엔드 보일러플레이트 구현`.
유형은 일반 커밋의 유형을 대문자로 바꾼 `FEAT`, `FIX`, `CHORE`, `DOCS`, `REFACTOR`, `TEST`, `CI`를 사용합니다.

GitHub에서 PR 제목을 Squash 커밋 제목의 기본값으로 사용하도록 설정했습니다.
PR 번호가 붙은 최종 커밋 제목 예시는 `[CHORE] 프론트엔드 보일러플레이트 구현 (#2)`입니다.

### PR와 main 보호

- 작업 브랜치에 커밋을 푸시하고 `main`을 대상으로 PR을 생성합니다.
- PR 병합 후 원격 작업 브랜치를 자동 삭제하는 저장소 설정을 활성화했습니다.
- `main`은 활성 룰셋으로 PR 경유를 필수로 하며, 승인 리뷰 인원은 `0`명입니다.
- 코드 소유자·마지막 푸시·작성자 미확인 변경의 별도 승인도 요구하지 않습니다.
- 관리자를 포함해 룰셋 우회 사용자는 두지 않습니다.

저장소는 공개로 운영하며, `main` 직접 푸시 차단 룰셋을 GitHub에 적용했습니다.
설정값은 [`.github/rulesets/main.json`](.github/rulesets/main.json)에 기록합니다.
원격 정책은 GitHub에서 관리하므로 JSON 파일을 변경하는 것만으로 자동 적용되지는 않습니다.

`main`에 실제 적용된 규칙은 다음 명령으로 확인합니다.

```sh
gh api repos/SYU-Taxi-Delivery/taxi-delivery-sharing-fe/rules/branches/main
```

## 알려진 의존성 제한

2026-10-04 기준 `pnpm audit --audit-level=high`는 다음 개발 의존성 경로에서 High 1건으로 실패합니다.

```text
eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3
```

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)은 깊게 중첩된 brace 패턴을 처리할 때
Node.js 프로세스가 종료될 수 있는 문제이며, 공지에 패치 버전이 없습니다.
이 저장소의 의존 경로는 린트 도구이며 애플리케이션 입력을 glob 패턴으로 전달하는 코드는 없습니다.
패치가 발표되면 의존성을 갱신하고 감사를 다시 실행하세요.
미패치 문제로 감사 명령은 현재 통과하지 않으며, 기본 CI의 필수 검사에는 포함하지 않았습니다.

pnpm은 `unrs-resolver`의 설치 스크립트를 기본 차단합니다. 현재 플랫폼용 native 패키지로 린트가 정상 동작하므로
전체 설치 스크립트를 일괄 허용하지 않습니다.

## Vercel 배포

GitHub 저장소와 Vercel 프로젝트 `syu-taxi`의 연결을 완료했습니다.
배포 주소는 [syu-taxi.singhic.xyz](https://syu-taxi.singhic.xyz)입니다.

`main`을 기준으로 Production을 배포하고, 작업 브랜치는 Preview 배포를 사용합니다.
빌드 설정은 Framework Preset **Next.js**, Root Directory 저장소 루트(`.`), Node.js **24.x**를 기준으로 합니다.
Install Command와 Output Directory는 자동 감지 기본값을 유지하고, Build Command는 `pnpm build`를 사용합니다.

별도 `vercel.json`이나 배포용 GitHub Secret은 필요하지 않습니다.
Vercel Git 연동이 Preview와 Production 배포를 담당하고, GitHub Actions는 검증을 담당합니다.
CI 통과를 배포나 병합의 필수 조건으로 만들려면 GitHub 브랜치 규칙과 Vercel 배포 검사 설정을 별도로 구성합니다.

Development / Preview / Production별로 `NEXT_PUBLIC_API_BASE_URL`에는 해당 프론트엔드 origin을,
`BACKEND_ORIGIN`에는 연결할 백엔드 origin을 등록합니다. `/api` 접두 경로는 어댑터가 붙입니다.
환경변수를 변경하면 새로 배포해야 프록시 설정과 브라우저 번들에 반영됩니다.

## 참고 문서

- [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js의 Vitest 구성](https://nextjs.org/docs/app/guides/testing/vitest)
- [Vercel 패키지 매니저](https://vercel.com/docs/package-managers)
- [Vercel Node.js 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [GitHub 이슈 양식](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
