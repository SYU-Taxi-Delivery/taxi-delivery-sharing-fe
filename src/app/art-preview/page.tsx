import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  BagArt,
  BeanArt,
  CampusScene,
  PersonIcon,
  SeatSlots,
  TaxiArt,
} from "@/features/ui/art";

export const metadata = { robots: { index: false, follow: false } };

/*
 * Development-only sheet of the 두유팟 icon set (taxi, lunch bag, 두유콩):
 * the set side by side, then each drawing at the size the app really uses.
 * Not available in production builds.
 */
export default function ArtPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto grid max-w-3xl gap-10 bg-white px-4 py-8">
      <h1 className="text-2xl font-bold">두유팟 아이콘 세트</h1>

      <Section title="세트 (큰 크기)">
        <Cell label="택시 lg">
          <TaxiArt size="lg" className="h-24 w-32" />
        </Cell>
        <Cell label="배달 lg">
          <BagArt size="lg" className="h-24 w-24" />
        </Cell>
        <Cell label="두유콩 full">
          <BeanArt className="h-24 w-[5.4rem]" />
        </Cell>
        <Cell label="두유콩 green·인사">
          <BeanArt look="green" wave className="h-24 w-[5.4rem]" />
        </Cell>
      </Section>

      <Section title="실제 사용 크기">
        <Cell label="제목 장식 140×46">
          <CampusScene className="h-[2.875rem] w-[8.75rem]" />
        </Cell>
        <Cell label="카드 48px">
          <TaxiArt className="w-12" />
          <BagArt className="w-10" />
        </Cell>
        <Cell label="유형 배지 40px">
          <TaxiArt className="w-10" />
          <BagArt className="w-[1.875rem]" />
        </Cell>
        <Cell label="상세 68px">
          <TaxiArt size="lg" className="w-[4.25rem]" />
          <BagArt size="lg" className="w-16" />
        </Cell>
        <Cell label="두유콩 얼굴 32px">
          <BeanArt detail="face" className="h-8 w-[1.8rem]" />
        </Cell>
        <Cell label="인원 18px · 26px">
          <SeatSlots
            total={4}
            filled={3}
            className="flex gap-px [&_svg]:size-[18px]"
          />
          <SeatSlots
            total={4}
            filled={2}
            className="flex gap-0.5 [&_svg]:size-[26px]"
          />
        </Cell>
        <Cell label="메뉴 아이콘 24px">
          <PersonIcon className="size-6 text-[var(--text)]" />
        </Cell>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="flex flex-wrap items-end gap-4">{children}</div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="grid justify-items-center gap-2 rounded-2xl bg-[var(--soft)] p-4">
      <div className="flex items-end gap-3">{children}</div>
      <figcaption className="text-xs text-[var(--muted)]">{label}</figcaption>
    </figure>
  );
}
