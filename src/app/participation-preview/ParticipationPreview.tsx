"use client";

import { useRef } from "react";
import { ParticipationPanel } from "@/features/participation/ParticipationPanel";
import {
  hideUnavailableDetails,
  type ParticipationSnapshot,
} from "@/features/participation/participation";
import { useParticipation } from "@/features/participation/useParticipation";

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 350));

export function ParticipationPreview({
  initialSnapshot,
}: {
  initialSnapshot: ParticipationSnapshot;
}) {
  const current = useRef(initialSnapshot);
  const participation = useParticipation(initialSnapshot, {
    join: async () => {
      await pause();
      current.current = {
        ...current.current,
        viewerRelation: "JOINED",
        currentMemberCount: current.current.currentMemberCount + 1,
        participantNames: ["작성자", "참가자", "나"],
        communicationUrl: "#preview-communication",
      };
    },
    cancel: async () => {
      await pause();
      current.current = hideUnavailableDetails({
        ...current.current,
        viewerRelation: "CANCELLED",
        currentMemberCount: current.current.currentMemberCount - 1,
      });
    },
    refresh: async () => {
      current.current = {
        ...current.current,
        serverTime: new Date().toISOString(),
      };
      return current.current;
    },
  });

  return (
    <article>
      <h2 className="mb-3 font-bold">
        {initialSnapshot.type === "TAXI"
          ? "택시 · 참여 신청"
          : "배달 · 참여 취소"}
      </h2>
      <ParticipationPanel participation={participation} />
      {participation.snapshot.participantNames && (
        <p className="mt-4 text-sm">
          참가자: {participation.snapshot.participantNames.join(", ")}
        </p>
      )}
      {participation.snapshot.communicationUrl && (
        <a
          className="mt-2 inline-block text-sm underline"
          href={participation.snapshot.communicationUrl}
        >
          소통 링크 (모의)
        </a>
      )}
    </article>
  );
}
