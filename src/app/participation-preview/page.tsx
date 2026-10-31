import type { ParticipationSnapshot } from "@/features/participation/participation";
import { ParticipationPreview } from "./ParticipationPreview";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function ParticipationPreviewPage() {
  const serverTime = new Date().toISOString();
  const referenceTime = new Date(
    Date.parse(serverTime) + 3_600_000,
  ).toISOString();
  const examples: ParticipationSnapshot[] = [
    {
      postId: "preview-taxi",
      type: "TAXI",
      title: "학교에서 태릉입구역까지 함께 가요",
      status: "OPEN",
      referenceTime,
      serverTime,
      currentMemberCount: 2,
      capacity: 4,
      viewerRelation: "NONE",
      joinable: true,
    },
    {
      postId: "preview-delivery",
      type: "DELIVERY",
      title: "점심 배달을 함께 주문해요",
      status: "OPEN",
      referenceTime,
      serverTime,
      currentMemberCount: 3,
      capacity: 6,
      viewerRelation: "JOINED",
      joinable: true,
      participantNames: ["작성자", "참가자", "나"],
      communicationUrl: "#preview-communication",
    },
  ];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold">참여 신청·취소 미리보기</h1>
      <p className="mt-3 mb-8 text-sm leading-6 text-neutral-600">
        예시 데이터로 동작을 확인하는 데모 화면입니다. 새로고침하면 초기 상태로
        돌아갑니다.
      </p>
      <div className="grid items-start gap-8 md:grid-cols-2">
        {examples.map((snapshot) => (
          <ParticipationPreview
            key={snapshot.postId}
            initialSnapshot={snapshot}
          />
        ))}
      </div>
      <p id="preview-communication" className="mt-8 text-sm text-neutral-600">
        소통 링크는 동작 확인용이며 실제 채팅방에 연결되지 않습니다.
      </p>
    </main>
  );
}
