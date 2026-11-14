# 백엔드 연동 (#18)

기준 백엔드: [SYU-Taxi-Delivery/taxi-delivery-sharing](https://github.com/SYU-Taxi-Delivery/taxi-delivery-sharing)
`main` 커밋 `b79ca2a66a0a4475a349e11695896bee680878ef`(2026-10-28 확인)의 `docs/post-api.md`,
`docs/participation-api.md`, `docs/running.md`.

## 구조

- 브라우저는 같은 origin의 `/api/*`·`/logout`을 호출하고, Next.js `rewrites`가
  `BACKEND_ORIGIN`으로 전달한다. 세션(`JSESSIONID`)·CSRF(`XSRF-TOKEN`) 쿠키가 1st-party로
  유지되고 백엔드에 CORS 설정이 필요 없다.
- `src/lib/backend.ts`: 성공 `{ data, meta.evaluatedAt }`을 풀고, 오류
  `{ error.code }`를 `errorCode()`로 읽는다. 변경 요청은 `GET /api/csrf`의
  `headerName`/`token`을 붙이고, `CSRF_INVALID`이면 토큰을 다시 받아 한 번 재시도한다.
- 각 기능의 `*Api.ts` adapter가 백엔드 DTO를 화면 모델로 바꾼다. 화면의 응답 검증
  (`toPostPage`, `toPostDetail`, `toMyHistory`)은 그대로 거친다.

| 화면             | 백엔드                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------- |
| 로그인           | `POST /api/auth/local/login` `{ identifier: 학교 이메일, password }`                      |
| 로그인 상태 확인 | 로그인 응답 사용자 + `GET /api/users/me/participations?size=1`로 세션 확인                |
| 로그아웃         | `POST /logout` (브라우저 요청은 204, 리다이렉트는 따라가지 않음)                          |
| 목록             | `GET /api/posts?page&size=20&type` · "참여 가능한 글만"은 `status=OPEN`                   |
| 상세             | `GET /api/posts/{id}` + 작성자·JOINED는 `GET /api/posts/{id}/participants`(명단)          |
| 작성·수정        | `POST /api/posts`, `PATCH /api/posts/{id}` (`description`→`content`, 수정 시 `type` 제외) |
| 참여·재참여·취소 | `POST`/`DELETE /api/posts/{id}/participants` (본문 없음)                                  |
| 내 참여 내역     | `GET /api/users/me/participations?size=50` + 각 모집 상세                                 |

- 참여 신청·취소 마감은 서버의 `participationDeadline`을 따른다(현재 T-10). 값이 없으면
  T-10으로 판단한다. 안내 문구의 "N분 전"도 이 값에서 계산한다.
- 응답 시각 `meta.evaluatedAt`을 화면의 서버 시각으로 쓴다.
- 오류 코드: `POST_TIME_CONFLICT`→같은 시각 중복, `POST_REFERENCE_TIME_TOO_EARLY`→시각
  조건, `INVALID_POST_FIELD`(`details.field`)→해당 입력 칸, `POST_CORE_FIELDS_LOCKED`·
  `POST_FINISHED` 등 409→최신 정보 다시 불러오기, 404→없는 모집, 401→로그인 만료.

## 로컬 실행

```sh
# 백엔드 (JDK 17)
./gradlew bootJar -x test
java -jar build/libs/taxi-delivery-sharing-0.0.1-SNAPSHOT.jar --spring.profiles.active=demo

# 프론트엔드 .env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
BACKEND_ORIGIN=http://localhost:8080
```

demo 프로필 계정에는 로컬 비밀번호(LOCAL_CREDENTIAL)가 없어 로그인 API로 로그인할 수
없다. 2026-10-27 통합 확인은 백엔드 로컬 사본의 `DemoConfiguration`에서 계정 이메일을
`<name>@syuin.ac.kr`로 바꾸고 `demo-pass` 비밀번호를 저장해 진행했다(백엔드 저장소에는
반영하지 않음). 백엔드에 같은 demo 데이터를 요청한다.

## 2026-10-27 통합 확인

실제 백엔드(demo, H2)와 Next 프록시로 확인했다.

- 로그인 → 목록 이동, 목록 2건 표시(서버 정렬·인원·남은 자리)
- 상세: 참여 취소 기한 = 서버 `participationDeadline`, 비참여자 명단 숨김
- 참여(201) → 명단(작성자부터)·참여 중 표시, 취소(200) → 다시 참여하기, 재참여(200)
- 작성(201) → 새 상세로 이동, 수정(제목) → 상세에 반영
- 내 참여 내역: 참여 중 카드, 취소 기한 표시
- 오류 코드: 이른 시각 400 `POST_REFERENCE_TIME_TOO_EARLY`, 같은 시각 409
  `POST_TIME_CONFLICT`, 긴 제목 400 `INVALID_POST_FIELD`(`details.field=title`), 타인 수정
  403 `FORBIDDEN_OPERATION`, 중복 참여 409 `ALREADY_JOINED`

함께 고친 화면 오류: 창으로 돌아오며 누른 참여 버튼이 focus 재조회 중 비활성화되어 클릭이
무시되던 문제. 자동 재조회는 버튼을 막지 않고, 그 사이 누른 요청은 재조회가 끝난 뒤 보낸다.

## 2026-11-09 통합 재검증

프론트 `main`(`336f152`, #40까지)과 백엔드 `main`(`b79ca2a`, 모집글·참여 API 병합)으로
다시 확인했다. 백엔드는 위 로컬 demo 계정 수정만 더해 실행했다.

- 비로그인: `/posts`·`/posts/{id}`·`/posts/new`·`/posts/{id}/edit`·`/my`·`/admin`이 모두
  로그인 안내와 `/login?next=원래 경로`를 보여 주고, 보호 API를 호출하지 않는다.
- 로그인: `next`로 돌아가고, 로그인 상태에서 `/`·`/login`·`/signup`은 목록으로 보낸다.
  STUDENT의 `/admin`은 "접근 권한이 없어요", 타인 글 수정은 "본인이 작성한 모집만 수정",
  없는 모집은 "모집을 찾을 수 없어요".
- 세션 만료: 서버 세션을 끊은 뒤 화면을 이동하면 목록 API 401 → "로그인이 만료됐어요".
- 로그아웃: 계정 메뉴 → `POST /logout` 204 → 로그인 화면 "로그아웃했어요".
- 참여(201) → 취소 확인창 → 취소(200) → 다시 참여하기(200), 명단·인원·버튼이 서버 상태로 바뀐다.
- 다른 학생이 마지막 자리를 먼저 채운 뒤 참여: 409 → 최신 정보로 "정원 마감"을 보여 준다.
- 수정(제목, 참여자가 있어 장소·시각·정원 잠김): `PATCH` 200 → 상세에 반영.
- "참여 가능한 글만": `status=OPEN`으로 정원 마감 글을 뺀다.
- 내 참여 내역: 참여 중 카드, 취소 기한 표시.

함께 고친 화면 오류

- 작성자의 "모집 마감하기"·"모집 취소하기"와 "이 모집글 신고하기"가 눌리지만 서버 API가 없어
  항상 실패했다. API adapter에서 이 동작을 빼면 버튼을 비활성화하거나 숨기고 "준비 중"으로
  안내한다(데모 화면은 그대로 동작).
- "작성한 글" 탭이 "잠시 후 다시 이용해 주세요"와 다시 불러오기를 보여 줬다. API가 없다는
  안내와 모집글 목록 링크로 바꿨다.
- 내 참여 카드의 "기준시각 10분 전"을 "출발 10분 전"·"주문 마감 10분 전"으로 바꿨고, 마이페이지
  안내의 "모집 마감·모집 취소가 가능해요"를 실제 기능에 맞게 고쳤다.

## 2026-11-12 회원가입 항목 정합성

백엔드 `main` [`c55054f`](https://github.com/SYU-Taxi-Delivery/taxi-delivery-sharing/tree/c55054f00e3ac9ce740f63e17406aa94ea649a3b)의
`SchoolRegisterRequest`, `SchoolEmailAuthController`, `SchoolEmailPolicy`, `PasswordPolicy`를
소스로 확인했다. 이번 변경은 닉네임을 이름으로 바꾸고 학번 입력을 추가하며 가입 콜백에
`{ studentNo, name, schoolEmail, password }`만 전달한다. 학번은 필수 문자열·최대 20자,
이름은 필수·최대 50자이며 길이는 UTF-16 코드 단위다. 학번의 선행 0은 유지한다.

실제 `requestCode`·`verifyCode`·`register`는 계속 미연결이다. 백엔드는
`POST /api/auth/school-email/send-code`에 `{ schoolEmail }`, `/verify-code`에
`{ schoolEmail, code }`, `/register`에 위 네 필드를 받으며 모두 CSRF가 필요하다.
인증 상태는 이메일별로 30분 유지되고 가입 시 소비되며 가입 후 자동 로그인하지 않는다.
실제 연결 전에는 다음 차이를 반영해야 한다.

- 발송·인증 성공은 200 일반 문자열, 가입 성공은 200 숫자 ID다. 현재 `apiFetch`는
  성공 본문을 JSON으로 파싱하므로 문자열 응답 처리가 필요하다.
- 이미 가입된 이메일의 발송 요청은 409, 인증번호 5회 실패는 429다. 재발송 60초는 일치한다.
- 화면의 비밀번호 검증은 기존 15~128 코드포인트를 유지했다. 백엔드는 원문 8~64
  UTF-16 코드 단위·UTF-8 72바이트 이하를 요구하므로 별도 정합성 작업이 필요하다.

백엔드 기본 허용 도메인은 `syuin.ac.kr`와 `syu.ac.kr`이며 화면의 `@syuin.ac.kr`를
지원한다. 위 내용은 소스 계약 확인이며 실제 메일·가입·운영 배포 검증 결과가 아니다.

2026-11-14 인증번호 유효시간 정합성: 화면 타이머와 안내를 5분으로 통일했다.
백엔드 `EmailVerificationStore.CODE_TTL`은 발급 시각부터 5분이며 정확히 5분에 만료한다.
화면 타이머와 서버 발급 시각은 다를 수 있으므로 400 응답의
`VERIFICATION_CODE_EXPIRED`·`VERIFICATION_CODE_MISMATCH`를 우선해 안내하고,
위 두 오류 코드가 아니면 화면의 경과 시간으로 만료·불일치를 구분한다.

## 프론트·백엔드 불일치와 요청 목록

| 항목                       | 현재                                                    | 요청                                                         |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| 현재 사용자 조회           | API 없음. 로그인 응답을 브라우저에 기억                 | `GET /api/users/me` (`userId`, `name`, `role`), 비로그인 401 |
| 로그아웃                   | 브라우저 요청은 204(2026-11-09 확인)                    | 해결                                                         |
| 학교 이메일 도메인         | 화면 `@syuin.ac.kr`, 백엔드 `@syuin.ac.kr`·`@syu.ac.kr` | 소스 기준 화면 도메인 지원(2026-11-12 확인)                  |
| 회원가입 항목              | 학번·이름·학교 이메일·비밀번호 및 요청 필드 일치        | 항목 정합성 반영. 실제 연결·응답·정책 차이는 위 절 참고      |
| 작성자 모집 마감·모집 취소 | API 없음(버튼 비활성화, "준비 중" 안내)                 | `POST /api/posts/{id}/close`, `/cancel` 등                   |
| 신고                       | API 없음(버튼 대신 "준비 중"), `reported` 필드 없음     | 신고 API와 상세의 `reported`                                 |
| 유사 모집 추천             | API 없음(빈 결과로 작성 진행)                           | 같은 날짜·유형·±30분 검색                                    |
| 작성한 모집 목록           | API 없음("작성한 글" 탭은 준비 중 안내)                 | `GET /api/users/me/posts`                                    |
| "참여 가능한 글만" 필터    | `status=OPEN`으로 대체(마감 직전 글 포함)               | `joinable=true` 필터                                         |
| 내 참여 내역               | 목록에 장소·인원이 없어 모집마다 상세 추가 조회         | 목록 항목에 장소·인원·`joinable`·`participationDeadline`     |
| demo 로그인                | demo 계정은 Basic 인증만                                | demo 계정에 LOCAL_CREDENTIAL                                 |
| 참여 마감                  | 백엔드 T-10                                             | 30분 변경 시 `participationDeadline`만 바꾸면 화면이 따라감  |
