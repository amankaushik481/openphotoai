import { MailIcon } from "lucide-react";
import { GoogleIcon } from "@/components/auth/google-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SignInMethodDTO } from "@/server/account/profile";

const LABELS: Record<string, string> = { email: "Email link", google: "Google" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Read-only: email sign-in always works; Google links itself on first Google sign-in. */
export function SignInMethodsCard({ email, methods }: { email: string; methods: SignInMethodDTO[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in methods</CardTitle>
        <CardDescription>Ways you can sign in to this account.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {methods.map((m) => (
            <li key={m.providerId} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                {m.providerId === "google" ? (
                  <GoogleIcon className="size-4" />
                ) : (
                  <MailIcon aria-hidden className="size-4 text-muted-foreground" />
                )}
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-sm font-medium">{LABELS[m.providerId] ?? m.providerId}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {m.providerId === "email" ? `A sign-in link sent to ${email}` : m.linkedAt && `Linked ${formatDate(m.linkedAt)}`}
                </span>
              </div>
              <Badge variant="secondary">Connected</Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
