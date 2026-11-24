/**
 * Better Auth endpoints (magic link, Google OAuth, sessions, sign-out).
 * Better Auth does its own error handling, so this is the one API route that is
 * not wrapped in `route()`.
 */
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";

export const { GET, POST } = toNextJsHandler((request: Request) => getAuth().handler(request));
