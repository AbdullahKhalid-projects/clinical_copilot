import Link from "next/link";

export default function ClinicalSessionIndexPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Select a Session</h1>
      <p className="mt-3 text-muted-foreground">
        Start or open a specific clinical session from your dashboard.
      </p>
      <Link
        href="/doctor/dashboard"
        className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        Go to Dashboard
      </Link>
    </main>
  );
}
