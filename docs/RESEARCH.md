# OpenShoot — Product Research (photoai.com + competitors)

_Researched 2026-11-24. Scope: photoai.com, HeadshotPro, Aragon AI, BetterPic (+ Remini as a billing anti-pattern), user complaints, pricing, pack catalogue._

> **Method note:** This session's network sandbox blocked direct fetches of `photoai.com`, `headshotpro.com`, `web.archive.org` and `news.ycombinator.com` (DNS / proxy 403), and the search tool refuses `reddit.com`. Everything below comes from **web-search snippets of the official pages**, third-party reviews, Trustpilot, X posts and HN thread snippets. Figures conflict between snapshots; where they do, the most recent or official-page figure is used and the conflict is flagged. **Re-verify prices against the live pages before quoting them publicly.**

---

## 1. Summary (10 bullets)

1. **photoai.com is now a credit-metered "AI photo + video studio", not a headshot tool.** Four tiers: $19 / $49 / $99 / $199 per month (Starter / Pro / Max / Ultra), 50 / 1,000 / 3,000 / 10,000 credits. It sits on third-party models (Nano Banana 2/Pro, Seedream 5.5, Seedance 2.5 video) rather than its own training stack. ([pricing](https://photoai.com/pricing))
2. **Its pricing punishes small buyers.** A Starter credit costs about **$0.38**, an Ultra credit about **$0.02**, so Starter is roughly 19x more expensive per photo (about $3.80 per Nano Banana 2 photo against $0.20). Even "likeness" is sold by tier: "Low likeness" at $19 and "Ultra-high likeness" at $199. ([dev.to review](https://dev.to/illeanavoviews/photo-ai-review-is-it-worth-it-and-a-better-alternative-4hnh))
3. **Trust is photoai's weakest point.** Its Trustpilot score is about **2.2/5** (around 91 reviews, roughly 61% 1-star), and the company doesn't reply. Refunds are allowed only if you never trained a model *and* generated fewer than 20 photos. Reviewers report double charges, missing support, and credit costs that rose mid-subscription. ([Trustpilot](https://www.trustpilot.com/review/photoai.com), [HN](https://news.ycombinator.com/item?id=42028170))
4. **The headshot specialists (HeadshotPro, Aragon, BetterPic) sell one-time packs at $29–$79** with 20–120 photos, delivered in 10 minutes to 2 hours. Their Trustpilot scores are 4.5+, but their "money-back guarantees" stop applying once you download a photo.
5. **The industry has moved from LoRA training to zero-shot, reference-based identity.** HeadshotPro's March 2026 model needs only **1–3 selfies and about 10 minutes**. PhotoAI's model creation went from about 2 hours to about 3 minutes (90 s on top tiers). Aragon runs GPT Image 1.5, Flux 2 Pro and Seedream 4.5. ([HeadshotPro](https://www.headshotpro.com/blog/introducing-our-new-ai-headshot-model), [levelsio](https://x.com/levelsio/status/1923075661822034316))
6. **The #1 complaint everywhere is likeness:** "doesn't look like me", eye colour that changes between shots, moles erased, a different person after a model update. **#2 is the "AI look":** plastic or poreless skin, extra fingers, empty eyes. Recruiters are now trained to spot "hyper-symmetry and poreless skin".
7. **Skin-tone and ethnicity drift is a documented, reputational failure mode** (the MIT student who was "turned white", Black users' skin lightened). No competitor markets a skin-tone lock.
8. **Privacy terms are vague or contradictory everywhere.** PhotoAI's terms say it "collects and retains" uploads and may store them abroad. Reported HeadshotPro retention is "24 h" on one site and "90 days" on another. Aragon's deletion clock can run to 1 year. None of them offers self-hosting.
9. **PhotoAI's growth engine is programmatic SEO.** It has 200+ pack landing pages, more than 900 "ideas" pages, a public prompt gallery (CC BY 4.0) and free no-signup tools. A solo founder runs it on PHP, jQuery and SQLite, and it peaked at about $150k/month. OpenShoot can copy this playbook with an open pack format.
10. **OpenShoot's opening:** honest flat-rate credits that roll over, one-time packs with no subscription, auto-refunds based on a likeness score, a realism-first default (no beauty filter), a skin-tone lock, delete-after-training privacy plus self-hosting, and an open pack and community marketplace. Pricing target: **about $15 one-time shoot, $12/$29/$79 per month**, at 2–3x photoai's photos per dollar.

---

## 2. photoai.com

### 2.1 Features (exhaustive, from official pages and reviews)

| Area | Feature | Notes / cost (credits) | Source |
|---|---|---|---|
| Identity | **AI model ("character") from selfies** | Person or **Couple** model (both people must be in every photo). Asks for name, gender, age, ethnicity and eye colour. | [FAQ](https://photoai.com/faq), [couple](https://photoai.com/future-family-visualization) |
| Identity | Model from a prompt (synthetic "AI influencer", no photos) | Aimed at Instagram/TikTok/OnlyFans creators | [AI influencer](https://photoai.com/ai-influencer-generator) |
| Identity | Fast training | Marketing says about 1–5 min; "90 s" on Premium/Ultra; older/lower plans "30 min–2 h" | [selfies page](https://photoai.com/ai-selfies), [gradually.ai](https://www.gradually.ai/en/ai-portrait-generators/) |
| Generate | **Photo packs** | 1-click themed sets; "205+" packs (other pages say 195+, 145+, 100+) | [home](https://photoai.com/) |
| Generate | Free auto-generated photos per model | e.g. 48 on Starter: 8 profile pics, 8 headshots, 8 dating. Contradicted elsewhere ("no free auto photos") | [headshot gen](https://photoai.com/ai-headshot-generator) |
| Generate | Prompt-based photos with model picker | Nano Banana 2 (10 cr), Nano Banana Pro (5–10 cr, varies), Seedream 5.5 (5 cr) | [credits FAQ](https://photoai.com/faq/how-much-does-it-cost-to-generate-on-photo-ai-how-do-credits-work-4550834) |
| Generate | Parallel generation | 1 at a time (Starter), up to 16 at once (Ultra) | [pricing](https://photoai.com/pricing) |
| Edit | **Remix** | Puts your likeness back after edits; batch remix on uploaded photos | [FAQ](https://photoai.com/faq) |
| Edit | **Try on clothes** | Paste an outfit image; batch try-on; "for Shopify" on higher tiers. Also Virtual Suits, AI Makeup Try-On | [makeup try-on](https://photoai.com/ai-makeup-try-on) |
| Edit | Magic Edit / inpainting / grain | Magic Edit does **not** use your model, so likeness drops and Remix is the fix | [FAQ](https://photoai.com/faq) |
| Edit | Relight | 5–15 cr; can add golden-hour light, often weakens likeness | [credits FAQ](https://photoai.com/faq/how-much-does-it-cost-to-generate-on-photo-ai-how-do-credits-work-4550834) |
| Edit | Zoom out (outpaint) | 5 cr | same |
| Edit | Combine photos | about 1 cr | same |
| Edit | **Upscale** (image *and* video) | 5 cr | same |
| Video | **Make video** (image to video) from any photo | Seedance 2.5; "video with sound" 300 cr (earlier 30 and then 100 cr) | same |
| Video | Talking video | Started via "Make video". No dedicated lip-sync or voice-clone page found | [FAQ](https://photoai.com/faq) |
| 3D | Make 3D model / **T-pose 3D model for Mixamo** | 20–25 cr | [t-pose](https://photoai.com/t-pose-3d-model) |
| Fun | AI Action Figure, Future Family / baby visualisation, Looksmaxxing | novelty packs | [action figure](https://photoai.com/ai-action-figure) |
| Utility | Passport/ID photo | Says to check whether your government accepts AI photos | [passport](https://photoai.com/passport-photos) |
| Funnel | Free tools | Free AI headshot (1 selfie, **5/day, no email**), image resizer, free image generator | [tools](https://photoai.com/tools) |
| Funnel | Public gallery `/photos/*` | Prompts and outputs, "royalty-free with backlink" / CC BY 4.0; 900+ `/ideas/*` pages | [ideas](https://photoai.com/ideas) |
| Licensing | Commercial use | Pro and above only; Starter is personal use | [pricing](https://photoai.com/pricing) |
| Billing | One-time credit top-ups | Added in 2025 as the "#1 most requested feature"; top-up credits last 2 years | [levelsio](https://x.com/levelsio/status/1904526959230484481) |
| Integrations | MCP / "connect to Claude, ChatGPT, Cursor" | Mentioned in one search snippet; **unverified** | — |
| Not found | Dedicated **pose copy** | Nothing found; Remix and batch try-on come closest | — |

### 2.2 Pricing tiers (official page via search snippets, Nov 2026)

| Tier | Monthly | Annual (billed) | Credits/mo | Approx. output/mo | AI models/mo | Parallel | Likeness label | Commercial | $/credit (monthly) |
|---|---|---|---|---|---|---|---|---|---|
| Starter | **$19** (promo shows $9) | $99/yr ("6+ months free") | 50 | 5 Nano Banana 2 **or** 10 Seedream 5.5 photos | 1 | 1 | Low | No | **$0.380** |
| Pro | **$49** (promo $29) | $349/yr | 1,000 | 100 NB2 / 200 Seedream | 3 | — | Medium | Yes | $0.049 |
| Max | **$99** (promo $49) | $599/yr | 3,000 | 300 NB2 / 600 Seedream / about 16 15-second Seedance videos | 10 | — | High | Yes | $0.033 |
| Ultra | **$199** (promo $99) | $1,199/yr | 10,000 | 1,000 NB2 / 2,000 Seedream / about 40 videos | 50 | 16 | Ultra-high | Yes | **$0.020** |

- Sources: [pricing](https://photoai.com/pricing), [tryclout](https://www.tryclout.ai/blog/photo-ai-review), [dev.to](https://dev.to/illeanavoviews/photo-ai-review-is-it-worth-it-and-a-better-alternative-4hnh). Older pages call Max "Premium". 2025 pages listed Pro at $39 with 1,000 photos and 5 models, and Premium at $99 with 5,000 photos and 25 models, so **the allowance has shrunk a lot.**
- **Monthly plan credits expire each month (annual plans too). Top-up credits last 2 years.** ([FAQ](https://photoai.com/faq/how-much-does-it-cost-to-generate-on-photo-ai-how-do-credits-work-4550834))
- Strikethrough "list" prices are used as an anchor; third-party sites quote the promo numbers as the real price.
- **Refunds:** only if you have **not created a model and generated fewer than 20 photos**. Referral-link signups are excluded. The stated reason is that GPU providers don't refund compute. ([refund article](https://ideasbugs.featurebase.app/help/articles/4078304-can-i-get-a-refund))

### 2.3 Onboarding flow

1. **Sign up** with email or Google. There is no free trial of model training; the free funnel is the single-selfie headshot tool (5 per day).
2. **Subscribe.** Model training sits behind a paywall, and training a model voids refund eligibility.
3. **Create model:** enter name, gender, age, ethnicity and eye colour, and choose Person or Couple (or a prompt-only synthetic model).
4. **Upload selfies:** minimum **5**; the official guide asks for **about 20**; reviewers recommend **30–60** ([gradually.ai](https://www.gradually.ai/en/ai-portrait-generators/)). Mix angles, lighting, backgrounds and expressions, with close-ups and full body. **No** group photos, hats, sunglasses, filters, Instagram screenshots or cropped faces.
5. **Training:** official claims run from about 1–5 minutes to 90 s on top tiers. On lower plans it is "30 min–2 h". ExpertPhotography uploaded 27 photos and waited **about 45 minutes** against a "30 min" estimate ([review](https://expertphotography.com/photoai-review)).
6. **Auto-generated freebies** arrive (headshots, dating, profile pics), then the user runs **packs**, prompts, Remix, try-on and "Make video".

### 2.4 Photo pack names found (about 100)

_All live at `photoai.com/<slug>` (e.g. [/old-money](https://photoai.com/old-money), [/diwali](https://photoai.com/diwali), [/travel](https://photoai.com/travel)). Category nav on /ideas: Fashion, Fun, Dating, AI Tools, Aesthetic, Social Media, Professional, Creative, Travel, Fitness, Events, Retro, Holidays._

- **Professional:** Headshots · LinkedIn Headshots · Corporate Headshots (teams) · Startup Headshots · CEO Headshots · Doctor Headshots · Life Coach Headshots · Author Headshots · Model Headshots · Chef Headshots · Keynote Speaker · Passport Photos · AI Model Agency (portfolio) · Digital Nomad
- **Dating:** AI Dating Photos (Tinder/Bumble/Hinge) · Dating Headshots · First Date Pack · Tinder · Hinge · Bumble
- **Aesthetic:** Old Money · Dark Academia · Cottagecore · Coquette · Clean Girl · Tradwife Aesthetic · Soft Living · E-Girl · Catgirl · Y2K Aesthetic · Aesthetic Weekend Vibes · Looksmaxxing
- **Social / lifestyle:** Instagram · Luxury Lifestyle (jet, yacht, penthouse) · Dubai Influencer · Fitness Influencer · Street Style · Nightlife · Berlin Nightlife · Become a World Famous DJ · AI Influencer · Celebrity · Extreme Close-Ups · AI Selfies · AI Photography (artistic portraits) · Outdoor Adventure
- **Travel ("50+ destinations"):** Paris · Summer in Paris · Tokyo · Summer in Tokyo · London · New York · Rome · Miami · Santorini · Mykonos Nights · Bali · Dubai · Made in Europe · Born in the U.S.A. · Nomads.com (official partner pack)
- **Events / life moments:** Wedding · Pre-Wedding Engagement · Prom · Graduation · Bachelor Party · Pink Birthday Picnic · Met Gala · AI Fashion Week · Maternity · Family Group Photos · Future Family Visualization · You + Pets
- **Holidays:** Christmas · Sexy Santa · Halloween / Naughty Halloween · Thanksgiving · Hanukkah · Diwali
- **Retro:** Retro 90s · Retro 80s · 1950s Pin-Up Girl · Instant Camera (Polaroid-style) · AI Yearbook · 1960s Rock 'n' Roll
- **Creative / fun:** Mobster · Life on Mars · Cosplay · Anime Character Creator · AI Action Figure · T-Pose 3D Model · Traditional Clothes · Korean Profile Photo (K-Pop idol) · AI Beard Generator · AI Avatars
- **Swim / beach:** Beach Bikini · Swimsuit · Bikini in the Snow
- **Try-on / mega:** Virtual Suits Try On · AI Makeup Try-On · Nano Banana Pro Mega Pack (250+)
- **Adult-adjacent SEO pages** (risk signal): "OnlyFans" (marked "100% unofficial") · "AI Nude Outfits"

### 2.5 Tech and business observations

- **Stack (founder-reported):** PHP + jQuery + SQLite on a single Hetzner VPS (Nginx/Ubuntu), one person, no funding ([levelsio](https://x.com/levelsio/status/1970858876212756506)). A profile site claims the app is one `index.php` of about 40k lines.
- **Models:** It has moved from SD + DreamBooth on Replicate (2023) to Flux (Black Forest Labs) and now Google **Nano Banana 2/Pro**, ByteDance **Seedream 5.5** and **Seedance 2.5** video. GPU and API providers named: **fal** and **WaveSpeed**. These are reference-image models, which explains "training" dropping from about 2 h to about 3 min. ([andrew.ooo](https://andrew.ooo/posts/pieter-levels-photo-ai-solo-founder/), [levelsio](https://x.com/levelsio/status/1923075661822034316))
- **Revenue:** record **about $150k/month, 2,573 subscribers, 87% margin** (founder post). 2026 secondary trackers show **about $86–105k/month**, so churn and competition are biting. ([mrrledger](https://mrrledger.com/b/photo-ai/), [theaireceipts](https://theaireceipts.com/case-studies/photo-ai/))
- **Unit economics (my calculation):** a Nano Banana 2 photo costs about $0.08 at fal list price ([fal](https://fal.ai/learn/tools/nano-banana-vs-seedream)) and sells for $0.20–$3.80. A Seedream photo costs about $0.04 and sells for $0.10–$1.90. The margin comes from breakage (credits expiring monthly) and the Starter mark-up.
- **Growth:** programmatic SEO (one landing page per pack, `/ideas/*`, `/alternatives/*`, `/compare`), a public prompt gallery, `?via=` affiliate links, free no-email tools, and founder build-in-public on X.
- **Legal/privacy:** the terms allow models of others "only with written consent" (not enforced technically). Uploads are "collected and retained" and may be stored outside your country. Deleted gallery photos are purged after 30 days. Nothing explicit about deleting the trained model or using data for training. ([legal](https://photoai.com/legal), [FAQ](https://photoai.com/faq))
- **Pricing volatility:** "video with sound" rose 30 → 100 → 300 credits within months, and model allowances shrank year over year.

---

## 3. Competitors

### 3.1 HeadshotPro (headshotpro.com): B2B headshot specialist

- **Pricing (one-time, no subscription):** Basic **$29**/30 headshots (about 2 h) · Professional **$39**/50 (about 30 min, free redo) · Executive **$59**/70 4K (about 15 min, free redo). ([techyorker, Nov 2026](https://techyorker.com/how-much-do-ai-headshot-generators-cost-for-job-seekers-pricing-compared-november/), [betterpic review](https://www.betterpic.io/blog/headshotpro-betterpic-review))
- **Teams:** **$39/person**, 20% off at 5+ seats, up to 60% off at enterprise scale. Admin sets shared **backdrops and clothing pools**; email/link invites, reminders, bulk download, **SSO** on enterprise. ([company headshots](https://www.headshotpro.com/company-headshots), [hollymack](https://hollymack.com/headshotpro-review/))
- **Model:** new model since **Mar 24 2026**: **1–3 selfies, about 40 photos in about 10 min** (the old model needed 15+ selfies and up to 2 h of training). ([announcement](https://www.headshotpro.com/blog/introducing-our-new-ai-headshot-model), [llms.txt](https://www.headshotpro.com/llms.txt))
- **Free:** 1 HD headshot (1024×1024) from 1 selfie, no signup.
- **Guarantee:** "100% money-back" / "Profile-Worthy" headline, but self-serve refunds require **no downloads and fewer than 14 days since purchase**. ([talentedladiesclub](https://www.talentedladiesclub.com/articles/ai-headshot-tools-comparison-keeper-rate-refund-terms-and-who-keeps-your-self/))
- **Reputation:** Trustpilot **4.5 TrustScore / about 3,600 reviews**. ([Trustpilot](https://www.trustpilot.com/review/headshotpro.com))
- **Differentiators:** team workflow and brand consistency, fast turnaround, a big library of curated styles, one-time pricing.

### 3.2 Aragon AI (aragon.ai): headshots plus a growing editor subscription

- **Headshot packs (one-time):** list **$35 / $45 / $75**, roughly 40 / 60 / 100 headshots in 45 / 30 / 15 min. Constant promos drop them to **$18–$40**. One reviewer says real delivery is 1–3 h and only 10–25% of photos are keepers. ([aitoolspolice](https://aitoolspolice.com/reviews/aragon-ai/), [freeheadshot.org](https://freeheadshot.org/aragon-ai-pricing))
- **Subscriptions (since Mar 27 2026):** **Lite $15/mo** (300 credits, 100 edits, 60+ AI tools, 100+ creative packs, 1 AI character) · **Pro $29/mo** (1,200 credits, 240 edits, GPT Image 1.5, Flux 2 Pro, Seedream 4.5, 3 characters) · Ultimate / Creator up to about **$249/mo**. Headshot packs are a **separate purchase** from the subscription. ([changelog](https://www.aragon.ai/changelog/new-feature-introducing-aragon-subscription-plans), [photo generator](https://www.aragon.ai/photo-generator))
- **Free demo:** try packs on demo characters before uploading yourself (good conversion pattern).
- **Refunds:** marketing says "100% refund or free redo". The policy says monthly plans within **14 days**, and generating or downloading makes it case by case. Third parties quote 7, 14 and 30 days. ([refund policy](https://www.aragon.ai/refund-policy), [fritz.ai](https://fritz.ai/aragon-ai-review/))
- **Privacy:** a 30-day deletion clock that can start as late as "1 year from collection"; says providers may not train general models on your face. ([aiheadshotguru](https://aiheadshotguru.com/ai-headshot-safety-guide))
- **Differentiators:** packs plus an AI editor, multi-model access, demo characters, aggressive discounting, and copying photoai's "AI photo studio" direction.

### 3.3 BetterPic (betterpic.io): 4K plus human retouching

- **Pricing (one-time):** Basic **$35**/20 4K headshots, 1 style (about 2 h) · Pro **$39**/60, 3 styles (about 1.5 h) · Expert **$79**/120, 6 styles (about 1 h), **human edits** (unlimited revisions on one photo) and a free redo. One site lists $39/$79/$129. ([filipkonecny](https://filipkonecny.com/blog/betterpic-review), [nemovideo](https://www.nemovideo.com/alternative/betterpic))
- **Teams:** $49/person (1–4), sliding down to about **$13/person at 1,000+**. ([betterpic blog](https://www.betterpic.io/blog/company-headshot-photographer-pricing-2026))
- **Guarantee:** **7-day money-back** on all paid plans.
- **Reputation:** Trustpilot **4.5 / about 1,000 reviews**. ([Trustpilot](https://www.trustpilot.com/review/betterpic.io))
- **Differentiators:** 4K output, a **human-in-the-loop retouch** tier, and heavy SEO comparison content against every competitor.

### 3.4 Remini (billing anti-pattern reference only)

- Weekly subscriptions at **$6.99–$9.99 per week** after a 7-day trial (about $360–$520 a year if forgotten). The most common Trustpilot complaint is being "charged after I cancelled"; Apple refunds get denied. ([litmustools](https://litmustools.com/review/remini/), [Trustpilot](https://www.trustpilot.com/review/remini.ai))

### 3.5 Quick comparison

| | photoai | HeadshotPro | Aragon | BetterPic | **OpenShoot (target)** |
|---|---|---|---|---|---|
| Model | Subscription credits | One-time | One-time + sub | One-time | One-time **and** sub, credits roll over |
| Entry price | $19/mo | $29 | $35 (promo $18) | $35 | **Free tier + about $15 one-time** |
| Selfies needed | 5–20+ | 1–3 | about 6–10 | about 10+ | **1–3 instant, 10–20 for "Pro identity"** |
| Time to first photo | min to hours | about 10 min | 15 min–3 h | 1–2 h | **under 60 s preview** |
| Packs | 205+ | headshot styles | 100+ | styles | **50 at launch, open format + community** |
| Video / try-on / edit | Yes | No | Edit only | No | Yes (phased) |
| Refund | Almost none | No-download, under 14 days | 14 days, conditional | 7 days | **Auto credit refund on low likeness; unused credits refundable** |
| Self-host | No | No | No | No | **Yes (open source)** |
| Trustpilot | **about 2.2** | 4.5 | mixed, high volume | 4.5 | — |

---

## 4. What users complain about

### A. Likeness: "doesn't look like me" (the #1 issue, every vendor)
- photoai: "on the others I'm a completely different person"; "only slightly like me even after uploading **83 images**"; "**after a model update** the photos no longer looked like me". ([Trustpilot](https://www.trustpilot.com/review/photoai.com))
- photoai **sells likeness by tier** ("Low likeness" on the $19 card). ([dev.to](https://dev.to/illeanavoviews/photo-ai-review-is-it-worth-it-and-a-better-alternative-4hnh))
- "All photos had a bad similarity" ([saashub](https://www.saashub.com/compare-openfabric-ai-vs-photo-ai)). ExpertPhotography: likeness is "a recurring issue when you ask PhotoAI to generate multiple images" ([review](https://expertphotography.com/photoai-review)).
- HeadshotPro: "light eyes in some and dark in others", a **mole removed**, many photos missing the person's look ([Slashdot](https://slashdot.org/software/p/HeadshotPro/)). Aragon: "obviously AI-generated", "didn't look like me at all" ([Trustpilot](https://www.trustpilot.com/review/www.aragon.ai)).

### B. "AI look": plastic skin, artefacts, uncanny details
- HeadshotPro (Trustpilot AI summary): **over-smoothed skin**. Users report extra hands and fingers, invented tattoos, "empty" eyes, unrealistic body shapes. ([Trustpilot](https://www.trustpilot.com/review/headshotpro.com))
- photoai pack testimonials admit stiff poses and hands, repetitive backgrounds, fake-looking snow, over-blurred backgrounds.
- Recruiters flag **hyper-symmetry and poreless skin**. Tells are usually **hands, collars, teeth, backgrounds** rather than the face. 38% call AI headshots "soulless". 66% are put off by an undisclosed AI photo that doesn't look like the candidate. ([hrlens](https://www.hrlens.io/articles/ai-generated-linkedin-photo-verdict-2026), [capturely](https://capturely.com/linkedin-ai-headshot/), [headshotphoto.io](https://www.headshotphoto.io/blogs/can-employers-tell-ai-headshot))

### C. Skin tone, ethnicity and feature drift
- An Asian MIT student's "professional headshot" came back Caucasian ([futurism](https://futurism.com/the-byte/asian-woman-ai-generator-white)). Black users report lightened skin and changed hair texture, "digital colorism" ([CNW](https://www.cnwmedia.com/article/when-ai-makes-you-a-stranger-black-users-say-tech-tools-are-whitening-their-images), [DigitalCameraWorld](https://www.digitalcameraworld.com/news/ai-photo-generators-that-claim-to-create-professional-headshots-show-disturbing-racial-bias)). Others report sharpened noses and enlarged eyes.

### D. Pricing and credit confusion
- photoai credit costs **change silently**: video went 30 → 100 → 300 credits, and one reviewer says "credit costs doubled" after subscribing and video went up "10x in weeks". ([Trustpilot](https://www.trustpilot.com/review/photoai.com))
- Different photoai pages list different numbers for the same plan (free photos 48 vs none; pack counts 100+ / 145+ / 205+).
- Monthly credits **expire**, the Starter credit costs 19x the Ultra credit, and fake-looking strikethrough anchors appear.
- Aragon: headshot packs and the subscription are separate purchases, which confuses buyers. ([runtheprompts](https://runtheprompts.com/resources/other-ai-tools/aragon-ai-review/))

### E. Refunds, billing errors and missing support
- photoai: refunds are only possible before you train a model and with fewer than 20 photos ([policy](https://ideasbugs.featurebase.app/help/articles/4078304-can-i-get-a-refund)). HN: "charged **$99 instead of $9**", no reply, advised to do a chargeback ([HN](https://news.ycombinator.com/item?id=42028170), [HN](https://news.ycombinator.com/item?id=39886448)). Trustpilot: double charges for credit top-ups with no credits delivered, "had to go through Stripe to cancel", no contact email, bug reports ignored for over a month.
- HeadshotPro: the refund is **void once you download**, the policy is "hard to find", and refunds take 5–15 days. Aragon: "double-charged when I tried to redo", refund declined before any download, and conflicting 7/14/30-day windows ([SourceForge](https://sourceforge.net/software/product/Aragon.ai/)).

### F. Slow or opaque training
- photoai: "30 min–2 h" on lower plans; one reviewer waited 45 min against a "30 min" estimate. Aragon: advertised 15–45 min, actually 1–3 h. HeadshotPro's old model took up to 2 h, and third parties attribute delays to **queue time on shared GPUs**. ([makeaiphotos](https://www.makeaiphotos.com/blog/ai-photo-generator-turnaround-time/))

### G. Privacy, consent and data
- Retention claims are inconsistent across vendors (HeadshotPro "24 h" vs "90 days"; Aragon up to 1 year) and deletion often excludes backups. ([meikuio](https://meikuio.com/best-ai-headshot-generator/), [kahma](https://kahma.io/knowledge/ai_headshot_privacy_comparison_2026_which_generators_keep_your_face_data_safe.php))
- photoai's terms are silent on deleting the trained model and on training use. Anyone can upload anyone's face (consent exists only in the ToS), with adult-adjacent pages (OnlyFans, "nude outfits", "sexy Santa"). Regulatory precedent: the FTC ordered Ever to delete face embeddings. Laws in force now include the US TAKE IT DOWN Act and the EU AI Act.

### H. Subscription traps
- Remini's weekly auto-renew is the canonical example. photoai users report accidentally buying an annual plan (photoai has a [FAQ for exactly this](https://photoai.com/faq/i-accidentally-signed-up-for-the-yearly-plan-but-i-want-monthly-7511816)) and struggling to cancel.

---

## 5. Where OpenShoot can beat them (actionable, mapped to features)

| # | Pain | OpenShoot feature | Priority |
|---|---|---|---|
| 1 | Likeness | **Hybrid identity engine:** an *Instant* identity (1–3 selfies, zero-shot reference models such as Nano Banana / Seedream / InstantID / PuLID-class) plus an optional *Pro* identity (Flux-class LoRA on 10–20 selfies) for best fidelity. Per-provider adapters. | P0 |
| 2 | Likeness | **Likeness score on every photo** (ArcFace/InsightFace cosine against the reference set). Hide or auto-regenerate below the threshold, **free**. Show "keeper rate" honestly. | P0 |
| 3 | Likeness drift | **Identity snapshot pinning:** a model update never silently changes an existing identity; users opt in to re-render. | P1 |
| 4 | Plastic skin | **Realism-first defaults:** no beauty retouch, skin-texture and pore preservation prompts, a film-grain option, a "retouch intensity" slider (0 = as-is). | P0 |
| 5 | Feature erasure | **"Keep my features" toggles:** moles, freckles, scars, glasses, gap teeth, hair texture, facial hair, body type. | P1 |
| 6 | Skin-tone drift | **Skin-tone lock:** measure tone (e.g. ITA° / Lab) from selfies, reject outputs whose delta-E exceeds the threshold, re-roll for free. | P0 |
| 7 | Bad inputs, wasted money | **Upload quality gate before payment:** blur, occlusion, sunglasses, multiple faces, duplicates, low light, and identity mismatch across uploads, with instant fix-it tips. | P0 |
| 8 | Hands / collars / teeth | **Auto-QA pass:** hand and finger count check, artefact detector, one-click inpaint fix (free on flagged images). | P1 |
| 9 | Slow and opaque training | **Preview in under 60 s** from the instant identity while the Pro identity trains. Visible queue position and ETA; email or push when done. | P0 |
| 10 | Credit confusion | **Credit cost printed on every button**, a pre-flight estimate for packs, a public price table versioned in git, **30-day notice before any price change**. | P0 |
| 11 | Small-buyer penalty | **Flat credit value across tiers** (at most about 15% volume bonus, not 19x). **No likeness gating by tier.** | P0 |
| 12 | Expiring credits | Subscription credits **roll over for 2 months**; one-time credits **never expire**. | P0 |
| 13 | Refund hostility | **Keeper guarantee:** if fewer than N photos pass the likeness threshold, credits come back automatically. **Self-serve refund of unused credits within 14 days**, even after downloading. | P0 |
| 14 | Subscription traps | One-click cancel in-app, renewal reminder 7 days before annual renewal, **one-time packs need no subscription**, no fake strikethrough pricing. | P0 |
| 15 | Billing errors / no support | Idempotent payments (no double charges), email receipts, a status page, an in-app support inbox with an SLA. | P1 |
| 16 | Privacy | **Selfies auto-deleted after the identity is built (default 7 days)**, one-click identity deletion with a deletion receipt, export of everything, **never train on user data**, data-region choice (EU/US). | P0 |
| 17 | Privacy (ultimate) | **Self-host in one Docker Compose**, BYO provider keys (fal / Replicate / local ComfyUI), zero mark-up. This is the open-source moat. | P0 |
| 18 | Consent / deepfakes | **Liveness and consent check** (a short selfie video with a random gesture matched to the uploads) before an identity can be created; couple identities need both people. No NSFW packs. A TAKE IT DOWN takedown flow. | P0 |
| 19 | Authenticity backlash | Optional **C2PA / "AI-generated" metadata**, plus a "natural phone photo" style that avoids the glossy AI look. | P2 |
| 20 | Pack catalogue | **Open pack format (YAML/JSON):** prompts, negative prompts, poses, outfits, backgrounds, aspect ratios, a preview set. Community pack marketplace with revenue share; packs double as SEO landing pages (photoai's growth engine). | P0 |
| 21 | Editing | Remix (restore likeness), **pose copy from a reference image** (photoai has none), outfit try-on, relight, expand, inpaint, upscale to 4K, background swap. | P1 |
| 22 | Teams | Brand kit (backdrop, outfit pool, crop), invites, bulk export, consistent colour grading. Beat HeadshotPro on price ($19/seat or less). | P1 |
| 23 | Video | Image-to-video loops, talking head (your own consented voice only), **cost shown up front**. | P2 |
| 24 | Distribution | Public **API and MCP server**, embeddable "try this pack" widget, free no-signup single-selfie tool for the funnel. | P2 |
| 25 | Try before buying | **Demo characters** (as Aragon does) so users see every pack's quality before uploading their face. | P1 |

---

## 6. Pricing recommendation for OpenShoot (hosted SaaS)

**Principles:** 1 credit = about **$0.01** at every tier. Show the credit cost on every action. Subscription credits roll over for 2 months and pack or top-up credits never expire. Failed or below-threshold generations are refunded automatically. Commercial use is included on every paid tier. Self-hosted OpenShoot is free, with BYO keys.

### 6.1 Credit cost per action (about 2–2.5x provider list cost)

| Action | Credits | Approx. provider cost | Basis |
|---|---|---|---|
| Instant identity (1–3 selfies, zero-shot) | **0** | about $0 | conversion lever |
| Pro identity (LoRA fine-tune, 10–20 selfies) | 150 | about $1–2 | 1 included per month on Pro, 3 on Studio |
| Standard photo (Seedream / Flux-class, 1–2K) | **8** | about $0.03–0.04 | [fal](https://fal.ai/learn/tools/nano-banana-vs-seedream) |
| Premium photo (Nano Banana 2-class) | 16 | about $0.08 | same |
| Ultra photo (Nano Banana Pro-class / 4K) | 30 | about $0.15 | [fal NB Pro](https://fal.ai/models/fal-ai/nano-banana-pro) |
| Upscale to 4K | 2 | under $0.01 | — |
| Edit / relight / try-on / pose copy | 8–16 | per model used | — |
| Video, 5 s (Kling-class, no audio) | 100 | about $0.35–0.56 | [fal Kling](https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video) |
| Video, 5 s with audio / Seedance-class | 200 | about $0.70–1.50 | [atlascloud](https://www.atlascloud.ai/blog/guides/cheapest-api-provider-seedance-2-kling-wan) |
| Below-likeness-threshold or failed output | **refunded** | — | Keeper guarantee |

### 6.2 Plans

| Plan | Price | Credits | What you get | vs. competition |
|---|---|---|---|---|
| **Free** | $0 | 40 once | 1 instant identity, 5 standard photos, every pack previewable on demo characters | photoai: no free generation of you |
| **Single Shoot** (one-time) | **$15** | 500, never expire | 1 pack run, about 50 standard photos plus upscales, Pro identity included | HeadshotPro $29/30 · Aragon $35/40 · BetterPic $35/20 |
| **Credit packs** (one-time) | $10 / $25 / $60 | 1,000 / 2,700 / 7,000 | never expire, about 8–17% bonus | photoai top-ups only for subscribers |
| **Plus** | **$12/mo** ($120/yr) | 1,200/mo | about 150 standard photos, 1 Pro identity/quarter, 4 parallel, commercial use | photoai Starter $19 = 10 Seedream photos |
| **Pro** | **$29/mo** ($290/yr) | 3,000/mo | about 375 standard / 185 premium photos or about 30 videos, 1 Pro identity/mo, 8 parallel, all editing | photoai Pro $49 = 200 Seedream photos (about 3x value per $) |
| **Studio** | **$79/mo** ($790/yr) | 9,000/mo | about 1,125 standard photos, 3 Pro identities/mo, 16 parallel, API/MCP, brand kit | photoai Max $99 = 600 Seedream photos |
| **Teams** | **$19/seat** one-time (as low as $9 at 100+) | per seat | brand kit, admin, invites, bulk export, SSO on enterprise | HeadshotPro $39/seat · BetterPic $49→$13 |
| **Self-hosted** | $0 | BYO keys | everything, no mark-up | nobody else offers this |

- **Annual discount = 2 months free**, stated plainly with no fake "list price".
- **Margin check (my calculation):** at 100% credit use with standard photos, gross margin is about 55% (Plus/Pro) and about 50% (Studio). Typical utilisation of 50–70% puts the blended margin at about 70–80%, below photoai's 87% but sustainable.
- **Don't copy:** monthly credit expiry, tier-gated likeness, the "no refund once a model is trained" rule, Starter mark-ups, weekly subscriptions.

---

## 7. Fifty launch pack ideas

_Each pack is about 40 photos across 8–10 scene/outfit/pose variants, with gender-neutral and inclusive outfit options._

**Professional**
1. **LinkedIn Headshots:** chest-up, neutral grey/white/blue seamless backdrops, blazer or suit, soft key light, confident smile.
2. **Business Casual:** open-collar shirts, knitwear and chinos in bright modern offices and cafés; approachable but polished.
3. **Executive / CEO:** dark tailoring, boardroom and glass-office window light, arms-crossed authority poses.
4. **Founder & Press Kit:** editorial magazine-feature portraits for TechCrunch/Forbes-style stories: loft office, whiteboard, team-in-background bokeh.
5. **Keynote Speaker:** on stage under a spotlight with headset mic, LED screen and audience bokeh; also green-room candids.
6. **Team Directory:** strictly uniform backdrop, crop and lighting so a whole company matches (Teams brand kit).
7. **Creative Professional:** designer, architect or artist studio, colourful backdrops, turtlenecks, moodboards.
8. **Real Estate Agent:** friendly, bright exteriors in front of homes, blazer in brand colours, handing over keys.
9. **Healthcare Professional:** white coat or scrubs, stethoscope, clean clinic and hospital corridor backgrounds.
10. **Author & Book Jacket:** moody library or study, window light, black-and-white and warm-tone variants.
11. **Studio Portrait:** classic Rembrandt and butterfly lighting on painted canvas and coloured seamless paper; the "real photographer" look.
12. **Black & White Editorial:** high-contrast monochrome fine-art portraits with deep shadows and film grain.

**Dating & social**
13. **Dating Profile:** natural daylight smiles, candid laughs, hobby shots (coffee, hiking, cooking, dog); approachable, not glossy.
14. **First Date Night:** candlelit restaurant, wine bar and rooftop cocktails in smart-casual outfits.
15. **Natural Phone Photos:** realistic iPhone-style casual shots, mirror selfies and "photo dump" vibes; the anti-plastic pack.
16. **Golden Hour Influencer:** rooftops, beaches and city streets at sunset with lens flare and warm grade.
17. **Coffee Shop Creator:** cosy café, latte, laptop or journal, soft window light.
18. **Street Style:** urban fashion week streets, sneakers, layered outfits, crosswalk and graffiti walls.
19. **Fashion Editorial / Magazine Cover:** high-fashion poses and bold lighting with generic masthead-free cover layouts.
20. **Cinematic Movie Still:** anamorphic widescreen frames, teal-orange or neon grades, film-scene drama.

**Aesthetics**
21. **Old Money:** tennis clubs, polo fields, cable-knit sweaters, Riviera terraces, Ivy League quads.
22. **Quiet Luxury:** neutral cashmere and linen, minimalist interiors, gallery spaces, understated elegance.
23. **Luxury Lifestyle:** yacht deck, private-jet cabin, penthouse view, supercar (no logos).
24. **Dark Academia:** tweed, turtlenecks, candlelit libraries, gothic university halls.
25. **Cottagecore:** flowy linen, wildflower fields, baking bread, rustic countryside cottages.
26. **Y2K:** glossy early-2000s styling, flip phones, low-rise denim, butterfly clips, chrome.
27. **Retro 90s Film:** disposable-camera flash, film grain, mall and bedroom sets, 90s fashion.
28. **Instant Film:** square instant-camera frames with soft flash and nostalgic colour shifts (no brand names).
29. **K-Style Studio Profile:** Korean photo-studio look with clean pastel backdrops, soft beauty light and natural retouch.

**Travel & outdoors**
30. **Europe Summer:** Amalfi Coast, Paris café terraces, Santorini blue domes, Barcelona streets.
31. **Asia Explorer:** Tokyo neon at night, Kyoto temples, Bali rice terraces, Seoul cafés.
32. **City Break USA:** NYC streets and rooftops, Miami Art Deco, LA palm boulevards.
33. **Digital Nomad:** laptop at a beach café, co-working loft, mountain-view balcony.
34. **Outdoor Adventure:** hiking trails, mountain summits, camping, lakeside kayaking.
35. **Winter Ski Chalet:** snowy slopes, après-ski fireside, puffer jackets, alpine village.
36. **Beach & Resort:** tasteful resort wear, infinity pools, cabanas, sunset shoreline.

**Fitness & hobbies**
37. **Fitness / Gym:** dramatic gym lighting, activewear, lifting, battle ropes, post-workout candids.
38. **Running & Athlete:** track, marathon finish line, sports-brand-ad style motion shots.
39. **Yoga & Wellness:** sunrise yoga, studio poses, spa and meditation calm.
40. **Golf & Country Club:** fairway swings, clubhouse terrace, preppy golf attire.
41. **Musician / Stage:** concert lights, guitar or mic, recording studio, backstage candids.
42. **Chef & Foodie:** professional kitchen, apron, plating, farmers-market produce.

**Events, life moments & festive**
43. **Wedding Guest:** cocktail and semi-formal outfits at garden, vineyard and ballroom weddings; solo and with a plus-one.
44. **Black Tie Gala / Red Carpet:** tuxedos and gowns, step-and-repeat flashes, grand staircases.
45. **Engagement & Couple:** couple identity at golden hour, city and nature, ring-reveal poses.
46. **Graduation:** cap and gown on campus, diploma, celebratory toss.
47. **Diwali Festive:** kurta, saree and lehenga, glowing diyas, rangoli, marigolds, sparklers and fireworks.
48. **Desi Wedding & Sangeet:** sherwani and lehenga, mehndi details, mandap florals, dance-floor candids.
49. **Christmas & Holiday Card:** cosy sweaters, decorated tree, fireplace, snowy street; card-ready crops.
50. **Lunar New Year & Eid:** red qipao or tang suit with lanterns; elegant Eid attire with crescent-moon lanterns and festive tables (shipped as two sub-packs).

_Strong follow-ups: Halloween Costumes, Maternity, You + Your Pet, Prom, Birthday Celebration, Passport/ID (with acceptance disclaimer), Formula-1 Paddock, Astronaut / Sci-Fi, Superhero / Cosplay, Thanksgiving, Hanukkah, Pride, Met-Gala-style Couture._

---

## 8. Sources (key)

- photoai: [home](https://photoai.com/) · [pricing](https://photoai.com/pricing) · [FAQ](https://photoai.com/faq) · [credits FAQ](https://photoai.com/faq/how-much-does-it-cost-to-generate-on-photo-ai-how-do-credits-work-4550834) · [ideas](https://photoai.com/ideas) · [legal](https://photoai.com/legal) · [refund policy](https://ideasbugs.featurebase.app/help/articles/4078304-can-i-get-a-refund) · [Trustpilot](https://www.trustpilot.com/review/photoai.com) · [HN refund thread](https://news.ycombinator.com/item?id=42028170) · [levelsio stack/revenue](https://x.com/levelsio/status/1970858876212756506) · [levelsio 3-min models](https://x.com/levelsio/status/1923075661822034316) · [levelsio top-ups](https://x.com/levelsio/status/1906058986618802480) · [dev.to review](https://dev.to/illeanavoviews/photo-ai-review-is-it-worth-it-and-a-better-alternative-4hnh) · [tryclout review](https://www.tryclout.ai/blog/photo-ai-review) · [ExpertPhotography](https://expertphotography.com/photoai-review)
- HeadshotPro: [new model](https://www.headshotpro.com/blog/introducing-our-new-ai-headshot-model) · [teams](https://www.headshotpro.com/company-headshots) · [Trustpilot](https://www.trustpilot.com/review/headshotpro.com) · [refund analysis](https://www.talentedladiesclub.com/articles/ai-headshot-tools-comparison-keeper-rate-refund-terms-and-who-keeps-your-self/)
- Aragon: [subscription changelog](https://www.aragon.ai/changelog/new-feature-introducing-aragon-subscription-plans) · [photo generator](https://www.aragon.ai/photo-generator) · [refund policy](https://www.aragon.ai/refund-policy) · [Trustpilot](https://www.trustpilot.com/review/www.aragon.ai) · [aitoolspolice](https://aitoolspolice.com/reviews/aragon-ai/)
- BetterPic: [review](https://filipkonecny.com/blog/betterpic-review) · [team pricing](https://www.betterpic.io/blog/company-headshot-photographer-pricing-2026) · [Trustpilot](https://www.trustpilot.com/review/betterpic.io)
- Complaints and context: [skin-tone bias](https://www.digitalcameraworld.com/news/ai-photo-generators-that-claim-to-create-professional-headshots-show-disturbing-racial-bias) · [recruiter detection](https://www.headshotphoto.io/blogs/can-employers-tell-ai-headshot) · [privacy comparison](https://meikuio.com/best-ai-headshot-generator/) · [Remini billing](https://litmustools.com/review/remini/)
- Tech: [InstantID](https://github.com/instantX-research/InstantID) · [zero-shot vs LoRA guide](https://tech-insider.org/ai-headshot-generator-lora-identity-preservation-2026/) · [astria headshots-starter (OSS)](https://github.com/astriaai/headshots-starter) · [Flux licensing](https://en.wikipedia.org/wiki/Flux_(text-to-image_model)) (FLUX.1-dev is non-commercial; Schnell is Apache-2.0)
