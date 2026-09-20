import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold">SSU ODL Online Classes</h1>
      <p className="text-muted-foreground">Sri Sri University — Open &amp; Distance Learning</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/login/student" className="rounded-md bg-primary px-5 py-2.5 text-primary-foreground">
          Student sign in (Google)
        </Link>
        <Link href="/login" className="rounded-md border border-border px-5 py-2.5">
          Teacher / admin sign in
        </Link>
      </div>
    </main>
  );
}
