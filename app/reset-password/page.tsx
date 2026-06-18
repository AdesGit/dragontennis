import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
      <Suspense fallback={<p>Chargement…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
