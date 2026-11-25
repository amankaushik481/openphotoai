import { cn } from "@/lib/utils";

import styles from "./darkroom.module.css";

/** Loading placeholder: a sheet of paper with a slow sheen passing over it (still under reduced motion). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn(styles.shimmer, "relative overflow-hidden rounded-xs bg-secondary", className)} {...props} />;
}

export { Skeleton };
