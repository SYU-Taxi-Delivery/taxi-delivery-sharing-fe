import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center px-6 py-16 sm:px-10">
      <h1 className="text-3xl font-bold">페이지를 찾을 수 없어요.</h1>
      <p className="mt-4 text-neutral-600">
        주소를 확인하고 다시 시도해 주세요.
      </p>
      <Link
        href="/"
        className="mt-8 w-fit rounded bg-neutral-900 px-5 py-3 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-900"
      >
        홈으로 돌아가기
      </Link>
    </main>
  );
}
