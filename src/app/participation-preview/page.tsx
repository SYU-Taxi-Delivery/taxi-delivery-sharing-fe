import { ParticipationPreview } from "./ParticipationPreview";

export const metadata = { robots: { index: false, follow: false } };

/** Shared demo posts: one I can join (taxi) and one I already joined (delivery). */
const examples = ["preview-6", "preview-8"];

export default function ParticipationPreviewPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold">참여 신청·취소 미리보기</h1>
      <p className="mt-3 mb-8 text-sm leading-6 text-neutral-600">
        예시 데이터로 동작을 확인하는 데모 화면입니다. 모집 목록·상세·내 활동과
        같은 데이터를 쓰고, 새로고침하면 초기 상태로 돌아갑니다.
      </p>
      <div className="grid items-start gap-8 md:grid-cols-2">
        {examples.map((postId) => (
          <ParticipationPreview key={postId} postId={postId} />
        ))}
      </div>
      <p className="mt-8 text-sm text-neutral-600">
        소통 링크는 동작 확인용이며 실제 채팅방에 연결되지 않습니다.
      </p>
    </main>
  );
}
