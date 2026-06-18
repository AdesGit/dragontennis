import { cn } from "@/lib/utils";

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type AvatarProps = Omit<React.ComponentProps<"div">, "children"> & {
  name?: string;
  initials?: string;
};

export function Avatar({
  name,
  initials,
  className,
  ...props
}: AvatarProps) {
  const label = initials ?? (name ? deriveInitials(name) : "?");
  return (
    <div
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground",
        className,
      )}
      {...props}
    >
      {label}
    </div>
  );
}
