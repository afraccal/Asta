import { cn } from "@/lib/cn";

const PALETTE = [
  "#6E93FF", "#3DDC97", "#FFC94D", "#FF7A6B",
  "#B98CFF", "#4ECDC4", "#FF9F68", "#7FD1FF",
];

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function Avatar({
  name,
  src,
  online,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  online?: boolean;
  size?: number;
  className?: string;
}) {
  const color = colorFor(name);
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="size-full rounded-full object-cover ring-2 ring-pitch-700"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-full items-center justify-center rounded-full font-semibold text-pitch-950 ring-2 ring-pitch-700"
          style={{ background: color, fontSize: size * 0.38 }}
        >
          {initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          title={online ? "Collegato" : "Non collegato"}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-pitch-850",
            online ? "bg-turn-400" : "bg-chalk-600",
          )}
        />
      )}
    </span>
  );
}
