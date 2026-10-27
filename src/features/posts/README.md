# 모집글 목록 (#6)

> 연동 상태(2026-10-27): `GET /api/posts`에 연결했다(`postsApi.ts`). "참여 가능한 글만"은 백엔드에 `joinable` 필터가 없어 `status=OPEN`으로 요청한다. 설정·불일치·요청 목록은
> [docs/backend-integration.md](../../../docs/backend-integration.md)를 참고한다.

API 명세가 미정인 상태의 1차 구현이다. 로그인 사용자용 `/posts` 목록 화면,
유형 탭·참여 가능 체크·페이지 이동, 카드 표시와 로딩·오류·빈 상태를 구현했다.
운영 화면에는 가짜 모집·API를 추가하지 않으므로 현재 `/posts`는 로그인 연동(#18)
전에는 로그인 상태 확인 실패, 연동 후에는 "모집 목록 연동을 준비하고 있어요"를 표시한다.

개발 서버의 `/posts-preview`에서 로그인된 모의 사용자와 모의 모집 41건으로 탭·체크·
페이지 이동을 확인하고, 상단 선택에서 빈 목록·조회 실패·잘못된 데이터를 바꿔 볼 수 있다.
운영 환경에서는 404다.

## 연결 방법

`postsApi.ts`의 `postListOperations.list(query)`를 확정된 `GET /api/posts` adapter로
교체한다. 기존 `apiFetch`를 사용하고 DTO를 `PostPage` 화면 모델로 바꿔 반환한다.
URI·query 이름을 추측해 넣지 않는다.

- `query.type`은 `ALL`·`TAXI`·`DELIVERY`, `query.joinableOnly`는 서버 `joinable=true`만
  보기, `query.page`는 0부터 시작하는 API 페이지(size 20 고정)다.
- 응답은 `content`·`totalElements`·`totalPages`·`number`·`size` 형태로 맞춘다. 정렬
  (기준시각 ASC, id ASC)과 기본 현재 목록(OPEN+FULL) 판정은 서버가 한다.
- 카드는 `referenceTime`(택시 출발·배달 주문 마감, offset 포함 ISO), `capacity`,
  작성자를 포함한 `currentMemberCount`, 서버 `joinable`, 유형별 필수값(택시
  `departure`/`destination`, 배달 `restaurantName`/`pickupLocation`)을 받는다.
  `authorName`은 선택이다.
- `toPostPage`가 페이지 전체를 검증하며, 카드 하나라도 필수값·범위가 맞지 않으면
  가짜 기본값으로 채우지 않고 목록 오류·다시 불러오기를 표시한다(AC-TAXI-003-02).
- 목록 API가 401이면 `useAuth().handleUnauthorized()`로 만료 안내를 표시한다.

## 화면 정책

- 필터·페이지는 `?type=TAXI&joinable=true&page=2`(UI는 1부터)로 주소에 남아 뒤로
  가기·공유가 된다. 잘못된 값은 기본값으로 읽고, 필터를 바꾸면 첫 페이지로 이동한다.
- 상태는 텍스트 배지로 표시한다. OPEN이어도 `joinable=false`면 새 enum 없이
  "참여 마감"과 사유(정원 마감 또는 출발·주문 마감 10분 전 마감)를 보여 준다.
  REMOVED는 카드로 표시하지 않는다.
- 시각은 Asia/Seoul 기준으로 표시한다.
- 조건이 바뀌면 이전 요청의 늦은 응답을 무시한다.

## Figma와 다른 점

[모집글 목록](https://www.figma.com/design/3fvNUDoN2M1PP9A3rYDxsB/?node-id=2-4380),
[택시](https://www.figma.com/design/3fvNUDoN2M1PP9A3rYDxsB/?node-id=33-1074),
[배달](https://www.figma.com/design/3fvNUDoN2M1PP9A3rYDxsB/?node-id=33-1316) 시안의
헤더·내비게이션·제목·작성 CTA·탭·체크·건수·카드·페이지 구성을 따랐다.

- 검색, 출발지/도착지·음식 종류 선택, "최신순" 정렬 선택은 확장 보류(Q-FILTER,
  AC-UI-FILTER-01~06, -09)라 표시하지 않는다. 정렬 문구는 "출발·마감 빠른 순"이다.
- "모집 중인 글만 보기"는 서버 `joinable` 기준인 "참여 가능한 글만 보기"로 바꿨다.
- 배달 카드에 이슈 요구사항인 수령 장소와 "주문 마감" 표기를 추가했다.
- 작성자 옆 "12분 전" 같은 상대 시각은 DTO 근거가 없어 생략했다.
- "내 참여 · 모집"(#10), "모집글 쓰기"(#8), 카드 상세(#7)는 해당 화면이 생기기 전까지
  404다. 계정 메뉴는 #5의 `AccountMenu`를 그대로 쓴다.

## 검증

```sh
pnpm exec vitest run src/features/posts
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

테스트 이름에 관련 TC ID를 연결했다. 유형별 필수값·범위·중복 id 검증, 주소 query
해석, 상태 문구와 참여 마감, 카드 표시와 Asia/Seoul 시각, REMOVED 제외, 로딩·실패·
재시도·잘못된 데이터·빈 목록·필터 결과 없음·마지막 이후 페이지, 탭·체크·페이지
주소, 늦은 응답 무시, 401 만료, 비로그인 미요청, 헤더 내비게이션을 검증한다.

2026-10-18 로컬 개발 서버의 `/posts-preview`(320·375·1280px)에서 카드·탭·체크·
페이지 이동·빈 목록·조회 실패·잘못된 데이터와 가로 넘침 없음을 확인했다.
FE 모의 응답 통과는 서버 정렬·필터·페이지 계약의 증거가 아니다.
