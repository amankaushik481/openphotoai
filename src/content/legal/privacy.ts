import type { LegalDocument } from "./types";

/** Privacy Policy template. `{{placeholders}}` are filled by renderLegalDocument(). */
export const PRIVACY_TEMPLATE: LegalDocument = {
  slug: "privacy",
  title: "Privacy Policy",
  summary:
    "{{appName}} processes your photos and a mathematical description of your face (a face embedding) to build your private photo model, verify consent and score likeness. We use your data only to run the Service, never to train general AI models, never sell it, and delete it for real when you ask.",
  highlights: [
    "Face embeddings are used only for consent verification and likeness scoring, and are deleted with the model.",
    "Your photos never train general-purpose AI models and are never sold.",
    "Delete a photo, a model or your whole account at any time; account deletion is confirmed by email.",
    "Export everything we hold about you from Settings.",
    "Analytics are off unless the operator enables them; essential cookies only by default.",
  ],
  sections: [
    {
      id: "controller",
      heading: "1. Who is responsible",
      blocks: [
        {
          type: "p",
          text: "{{legalEntity}} operates the hosted {{appName}} service at {{appUrl}} and is the controller of the personal data described here. Contact us at {{supportEmail}} for any privacy question or request.",
        },
        {
          type: "note",
          text: "Self-hosted copies of {{appName}} are run by their own operators, who are responsible for their own privacy notices. This policy covers only the hosted Service at {{appUrl}}.",
        },
      ],
    },
    {
      id: "data-we-collect",
      heading: "2. What we collect",
      blocks: [
        {
          type: "table",
          head: ["Category", "Examples", "Source"],
          rows: [
            [
              "Account data",
              "Email address, name, profile picture URL (Google sign-in), plan, settings",
              "You, or Google if you sign in with it",
            ],
            [
              "Photos you upload",
              "Live consent selfie, training selfies, reference poses, garments, brush masks",
              "You",
            ],
            [
              "Biometric data",
              "Face embeddings derived from your consent selfie and training photos; age estimates used for the adults-only check",
              "Derived by our safety systems",
            ],
            [
              "Generated content",
              "Images and videos, prompts, pack choices, likeness scores, folders, favorites, share links",
              "You and the Service",
            ],
            [
              "Billing data",
              "Purchases, subscription status, credit ledger, invoices. Card details are collected by our payment provider, not by us",
              "You and our payment provider",
            ],
            [
              "Safety records",
              "Blocked prompts or outputs (reason only, never the blocked image), reports, moderation decisions",
              "Our safety systems, people who report content",
            ],
            ["Technical data", "IP address, device and browser type, request logs, rate-limit counters", "Your device"],
            [
              "Communications",
              "Support emails, takedown requests, email delivery status",
              "You and our email provider",
            ],
          ],
        },
      ],
    },
    {
      id: "biometric",
      heading: "3. Biometric data (face embeddings)",
      blocks: [
        {
          type: "p",
          text: "A face embedding is a list of numbers that describes a face so two photos can be compared. It cannot be turned back into a photo. We create embeddings only after you take the live consent selfie and agree to this processing, and we use them **only** for:",
        },
        {
          type: "list",
          items: [
            "**Consent verification**: checking that every training photo shows the same person who took the live consent selfie, so nobody can build a model of someone else.",
            "**Likeness scoring**: comparing generated photos with your consent selfie, so weak results are hidden and refunded under the likeness guarantee.",
            "**Adults-only enforcement**: age is estimated from faces to block models of anyone under {{minAge}}. The estimate is used for that decision only.",
          ],
        },
        {
          type: "p",
          text: "We never use face embeddings to identify you elsewhere, never build a face-recognition database, never sell or license them, and never use them to train AI models. They are stored with your identity model and **deleted together with it**: when you delete the model, when you delete your account, or at the latest {{biometricMaxYears}} years after your last interaction with the Service. Deleting the model withdraws your consent.",
        },
      ],
    },
    {
      id: "use",
      heading: "4. How we use your data",
      blocks: [
        {
          type: "list",
          items: [
            "To provide the Service: train your private model, run generations and edits, show your gallery, deliver downloads and share links.",
            "To keep people safe: consent and age checks, prompt and output moderation, public-figure blocking, abuse and fraud prevention, handling reports.",
            "To bill you: process payments, grant and refund credits, send receipts.",
            "To communicate: sign-in links, model-ready and low-credit notices, receipts, safety and deletion confirmations. Product news only if you opt in.",
            "To improve reliability: aggregated, de-identified usage and error statistics. Never your photos.",
            "To comply with the law and respond to lawful requests.",
          ],
        },
        {
          type: "p",
          text: "**We do not use your photos, models or outputs to train general-purpose AI models, and we do not sell or rent personal data.** We only use AI providers whose terms, or our settings with them, do not let them train their own models on the inputs we send.",
        },
      ],
    },
    {
      id: "legal-bases",
      heading: "5. Legal bases (EEA, UK and similar laws)",
      blocks: [
        {
          type: "list",
          items: [
            "**Contract**: running the Service you signed up for, billing and transactional emails.",
            "**Explicit consent**: processing biometric data from your consent selfie and training photos. You can withdraw it at any time by deleting the identity model.",
            "**Legitimate interests**: safety, abuse prevention, security and service reliability, balanced against your rights.",
            "**Legal obligation**: tax and accounting records, responding to lawful requests, reporting content involving minors.",
          ],
        },
      ],
    },
    {
      id: "subprocessors",
      heading: "6. Who we share data with (subprocessors)",
      blocks: [
        {
          type: "p",
          text: "We share personal data only with service providers that help us run the Service, only what they need, and under agreements that restrict their use of it. The current list:",
        },
        {
          type: "table",
          head: ["Category", "Provider (default configuration)", "Data shared", "Purpose"],
          rows: [
            [
              "AI inference",
              "fal.ai or Replicate",
              "Training photos, prompts, reference images, generated outputs",
              "Training your private model and generating images and videos",
            ],
            [
              "Payments",
              "Stripe",
              "Email, billing details, payment method (collected by Stripe)",
              "Checkout, subscriptions, receipts, fraud prevention",
            ],
            ["Email", "Resend", "Email address, message content", "Sign-in links, receipts, notices"],
            [
              "Storage and hosting",
              "S3-compatible object storage, application and database hosting",
              "All Service data, encrypted in transit",
              "Storing and serving your data",
            ],
            ["Sign-in (optional)", "Google", "Name, email, profile picture URL", "Signing in with Google"],
            [
              "Safety (optional)",
              "Amazon Rekognition, OpenAI Moderation",
              "Images or text being checked",
              "Face matching, age estimation and moderation, only if enabled instead of our on-server checks",
            ],
            ["Analytics (optional)", "PostHog", "Pseudonymous usage events", "Product analytics, only if enabled"],
          ],
        },
        {
          type: "p",
          text: "We will update this list before adding a subprocessor that receives your photos. We may also disclose data when the law requires it, to protect someone's safety, or as part of a merger or acquisition (with this policy continuing to apply).",
        },
      ],
    },
    {
      id: "retention",
      heading: "7. How long we keep data",
      blocks: [
        {
          type: "table",
          head: ["Data", "Kept until"],
          rows: [
            ["Account details", "You delete your account"],
            [
              "Consent selfie and face embeddings",
              "You delete the identity model or your account, and at most {{biometricMaxYears}} years after your last interaction",
            ],
            [
              "Training photos",
              "You delete them, the model or your account (you can delete them right after training)",
            ],
            [
              "Trained model weights",
              "You delete the model; we also ask the AI provider to delete its copy where supported",
            ],
            ["Generated photos and videos", "You delete them or your account"],
            ["Reference images, garments, masks", "While needed for your jobs; deleted with your account"],
            ["Share links", "You revoke them, they expire, or you delete the media"],
            ["Payment and invoice records", "As long as tax and accounting law requires (no card numbers)"],
            ["Safety records and reports", "12 months, or longer while an investigation or legal obligation requires"],
            ["Server logs", "{{logRetentionDays}} days"],
            ["Backups", "Deleted data drops out of encrypted backups within {{backupRetentionDays}} days"],
          ],
        },
      ],
    },
    {
      id: "deletion",
      heading: "8. Deleting your data (for real)",
      blocks: [
        {
          type: "list",
          items: [
            "**A photo or video**: delete it from your gallery; it is removed from storage immediately.",
            "**An identity model**: delete it from Models. We delete the consent selfie, face embeddings, training photos and model weights, ask the AI provider to delete its copy, and email you a confirmation.",
            "**Your account**: go to Settings → Delete account. We email you a confirmation link (valid for {{deletionLinkHours}} hours) so nobody else can delete your account. Once you confirm, we delete your photos, models, generated media, share links, API keys and account records, and send a final confirmation email.",
          ],
        },
        {
          type: "p",
          text: "Some records survive deletion only where the law requires it (for example invoices) or to prevent abuse (for example the fact that an account was suspended). They are kept separately, minimized, and not used for anything else.",
        },
      ],
    },
    {
      id: "rights",
      heading: "9. Your rights",
      blocks: [
        {
          type: "p",
          text: "Depending on where you live, you can access, export, correct or delete your data, object to or restrict some processing, withdraw consent, and complain to your data protection authority. Most of this is self-serve: **Settings → Export data** downloads everything we hold about you, and deletion is described above. For anything else email {{supportEmail}}; we answer within 30 days. We never discriminate against you for using your rights.",
        },
      ],
    },
    {
      id: "security",
      heading: "10. Security",
      blocks: [
        {
          type: "list",
          items: [
            "Encryption in transit (HTTPS) everywhere; private media is served only through short-lived signed links.",
            "Location metadata (EXIF/GPS) is stripped from uploads.",
            "Secrets such as API keys and sign-in tokens are stored only as hashes.",
            "Access to production data is limited to staff who need it, and logged.",
          ],
        },
        {
          type: "p",
          text: "No system is perfectly secure. If a breach affects your data, we will notify you and the authorities as the law requires.",
        },
      ],
    },
    {
      id: "transfers",
      heading: "11. International transfers",
      blocks: [
        {
          type: "p",
          text: "Our providers may process data outside your country, including in the United States. Where required we rely on safeguards such as the EU Standard Contractual Clauses or adequacy decisions.",
        },
      ],
    },
    {
      id: "children",
      heading: "12. Children",
      blocks: [
        {
          type: "p",
          text: "The Service is only for adults ({{minAge}}+). We do not knowingly collect data from children, and our safety systems refuse photos of anyone who appears to be under {{minAge}}. If you believe a child's data was uploaded, email {{takedownEmail}} and we will delete it.",
        },
      ],
    },
    {
      id: "cookies",
      heading: "13. Cookies and analytics",
      blocks: [
        {
          type: "p",
          text: "We use essential cookies to keep you signed in and protect against abuse. Product analytics are disabled unless the operator configures them; when enabled they use pseudonymous identifiers, never your photos, and you can opt out from your browser settings.",
        },
      ],
    },
    {
      id: "changes",
      heading: "14. Changes",
      blocks: [
        {
          type: "p",
          text: "We will email you before material changes take effect, and the date at the top always shows the latest revision.",
        },
      ],
    },
    {
      id: "contact",
      heading: "15. Contact",
      blocks: [
        {
          type: "p",
          text: "{{legalEntity}} · Privacy and data requests: {{supportEmail}} · Takedowns: {{takedownEmail}}",
        },
      ],
    },
  ],
};
