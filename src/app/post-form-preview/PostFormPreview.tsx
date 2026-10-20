"use client";

import { useMemo, useState } from "react";
import type { AuthOperations } from "@/features/auth/auth";
import { AuthProvider } from "@/features/auth/AuthProvider";
import {
  PostFormError,
  toSeoulParts,
  type EditablePost,
  type PostFormOperations,
} from "@/features/posts/form/postDraft";
import { PostFormScreen } from "@/features/posts/form/PostFormScreen";

const auth: AuthOperations = {
  me: async () => ({ id: "1", displayName: "김하늘", role: "STUDENT" }),
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

function editablePost(
  scenario: string,
  joinedAfterConflict: boolean,
): EditablePost {
  const { date } = toSeoulParts(Date.now() + 3 * 3_600_000);
  const joined = scenario === "joined" || joinedAfterConflict;
  return {
    id: "preview-edit",
    status:
      scenario === "closed"
        ? "CLOSED"
        : scenario === "cancelled"
          ? "CANCELLED"
          : "OPEN",
    isAuthor: true,
    otherJoinedCount: joined ? 1 : 0,
    currentMemberCount: joined ? 2 : 1,
    draft: {
      type: "TAXI",
      common: {
        title: "정문에서 석계역까지 같이 가요",
        description: "정문 앞에서 만나요.",
        communicationUrl: "https://open.kakao.com/o/preview",
      },
      taxi: {
        departure: "삼육대학교 정문",
        destination: "석계역 1번 출구",
        date,
        time: "21:00",
        capacity: 4,
      },
      delivery: {
        restaurantName: "",
        pickupLocation: "",
        date,
        time: "",
        capacity: 4,
        orderGuide: "",
      },
    },
  };
}

export function PostFormPreview() {
  const [mode, setMode] = useState<Mode>("create");
  const [scenario, setScenario] = useState<string>("normal");
  const [version, setVersion] = useState(0);

  const operations = useMemo<PostFormOperations>(() => {
    const conflict = { joined: false };
    return {
      findSimilar: async (request) => {
        await pause();
        if (scenario === "similarError") throw new TypeError("Failed to fetch");
        if (scenario !== "similar") return [];
        const base = {
          status: "OPEN",
          referenceTime: request.referenceTime,
          capacity: 4,
          currentMemberCount: 2,
          joinable: true,
          authorName: "박지민",
        };
        return request.type === "TAXI"
          ? [
              {
                ...base,
                id: "similar-1",
                type: "TAXI",
                departure: request.departure,
                destination: request.destination,
              },
            ]
          : [
              {
                ...base,
                id: "similar-1",
                type: "DELIVERY",
                restaurantName: request.restaurantName,
                pickupLocation: request.pickupLocation,
              },
            ];
      },
      create: async () => {
        await pause();
        if (scenario === "duplicate") throw new PostFormError("duplicate");
        if (scenario === "lost") throw new TypeError("Failed to fetch");
        return "preview-created";
      },
      load: async () => {
        await pause();
        return editablePost(scenario, conflict.joined);
      },
      update: async () => {
        await pause();
        if (scenario === "conflict" && !conflict.joined) {
          conflict.joined = true;
          throw new PostFormError("conflict");
        }
      },
    };
  }, [scenario]);

  return (
    <AuthProvider operations={auth}>
      <div className="flex flex-wrap items-center gap-3 bg-yellow-100 px-4 py-2 text-xs">
        <span>개발 전용 모의 화면 · 성공하면 상세 주소(#7)로 이동해요.</span>
        <label className="flex items-center gap-1">
          상황
          <select
            className="rounded border px-1"
            value={`${mode}:${scenario}`}
            onChange={(event) => {
              const [nextMode, nextScenario] = event.target.value.split(":");
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
      <PostFormScreen
        key={version}
        mode={mode}
        postId="preview-edit"
        listPath="/posts-preview"
        operations={operations}
      />
    </AuthProvider>
  );
}
