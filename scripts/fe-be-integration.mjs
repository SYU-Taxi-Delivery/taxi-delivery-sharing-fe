// FE·BE 통합 점검 (API 단계). Next 개발 서버의 /api 프록시를 거쳐 백엔드 demo 프로필에 요청한다.
//
//   1) 백엔드: java -jar build/libs/taxi-delivery-sharing-0.0.1-SNAPSHOT.jar --spring.profiles.active=demo
//   2) 프론트: NEXT_PUBLIC_API_BASE_URL=http://localhost:3000 BACKEND_ORIGIN=http://localhost:8080 pnpm dev
//   3) node scripts/fe-be-integration.mjs http://localhost:3000
//
// demo 계정(author, student1~3, admin)과 비밀번호는 백엔드 docs/running.md의 일회성 H2 demo 값이다.
// 실제 계정·운영 서버에는 실행하지 않는다. 실행할 때마다 새 모집글을 만든다.
const BASE = process.argv[2] || "http://localhost:3000";
const PASS = process.env.DEMO_PASSWORD || "demo-pass";
const results = [];
const ok = (name, cond, extra = "") => {
  results.push(
    `${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`,
  );
};

class Client {
  constructor() {
    this.cookies = {};
  }
  cookieHeader() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i),
        v = kv.slice(i + 1);
      if (/Max-Age=0/i.test(c) || v === "") delete this.cookies[k];
      else this.cookies[k] = v;
    }
  }
  async req(method, path, body, { csrf = method !== "GET" } = {}) {
    const headers = { Accept: "application/json" };
    if (csrf) {
      const t = await this.csrf();
      headers[t.headerName] = t.token;
    }
    headers.Cookie = this.cookieHeader();
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    this.store(res);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    return { status: res.status, json };
  }
  async csrf() {
    const r = await this.req("GET", "/api/csrf");
    return r.json.data;
  }
  async login(id) {
    return this.req("POST", "/api/auth/local/login", {
      identifier: id,
      password: PASS,
    });
  }
}
const code = (r) => r.json?.error?.code;

(async () => {
  const anon = new Client();
  const a = await anon.req("GET", "/api/posts");
  ok(
    "비로그인 목록 401 AUTHENTICATION_REQUIRED",
    a.status === 401 && code(a) === "AUTHENTICATION_REQUIRED",
    `${a.status} ${code(a)}`,
  );

  const author = new Client(),
    s1 = new Client(),
    s2 = new Client(),
    s3 = new Client(),
    admin = new Client();
  for (const [c, id] of [
    [author, "demo-author@syuin.ac.kr"],
    [s1, "demo-student1@syuin.ac.kr"],
    [s2, "demo-student2"],
    [s3, "demo-student3"],
    [admin, "demo-admin"],
  ]) {
    const r = await c.login(id);
    ok(`로그인 ${id}`, r.status === 200 && !!r.json?.userId, `${r.status}`);
  }
  const bad = await new Client().req("POST", "/api/auth/local/login", {
    identifier: "demo-student1",
    password: "wrong-pass",
  });
  ok("잘못된 비밀번호 401", bad.status === 401, `${bad.status} ${code(bad)}`);
  const noCsrf = await new Client().req(
    "POST",
    "/api/auth/local/login",
    { identifier: "demo-student1", password: PASS },
    { csrf: false },
  );
  ok(
    "CSRF 없는 로그인 403 CSRF_INVALID",
    noCsrf.status === 403 && code(noCsrf) === "CSRF_INVALID",
    `${noCsrf.status} ${code(noCsrf)}`,
  );

  // Author creates a TAXI post with an open-chat link, capacity 3 (author + 2).
  const T = new Date(
    Date.now() + (3 + Math.floor(Math.random() * 40)) * 3600_000,
  );
  T.setSeconds(0, 0);
  T.setMinutes(0);
  const created = await author.req("POST", "/api/posts", {
    type: "TAXI",
    title: "통합 테스트 택시",
    content: "정문 앞에서 만나요.",
    capacity: 3,
    referenceTime: T.toISOString(),
    departure: "삼육대학교 정문",
    destination: "석계역 1번 출구",
    communicationUrl: "https://open.kakao.com/o/integration",
  });
  ok(
    "작성자 모집글 생성 201",
    created.status === 201,
    `${created.status} ${code(created)}`,
  );
  const id = created.json?.data?.postId;
  const P = `/api/posts/${id}`;

  // Author cannot join; author cannot cancel participation.
  let r = await author.req("POST", `${P}/participants`);
  ok(
    "작성자 참여 403 SELF_PARTICIPATION_NOT_ALLOWED",
    r.status === 403 && code(r) === "SELF_PARTICIPATION_NOT_ALLOWED",
    `${r.status} ${code(r)}`,
  );
  r = await author.req("DELETE", `${P}/participants`);
  ok(
    "작성자 참여 취소 403 AUTHOR_CANNOT_CANCEL_PARTICIPATION",
    r.status === 403 && code(r) === "AUTHOR_CANNOT_CANCEL_PARTICIPATION",
    `${r.status} ${code(r)}`,
  );

  // Non-participant: no link, no roster.
  r = await s1.req("GET", P);
  ok(
    "비참여자 상세에 오픈채팅 링크 없음",
    r.status === 200 && r.json.data.communicationUrl === undefined,
    JSON.stringify(r.json?.data?.viewer),
  );
  r = await s1.req("GET", `${P}/participants`);
  ok(
    "비참여자 명단 403 PARTICIPANT_LIST_FORBIDDEN",
    r.status === 403 && code(r) === "PARTICIPANT_LIST_FORBIDDEN",
    `${r.status} ${code(r)}`,
  );

  // Concurrent duplicate join by the same user: exactly one success.
  const dup = await Promise.all([
    s1.req("POST", `${P}/participants`),
    s1.req("POST", `${P}/participants`),
  ]);
  const dupOk = dup.filter((x) => x.status === 201).length,
    dupCodes = dup.map(
      (x) => x.status + ":" + (code(x) ?? x.json?.data?.action),
    );
  ok(
    "같은 학생 동시 중복 참여 → 성공 1건",
    dupOk === 1 && dup.some((x) => code(x) === "ALREADY_JOINED"),
    dupCodes.join(", "),
  );

  // Joined: link and roster visible.
  r = await s1.req("GET", P);
  ok(
    "참여자 상세에 오픈채팅 링크 보임",
    r.json?.data?.communicationUrl === "https://open.kakao.com/o/integration",
  );
  r = await s1.req("GET", `${P}/participants`);
  ok(
    "참여자 명단 조회 200",
    r.status === 200 && r.json.data.participants.length === 1,
    `${r.status} n=${r.json?.data?.participants?.length}`,
  );

  // Capacity race: s2, s3, admin join at once for the 1 remaining seat.
  const race = await Promise.all(
    [s2, s3, admin].map((c) => c.req("POST", `${P}/participants`)),
  );
  const raceOk = race.filter((x) => x.status === 201).length;
  ok(
    "남은 1자리에 3명 동시 참여 → 성공 1건, 나머지 POST_FULL",
    raceOk === 1 && race.filter((x) => code(x) === "POST_FULL").length === 2,
    race.map((x) => x.status + ":" + (code(x) ?? "ok")).join(", "),
  );
  const full = race.find((x) => code(x) === "POST_FULL");
  ok(
    "POST_FULL에 details.post 최신 상태 포함",
    full?.json?.error?.details?.post?.currentMemberCount === 3 &&
      full.json.error.details.post.remainingSeats === 0,
    JSON.stringify(full?.json?.error?.details?.post),
  );

  // Same post id: list, detail, my show the same numbers/status.
  const detail = (await s1.req("GET", P)).json.data;
  const list = (
    await s1.req("GET", "/api/posts?type=TAXI&page=0&size=50")
  ).json.data.items.find((x) => x.postId === id);
  const mine = (
    await s1.req("GET", "/api/users/me/participations?page=0&size=50")
  ).json.data.items.find((x) => x.post.postId === id);
  const authored = (
    await author.req("GET", "/api/users/me/posts?page=0&size=50")
  ).json.data.items.find((x) => x.postId === id);
  const pick = (x) =>
    x &&
    JSON.stringify([
      x.postStatus,
      x.recruitmentStatus,
      x.currentMemberCount,
      x.remainingSeats,
      x.joinable,
      x.participationDeadline,
    ]);
  ok(
    "목록·상세·내 참여·내 모집 값 일치",
    pick(list) === pick(detail) &&
      pick(detail) === pick(mine?.post) &&
      pick(detail) === pick(authored),
    [pick(list), pick(detail), pick(mine?.post), pick(authored)].join(" | "),
  );

  // The list row says how it relates to each viewer, like the detail.
  const row = async (c) =>
    (
      await c.req("GET", "/api/posts?type=TAXI&page=0&size=50")
    ).json.data.items.find((x) => x.postId === id)?.viewer;
  // "Other" must be someone who lost the race; the winner is a member.
  const outsider = [s2, s3, admin][race.findIndex((x) => x.status !== 201)];
  const [asMember, asOther, asAuthor] = [
    await row(s1),
    await row(outsider),
    await row(author),
  ];
  ok(
    "목록 viewer: 참여자 JOINED·남 NONE·작성자 isAuthor",
    asMember?.myParticipationStatus === "JOINED" &&
      asMember.myParticipationStatus === detail.viewer?.myParticipationStatus &&
      asOther?.myParticipationStatus === "NONE" &&
      asAuthor?.isAuthor === true,
    JSON.stringify([asMember, asOther, asAuthor]),
  );

  // Cancel, then cancelled member loses roster/link, then rejoin keeps the participation id.
  const before = (await s1.req("GET", `${P}/participants/me`)).json.data
    .participation.participationId;
  r = await s1.req("DELETE", `${P}/participants`);
  ok(
    "참여 취소 200 CANCEL",
    r.status === 200 && r.json.data.action === "CANCEL",
    `${r.status}`,
  );
  r = await s1.req("DELETE", `${P}/participants`);
  ok(
    "중복 취소 409 ALREADY_CANCELLED",
    r.status === 409 && code(r) === "ALREADY_CANCELLED",
    `${r.status} ${code(r)}`,
  );
  r = await s1.req("GET", `${P}/participants`);
  ok("취소한 학생 명단 403", r.status === 403, `${r.status} ${code(r)}`);
  r = await s1.req("GET", P);
  ok("취소한 학생 링크 없음", r.json?.data?.communicationUrl === undefined);
  const mineAfter = (
    await s1.req("GET", "/api/users/me/participations?page=0&size=50")
  ).json.data.items.find((x) => x.post.postId === id);
  ok(
    "내 참여에 취소 상태 반영",
    mineAfter?.participationStatus === "CANCELLED" &&
      mineAfter.post.communicationUrl === undefined,
    mineAfter?.participationStatus,
  );
  r = await s1.req("POST", `${P}/participants`);
  ok(
    "재참여 200 REJOIN, 같은 participationId",
    r.status === 200 &&
      r.json.data.action === "REJOIN" &&
      r.json.data.participation.participationId === before,
    `${r.status} ${r.json?.data?.action}`,
  );

  // Never-joined cancel.
  const delivery = (
    await s3.req("GET", "/api/posts?type=DELIVERY&page=0&size=50")
  ).json.data.items[0];
  r = await s3.req("DELETE", `/api/posts/${delivery.postId}/participants`);
  ok(
    "참여 기록 없이 취소 404 PARTICIPATION_NOT_FOUND",
    r.status === 404 && code(r) === "PARTICIPATION_NOT_FOUND",
    `${r.status} ${code(r)}`,
  );

  // Author closes: join refused with POST_CLOSED.
  r = await author.req("POST", `${P}/close`);
  ok("작성자 모집 마감 200", r.status === 200, `${r.status} ${code(r)}`);
  r = await s1.req("DELETE", `${P}/participants`);
  ok(
    "마감 후 참여자 취소 가능(기한 전)",
    r.status === 200,
    `${r.status} ${code(r)}`,
  );
  r = await s1.req("POST", `${P}/participants`);
  ok(
    "마감 후 참여 409 POST_CLOSED",
    r.status === 409 && code(r) === "POST_CLOSED",
    `${r.status} ${code(r)}`,
  );

  // Logout ends the session.
  r = await s2.req("POST", "/logout");
  ok(
    "로그아웃 성공(204 또는 302)",
    r.status === 204 || r.status === 302,
    `${r.status}`,
  );
  r = await s2.req("GET", "/api/posts");
  ok("로그아웃 후 401", r.status === 401, `${r.status}`);

  console.log(results.join("\n"));
  const passed = results.filter((x) => x.startsWith("PASS")).length;
  console.log(`\n${passed}/${results.length} passed; post ${id}`);
  if (passed !== results.length) process.exitCode = 1;
})().catch((e) => {
  console.log(results.join("\n"));
  console.error(e);
  process.exit(1);
});
