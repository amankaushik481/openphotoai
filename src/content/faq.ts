/**
 * FAQ copy as typed data. Answers use the inline markup from ./inline (bold, [links](/x), auto-linked emails);
 * paragraphs are separated by a blank line. Numbers come from config so the copy never drifts from reality.
 */
import { APP, TRAINING } from "@/config/app";
import { CREDIT_COSTS, DRAFT_DAILY_LIMIT, DRAFT_DAILY_LIMIT_FREE, INSTANT_MODE_MULTIPLIER } from "@/config/credits";
import { MODELS } from "@/config/models";
import { CREDIT_PACKS, PAID_PLAN_IDS, PLANS } from "@/config/plans";
import { formatUsd } from "@/lib/utils";
import { getLegalVariables } from "./legal";

export type FaqCategoryId = "getting-started" | "photos-quality" | "privacy-safety" | "billing" | "self-hosting";

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  /** Shown in the landing-page FAQ teaser. */
  featured?: boolean;
  /** Shown on the pricing page. */
  pricing?: boolean;
}

export interface FaqCategory {
  id: FaqCategoryId;
  title: string;
  description: string;
  items: FaqItem[];
}

/** Months free when paying yearly, e.g. 2 when yearly = 10 × monthly. */
export function yearlyMonthsFree(): number {
  const pro = PLANS.pro;
  if (!pro.monthlyPriceCents) return 0;
  return Math.max(0, Math.round(12 - pro.yearlyPriceCents / pro.monthlyPriceCents));
}

export function getFaqCategories(): FaqCategory[] {
  const legal = getLegalVariables();
  const name = APP.name;
  const cheapestPack = Math.min(...CREDIT_PACKS.map((p) => p.priceCents));
  const apiPlans = PAID_PLAN_IDS.filter((id) => PLANS[id].limits.apiAccess).map((id) => PLANS[id].name);
  const maxBatch = Math.max(...PAID_PLAN_IDS.map((id) => PLANS[id].limits.maxBatch));
  const monthsFree = yearlyMonthsFree();

  return [
    {
      id: "getting-started",
      title: "Getting started",
      description: "What it is, what you need and how long it takes.",
      items: [
        {
          id: "what-is-it",
          question: `What is ${name}?`,
          answer: `${name} is an AI photographer. You take a live selfie and add a few photos of yourself, ${name} builds a private identity model, and then you create professional headshots, dating photos, travel shots, edits and short videos of yourself in minutes.\n\nIt is open source under the MIT License: use the hosted version, or [run it on your own server](/docs).`,
        },
        {
          id: "how-many-photos",
          question: "How many photos do I need?",
          featured: true,
          answer: `For a **Trained** model (best likeness), upload ${TRAINING.minPhotos}–${TRAINING.maxPhotos} photos. For an **Instant** model, 3–10 is enough. Use recent photos with different angles, lighting and expressions, only you in the frame, and no sunglasses.\n\nThe quality checker reviews every photo as you upload it (blur, lighting, face size, duplicates, other people) and tells you how to fix problems **before** you spend any credits.`,
        },
        {
          id: "instant-vs-trained",
          question: "What's the difference between Instant and Trained models?",
          answer: `**Instant** models are ready in seconds and cost nothing to create. They use reference-based AI, so each photo costs ${INSTANT_MODE_MULTIPLIER}× the normal credits.\n\n**Trained** models fine-tune a private model on your photos for the best likeness. Training costs ${CREDIT_COSTS.train} credits once; after that photos cost the normal price. You can start Instant and train later.`,
        },
        {
          id: "how-long",
          question: "How long does it take?",
          answer:
            "Instant models are ready in seconds. Training usually takes a few minutes, depending on the AI provider's queue, and we email you when it's done. Draft previews arrive in seconds, full-quality photos shortly after, and a 50-photo pack batch runs in parallel with live progress.",
        },
        {
          id: "free-trial",
          question: "Can I try it for free?",
          answer: `Yes. Instant models are free to create, and draft previews cost 0 credits (${DRAFT_DAILY_LIMIT_FREE} a day before your first purchase, ${DRAFT_DAILY_LIMIT} a day after). Full-quality photos use credits; on the free plan they carry a small watermark until your first purchase.`,
        },
        {
          id: "packs",
          question: "What are photo packs?",
          answer: `A pack is a curated set of styles for one goal: LinkedIn headshots, dating, travel, fashion, events and more. Pick a pack, choose your model, and generate the whole set (up to ${maxBatch} photos in one click). [Browse all packs](/packs).`,
        },
      ],
    },
    {
      id: "photos-quality",
      title: "Photos & quality",
      description: "Likeness, the best-shots picker, editing and usage rights.",
      items: [
        {
          id: "look-like-me",
          question: "Will the photos actually look like me?",
          featured: true,
          answer:
            "That's the whole point, so we measure it. Every generated photo gets a likeness score against your consent selfie. The best-shots picker shows your strongest photos first and hides weak ones, and the **likeness guarantee** refunds the credits for photos that fall below the threshold, automatically.",
        },
        {
          id: "likeness-guarantee",
          question: "How does the likeness guarantee work?",
          pricing: true,
          answer:
            "After each photo is generated we compare the face with your consent selfie. If the likeness score is below our threshold, the photo is hidden from your gallery and its credits go straight back to your balance. You don't have to ask. You can still view hidden shots with “Show hidden” if you're curious.",
        },
        {
          id: "drafts",
          question: "What are instant drafts?",
          answer: `Drafts are fast, lower-resolution previews that cost 0 credits. When you like one, click “Full quality” to re-render the same shot (same seed) at full resolution for the normal price (${CREDIT_COSTS.generateStandard} credit for a standard photo).`,
        },
        {
          id: "editing",
          question: "Can I edit the photos?",
          answer: `Yes. Change the outfit, background, hair or expression with a sentence, repaint any area with the brush, copy a pose from a reference photo, upscale 2× or 4×, restore faces, remove backgrounds, try on garments, and turn any photo into a 5–10 second video or a talking video. Every tool shows its credit cost before you run it.`,
        },
        {
          id: "commercial-use",
          question: "Can I use the photos commercially?",
          answer:
            "Yes, on paid plans: use them on LinkedIn, your website, press kits, ads and client work. You must follow the [Acceptable Use Policy](/legal/acceptable-use), respect the rights of anyone depicted, and disclose AI generation where the law or a platform requires it.",
        },
        {
          id: "ai-labels",
          question: "Are the photos marked as AI-generated?",
          answer:
            "Yes. Every image and video carries standard machine-readable metadata (IPTC “trainedAlgorithmicMedia”) that platforms use to detect AI content. Free-plan images also get a small visible watermark until your first purchase. Please don't remove the labels to mislead people.",
        },
      ],
    },
    {
      id: "privacy-safety",
      title: "Privacy & safety",
      description: "Your data, consent, and how we prevent misuse.",
      items: [
        {
          id: "train-on-my-photos",
          question: "Do you use my photos to train AI?",
          featured: true,
          answer:
            "No. Your photos train **only your own private model**, which only you can use. We never use your photos, models or results to train general AI models, and we never sell them.",
        },
        {
          id: "face-data",
          question: "What happens to my face data?",
          answer: `We store a face embedding (a list of numbers, not a photo) from your consent selfie. It's used for exactly two things: checking that every training photo is really you, and scoring the likeness of your results. It's deleted together with your model, and at the latest ${legal.biometricMaxYears} years after your last visit. Details in the [Privacy Policy](/legal/privacy#biometric).`,
        },
        {
          id: "delete-data",
          question: "How do I delete my data?",
          answer:
            "Delete any photo, video or model at any time. Deleting a model removes your selfies, face data and model weights, including the copy at the AI provider. To delete everything, go to Settings → Delete account: we email you a confirmation link, then delete it all for real and send a final confirmation. You can also export all your data first.",
        },
        {
          id: "someone-else",
          question: "Can I create photos of someone else?",
          answer:
            "Only of an adult who agrees and verifies it themselves. Every model starts with a **live camera selfie**, and every training photo must match that face, so nobody can build a model of you from your Instagram. For couple or group shots, invite the other person: they accept in the app and choose which of their own models to share, and can revoke it any time.",
        },
        {
          id: "nsfw",
          question: "Can I generate NSFW or sexy photos?",
          answer:
            "No, never. Prompts and uploads are filtered and every output is checked before it's stored. Blocked outputs are discarded, never shown, and the credits are refunded. Minors and public figures are blocked too.",
        },
        {
          id: "report",
          question: "How do I report misuse or request a takedown?",
          answer: `Use the “Report” button on any shared page, or email ${legal.takedownEmail}. We acknowledge reports within ${legal.takedownAckHours} hours and remove intimate imagery, content involving minors and impersonation within ${legal.takedownUrgentHours} hours. See the [takedown process](/legal/acceptable-use#takedown).`,
        },
      ],
    },
    {
      id: "billing",
      title: "Billing & credits",
      description: "Credits, refunds, subscriptions and cancellations.",
      items: [
        {
          id: "credits",
          question: "How do credits work?",
          pricing: true,
          answer: `One credit is roughly one standard photo. Every action shows its credit cost before you run it, and the full price list is on the [pricing page](/pricing#credit-costs). Drafts and the prompt helper are free.`,
        },
        {
          id: "credits-expire",
          question: "Do my credits expire?",
          featured: true,
          pricing: true,
          answer: `Credits **never expire** — whether they come from a plan or a one-time credit pack. A quiet month never wastes your credits.`,
        },
        {
          id: "failed-photos",
          question: "What if a photo fails or doesn't look like me?",
          pricing: true,
          answer:
            "You get the credits back automatically: for failed jobs, cancellations, outputs blocked by the safety filter, and photos below the likeness threshold. No support ticket needed.",
        },
        {
          id: "refunds",
          question: "Can I get a refund?",
          pricing: true,
          answer: `Yes. Within ${legal.refundWindowDays} days of a purchase you can ask for a refund of the unused part, even if you've downloaded photos. Email ${legal.supportEmail} from your account address. Automatic credit refunds (above) happen on top of that.`,
        },
        {
          id: "cancel",
          question: "Can I cancel any time?",
          pricing: true,
          answer:
            "Yes, in one click from Billing. No retention maze. You keep your plan and credits until the end of the period you paid for.",
        },
        {
          id: "subscription-needed",
          question: "Do I need a subscription?",
          pricing: true,
          answer: `No. Buy a one-time credit pack (from ${formatUsd(cheapestPack)}) whenever you need it. Subscriptions are cheaper per credit if you shoot every month${monthsFree > 0 ? `, and yearly billing gets you ${monthsFree} months free` : ""}.`,
        },
      ],
    },
    {
      id: "self-hosting",
      title: "Open source & self-hosting",
      description: "Run it yourself, extend it, automate it.",
      items: [
        {
          id: "open-source",
          question: "Is it really open source?",
          answer: `Yes, the whole product is MIT-licensed: the app, safety system, billing, pack format and API. The code is on [GitHub](${APP.githubUrl}).`,
        },
        {
          id: "self-host",
          question: "Can I self-host it?",
          featured: true,
          answer:
            "Yes. Run `docker compose up` (Postgres and S3-compatible storage included) or deploy to Vercel with any Postgres. It runs with zero API keys in mock mode, so you can try everything before adding your own AI provider keys. See the [self-hosting guide](/docs).",
        },
        {
          id: "self-host-cost",
          question: "What does self-hosting cost?",
          answer: `The software is free. You pay your AI provider directly at their prices with no markup, for example about $${MODELS.fal.generate.costUsd.toFixed(3)} per standard photo and about $${MODELS.fal.train.costUsd.toFixed(2)} per trained model on fal.ai's defaults, plus your own hosting.`,
        },
        {
          id: "custom-packs",
          question: "Can I add my own photo packs?",
          answer:
            "Yes. A pack is a single JSON file in the `packs/` folder (name, description, prompts and colors), with no code changes needed. The format is open, so packs can be shared between deployments.",
        },
        {
          id: "self-host-safety",
          question: "Are the safety checks on when I self-host?",
          answer:
            "Yes. Consent verification, adults-only checks and content filters are a core module that can't be switched off with a setting, and configuring a real AI provider requires real safety providers. As the operator, you are responsible for how your deployment is used.",
        },
        {
          id: "api",
          question: "Is there an API?",
          answer: `Yes. A REST API with an OpenAPI 3.1 spec lets you create jobs, run packs in batches and fetch results with an API key${apiPlans.length ? ` (included on ${apiPlans.join(" and ")})` : ""}. See the [API docs](/docs/api).`,
        },
      ],
    },
  ];
}

export function allFaqItems(categories: FaqCategory[] = getFaqCategories()): FaqItem[] {
  return categories.flatMap((c) => c.items);
}

export function featuredFaqItems(): FaqItem[] {
  return allFaqItems().filter((i) => i.featured);
}

export function pricingFaqItems(): FaqItem[] {
  return allFaqItems().filter((i) => i.pricing);
}
