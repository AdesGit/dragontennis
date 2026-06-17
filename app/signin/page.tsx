import { SignInForm } from "@/components/SignInForm";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-2xl font-bold">Dragon Tennis</h1>
      <SignInForm />
    </main>
  );
}
