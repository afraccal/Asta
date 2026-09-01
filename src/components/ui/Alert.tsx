import { cn } from "@/lib/cn";

export function Alert({
  children,
  tone = "error",
  className,
}: {
  children: React.ReactNode;
  tone?: "error" | "info";
  className?: string;
}) {
  if (!children) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        tone === "error"
          ? "border-alarm-600/50 bg-alarm-600/12 text-alarm-400"
          : "border-brand-600/50 bg-brand-600/12 text-brand-400",
        className,
      )}
    >
      {children}
    </p>
  );
}
