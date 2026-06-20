import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Image
        src="/asdragon-logo.png"
        alt="AS Dragon"
        width={32}
        height={32}
        priority
        className="h-8 w-8 object-contain"
      />
      <span className="font-bold">Dragon Tennis</span>
    </span>
  );
}
