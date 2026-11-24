import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { DemoLoginButtonClient } from "./demo-login-button-client";

interface DemoLoginButtonProps {
  /**
   * Ask the server whether demo mode is on before rendering (for statically rendered pages, which
   * can't read the runtime env). Renders nothing until the answer is yes.
   */
  probe?: boolean;
  variant?: "outline" | "secondary" | "brand" | "ghost";
  size?: "default" | "lg";
  className?: string;
  label?: string;
}

/**
 * "Try the live demo": creates a throwaway demo account, signs in and opens its first batch.
 *
 * The button classes are resolved here (on the server when rendered from a server component, e.g. the
 * landing hero), so the client island ships without the Button/cva/tailwind-merge stack.
 */
export function DemoLoginButton({
  probe = false,
  variant = "outline",
  size = "lg",
  className,
  label = "Try the live demo",
}: DemoLoginButtonProps) {
  return (
    <DemoLoginButtonClient
      probe={probe}
      variant={variant}
      size={size}
      label={label}
      className={cn(buttonVariants({ variant, size, className: cn("w-full sm:w-auto", className) }))}
    />
  );
}
