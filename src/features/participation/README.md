# 참여 신청·취소 UI (#9)

API·인증 명세가 미정인 상태의 1차 구현이다. 공통 UI와 상태/시간/응답 처리만
구현했으며 상세 #7, 목록 #6, 마이페이지 #10 및 실제 인증/API 연결은 남아 있다.
운영 화면에는 가짜 사용자·모집·API를 추가하지 않는다.

개발 서버의 `/participation-preview`에서 TAXI 참여·DELIVERY 취소·재참여를
모의 데이터로 확인할 수 있다. 새로고침하면 초기화되며 운영 환경에서는 404다.

## 연결 방법

`ParticipationSnapshot`은 화면용 입력 모델이며 서버 DTO가 아니다.
`serverTime`은 해당 조회 결과의 서버 관찰 시각이고 `referenceTime`과 함께
offset 또는 Z가 있는 ISO timestamp로 전달한다. `currentMemberCount`는 작성자
1명을 포함한 값이다. `joinable`은 서버의 모집 참여 가능 판정이며, JOINED의
취소 가능 여부와 별도로 처리한다.

화면 소유 컴포넌트에서 `useParticipation(initialSnapshot, operations)`를 한 번
호출하고 결과를 `<ParticipationPanel participation={participation} />`에 전달한다.
모집 또는 로그인 사용자가 바뀌면 소유 컴포넌트에 `key={[userId, postId].join(":")}`를
사용해 상태와 대기 요청을 분리한다. `initialSnapshot`은 마운트 시 초기값이며
이후 갱신은 `operations.refresh`가 담당한다.

`operations`는 다음 세 콜백이다. 확정된 인증·URI·DTO에 맞는 adapter에서 기존
`apiFetch`를 사용하고 응답을 검증한 뒤 이 모델로 변환한다.

- `join(): Promise<void>`: 현재 사용자의 참여/재참여 요청. 계약상 성공을 확인한
  경우에만 resolve한다.
- `cancel(): Promise<void>`: 현재 사용자의 참여 취소. 계약상 성공을 확인한
  경우에만 resolve한다.
- `refresh(): Promise<ParticipationSnapshot>`: 현재 사용자·모집의 최신 정보 조회.
  상세·목록·참여 이력을 함께 최신화하는 작업도 화면 소유자가 연결한다.

인원/모집 상태는 로컬에서 증감·전환하지 않고 최신 조회 결과를 표시한다.
명단과 소통 링크는 원래 props 대신 `participation.snapshot`에서 읽는다.
취소 성공 확인 직후 보호 필드를 제거하며 후속 조회 실패 시에도 복구하지 않는다.
다시 조회해도 서버가 현재 권한 없는 사용자에게 명단·URL 값을 반환하지 않는지
실제 API에서 별도 확인해야 한다. `needsRefresh`인 동안 추가 변경 요청은 차단한다.

이 hook은 조회와 변경을 한 번에 하나씩 처리하므로 이전 조회가 변경 후 상태를
덮어쓰는 경합을 예방한다. 마운트 해제 후 도착한 결과는 무시한다. 페이지가 다시
활성화되면 최신 정보를 재조회한다. 대기 요청을 닫거나 브라우저에서 취소했다고
서버 변경이 취소된 것으로 판단하지 않는다.

## 성공·실패와 시각

빈 성공 응답은 최신 조회로 상태를 확인한다. 변경 요청 거절·응답 유실·JSON 파싱
오류에는 최신 조회로 현재 상태를 확인하며 변경 요청을 자동 재전송하지 않는다.
변경 성공 후 조회 실패는 “변경 완료·최신 정보 확인 실패”로 구분하고 조회만
재시도한다. 원문 서버 오류를 사용자 화면에 그대로 표시하지 않는다.

시각은 서버 관찰 시각에 `performance.now()` 경과를 더해 계산한다. 기기 벽시계
변경으로 마감이 뒤집히지 않는다. 서버 `participationDeadline`(없으면 T−10분)에 화면 제한을 갱신하고 제출
직전에도 확인한다. 실제 요청 최종 판정은 서버 timestamp 기준이다. 응답 전송 지연
보정/서버 시각 제공 방식은 #18 계약에 연결해야 한다. 시간 표시에는 Asia/Seoul을
명시하며 OPEN 시간 마감은 “참여 마감”으로 표시하고 enum을 변경하지 않는다.
T에 도달하면 완료로 표시하고 소통 링크를 제거하며 최종 참가자 명단은 유지한다.

Figma의 30분 안내를 PRD 10분으로 수정했다. 모집 취소 확인창은 내 참여 취소
문구로 조정했다. 시안의 초록 `#76b900`을 사용하되 버튼 글자는 대비를 확보하는
`#212124`로 적용했다. 정상 OPEN의 추가 상태 배지를 제거했고, 시안의 Noto Sans KR
400/700, 패널 20px 여백, 16px 간격, 확인창 버튼 사이 12px 간격을 적용했다.
글꼴은 기존 Next.js의 `next/font/google`로 빌드할 때 내려받아 자체 호스팅한다.
별도 패키지나 방문자의 Google Fonts 요청은 추가하지 않는다.
Figma 아이콘은 `public/participation`의 로컬 SVG를 사용한다.

## 검증

```sh
pnpm exec vitest run src/features/participation
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

정책·hook·컴포넌트 테스트 이름에 관련 TC ID를 연결했다. TAXI/DELIVERY,
관계·상태·정원, T−10 초/밀리초 경계, 서버와 기기 시계 차이, 중복 요청,
경합·응답 유실·후속 조회 실패·읽기 재시도·마운트 해제, 보호 필드 제거,
취소 확인창 열기/복귀/닫기/확정을 검증한다.

jsdom 테스트에서 dialog의 native modal 기능은 모의 처리한다.
2026-10-13 로컬 Chromium의 임시 Next.js 모의 응답 화면에서 첫 포커스(돌아가기),
Tab의 배경 컨트롤 진입 차단, 배경 focus 차단, Escape/닫기 후 포커스 복귀,
즉시 취소 성공 후 포커스 유지와 명단·URL의 DOM 제거를 확인했다.
320/768/1024/1440px에서 가로 넘침이 없고 로컬 SVG가 로드되는 것도 확인했다.
Noto Sans KR 로드 후 패널 361×317px, 확인창 353×367px, 버튼 높이 48px를 확인했다.
검증용 `/participation-preview`는 development에서만 표시한다. 실제 기기·다른 브라우저 검증은 남아 있다.
FE 모의 응답 통과는 인증 연동·DB unique·정원 동시성·트랜잭션 증거가 아니다.
`docs/test-cases.md`의 실제 API/DB/FLOW 케이스는 실행 증거가 생길 때 갱신한다.
