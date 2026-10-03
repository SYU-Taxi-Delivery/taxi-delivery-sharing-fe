export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center px-6 py-16 sm:px-10">
      <p className="mb-6 w-fit border-l-4 border-yellow-400 pl-3 text-sm font-semibold tracking-widest">
        SYU TAXI · DELIVERY
      </p>
      <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-5xl">
        SYU 택시·배달 공유
      </h1>
      <p className="mt-6 max-w-md text-base leading-7 text-neutral-600">
        택시와 배달을 함께할 수 있는 공간을 준비하고 있어요.
      </p>
      <p role="status" className="mt-10 text-sm text-neutral-500">
        서비스 준비 중
      </p>
    </main>
  );
}
