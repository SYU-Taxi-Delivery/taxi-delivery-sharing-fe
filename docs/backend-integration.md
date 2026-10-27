# 백엔드 연동 (#18)

기준 백엔드: [SYU-Taxi-Delivery/taxi-delivery-sharing](https://github.com/SYU-Taxi-Delivery/taxi-delivery-sharing)
`main`(PR #13으로 `codex/post-api` 병합, 2026-10-27)의 `docs/post-api.md`,
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
| 로그아웃         | `POST /logout` (302, 따라가지 않음)                                                       |
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

## 프론트·백엔드 불일치와 요청 목록

| 항목                       | 현재                                                            | 요청                                                         |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| 현재 사용자 조회           | API 없음. 로그인 응답을 브라우저에 기억                         | `GET /api/users/me` (`userId`, `name`, `role`), 비로그인 401 |
| 로그아웃                   | `POST /logout` 302 리다이렉트                                   | JSON 204/200 응답                                            |
| 학교 이메일 도메인         | 화면 `@syuin.ac.kr`, 백엔드 가입 `@syu.ac.kr`                   | 도메인 확정 후 한쪽 수정                                     |
| 회원가입 항목              | 화면: 이메일·닉네임·비밀번호. 백엔드: 학번·이름·이메일·비밀번호 | 학번 필요 여부·닉네임 정책 확정. 확정 전 가입 화면은 미연결  |
| 작성자 모집 마감·모집 취소 | API 없음(화면은 "연동 준비 중")                                 | `POST /api/posts/{id}/close`, `/cancel` 등                   |
| 신고                       | API 없음, `reported` 필드 없음                                  | 신고 API와 상세의 `reported`                                 |
| 유사 모집 추천             | API 없음(빈 결과로 작성 진행)                                   | 같은 날짜·유형·±30분 검색                                    |
| 작성한 모집 목록           | API 없음("작성한 글" 탭 미연결)                                 | `GET /api/users/me/posts`                                    |
| "참여 가능한 글만" 필터    | `status=OPEN`으로 대체(마감 직전 글 포함)                       | `joinable=true` 필터                                         |
| 내 참여 내역               | 목록에 장소·인원이 없어 모집마다 상세 추가 조회                 | 목록 항목에 장소·인원·`joinable`·`participationDeadline`     |
| demo 로그인                | demo 계정은 Basic 인증만                                        | demo 계정에 LOCAL_CREDENTIAL                                 |
| 참여 마감                  | 백엔드 T-10                                                     | 30분 변경 시 `participationDeadline`만 바꾸면 화면이 따라감  |
