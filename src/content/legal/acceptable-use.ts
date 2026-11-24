import type { LegalDocument } from "./types";

/** Acceptable Use Policy template (incl. the takedown process). `{{placeholders}}` are filled by renderLegalDocument(). */
export const ACCEPTABLE_USE_TEMPLATE: LegalDocument = {
  slug: "acceptable-use",
  title: "Acceptable Use Policy",
  summary:
    "{{appName}} is for creating photos of yourself, or of adults who said yes. No sexual content, nothing involving minors, no public figures, no impersonation and no deception. Anyone can report misuse; we act on urgent reports within {{takedownUrgentHours}} hours.",
  highlights: [
    "Only you, or consenting adults who verified themselves in the app.",
    "Never sexual, never minors, never public figures or other real people without consent.",
    "Never to deceive, defraud, harass or impersonate.",
    "Report anything with the report button or at {{takedownEmail}}.",
  ],
  sections: [
    {
      id: "consent",
      heading: "1. The core rule: consent",
      blocks: [
        {
          type: "p",
          text: "Only create identity models and images of **yourself**, or of **another adult who has explicitly agreed** and completed the live consent selfie in the app. Together photos need both people's in-app consent. Do not upload photos of anyone else, and do not try to recreate a person from photos you found online.",
        },
      ],
    },
    {
      id: "minors",
      heading: "2. Adults only",
      blocks: [
        {
          type: "p",
          text: "Every person depicted must be at least {{minAge}} years old. Never upload photos of minors, never prompt for content depicting minors, and never try to make an adult look like a child. We block suspected minors automatically, terminate accounts that attempt this, and report child sexual abuse material to the relevant authorities (such as NCMEC in the United States).",
        },
      ],
    },
    {
      id: "sexual-content",
      heading: "3. No sexual content",
      blocks: [
        {
          type: "p",
          text: "No nudity, sexual or sexually suggestive content, fetish content or “undressing” of anyone, including yourself. Prompts and uploads are filtered, and every output is classified before it is stored; blocked outputs are discarded and never shown. Repeated attempts lead to suspension.",
        },
      ],
    },
    {
      id: "public-figures",
      heading: "4. No public figures, no impersonation",
      blocks: [
        {
          type: "list",
          items: [
            "Do not generate images or videos of celebrities, politicians, influencers or any other real person who has not consented, by name, description or reference photo.",
            "Do not impersonate anyone, including creating content that could reasonably be mistaken for a real statement, endorsement or appearance by another person.",
            "Do not use someone else's likeness, brand or trademark in a way that suggests an affiliation that does not exist.",
          ],
        },
      ],
    },
    {
      id: "deception",
      heading: "5. No deceptive or harmful use",
      blocks: [
        {
          type: "list",
          items: [
            "No fraud, scams or fake identity documents (IDs, passports, badges) and no attempts to defeat identity verification or “know your customer” checks.",
            "No fabricated evidence, fake news, election or political disinformation, or content presented as a real event that did not happen.",
            "No catfishing: do not use images of someone else on dating or social profiles.",
            "Do not remove or falsify the AI-generated labels in order to mislead anyone, and disclose AI generation wherever the law or a platform requires it.",
            "No harassment, bullying, threats, hate speech, glorification of violence or self-harm, or content that degrades a person.",
            "Nothing illegal where you live or where the content is published, and nothing that infringes someone else's intellectual property or privacy.",
          ],
        },
      ],
    },
    {
      id: "platform-abuse",
      heading: "6. Don't abuse the Service",
      blocks: [
        {
          type: "list",
          items: [
            "Do not try to bypass, probe or disable safety filters, consent checks, rate limits or watermarks (for example with misspellings, code words or adversarial images).",
            "Do not create multiple accounts to evade limits or a suspension.",
            "Do not scrape the Service, overload it, reverse-engineer the hosted infrastructure, or resell access without our written permission. (The open-source code itself may be used under its MIT License.)",
            "Keep API keys secret and use the API within its documented limits.",
          ],
        },
      ],
    },
    {
      id: "takedown",
      heading: "7. Reporting and takedowns",
      blocks: [
        {
          type: "p",
          text: "Anyone can report content, whether or not they have an account. If you believe an image or video depicts you without your consent, involves a minor, is sexual, or otherwise breaks this policy:",
        },
        {
          type: "list",
          items: [
            "**Report button**: every shared page has a “Report” button. It sends the exact item to our moderation queue.",
            "**Email**: write to {{takedownEmail}} with the link(s) to the content, why it should be removed, and how to reach you. If the content depicts you, say so; we may ask for proof of identity, which we use only for this request and then delete.",
          ],
        },
        {
          type: "table",
          head: ["Step", "Target time"],
          rows: [
            ["Acknowledge your report", "Within {{takedownAckHours}} hours"],
            ["Remove intimate or sexual imagery, content involving minors, and impersonation of a real person", "Within {{takedownUrgentHours}} hours of a valid report (sooner where we can)"],
            ["Resolve other reports (other policy or rights complaints)", "Within {{takedownStandardDays}} business days"],
            ["Tell you the outcome", "When the report is resolved, where it is safe and lawful"],
          ],
        },
        {
          type: "p",
          text: "When we remove content for depicting someone without consent, we also disable the identity model it came from and review the account. Copyright complaints should include the information required by applicable law (for example the DMCA); counter-notices go to the same address.",
        },
      ],
    },
    {
      id: "enforcement",
      heading: "8. Enforcement",
      blocks: [
        {
          type: "p",
          text: "Depending on severity we may remove content, revoke share links, disable models, limit features, or suspend or permanently close accounts, without refund for serious violations. Content involving minors and credible threats are reported to the authorities. Our automated systems record every block so that decisions can be reviewed by a person.",
        },
      ],
    },
    {
      id: "appeals",
      heading: "9. Appeals",
      blocks: [
        {
          type: "p",
          text: "If you think we got it wrong, reply to the notice or email {{supportEmail}} within 30 days. A person who was not involved in the original decision reviews it, and we tell you the result.",
        },
      ],
    },
    {
      id: "self-hosted",
      heading: "10. Self-hosted deployments",
      blocks: [
        {
          type: "p",
          text: "This policy applies to the hosted Service at {{appUrl}}. Operators of self-hosted {{appName}} deployments are responsible for their own acceptable-use rules, moderation and takedown handling. The built-in consent, adults-only and content safety checks ship enabled in the open-source code and are designed not to be switched off, but operators remain responsible for how their deployment is used. To report content on a deployment we do not operate, contact that deployment's operator.",
        },
      ],
    },
  ],
};
