# 모집글 상세 (#7)

API 명세가 미정인 상태의 1차 구현이다. 로그인 사용자용 `/posts/[id]` 상세, 관계별 정보
노출, 참여(#9 `ParticipationPanel` 재사용), 작성자 관리(수정 진입·수동 마감·모집 취소),
신고를 구현했다. 댓글 영역은 #11에서 붙인다. 운영 화면에는 가짜 모집·API를 추가하지
않으므로 연동(#18) 전에는 "연동을 준비하고 있어요"·조회 실패 안내를 표시한다.

개발 서버의 `/post-detail-preview` 상단 "상황" 선택에서 비참여자·배달·참여 중·참여 취소한
학생·이미 신고/중복 신고·작성자(모집 중/정원 마감/직접 마감/마감 중 상태 변경)·완료·
작성자 취소·삭제·없는 모집을 모의 응답으로 확인한다. 모의 서버는 일부러 모든 관계에
명단·링크·이메일·학번을 보내며, 화면이 이를 걸러내는지 확인할 수 있다. 운영 환경에서는 404다.

## 연결 방법

`postDetailApi.ts`의 `postDetailOperations`를 확정된 adapter로 교체한다. URI를 추측해
넣지 않는다.

- `load(id)`: `PostDetail` 형태(관계 `relation`, 서버 `serverTime`, 작성자 포함 인원,
  `joinable`, 작성자부터의 `participantNames`, `communicationUrl`, `reported`, 유형별
  필드)를 반환한다. 404는 `ApiError(404)` 또는 `PostDetailError("notFound")`, 403은
  `forbidden`, 401은 `ApiError(401)` 그대로 던진다.
- `close(id)`·`cancel(id)`: 작성자 수동 마감·모집 취소. 상태가 바뀌었으면
  `PostDetailError("conflict")`를 던지면 최신 정보로 다시 불러오며 안내한다.
- `join(id)`·`leave(id)`: #9 참여 신청·취소. 성공 시에만 resolve한다.
- `report(id, { reason, detail })`: 사유는 5종 enum, 상세는 NFC·양끝 공백 제거 후
  500자 이하이며 빈 값은 `null`. 중복·본인 글·삭제/없음·잘못된 입력은 각각
  `duplicateReport`·`ownPost`·`notFound`·`invalid`로 던진다.

## 노출 규칙

`toPostDetail`은 알려진 필드만 남겨 다른 사용자의 이메일·학번·전화번호가 화면에 닿지
않게 한다. 서버가 보내더라도 화면에서 다시 거른다(`visibleDetails`, #9
`hideUnavailableDetails`).

- 참가자 표시명: 작성자·JOINED에게 OPEN/FULL/CLOSED와 FINISHED(최종 참가자)에서만.
  비참여자·참여 취소자에게는 인원과 남은 자리만 보여 준다(시안과 다름, PRD 기준).
- 외부 소통 링크: 작성자·JOINED에게 OPEN/FULL/CLOSED이면서 기준시각 전에만, 새 창
  (`noopener noreferrer`)으로 연다. `https://`가 아니면 링크로 쓰지 않는다.
- FINISHED(진행 상태인데 기준시각이 지난 경우 포함)·CANCELLED는 이력으로 표시하며
  참여·링크를 제공하지 않는다. REMOVED는 제목·장소·참가자·링크 없이 삭제 안내만 보여 준다.

## 작성자 관리

작성자에게는 참여·신고 대신 "내 모집글 관리"를 보여 준다. 물리 삭제는 제공하지 않는다.

- 수정: OPEN/FULL/CLOSED에서 `/posts/{id}/edit`(#8)로 이동.
- 수동 마감: OPEN/FULL이고 기준시각 전(T-10 이후도 허용). CLOSED는 인원이 줄어도
  다시 열리지 않는다고 안내한다.
- 모집 취소: OPEN/FULL/CLOSED이고 기준시각 전. 참여자 참여도 함께 취소된다고 안내한다.
- 둘 다 확인창(Q-CONFIRM)을 거친다. 확인창을 여는 것만으로 요청하지 않고, 돌아가기·
  Escape·X는 호출 버튼으로 포커스를 돌린다. 요청 중에는 버튼을 막고, 응답 유실은 성공으로
  단정하지 않고 다시 불러오기를 제공한다.

## 신고

타인의 OPEN/FULL/CLOSED/CANCELLED/FINISHED 모집에서 "이 모집글 신고하기"를 제공하고,
본인 글·REMOVED·이미 신고한 모집에서는 제공하지 않는다. 확인창에서 사유 5종(라디오)과
선택 상세 내용(글자 수 표시)을 받는다. 사유 미선택·501자는 요청 없이 안내하고, 실패하면
입력을 유지한 채 다시 제출할 수 있다. 신고가 접수돼도 모집은 그대로 보인다.

## Figma와 다른 점

[참여 가능한 상세](https://www.figma.com/design/3fvNUDoN2M1PP9A3rYDxsB/?node-id=2-4557),
[작성자용 상세](https://www.figma.com/design/3fvNUDoN2M1PP9A3rYDxsB/?node-id=2-4876),
[참여 제한·취소·빈 상태](https://www.figma.com/design/3fvNUDoN2M1PP9A3rYDxsB/?node-id=2-4987)의
목록 복귀·제목·상태·작성자/시각·조건 카드·모임 안내·함께하는 학생·참여 카드·참여 안내
구성을 따랐다.

- 참여 취소 기한·안내의 30분을 PRD의 T-10분으로 바꿨다.
- 비참여자에게 참가자 이름 카드를 보여 주지 않는다.
- 시안에 없는 모집 제목, 소통 링크, 수정 진입, 신고 진입·확인창을 추가했다.
- 댓글 영역은 #11에서 추가한다.

## 검증

```sh
pnpm exec vitest run src/features/posts/detail
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

테스트 이름에 관련 TC ID를 연결했다. 알 수 없는 개인정보 필드 제거, https 링크, 응답
검증, 관계×상태별 명단·링크 노출, 기준시각 이후 완료 판정, 작성자 관리 가능 여부와 T-10·T
경계, 신고 가능 여부·상세 길이, 택시/배달 표시, 참여 중/취소/완료/작성자 취소/삭제/없음/
403/401/조회 실패·재시도/잘못된 응답, 작성자 관리(확인창·돌아가기·마감·마감 유지·요청 중
막기·실패·상태 변경·취소·기준시각 이후), 신고(사유 5종·미선택/501자·기타 상세 없음·반복
제출·실패 후 재시도·중복·거절 원인·이미 신고)를 검증한다.

2026-10-18 로컬 개발 서버의 `/post-detail-preview`에서 비참여자 개인정보·명단·링크
숨김, 참여 후 명단·새 창 링크, 작성자 마감 확인창(Escape 시 요청 없음·포커스 복귀)과 마감
반영, 배달 정보, 신고(사유 미선택 안내·접수·신고 버튼 제거), 완료 이력, 삭제·없는 모집을
확인했다. FE 모의 응답 통과는 서버 권한·상태 전이·신고 unique 제약의 증거가 아니다.
