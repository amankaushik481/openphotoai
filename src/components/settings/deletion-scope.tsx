import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Exactly what account deletion removes (keep in sync with src/server/account/delete-account.ts). */
const DELETED = [
  "Your identity models, including trained weights stored at our AI provider",
  "Training selfies and the consent selfie",
  "Every photo and video you created, plus your uploads and folders",
  "Share links (they stop working immediately)",
  "Your active subscription (canceled, no further charges) and remaining credits",
  "API keys, sign-in methods and all sessions",
  "Teams you own and their brand kits",
] as const;

/** What survives, and why. */
const KEPT = [
  "Anonymized safety records (no name, email, prompts or images) used to fight abuse",
  "Billing records our payment processor must keep by law",
] as const;

export function DeletionScope({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 text-sm", className)}>
      <div className="grid gap-2">
        <p className="font-medium">Permanently deleted</p>
        <ul className="grid gap-1.5">
          {DELETED.map((item) => (
            <li key={item} className="flex gap-2">
              <XIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-2">
        <p className="font-medium">Kept</p>
        <ul className="grid gap-1.5 text-muted-foreground">
          {KEPT.map((item) => (
            <li key={item} className="flex gap-2">
              <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
