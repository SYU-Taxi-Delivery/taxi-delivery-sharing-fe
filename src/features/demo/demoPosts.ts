/*
 * One shared set of demo posts for every preview screen (list, detail, my
 * activity, form, participation and comments). Each record is built once from
 * its index and the demo start time, so the same ID shows the same time,
 * place, author, capacity and headcount everywhere. Demo actions (join,
 * cancel, close, edit…) change the record here, the way the server would.
 *
 * Reset rule: a full reload of the page starts a new demo. Moving between
 * demo pages — links, back/forward, or typing a demo URL again in the same
 * tab — keeps the changes (sessionStorage), so list → detail → my activity
 * always agree.
 */
import {
  ParticipationRejected,
  REJECTION_MESSAGES,
} from "@/features/participation/participation";
import type { PostQuery, PostType } from "@/features/posts/posts";
import { matchesSearch } from "@/features/posts/search";

export const DEMO_VIEWER = {
  id: "1",
  displayName: "김하늘",
  role: "STUDENT",
} as const;

export type DemoRelation = "AUTHOR" | "JOINED" | "CANCELLED" | "NONE";
/** What the server stores; FULL and FINISHED are worked out from it. */
export type DemoStoredState = "OPEN" | "CLOSED" | "CANCELLED" | "REMOVED";
export type DemoPostStatus =
  "OPEN" | "FULL" | "CLOSED" | "CANCELLED" | "FINISHED" | "REMOVED";
export type DemoRecruitmentStatus =
  | "RECRUITING"
  | "FULL"
  | "CLOSED"
  | "APPLICATION_CLOSED"
  | "CANCELLED"
  | "FINISHED"
  | "REMOVED";

export type DemoPostRecord = {
  id: string;
  type: PostType;
  title: string;
  description: string;
  departure?: string;
  destination?: string;
  restaurantName?: string;
  pickupLocation?: string;
  orderGuide?: string;
  referenceTime: string;
  createdAt: string;
  capacity: number;
  authorName: string;
  /** JOINED members other than the author and the viewer, in join order. */
  members: string[];
  /** The demo viewer (김하늘) to this post. */
  relation: DemoRelation;
  state: DemoStoredState;
  communicationUrl: string | null;
  reported: boolean;
};

type DemoState = {
  version: 1;
  startedAt: number;
  nextId: number;
  posts: DemoPostRecord[];
};

export const DEMO_POST_COUNT = 121;
export const DEMO_CUTOFF_MS = 10 * 60_000;
const MINUTE = 60_000;
const STORAGE_KEY = "doyupot:demo-posts";
const COMMUNICATION_URL = "https://open.kakao.com/o/preview";

const STOPS = [
  "삼육대학교 정문",
  "삼육대학교 후문",
  "태릉입구역 7번 출구",
  "석계역 1번 출구",
  "화랑대역 2번 출구",
];
const RESTAURANTS = ["정문 김밥", "후문 치킨", "태릉 중식당", "기숙사 앞 분식"];
const PICKUPS = ["정문", "후문", "기숙사 앞"];
const AUTHORS = ["박지민", "최유진", "정민수", "오수빈", "이도윤", "한지우"];
const MEMBERS = [
  "이서연",
  "윤서준",
  "강다은",
  "조하린",
  "임도현",
  "서지아",
  "문태오",
  "배수아",
  "신유나",
];

/**
 * The viewer's own records, placed so 내 활동 has every state: upcoming,
 * full, closed, finished, cancelled, removed and a participation I left.
 */
const VIEWER_ROLES: Record<
  number,
  { relation: DemoRelation; state?: DemoStoredState }
> = {
  1: { relation: "JOINED" }, // already departed → FINISHED
  2: { relation: "AUTHOR" }, // already departed → FINISHED
  7: { relation: "JOINED" },
  8: { relation: "AUTHOR" },
  9: { relation: "CANCELLED" },
  10: { relation: "JOINED" }, // last seat → FULL
  12: { relation: "JOINED", state: "CLOSED" },
  14: { relation: "CANCELLED", state: "CANCELLED" },
  16: { relation: "JOINED", state: "REMOVED" },
  17: { relation: "AUTHOR" }, // FULL
  19: { relation: "AUTHOR", state: "CLOSED" },
  20: { relation: "AUTHOR", state: "CANCELLED" },
  22: { relation: "AUTHOR", state: "REMOVED" },
};

const minuteFloor = (ms: number) => Math.floor(ms / MINUTE) * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();

/** Index of a generated id ("preview-6" → 5), or null for other ids. */
export function demoIndex(id: string): number | null {
  const match = /^preview-(\d+)$/.exec(id);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return index >= 0 && index < DEMO_POST_COUNT ? index : null;
}

/** Record for a generated index; the same index and start always agree. */
export function generateDemoPost(
  index: number,
  startedAt: number,
): DemoPostRecord {
  const type: PostType = index % 3 === 1 ? "DELIVERY" : "TAXI";
  const referenceMs = startedAt + (index * 12 - 25) * MINUTE;
  const capacity = type === "TAXI" ? 4 : 2 + (index % 5);
  const full = index % 7 === 3;
  const headcount = full ? capacity : 1 + (index % (capacity - 1));
  const role = VIEWER_ROLES[index] ?? { relation: "NONE" as const };
  const state = role.state ?? "OPEN";
  const joined = role.relation === "JOINED";
  const others =
    state === "CANCELLED"
      ? 0
      : joined
        ? Math.max(2, headcount) - 2
        : headcount - 1;
  const members = Array.from(
    { length: others },
    (_, k) => MEMBERS[(index + k) % MEMBERS.length],
  );
  const createdAt = Math.min(
    startedAt - (5 + ((index * 37) % 240)) * MINUTE,
    referenceMs - 30 * MINUTE,
  );
  const base = {
    id: `preview-${index + 1}`,
    referenceTime: iso(referenceMs),
    createdAt: iso(createdAt),
    capacity,
    authorName:
      role.relation === "AUTHOR"
        ? DEMO_VIEWER.displayName
        : AUTHORS[index % AUTHORS.length],
    members,
    relation: role.relation,
    state,
    communicationUrl: COMMUNICATION_URL,
    reported: false,
  };
  if (type === "TAXI") {
    const departure = STOPS[index % STOPS.length];
    const destination = STOPS[(index + 2) % STOPS.length];
    return {
      ...base,
      type,
      title: `${departure} → ${destination} 택시`,
      description: `${departure}에서 ${destination}까지 같이 가요.\n출발 5분 전, ${departure} 앞에서 만나요.`,
      departure,
      destination,
    };
  }
  const restaurantName = RESTAURANTS[index % RESTAURANTS.length];
  const pickupLocation = PICKUPS[index % PICKUPS.length];
  return {
    ...base,
    type,
    title: `${restaurantName} 같이 주문해요`,
    description: `${restaurantName}에서 같이 주문해요.\n도착하면 ${pickupLocation}에서 함께 받아요.`,
    restaurantName,
    pickupLocation,
    orderGuide: "주문 전에 메뉴를 정해 두면 빨라요.",
  };
}

function freshState(now: number): DemoState {
  const startedAt = minuteFloor(now);
  return {
    version: 1,
    startedAt,
    nextId: DEMO_POST_COUNT + 1,
    posts: Array.from({ length: DEMO_POST_COUNT }, (_, index) =>
      generateDemoPost(index, startedAt),
    ),
  };
}

function isReload(): boolean {
  try {
    const [entry] = performance.getEntriesByType(
      "navigation",
    ) as PerformanceNavigationTiming[];
    return entry?.type === "reload";
  } catch {
    return false;
  }
}

function restore(): DemoState | null {
  if (typeof window === "undefined" || isReload()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DemoState) : null;
    return parsed?.version === 1 &&
      Number.isFinite(parsed.startedAt) &&
      Array.isArray(parsed.posts)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

let current: DemoState | null = null;

function persist() {
  if (typeof window === "undefined" || !current) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable: the demo still works until the tab navigates away.
  }
}

function state(): DemoState {
  // Never keep demo data in server memory; only the browser owns it.
  if (typeof window === "undefined") return freshState(Date.now());
  if (!current) {
    current = restore() ?? freshState(Date.now());
    persist();
  }
  return current;
}

/** Starts the demo over: every record is regenerated from `now`. */
export function resetDemoPosts(now = Date.now()): void {
  current = freshState(now);
  persist();
}

export function demoStartedAt(): number {
  return state().startedAt;
}

export function demoPosts(): readonly DemoPostRecord[] {
  return state().posts;
}

export function findDemoPost(id: string): DemoPostRecord | undefined {
  return state().posts.find((post) => post.id === id);
}

/** Changes one record and saves; returns the updated record. */
export function updateDemoPost(
  id: string,
  change: (post: DemoPostRecord) => DemoPostRecord,
): DemoPostRecord | undefined {
  const posts = state().posts;
  const index = posts.findIndex((post) => post.id === id);
  if (index < 0) return undefined;
  posts[index] = change({
    ...posts[index],
    members: [...posts[index].members],
  });
  persist();
  return posts[index];
}

/** Puts a generated record back to how it started (or adds it back). */
export function regenerateDemoPost(id: string): DemoPostRecord | undefined {
  const index = demoIndex(id);
  if (index === null) return findDemoPost(id);
  const fresh = generateDemoPost(index, state().startedAt);
  const posts = state().posts;
  const at = posts.findIndex((post) => post.id === id);
  if (at < 0) posts.push(fresh);
  else posts[at] = fresh;
  persist();
  return fresh;
}

export function removeDemoPost(id: string): void {
  const posts = state().posts;
  const at = posts.findIndex((post) => post.id === id);
  if (at >= 0) posts.splice(at, 1);
  persist();
}

export function addDemoPost(
  post: Omit<DemoPostRecord, "id" | "createdAt">,
  now = Date.now(),
): DemoPostRecord {
  const data = state();
  const record = {
    ...post,
    id: `preview-${data.nextId}`,
    createdAt: iso(now),
  };
  data.nextId += 1;
  data.posts.push(record);
  persist();
  return record;
}

// ───────── Server rules ─────────

export function demoMemberCount(post: DemoPostRecord): number {
  return 1 + post.members.length + (post.relation === "JOINED" ? 1 : 0);
}

export function demoDeadline(post: DemoPostRecord): number {
  return Date.parse(post.referenceTime) - DEMO_CUTOFF_MS;
}

/** The server's effective status (postStatus). */
export function demoStatus(post: DemoPostRecord, now: number): DemoPostStatus {
  if (post.state === "REMOVED" || post.state === "CANCELLED") return post.state;
  if (now >= Date.parse(post.referenceTime)) return "FINISHED";
  if (post.state === "CLOSED") return "CLOSED";
  return demoMemberCount(post) >= post.capacity ? "FULL" : "OPEN";
}

/** The server's public recruitment status, one rule for every response. */
export function demoRecruitmentStatus(
  post: DemoPostRecord,
  now: number,
): DemoRecruitmentStatus {
  const status = demoStatus(post, now);
  if (status === "OPEN" || status === "FULL") {
    if (now >= demoDeadline(post)) return "APPLICATION_CLOSED";
    return status === "FULL" ? "FULL" : "RECRUITING";
  }
  return status;
}

export function demoJoinable(post: DemoPostRecord, now: number): boolean {
  return demoStatus(post, now) === "OPEN" && now < demoDeadline(post);
}

/** Public counts and status, as a list item or a 409 `details.post` carries. */
export function demoPublicState(post: DemoPostRecord, now: number) {
  const count = demoMemberCount(post);
  return {
    status: demoStatus(post, now),
    recruitmentStatus: demoRecruitmentStatus(post, now),
    referenceTime: post.referenceTime,
    participationDeadline: iso(demoDeadline(post)),
    capacity: post.capacity,
    currentMemberCount: count,
    remainingSeats: Math.max(0, post.capacity - count),
    joinable: demoJoinable(post, now),
  };
}

const places = (post: DemoPostRecord) =>
  post.type === "TAXI"
    ? { departure: post.departure, destination: post.destination }
    : {
        restaurantName: post.restaurantName,
        pickupLocation: post.pickupLocation,
      };

/** List card data (the screen model the list validates). */
export function demoSummary(post: DemoPostRecord, now: number) {
  return {
    id: post.id,
    type: post.type,
    ...demoPublicState(post, now),
    authorName: post.authorName,
    createdAt: post.createdAt,
    ...places(post),
  };
}

/**
 * Detail data. Like a careless server it sends names and the link to
 * everyone; the screen must hide them from non-members.
 */
export function demoDetail(post: DemoPostRecord, now: number) {
  const author =
    post.relation === "AUTHOR" ? DEMO_VIEWER.displayName : post.authorName;
  return {
    ...demoSummary(post, now),
    title: post.title,
    description: post.description,
    serverTime: iso(now),
    relation: post.relation,
    authorName: author,
    reported: post.reported,
    participantNames: [
      author,
      ...post.members,
      ...(post.relation === "JOINED" ? [DEMO_VIEWER.displayName] : []),
    ],
    ...(post.communicationUrl
      ? { communicationUrl: post.communicationUrl }
      : {}),
    ...(post.type === "DELIVERY" && post.orderGuide
      ? { orderGuide: post.orderGuide }
      : {}),
  };
}

/** 내 활동 row; removed posts keep only id, status and relation. */
export function demoHistoryItem(post: DemoPostRecord, now: number) {
  const relation = post.relation === "NONE" ? "CANCELLED" : post.relation;
  if (post.state === "REMOVED") {
    return { id: post.id, status: "REMOVED" as const, relation };
  }
  const status = demoStatus(post, now);
  const linkVisible =
    (post.relation === "AUTHOR" || post.relation === "JOINED") &&
    (status === "OPEN" || status === "FULL" || status === "CLOSED");
  return {
    ...demoSummary(post, now),
    relation,
    ...(linkVisible && post.communicationUrl
      ? { communicationUrl: post.communicationUrl }
      : {}),
  };
}

/**
 * Like GET /api/posts: only active OPEN/FULL posts, the same search rules as
 * the server (places ignore spaces, case and "역"; direction by "삼육대";
 * from inclusive, to exclusive) and the same two sort orders.
 */
export function listDemoPosts(query: PostQuery, now: number) {
  return state()
    .posts.filter((post) => {
      const status = demoStatus(post, now);
      return status === "OPEN" || status === "FULL";
    })
    .filter((post) => !query.joinableOnly || demoJoinable(post, now))
    .filter((post) => matchesSearch(post, query, now))
    .sort((a, b) =>
      query.sort === "RECENT"
        ? Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          b.id.localeCompare(a.id, "en", { numeric: true })
        : Date.parse(a.referenceTime) - Date.parse(b.referenceTime) ||
          a.id.localeCompare(b.id, "en", { numeric: true }),
    )
    .map((post) => ({
      ...demoSummary(post, now),
      // The demo knows the viewer's relation, so the card can say 참여 중.
      ...(post.relation === "JOINED" ? { viewerJoined: true } : {}),
    }));
}

export function demoHistory(tab: "participated" | "created") {
  return state()
    .posts.filter((post) =>
      tab === "created"
        ? post.relation === "AUTHOR"
        : post.relation === "JOINED" || post.relation === "CANCELLED",
    )
    .sort((a, b) => Date.parse(b.referenceTime) - Date.parse(a.referenceTime));
}

// ───────── Mutations (server checks first, then change) ─────────

/** A server-style refusal: HTTP status and error code. */
export class DemoRejection extends Error {
  constructor(
    public readonly status: 403 | 404 | 409,
    public readonly code: string,
  ) {
    super(`데모 요청이 거절되었습니다. (${code})`);
    this.name = "DemoRejection";
  }
}

function live(id: string): DemoPostRecord {
  const post = findDemoPost(id);
  if (!post || post.state === "REMOVED")
    throw new DemoRejection(404, "POST_NOT_FOUND");
  return post;
}

/**
 * A join/cancel refusal as the real adapter reports it: a known 409 carries
 * the post's latest public state (`error.details.post`).
 */
export function demoParticipationError(
  error: unknown,
  id: string,
  now = Date.now(),
): unknown {
  if (
    !(error instanceof DemoRejection) ||
    error.status !== 409 ||
    !(error.code in REJECTION_MESSAGES)
  )
    return error;
  const post = findDemoPost(id);
  return new ParticipationRejected(
    error.code,
    post ? demoPublicState(post, now) : undefined,
  );
}

export function demoJoin(id: string, now = Date.now()): DemoPostRecord {
  const post = live(id);
  const status = demoStatus(post, now);
  if (status === "CANCELLED") throw new DemoRejection(409, "POST_CANCELLED");
  if (status === "FINISHED") throw new DemoRejection(409, "POST_FINISHED");
  if (status === "FULL") throw new DemoRejection(409, "POST_FULL");
  if (status === "CLOSED") throw new DemoRejection(409, "POST_CLOSED");
  if (now >= demoDeadline(post))
    throw new DemoRejection(409, "JOIN_TIME_CLOSED");
  if (post.relation === "AUTHOR")
    throw new DemoRejection(403, "SELF_PARTICIPATION_NOT_ALLOWED");
  if (post.relation === "JOINED")
    throw new DemoRejection(409, "ALREADY_JOINED");
  return updateDemoPost(id, (next) => ({ ...next, relation: "JOINED" }))!;
}

export function demoLeave(id: string, now = Date.now()): DemoPostRecord {
  const post = live(id);
  const status = demoStatus(post, now);
  if (status === "CANCELLED") throw new DemoRejection(409, "POST_CANCELLED");
  if (status === "FINISHED") throw new DemoRejection(409, "POST_FINISHED");
  if (now >= demoDeadline(post))
    throw new DemoRejection(409, "CANCEL_TIME_CLOSED");
  if (post.relation === "AUTHOR")
    throw new DemoRejection(403, "AUTHOR_CANNOT_CANCEL_PARTICIPATION");
  if (post.relation !== "JOINED")
    throw new DemoRejection(409, "ALREADY_CANCELLED");
  return updateDemoPost(id, (next) => ({ ...next, relation: "CANCELLED" }))!;
}

function authorOnly(id: string, now: number) {
  const post = live(id);
  if (post.relation !== "AUTHOR")
    throw new DemoRejection(403, "FORBIDDEN_OPERATION");
  const status = demoStatus(post, now);
  if (status === "CANCELLED") throw new DemoRejection(409, "POST_CANCELLED");
  if (status === "FINISHED") throw new DemoRejection(409, "POST_FINISHED");
  return status;
}

/** Author closes with the current members (OPEN/FULL → CLOSED). */
export function demoClose(id: string, now = Date.now()): DemoPostRecord {
  if (authorOnly(id, now) === "CLOSED")
    throw new DemoRejection(409, "POST_CLOSED");
  return updateDemoPost(id, (next) => ({ ...next, state: "CLOSED" }))!;
}

/** Author cancels the whole schedule; every member is cancelled with it. */
export function demoCancel(id: string, now = Date.now()): DemoPostRecord {
  authorOnly(id, now);
  return updateDemoPost(id, (next) => ({
    ...next,
    state: "CANCELLED",
    members: [],
  }))!;
}
