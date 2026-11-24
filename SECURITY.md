# Security policy

## Reporting a vulnerability

**Please do not report security issues in public issues, pull requests or discussions.**

Report privately through GitHub: **Security → Report a vulnerability** on this repository
([new advisory](https://github.com/amankaushik481/openphotoai/security/advisories/new)). Include:

- what is affected and the impact (what an attacker can read, change or generate),
- steps or a proof of concept to reproduce it,
- the version or commit, and your setup (`pnpm dev`, Docker, Vercel) and providers (`pnpm check-env`).

We aim to acknowledge reports within 3 business days and to ship a fix for confirmed high-severity issues within
30 days. We will keep you informed and credit you in the advisory unless you prefer to stay anonymous. Please give us
a reasonable time to fix the issue before disclosing it, and never access, modify or delete other people's data
(test with your own accounts and a local instance).

## Supported versions

Security fixes land on `main` and in the latest release. Self-hosters should keep their deployment up to date.

## Safety module policy

OpenShoot generates realistic images of real people, so its **safety module is part of the security boundary**
(`src/server/safety`, providers in `src/providers/safety`). The following are always treated as vulnerabilities,
with the same private reporting process:

- generating or training on someone without the consent flow (live consent selfie + face match of every training
  photo), or using another user's identity model without an accepted invite;
- bypassing the adult-only age checks;
- getting prompts, references or outputs past moderation (sexual content, minors, public figures, violence);
- removing or skipping the AI-generated label (IPTC metadata) or the free-tier watermark;
- accessing another user's photos, models, media or signed URLs (IDOR), or escalating to admin;
- disabling safety checks through configuration. By design no environment variable turns safety off, and
  `src/lib/env.ts` refuses mock safety providers when a real AI provider is configured; a way around this is a bug.

## Abuse of a hosted instance

This repository is software, not a service. To report misuse of your likeness or request removal of content from a
specific OpenShoot-based website, contact that website's operator through its takedown address (shown in its
acceptable-use policy and on every shared image's report button). Operators should configure
`NEXT_PUBLIC_TAKEDOWN_EMAIL` and act on reports from the admin moderation queue.
