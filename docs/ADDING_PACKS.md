# Adding photo packs

A **pack** is a themed set of 12–16 prompts ("LinkedIn Headshots", "Paris", "Diwali"…). Packs are plain JSON
files in [`packs/`](../packs): adding one is adding a file, with no code, migration or database row. The format
is defined by `packSchema` in [`src/types/pack.ts`](../src/types/pack.ts) and read at runtime by
[`src/server/packs/registry.ts`](../src/server/packs/registry.ts).

## Where packs appear

| Surface          | Path                                                          | What it shows                                                                             |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Public gallery   | `/packs`                                                      | Every pack card (emoji, gradient or cover, tagline), featured packs first                 |
| Public pack page | `/packs/[slug]`                                               | Name, description, tags and sample prompt titles. These pages double as SEO landing pages |
| App              | `/app/packs`, `/app/packs/[slug]`                             | Pick an identity model and generate a few photos or a full batch (up to 50)               |
| Create page      | `/app/create` (Pack tab)                                      | Generate from one pack, optionally adding your own prompt text                            |
| API              | `GET /api/packs`, `GET /api/packs/:slug`, `GET /api/v1/packs` | `PackSummary` JSON (prompt text is never exposed publicly)                                |

Packs are sorted by `sortOrder`, then by name. The registry caches packs per process, so restart the server (or
the worker) after adding or editing a file. The registry **skips invalid files with a warning** so that one bad pack
can't take the gallery down. Always run the validator before you commit.

## File format

`packs/<slug>.json`, where the file name must equal `slug`:

```json
{
  "slug": "coffee-date",
  "name": "Coffee Date",
  "tagline": "Warm café moments for an easy first impression.",
  "description": "The low-key first-date look: window seats, latte art, sidewalk terraces…",
  "category": "dating",
  "emoji": "☕",
  "tags": ["dating", "coffee", "cafe", "first date", "cozy"],
  "colors": ["#78350f", "#fcd34d"],
  "defaultAspectRatio": "4:5",
  "negativePrompt": "deformed hands, extra fingers, plastic skin, cartoon, watermark, text, logo, blurry",
  "featured": false,
  "isNew": false,
  "sortOrder": 150,
  "subjects": ["man", "woman", "person"],
  "prompts": [
    {
      "title": "Window seat latte",
      "prompt": "candid photo of {subject} at a café window seat with a latte, wearing a soft knit sweater, warm smile toward the camera as if across the table, soft diffused window light, street softly blurred outside, 50mm lens at f/1.8, natural skin texture, true-to-life skin tone, photorealistic",
      "promptMan": "candid photo of {subject} at a café window seat with a latte, wearing a navy knit sweater over a collared shirt, …",
      "promptWoman": "candid photo of {subject} at a café window seat with a latte, wearing a cream ribbed knit sweater, …"
    }
  ]
}
```

| Field                                 | Type / limits                                                                                            | Notes                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `slug`                                | kebab-case, unique                                                                                       | Must equal the file name. It's part of public URLs, so never rename a shipped pack                                |
| `name`                                | 2–60 chars                                                                                               | Title case, no trademarks                                                                                         |
| `tagline`                             | 2–120 chars                                                                                              | One line shown on the card                                                                                        |
| `description`                         | 10–800 chars                                                                                             | Shown on `/packs/[slug]` and used as the meta description. Say what scenes and wardrobe are inside                |
| `category`                            | `professional` `dating` `lifestyle` `travel` `fashion` `fitness` `events` `seasonal` `creative` `family` | Drives gallery filters                                                                                            |
| `emoji`                               | ≤ 8 UTF-16 units                                                                                         | Card icon when there is no cover                                                                                  |
| `tags`                                | ≤ 12, each ≤ 30 chars, lowercase                                                                         | Search and SEO keywords. Platform names ("linkedin", "tinder") are fine here                                      |
| `colors`                              | `[from, to]` hex                                                                                         | Card gradient. Pick two colors that read well behind white text                                                   |
| `cover`                               | path under `/public`                                                                                     | Optional, e.g. `/packs/coffee-date.jpg` (generated on a demo identity, never a real person)                       |
| `defaultAspectRatio`                  | `1:1` `4:5` `3:4` `2:3` `9:16` `16:9` `3:2` `5:4`                                                        | `4:5` portraits/feeds, `9:16` stories, `1:1` avatars, `16:9` thumbnails/cinematic, `2:3`/`3:2` film, `3:4` covers |
| `negativePrompt`                      | ≤ 600 chars                                                                                              | Applied to every prompt. Merged with the prompt's own negative prompt (duplicates dropped)                        |
| `featured` / `isNew`                  | boolean                                                                                                  | Keep both curated: about 8 featured and about 6 new across the catalogue                                          |
| `sortOrder`                           | integer (default 100)                                                                                    | Lower comes first. The seeds use 1–2; existing packs use steps of 10                                              |
| `subjects`                            | subset of `man` `woman` `person`                                                                         | Who the pack is designed for (default: all three)                                                                 |
| `prompts`                             | 6–60 items (aim for 12–16)                                                                               | See below                                                                                                         |
| `prompts[].title`                     | 1–80 chars                                                                                               | Shown publicly as a sample and in the gallery ("Window seat latte")                                               |
| `prompts[].prompt`                    | 20–1200 chars (validator: ≥ 80)                                                                          | The default template, used for `person` and whenever there's no override                                          |
| `prompts[].promptMan` / `promptWoman` | same as `prompt`                                                                                         | Optional full overrides when the wardrobe differs                                                                 |
| `prompts[].negativePrompt`            | ≤ 600 chars                                                                                              | Extra negatives for this prompt only                                                                              |
| `prompts[].aspectRatio`               | as above                                                                                                 | Overrides `defaultAspectRatio`, e.g. a 9:16 story shot in a 4:5 pack                                              |

## Placeholders

The registry expands placeholders for the identity being rendered:

| Placeholder    | man             | woman             | person             |
| -------------- | --------------- | ----------------- | ------------------ |
| `{subject}`    | `<trigger> man` | `<trigger> woman` | `<trigger> person` |
| `{pronoun}`    | he              | she               | they               |
| `{possessive}` | his             | her               | their              |

Rules (all enforced by the validator):

- **`{subject}` appears exactly once** in every `prompt`, `promptMan` and `promptWoman`. It carries the identity's
  trigger word: with none, the model never activates; with two, you get two people.
- Only these three placeholders exist. Placeholders are **not** expanded in names, taglines, descriptions, tags,
  titles or negative prompts, so keep them out of those fields.
- `{pronoun}` must read correctly as "he", "she" **and** "they". Avoid present-tense verbs after it: "{pronoun} is
  smiling" becomes "they is smiling". Prefer `{possessive}` ("sun behind {possessive} shoulder") or past tense ("as
  {pronoun} turned"). Don't start a sentence with a placeholder, because it expands in lowercase.
- When `promptMan`/`promptWoman` exist, `prompt` must stay gender-neutral because it is what `person` identities get.
  Overrides are complete prompts (with their own `{subject}`), so change only what differs, usually the wardrobe.

## Writing great prompts

Users judge a pack by its _worst_ photo, so aim for consistent, believable images, not novelty.

1. **Use one recipe.** Shot type → `{subject}` → wardrobe → pose or action → setting → light → lens → mood →
   realism tail. For example: _"candid photo of {subject} walking along a tree-lined sidewalk, wearing a light trench
   coat, mid-stride smile, golden morning light, city softly blurred, 85mm lens, editorial street style, natural skin
   texture, true-to-life skin tone, photorealistic"_.
2. **Be concrete.** Name the fabric, colors, the place and the light direction ("soft window light from the
   left"), plus a lens ("85mm f/1.8"). Vague prompts collapse into the same generic image.
3. **Vary the batch.** Across 12–16 prompts, vary the setting, framing (headshot, waist-up, full length), light
   (studio, window, golden hour, night), expression (smile, laugh, calm) and wardrobe. Two prompts that differ only by
   one word waste credits, and the validator rejects exact duplicates.
4. **Protect likeness.** Keep the face visible: no masks, no goggles over the eyes, no backs to camera, no tiny
   figures in big landscapes. Avoid hands near the face and props that hide it. Don't specify eye color, hair, body
   shape, age or ethnicity, because the identity model supplies those.
5. **Keep it realistic.** End with a realism tail such as `natural skin texture, true-to-life skin tone,
photorealistic`. Users' top complaints are plastic skin and skin-tone drift.
6. **Avoid rendered text.** Image models garble letters. Ask for "unreadable glyphs", "plain sleeve" or "empty space
   for a masthead" instead of signs, book titles or slogans, and keep `text, watermark, logo` in the negative prompt.
7. **Describe styles, not brands.** Write "warm color-negative film with fine grain", not a film-stock brand;
   "fashion magazine cover-style portrait with empty headroom", not a magazine name; "original hero suit with no
   emblem", not a character.
8. **Write negatives as short comma lists.** Start from the common set (`deformed hands, extra fingers, fused
fingers, distorted face, plastic skin, waxy skin, cartoon, anime, illustration, 3d render, watermark, text, logo,
blurry, lowres, duplicate person`) and add what this theme tends to go wrong on (`fake-looking snow`,
   `goggles covering eyes`, `letterbox bars`).
9. **Test on demo identities** (a man, a woman, a person; several skin tones) before marking a pack `featured`.

## Content and safety rules

Packs are trusted content: their prompts skip runtime moderation (only text a user adds is checked). The
validator is therefore strict, and every rule below is a hard error:

- **No sexualized content**, including wording such as "sexy", "seductive", "sensual", "lingerie", "bikini",
  "swimsuit", "shirtless", "topless" or "boudoir". Beach, pool, fitness and yacht packs use linen, resort wear and
  proper training clothes.
- **Adults only.** Don't mention children, teens or minors ("kid", "teen", "baby", "girl", "boy", "school uniform",
  "prom"). Use "adult relatives" or "adult friends" for group scenes, and make graduations university commencements.
- **No real people**: no celebrities, look-alikes, "in the style of <person>", and no public figures. The safety
  module's public-figure list applies too.
- **No trademarks**: no brands, logos, magazines, film stocks, camera makers, cars, franchises or characters. Platform
  names (LinkedIn, Instagram, YouTube…) are allowed in descriptions and tags as use cases, and only warn in prompts.
- **No weapons, gore or drugs**: no guns, swords, knives, blood or smoking. Knights get armor and banners, pirates get
  a spyglass, and Halloween stays spooky-fun.
- **Respect cultures.** Traditional dress (saree, kurta, hanbok, kimono, kente…) is styled accurately, in fitting
  settings (heritage sites, festivals, studios), without stereotypes, caricature makeup or costume framing. Keep
  sacred sites respectful ("standing respectfully", modest attire where customary).

Negative prompts are exempt from the banned-term scan and the safety classifier, because they name what the model
must _avoid_ (`nudity`, `weapons` and `gore` are useful negatives).

## Validate

```bash
pnpm packs:validate            # errors fail (exit 1); warnings are printed
pnpm packs:validate --strict   # warnings fail too (use in CI for new packs)
pnpm packs:validate --quiet    # hide warnings
pnpm packs:validate --dir path/to/packs
pnpm exec vitest run tests/unit/packs-content
```

`scripts/validate-packs.ts` checks:

1. valid JSON that matches `packSchema`
2. `slug` = file name, and slugs are unique
3. `{subject}` exactly once in every prompt variant, only known placeholders, no placeholders in metadata or
   negatives, and `{pronoun}` grammar that works for "they"
4. prompt length (at least 80 characters, at most 1200), no duplicate titles or prompt texts, and hex `colors`
5. a local banned-term list (sexual content, minors, violence, drugs, real people, trademarks; platform names in
   prompts are warnings), with whole-word, case- and accent-insensitive matching
6. **the safety module's text classifier** (`classifyText` in `src/server/safety/text-filter.ts`, the same
   always-on filter that guards user prompts), run on every expanded prompt and every piece of public metadata

Output groups issues by file with the exact location, for example
`prompts[3] "Rainy evening" › promptMan: {subject} appears 2 times (must be exactly once)`, and ends with a
summary table. The unit tests in `tests/unit/packs-content/` also assert catalogue-level rules: at least 46
packs, at least 12 prompts each, every prompt renders for man/woman/person with the trigger word, and every pack
has an emoji, a gradient and 4 or more tags.

## Contributing a pack (pull request checklist)

1. Copy a similar pack in `packs/` to `packs/<your-slug>.json` and change `slug` to match.
2. Write 12–16 prompts following the recipe above. Add `promptMan`/`promptWoman` only where the wardrobe differs.
3. Choose `category`, `emoji`, 4–12 lowercase `tags`, a `colors` gradient and a `sortOrder`. Leave `featured` and
   `isNew` as `false`, because maintainers curate those.
4. Run `pnpm packs:validate --strict` and `pnpm exec vitest run tests/unit/packs-content` until both pass.
5. If you can, generate a few samples on demo identities and attach them to the PR. Optionally add a cover at
   `public/packs/<slug>.jpg`, made from a demo identity and never a real person.
6. Open a PR titled `pack: <Name>` that describes the theme and who it's for. Reviewers check variety, realism,
   likeness safety (face visible) and cultural respect, as well as the validator.
