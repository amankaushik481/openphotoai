/**
 * Better Auth client for client components (magic link, Google, sign-out, session).
 * App fields (credits, plan, role...) come from `/api/me`, not from the session.
 */
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [magicLinkClient()],
});

export const { signIn, signOut, useSession } = authClient;
