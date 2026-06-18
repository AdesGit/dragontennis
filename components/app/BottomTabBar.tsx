"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Zap, HelpCircle, Shield, type LucideIcon } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; icon: LucideIcon };

const MEMBER_TABS: Tab[] = [
  { href: "/dashboard", label: "Accueil", icon: Home },
  { href: "/activate", label: "Activer", icon: Zap },
  { href: "/faq", label: "FAQ", icon: HelpCircle },
];

const ADMIN_TAB: Tab = { href: "/admin", label: "Admin", icon: Shield };

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname.startsWith("/admin");
  return pathname === href;
}

export function BottomTabBar() {
  const pathname = usePathname();
  const me = useQuery(api.users.getMe);

  const tabs =
    me?.role === "admin" ? [...MEMBER_TABS, ADMIN_TAB] : MEMBER_TABS;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background md:hidden">
      {tabs.map((tab) => {
        const active = isActive(pathname, tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon size={20} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
