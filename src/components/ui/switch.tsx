"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // Unchecked track ≥ 3:1 against the page and against the thumb in both themes (1.4.11).
        // Touch: invisible hit area grows the 18px control toward 44px without reflow.
        "peer relative inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-xs border border-transparent transition-all disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-safelight data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-muted-foreground/60 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-3",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-[1px] bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=checked]:bg-white data-[state=unchecked]:translate-x-0 dark:data-[state=unchecked]:bg-foreground",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
