"use client";

import { useEffect, useState } from "react";
import { ParticipationPanel } from "@/features/participation/ParticipationPanel";
import type { ParticipationSnapshot } from "@/features/participation/participation";
import { useParticipation } from "@/features/participation/useParticipation";
import { toPostDetail, toSnapshot } from "@/features/posts/detail/postDetail";
import {
  demoDetail,
  demoJoin,
  demoLeave,
  findDemoPost,
} from "@/features/demo/demoPosts";

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 350));

/** The shared demo record as the participation panel sees it. */
function readSnapshot(postId: string): ParticipationSnapshot | null {
  const post = findDemoPost(postId);
  return post ? toSnapshot(toPostDetail(demoDetail(post, Date.now()))) : null;
}

/** One shared demo post; joining here shows up in the list and 내 활동 too. */
export function ParticipationPreview({ postId }: { postId: string }) {
  const [initial, setInitial] = useState<ParticipationSnapshot | null>(null);
  useEffect(() => {
    // The store lives in the browser, so it is read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitial(readSnapshot(postId));
  }, [postId]);
  if (!initial) return <p role="status">모집 정보를 불러오고 있어요.</p>;
  return <Panel initial={initial} />;
}

function Panel({ initial }: { initial: ParticipationSnapshot }) {
  const participation = useParticipation(initial, {
    join: async () => {
      await pause();
      demoJoin(initial.postId);
    },
    cancel: async () => {
      await pause();
      demoLeave(initial.postId);
    },
    refresh: async () => {
      const latest = readSnapshot(initial.postId);
      if (!latest) throw new Error("모집을 찾을 수 없습니다.");
      return latest;
    },
  });

  return (
    <article>
      <h2 className="mb-3 font-bold">
        {initial.type === "TAXI" ? "택시" : "배달"} · {initial.title}
      </h2>
      <p className="mb-3 text-xs text-neutral-600">{initial.postId}</p>
      <ParticipationPanel participation={participation} />
      {participation.snapshot.participantNames && (
        <p className="mt-4 text-sm">
          참가자: {participation.snapshot.participantNames.join(", ")}
        </p>
      )}
      {participation.snapshot.communicationUrl && (
        <p className="mt-2 text-sm">
          소통 링크 (데모): {participation.snapshot.communicationUrl}
        </p>
      )}
    </article>
  );
}
