import type { LegalDocument } from "./types";

/** Terms of Service template. `{{placeholders}}` are filled by renderLegalDocument(). */
export const TERMS_TEMPLATE: LegalDocument = {
  slug: "terms",
  title: "Terms of Service",
  summary:
    "These terms govern your use of the hosted {{appName}} service at {{appUrl}}, operated by {{legalEntity}}. You may only create photos of yourself or of adults who have consented, everything we generate is labeled as AI-generated, credits are refunded automatically when something goes wrong, and you can delete your data at any time.",
  highlights: [
    "Adults only ({{minAge}}+). Photos of yourself, or of adults who consented through the app.",
    "No sexual content, no minors, no public figures, no impersonation, no deception.",
    "You own your photos. We never use them to train general AI models.",
    "Failed, blocked and low-likeness results are refunded in credits automatically.",
    "Credits never expire while your account is open, whether they come from a plan or a credit pack.",
    "Cancel in one click. Delete everything for real, confirmed by email.",
  ],
  sections: [
    {
      id: "agreement",
      heading: "1. The agreement",
      blocks: [
        {
          type: "p",
          text: "These Terms of Service (the “Terms”) are an agreement between you and {{legalEntity}} (“we”, “us”) for the hosted {{appName}} service available at {{appUrl}} (the “Service”). By creating an account or using the Service you accept these Terms, our [Privacy Policy](/legal/privacy) and our [Acceptable Use Policy](/legal/acceptable-use), which form part of these Terms.",
        },
        {
          type: "p",
          text: "If you use the Service on behalf of a company or team, you confirm that you may bind that organization, and “you” includes it.",
        },
      ],
    },
    {
      id: "eligibility",
      heading: "2. Eligibility and your account",
      blocks: [
        {
          type: "list",
          items: [
            "You must be at least {{minAge}} years old and able to form a binding contract. The Service is not directed at children and we block attempts to create images of minors.",
            "Keep your sign-in method (email inbox or Google account) secure. You are responsible for activity on your account and API keys.",
            "Provide accurate information and keep your email address current: we use it for receipts, safety notices and deletion confirmations.",
            "One person per account. Do not share accounts or create new ones to get around a suspension or limits.",
          ],
        },
      ],
    },
    {
      id: "service",
      heading: "3. What the Service does",
      blocks: [
        {
          type: "p",
          text: "The Service lets you create a private identity model from photos of yourself (or of a consenting adult) and use it to generate images and videos with artificial intelligence: photo packs, prompts, pose copies, edits, upscales, try-ons, videos and talking videos. Generation runs on third-party AI providers listed in the [Privacy Policy](/legal/privacy#subprocessors).",
        },
        {
          type: "p",
          text: "AI output is probabilistic. Results vary between runs and may contain mistakes, artifacts or features that do not match the person. We score likeness and hide weaker shots, but we do not promise any specific result beyond the refunds described in section 9.",
        },
      ],
    },
    {
      id: "consent",
      heading: "4. Consent: only you, or adults who agreed",
      blocks: [
        {
          type: "p",
          text: "You may only create an identity model of **yourself**, or of **another adult who has given you explicit permission** and who completes the live consent selfie themselves. Every identity model starts with a live camera selfie; every training photo must match that selfie or it is rejected.",
        },
        {
          type: "list",
          items: [
            "Together photos combine two identity models only when the second person owns that model or has shared it with you through an accepted in-app invitation. Either person can revoke the share at any time.",
            "You confirm that you have the rights to every photo you upload (selfies, reference images, garments) and that uploading it does not violate anyone's privacy or intellectual-property rights.",
            "If someone withdraws their consent, you must stop using their model and delete it. We will delete it on their request after verifying their identity (see the [Acceptable Use Policy](/legal/acceptable-use#takedown)).",
          ],
        },
      ],
    },
    {
      id: "acceptable-use",
      heading: "5. Acceptable use and safety",
      blocks: [
        {
          type: "p",
          text: "You must follow the [Acceptable Use Policy](/legal/acceptable-use). In short: no sexual or suggestive content, nothing involving minors, no public figures or real people without their consent, no impersonation, no deceptive or fraudulent use, no harassment or hate, and no attempts to get around our safety systems.",
        },
        {
          type: "p",
          text: "Safety checks run on every prompt, upload and output and cannot be switched off. Outputs our classifiers block are discarded and never stored; the credits for them are refunded. We may review content that is reported to us or flagged by our systems.",
        },
      ],
    },
    {
      id: "ai-labeling",
      heading: "6. AI-generated content and labeling",
      blocks: [
        {
          type: "list",
          items: [
            "Every image and video we produce carries machine-readable metadata identifying it as AI-generated (IPTC “trainedAlgorithmicMedia”). Free-tier images also carry a visible watermark until your first purchase.",
            "Do not remove or falsify these labels in order to mislead anyone about whether content is real.",
            "Disclose that content is AI-generated wherever the law or a platform's rules require it (for example in advertising, political content or news).",
          ],
        },
      ],
    },
    {
      id: "ownership",
      heading: "7. Your content and our license",
      blocks: [
        {
          type: "p",
          text: "As between you and us, you own the photos you upload and, to the extent the law allows, the images and videos you generate. Commercial use is allowed on paid plans, subject to these Terms and the rights of anyone depicted. AI-generated material may not be protected by copyright in every country.",
        },
        {
          type: "p",
          text: "You give us a limited, non-exclusive license to store, process and transmit your content only to operate the Service for you: to train your private model, run your generations, show you your gallery, keep you and others safe, and comply with the law. **We never use your photos, models or outputs to train general-purpose AI models**, and we never sell them.",
        },
        {
          type: "p",
          text: "Share links you create are public to anyone who has the link until you revoke them. Shared pages include a report button.",
        },
      ],
    },
    {
      id: "billing",
      heading: "8. Credits, plans and payments",
      blocks: [
        {
          type: "list",
          items: [
            "Generations cost credits. The cost of every action is shown before you start it and is listed on the [pricing page](/pricing).",
            "Subscriptions renew automatically each month or year until you cancel. You can cancel at any time in Billing; you keep access and your credits until the end of the paid period.",
            "Credits granted by a subscription and credits from one-time credit packs do not expire while your account is open. Cancelling a subscription stops future grants but keeps your existing balance.",
            "Prices are shown in US dollars and may exclude taxes, which are added at checkout where required. Payments are processed by our payment provider; we never see your full card number.",
            "We give at least {{priceChangeNoticeDays}} days' notice by email before any price or credit-cost increase that affects an active subscription. Credits you already hold keep their value.",
            "Credits have no cash value, cannot be transferred outside the Service (except team transfers we support) and are forfeited if your account is deleted.",
          ],
        },
      ],
    },
    {
      id: "refunds",
      heading: "9. Refunds and the likeness guarantee",
      blocks: [
        {
          type: "list",
          items: [
            "**Automatic credit refunds**: credits are returned automatically when a job fails, is canceled before it runs, or produces outputs blocked by our safety filter.",
            "**Likeness guarantee**: each generated photo is scored for likeness against your consent selfie. Photos below our likeness threshold are hidden and their credits are refunded automatically.",
            "**Unused purchases**: within {{refundWindowDays}} days of a purchase or subscription payment, you can ask for a refund of the unused part of it, even if you have already downloaded photos. Email {{supportEmail}} from your account address.",
            "Refunds go back to the original payment method. Banks usually take 5–10 business days to show them.",
            "Nothing in these Terms limits refund rights you have under consumer law where you live.",
          ],
        },
      ],
    },
    {
      id: "suspension",
      heading: "10. Suspension and termination",
      blocks: [
        {
          type: "p",
          text: "We may remove content, limit features, or suspend or close your account if you break these Terms or the Acceptable Use Policy, if we receive a credible report that you are using someone's likeness without consent, if required by law, or to protect people from harm. Where it is safe and lawful we tell you why and how to appeal by replying to the notice or writing to {{supportEmail}}.",
        },
        {
          type: "p",
          text: "Accounts suspended for using another person's likeness without consent, for content involving minors, or for sexual content are not refunded, and we may report content involving minors to the relevant authorities.",
        },
        {
          type: "p",
          text: "You can stop using the Service and delete your account at any time from Settings. Deletion is real: it removes your photos, models (including copies held by AI providers), generated media and account data, as described in the [Privacy Policy](/legal/privacy#deletion).",
        },
      ],
    },
    {
      id: "reports",
      heading: "11. Reports and takedowns",
      blocks: [
        {
          type: "p",
          text: "Anyone can report content: use the report button on any shared page or email {{takedownEmail}}. We acknowledge reports within {{takedownAckHours}} hours and act on intimate imagery, content involving minors and impersonation within {{takedownUrgentHours}} hours. The full process is in the [Acceptable Use Policy](/legal/acceptable-use#takedown).",
        },
      ],
    },
    {
      id: "api",
      heading: "12. API",
      blocks: [
        {
          type: "p",
          text: "Plans that include API access may use the public API with personal API keys. The same consent, safety and acceptable-use rules apply to every API call. Keep keys secret, respect rate limits, and do not use the API to build a service that lets other people generate images of people who have not consented.",
        },
      ],
    },
    {
      id: "open-source",
      heading: "13. Open-source software and self-hosting",
      blocks: [
        {
          type: "p",
          text: "{{appName}} is open-source software released under the MIT License. These Terms cover only the hosted Service operated by {{legalEntity}} at {{appUrl}}. They do not restrict your rights under the MIT License to use, modify and run the software yourself.",
        },
        {
          type: "p",
          text: "If you self-host {{appName}}, you are the operator of your deployment: you are responsible for your own terms, privacy notices, lawful basis for processing biometric data, provider accounts, content moderation, takedown handling and compliance with the laws that apply to you. The software is provided “as is” under the MIT License, without warranty, and {{legalEntity}} has no access to or responsibility for self-hosted deployments.",
        },
      ],
    },
    {
      id: "third-parties",
      heading: "14. Third-party services",
      blocks: [
        {
          type: "p",
          text: "The Service relies on third parties for AI inference, payments, email and storage. Their availability and terms may affect the Service. We choose providers carefully and only share what they need, as described in the [Privacy Policy](/legal/privacy#subprocessors).",
        },
      ],
    },
    {
      id: "disclaimers",
      heading: "15. Disclaimers",
      blocks: [
        {
          type: "p",
          text: "Except for the commitments expressly made in these Terms, the Service is provided “as is” and “as available”. To the maximum extent permitted by law we disclaim implied warranties of merchantability, fitness for a particular purpose and non-infringement, and we do not warrant that the Service will be uninterrupted or error-free or that outputs will meet your expectations.",
        },
      ],
    },
    {
      id: "liability",
      heading: "16. Limitation of liability",
      blocks: [
        {
          type: "p",
          text: "To the maximum extent permitted by law, {{legalEntity}} is not liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, data or goodwill. Our total liability for any claim relating to the Service is limited to the greater of the amount you paid us in the 12 months before the claim and USD 100. These limits do not apply where the law does not allow them, including liability for death or personal injury caused by negligence, or for fraud.",
        },
      ],
    },
    {
      id: "indemnity",
      heading: "17. Indemnity",
      blocks: [
        {
          type: "p",
          text: "You agree to defend and indemnify {{legalEntity}} against claims by third parties arising from content you upload or generate without the necessary rights or consent, or from your breach of these Terms, to the extent permitted by law.",
        },
      ],
    },
    {
      id: "law",
      heading: "18. Governing law and disputes",
      blocks: [
        {
          type: "p",
          text: "These Terms are governed by the laws of {{jurisdiction}}, without regard to conflict-of-law rules, and disputes will be handled by the competent courts there. If you are a consumer, you also keep the protection of the mandatory laws and courts of the country where you live. Before filing a claim, please contact {{supportEmail}} so we can try to resolve it informally.",
        },
      ],
    },
    {
      id: "changes",
      heading: "19. Changes to these Terms",
      blocks: [
        {
          type: "p",
          text: "We may update these Terms as the Service or the law changes. For material changes we email you at least {{priceChangeNoticeDays}} days in advance; continuing to use the Service after that means you accept the new Terms. The date at the top shows the latest revision.",
        },
      ],
    },
    {
      id: "contact",
      heading: "20. Contact",
      blocks: [
        {
          type: "p",
          text: "{{legalEntity}} · Support: {{supportEmail}} · Takedowns and abuse: {{takedownEmail}}",
        },
      ],
    },
  ],
};
