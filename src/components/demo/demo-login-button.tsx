"use client";

import { Loader2, PlayIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, apiErrorText, fetcher } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const DEMO_LOGIN_PATH = "/api/demo/login";

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

/** "Try the live demo": creates a throwaway demo account, signs in and opens its first batch. */
export function DemoLoginButton({ probe = false, variant = "outline", size = "lg", className, label = "Try the live demo" }: DemoLoginButtonProps) {
  const { data } = useSWR<{ enabled: boolean }>(probe ? DEMO_LOGIN_PATH : null, fetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const [pending, setPending] = useState(false);

  if (probe && !data?.enabled) return null;

  async function start() {
    setPending(true);
    try {
      const { redirect } = await api<{ redirect: string }>(DEMO_LOGIN_PATH, { method: "POST" });
      // Full navigation: the new session cookie must replace whatever the client cached.
      window.location.assign(redirect);
    } catch (err) {
      toast.error(apiErrorText(err));
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("w-full sm:w-auto", className)}
      onClick={start}
      disabled={pending}
      aria-busy={pending || undefined}
      data-testid="demo-login-button"
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PlayIcon aria-hidden />}
      {pending ? "Setting up your demo…" : label}
    </Button>
  );
}
