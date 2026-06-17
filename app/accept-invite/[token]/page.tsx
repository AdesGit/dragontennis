import { AcceptInviteForm } from "@/components/AcceptInviteForm";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-2xl font-bold">Dragon Tennis</h1>
      <AcceptInviteForm token={token} />
    </main>
  );
}
