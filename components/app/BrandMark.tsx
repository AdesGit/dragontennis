import { Zap } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <Zap className="h-4 w-4" />
      </span>
      <span className="font-bold">Dragon Tennis</span>
    </span>
  );
}
