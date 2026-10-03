# SYU Taxi · Delivery Frontend

삼육대학교 택시·배달 공유 서비스의 프론트엔드 보일러플레이트입니다.
백엔드 API와 인증 명세는 미정이며, 서비스 기능과 실제 API 호출은 포함하지 않습니다.

## 기술 구성

- Next.js 16 / React 19 / TypeScript / App Router
- Tailwind CSS 4
- Vitest / React Testing Library / jsdom
- ESLint / Prettier
- GitHub Actions CI / Vercel 배포 준비

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

API 명세가 확정되면 `.env.local`의 다음 값을 설정합니다.

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api
```

이 주소는 예시입니다. 실제 백엔드 주소로 변경해 주세요.
`NEXT_PUBLIC_*`는 빌드 시 브라우저 번들에 포함됩니다. 비밀 값이나 토큰을 넣지 마세요.
주소에는 HTTP(S) origin과 기본 경로만 사용하며, 인증 정보·쿼리·fragment는 허용하지 않습니다.

```ts
import { ApiError, apiFetch } from "@/lib/api";

// 엔드포인트와 타입은 예시입니다. 확정된 백엔드 명세에 맞춰 작성하세요.
type Room = { id: number };

try {
  const room = await apiFetch<Room>("/rooms/1");
  // 빈 응답이면 undefined이므로 사용 전에 확인하세요.
  console.log(room);
} catch (error) {
  if (error instanceof ApiError) {
    console.error(error.status); // 원문 응답은 error.body
  }
  throw error;
}

await apiFetch<Room>("/rooms", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
```

- 경로는 `/`로 시작합니다. 기본 주소의 `/api` 같은 접두 경로를 유지합니다.
- JSON 응답을 반환하고, 204 등 빈 성공 응답은 `undefined`를 반환합니다.
- HTTP 실패는 상태 코드와 응답 원문을 담은 `ApiError`를 발생시킵니다.
- 잘못된 JSON, 네트워크 오류, 요청 취소는 원래 오류를 그대로 전달합니다.
- 기본 `Accept`는 `application/json`, 캐시는 `no-store`이며 호출자가 변경할 수 있습니다.
- 요청 본문과 `Content-Type`은 호출자가 설정합니다. `FormData`의 `Content-Type`은 직접 설정하지 않습니다.
- 토큰 저장, 자동 재시도, 쿠키 인증, 자동 갱신은 구현하지 않았습니다. 확정된 인증 명세에 맞춰 추가하세요.
- 브라우저가 백엔드에 직접 요청하므로 백엔드 CORS에 개발·Vercel 도메인을 허용해야 합니다.
- 서버에서 쿠키가 필요한 요청은 수신 쿠키를 자동 전달하지 않습니다. 인증 명세 확정 후 별도로 처리합니다.
- 제네릭 타입은 런타임 응답 검증을 대신하지 않습니다. 실제 계약이 생기면 필요한 경계에서 데이터를 검증하세요.

## 테스트와 CI

시작 화면 렌더링과 API 요청 유틸의 성공·오류·빈 응답·설정 검증을 테스트합니다.
API 테스트는 네트워크를 모킹하며 실제 백엔드나 비밀 환경변수가 필요하지 않습니다.
Vitest는 비동기 Server Component 테스트를 지원하지 않으므로, 해당 화면이 추가되면 E2E 검증을 따로 구성합니다.

GitHub Actions는 `main` push, PR, 수동 실행에서 다음 검사를 수행합니다.

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

현재 파일을 원격에 올린 이후부터 CI와 이슈·PR 템플릿이 GitHub에 반영됩니다.
이슈 양식은 버그 신고, 기능 제안, 일반 작업을 제공하며 지정된 필수 항목을 입력합니다.
기존에 없는 라벨이나 담당자를 자동 지정하지 않습니다.

## 협업 규칙

### 브랜치명

브랜치명은 소문자 작업 유형과 관련 GitHub 이슈 번호를 사용합니다.

```text
<type>/#<이슈번호>
```

예시: `feat/#1`, `fix/#2`, `chore/#3`.

### 커밋 메시지

커밋 메시지는 소문자 작업 유형, 콜론과 공백, 작업 설명 순서로 작성합니다.

```text
<type>: 작업 설명
```

예시:

```text
feat: 프론트엔드 보일러플레이트 구현
```

브랜치와 커밋 유형은 작업에 맞게 `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`를 사용합니다.
각 커밋은 한 작업을 담습니다.

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

## Vercel 연결

Vercel 연결과 실제 배포는 저장소 소유자가 진행합니다.

1. 저장소에 코드가 올라간 뒤 Vercel에서 해당 GitHub 저장소를 Import합니다.
2. Framework Preset은 **Next.js**, Root Directory는 저장소 루트(`.`)를 사용합니다.
3. Node.js는 **24.x**를 사용합니다. `package.json`의 `engines`와 일치시킵니다.
4. Install Command는 **자동 감지 기본값**을 유지합니다. `pnpm-lock.yaml`을 보고 pnpm 10이 선택됩니다.
5. Build Command는 기본값인 `pnpm build`, Output Directory도 기본값을 유지합니다.
6. API 주소가 정해지면 `NEXT_PUBLIC_API_BASE_URL`을 Development / Preview / Production 환경별로 등록합니다.
7. 공개 환경변수를 변경하면 새로 배포해야 브라우저 번들에 반영됩니다.

별도 `vercel.json`이나 배포용 GitHub Secret은 필요하지 않습니다.
Vercel Git 연동이 Preview와 Production 배포를 담당하고, GitHub Actions는 검증을 담당합니다.
CI 통과를 배포나 병합의 필수 조건으로 만들려면 GitHub 브랜치 규칙과 Vercel 배포 검사 설정을 별도로 구성합니다.

## 참고 문서

- [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js의 Vitest 구성](https://nextjs.org/docs/app/guides/testing/vitest)
- [Vercel 패키지 매니저](https://vercel.com/docs/package-managers)
- [Vercel Node.js 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [GitHub 이슈 양식](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
