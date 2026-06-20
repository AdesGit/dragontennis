"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, HelpCircle, Shield, type LucideIcon } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/SignOutButton";
import { cn } from "@/lib/utils";

import { BrandMark } from "./BrandMark";

type NavLink = { href: string; label: string; icon: LucideIcon };

const MEMBER_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Accueil", icon: Home },
  { href: "/faq", label: "FAQ", icon: HelpCircle },
];

const ADMIN_LINK: NavLink = { href: "/admin", label: "Admin", icon: Shield };

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname.startsWith("/admin");
  return pathname === href;
}

export function AppNavbarDesktop() {
  const pathname = usePathname();
  const me = useQuery(api.users.getMe);

  const links =
    me?.role === "admin" ? [...MEMBER_LINKS, ADMIN_LINK] : MEMBER_LINKS;

  return (
    <header className="sticky top-0 z-40 hidden border-b bg-background md:block">
      <div className="mx-auto flex h-14 max-w-screen-lg items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard">
            <BrandMark />
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {me !== undefined && (
            <Badge variant="secondary">{me?.balance ?? 0} XPF</Badge>
          )}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
