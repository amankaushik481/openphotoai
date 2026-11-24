"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

type SignOutButtonProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  /** Where to go after signing out. */
  redirectTo?: string;
};

export function SignOutButton({ redirectTo = "/", children, disabled, ...props }: SignOutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const { error } = await signOut();
    if (error) {
      setPending(false);
      toast.error(error.message || "Couldn't sign out. Please try again.");
      return;
    }
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <Button {...props} onClick={onClick} disabled={pending || disabled}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
      {children ?? "Sign out"}
    </Button>
  );
}
