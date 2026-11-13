"use client";

import { useMemo, useState } from "react";
import type { AuthOperations } from "@/features/auth/auth";
import { AuthProvider } from "@/features/auth/AuthProvider";
import {
  PostFormError,
  toSeoulParts,
  type EditablePost,
  type PostFormOperations,
  type PostRequest,
} from "@/features/posts/form/postDraft";
import { PostFormScreen } from "@/features/posts/form/PostFormScreen";
import { DevTools } from "@/features/demo/DevTools";
import {
  DEMO_VIEWER,
  addDemoPost,
  demoJoinable,
  demoMemberCount,
  demoPosts,
  demoStatus,
  findDemoPost,
  regenerateDemoPost,
  demoSummary,
  updateDemoPost,
  type DemoPostRecord,
} from "@/features/demo/demoPosts";

const auth: AuthOperations = {
  me: async () => DEMO_VIEWER,
  login: async () => {},
  logout: async () => {},
};

const scenarios = {
  create: {
    normal: "작성 · 유사 모집 없음",
    similar: "작성 · 유사 모집 있음",
    similarError: "작성 · 유사 조회 실패",
    duplicate: "작성 · 같은 시각 중복",
    lost: "작성 · 응답 유실",
  },
  edit: {
    open: "수정 · 참여자 없음",
    joined: "수정 · 다른 참여자 있음",
    closed: "수정 · 마감한 모집",
    cancelled: "수정 · 취소된 모집",
    conflict: "수정 · 저장 중 다른 학생 참여",
  },
} as const;

type Mode = keyof typeof scenarios;

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 500));

/** A post I wrote that is still open; edit mode opens it when no id is given. */
export const DEFAULT_EDIT_ID = "preview-9";

/** Edit scenarios rewrite the shared record, like the detail scenarios. */
function applyEditScenario(id: string, scenario: string) {
  const base = regenerateDemoPost(id);
  if (!base) return;
  updateDemoPost(id, (post) => {
    const mine = {
      ...post,
      relation: "AUTHOR" as const,
      authorName: DEMO_VIEWER.displayName,
      state: "OPEN" as const,
    };
    switch (scenario) {
      case "open":
      case "conflict":
        return { ...mine, members: [] };
      case "joined":
        return { ...mine, members: ["윤서준"] };
      case "closed":
        return { ...mine, state: "CLOSED" };
      case "cancelled":
        return { ...mine, state: "CANCELLED", members: [] };
      default:
        return post;
    }
  });
}

function editablePost(id: string): EditablePost {
  const post = findDemoPost(id);
  if (!post || post.state === "REMOVED") throw new PostFormError("notFound");
  const now = Date.now();
  const { date, time } = toSeoulParts(Date.parse(post.referenceTime));
  const taxi = {
    departure: post.departure ?? "",
    destination: post.destination ?? "",
    date,
    time,
    capacity: post.type === "TAXI" ? post.capacity : 4,
  };
  const delivery = {
    restaurantName: post.restaurantName ?? "",
    pickupLocation: post.pickupLocation ?? "",
    date,
    time,
    capacity: post.type === "DELIVERY" ? post.capacity : 4,
    orderGuide: post.orderGuide ?? "",
  };
  return {
    id,
    status: demoStatus(post, now),
    isAuthor: post.relation === "AUTHOR",
    otherJoinedCount: demoMemberCount(post) - 1,
    currentMemberCount: demoMemberCount(post),
    draft: {
      type: post.type,
      common: {
        title: post.title,
        description: post.description,
        communicationUrl: post.communicationUrl ?? "",
      },
      taxi,
      delivery,
    },
  };
}

/** Request fields → record fields; omitted fields keep their value. */
function applyRequest(
  post: DemoPostRecord,
  request: Partial<PostRequest>,
): DemoPostRecord {
  const next: DemoPostRecord = { ...post };
  const fields = request as Record<string, unknown>;
  for (const key of [
    "title",
    "description",
    "departure",
    "destination",
    "restaurantName",
    "pickupLocation",
    "referenceTime",
    "capacity",
  ] as const) {
    if (fields[key] !== undefined)
      (next as Record<string, unknown>)[key] = fields[key];
  }
  if ("communicationUrl" in fields)
    next.communicationUrl = (fields.communicationUrl as string | null) ?? null;
  if ("orderGuide" in fields)
    next.orderGuide = (fields.orderGuide as string | null) ?? undefined;
  return next;
}

export function PostFormPreview({
  initialMode = "create",
  initialType = "TAXI",
  postId,
}: {
  initialMode?: Mode;
  initialType?: "TAXI" | "DELIVERY";
  postId?: string;
}) {
  const [editId, setEditId] = useState(postId);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [scenario, setScenario] = useState<string>(
    initialMode === "edit" ? "open" : "normal",
  );
  const [version, setVersion] = useState(0);

  const operations = useMemo<PostFormOperations>(() => {
    const conflict = { joined: false };
    return {
      findSimilar: async (request) => {
        await pause();
        if (scenario === "similarError") throw new TypeError("Failed to fetch");
        if (scenario !== "similar") return [];
        // A real shared record, so its card opens the same post everywhere.
        const now = Date.now();
        const target = Date.parse(request.referenceTime);
        const nearest = demoPosts()
          .filter((post) => post.type === request.type)
          .filter((post) => demoJoinable(post, now))
          .sort(
            (a, b) =>
              Math.abs(Date.parse(a.referenceTime) - target) -
              Math.abs(Date.parse(b.referenceTime) - target),
          )[0];
        return nearest ? [demoSummary(nearest, now)] : [];
      },
      create: async (request) => {
        await pause();
        if (scenario === "duplicate") throw new PostFormError("duplicate");
        if (scenario === "lost") throw new TypeError("Failed to fetch");
        const created = addDemoPost(
          applyRequest(
            {
              id: "",
              type: request.type,
              title: "",
              description: "",
              referenceTime: request.referenceTime,
              createdAt: "",
              capacity: request.capacity,
              authorName: DEMO_VIEWER.displayName,
              members: [],
              relation: "AUTHOR",
              state: "OPEN",
              communicationUrl: null,
              reported: false,
            },
            request,
          ),
        );
        return created.id;
      },
      load: async (id) => {
        await pause();
        return editablePost(id);
      },
      update: async (id, request) => {
        await pause();
        if (scenario === "conflict" && !conflict.joined) {
          conflict.joined = true;
          updateDemoPost(id, (post) => ({ ...post, members: ["윤서준"] }));
          throw new PostFormError("conflict");
        }
        const post = findDemoPost(id);
        if (!post || post.state === "REMOVED")
          throw new PostFormError("notFound");
        updateDemoPost(id, (current) => applyRequest(current, request));
      },
    };
  }, [scenario]);

  return (
    <AuthProvider operations={auth}>
      <DevTools>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span>
            작성·수정 데모 · 저장하면 목록·상세·내 활동에 함께 반영돼요.
          </span>
          <label className="flex items-center gap-1">
            상황
            <select
              className="rounded border px-1"
              value={`${mode}:${scenario}`}
              onChange={(event) => {
                const [nextMode, nextScenario] = event.target.value.split(":");
                if (nextMode === "edit") {
                  const id = editId ?? DEFAULT_EDIT_ID;
                  applyEditScenario(id, nextScenario);
                  setEditId(id);
                }
                setMode(nextMode as Mode);
                setScenario(nextScenario);
                setVersion((value) => value + 1);
              }}
            >
              {(Object.keys(scenarios) as Mode[]).map((group) =>
                Object.entries(scenarios[group]).map(([key, label]) => (
                  <option key={`${group}:${key}`} value={`${group}:${key}`}>
                    {label}
                  </option>
                )),
              )}
            </select>
          </label>
        </div>
      </DevTools>
      <PostFormScreen
        key={version}
        mode={mode}
        initialType={initialType}
        postId={editId ?? DEFAULT_EDIT_ID}
        listPath="/posts-preview"
        operations={operations}
      />
    </AuthProvider>
  );
}
