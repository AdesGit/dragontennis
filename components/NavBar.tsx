"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

const MEMBER_LINKS = [
  { href: "/dashboard", label: "Mon espace" },
  { href: "/activate", label: "Activer" },
  { href: "/faq", label: "FAQ" },
];
const ADMIN_LINKS = [
  { href: "/members", label: "Membres" },
  { href: "/credits", label: "Créditer" },
  { href: "/history", label: "Historique" },
  { href: "/stats", label: "Stats" },
  { href: "/admin/faq", label: "Gérer FAQ" },
];

export function NavBar({ title }: { title: string }) {
  const me = useQuery(api.users.getMe);
  const links = me?.role === "admin" ? [...MEMBER_LINKS, ...ADMIN_LINKS] : MEMBER_LINKS;
  return (
    <header className="mb-8 flex flex-col gap-3 border-b pb-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{title}</h1>
        <SignOutButton />
      </div>
      <nav className="flex flex-wrap gap-3 text-sm">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-blue-600 hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
