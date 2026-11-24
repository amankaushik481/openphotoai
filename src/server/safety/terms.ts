/**
 * Term lists for the always-on rule-based text filter (see text-filter.ts).
 * Terms are written in plain lowercase; normalization makes them match case/leetspeak/
 * homoglyph/separator/repeated-letter variants, and plurals are matched automatically.
 * Public figure names live in public-figures.ts.
 */

/** Explicit sexual terms, nudity, sexual acts, fetish and sexualized descriptors. */
export const SEXUAL_TERMS: readonly string[] = [
  // general
  "sex", "sexy", "sexier", "sexiest", "sexual", "sexually", "sexualized", "sexualised", "sexualize", "sexting",
  "seggs", "segs", "smexy", "nsfw", "x rated", "adult content", "adult film", "adult video", "explicit content",
  "erotic", "erotica", "eroticism", "lewd", "obscene", "smut", "smutty",
  "porn", "porno", "pornographic", "pornography", "pornstar", "porn star", "xxx", "hentai", "ecchi", "rule 34", "rule34",
  "onlyfans", "only fans", "fansly", "boudoir", "playboy", "playmate",
  // nudity / undressing
  "nude", "nudes", "nudity", "nudist", "nudism", "noods", "nudez", "nudie", "nudify", "nudifier", "nudification",
  "naked", "nakedness", "topless", "bottomless", "unclothed", "unclothe", "undress", "undressed", "undressing",
  "without clothes", "without clothing", "without any clothes", "with no clothes", "no clothes", "no clothing",
  "wearing nothing", "with nothing on", "clothes off", "clothing off", "strip naked", "stripped naked",
  "take off her clothes", "take off his clothes", "take off their clothes", "take off clothes", "taking off clothes",
  "remove her clothes", "remove his clothes", "remove their clothes", "remove clothes", "remove clothing",
  "remove her bra", "remove her top", "take off her top", "take off her bra", "implied nude", "hand bra", "handbra",
  "covering her breasts", "skinny dipping", "body paint", "bodypaint", "body painting",
  "see through", "seethrough", "transparent clothes", "transparent clothing", "transparent dress", "transparent top",
  "wet t shirt", "wet tshirt",
  // sexualized clothing / descriptors
  "lingerie", "underwear", "panties", "panty", "thong", "g string", "bra and panties", "negligee", "micro bikini",
  "thong bikini", "pasties", "seductive", "seductively", "seduce", "seducing", "seduction", "sensual", "sensually",
  "sultry", "provocative", "provocatively", "suggestive", "risque", "racy", "thirst trap", "bedroom eyes",
  "come hither", "voluptuous", "thicc", "busty", "cleavage", "booty",
  // body parts
  "boob", "boobs", "boobies", "tits", "titty", "titties", "breasts", "bare breast", "underboob", "sideboob",
  "nipple", "nipples", "areola", "areolas", "areolae", "nip slip", "upskirt", "downblouse", "cameltoe", "camel toe",
  "wardrobe malfunction", "butt naked", "bare butt", "bare ass", "naked butt", "buttocks",
  "genitals", "genitalia", "penis", "vagina", "vulva", "pussy", "cock", "dick pic", "dickpic", "erection", "boner",
  "testicles",
  // acts, toys, sex work, fetish
  "orgasm", "masturbate", "masturbating", "masturbation", "blowjob", "blow job", "handjob", "hand job", "fellatio",
  "cunnilingus", "cumshot", "cum", "creampie", "ejaculation", "ejaculate", "semen", "anal", "oral sex", "intercourse",
  "threesome", "orgy", "gangbang", "gang bang", "bukkake", "glory hole", "spread legs", "legs spread", "spread eagle",
  "bent over", "on all fours", "doggystyle", "doggy style", "missionary position", "cowgirl position",
  "dildo", "vibrator", "sex toy", "sex doll", "butt plug", "strapon",
  "fetish", "fetishes", "bdsm", "bondage", "dominatrix", "stripper", "striptease", "strip tease", "strip club", "stripclub",
  "pole dancer", "lap dance", "lapdance", "camgirl", "cam girl", "camboy", "webcam model", "escort service",
  "prostitute", "prostitution", "hooker", "call girl", "sugar baby",
  "milf", "dilf", "horny", "aroused", "arousing", "slut", "slutty", "whore", "nympho", "nymphomaniac", "shemale",
  "ahegao", "futanari", "yiff",
  // sexual abuse
  "rape", "raped", "rapist", "molest", "molested", "molestation", "incest", "bestiality", "zoophilia", "voyeur",
  "voyeurism", "revenge porn", "sextortion",
];

/** Children and anyone under 18 (ages under 18 are detected separately, e.g. "15 year old", "15yo"). */
export const MINOR_TERMS: readonly string[] = [
  "child", "children", "childlike", "child like", "kid", "kids", "kiddo", "kiddie", "kiddy", "youngster",
  "toddler", "baby", "babies", "infant", "newborn", "preschool", "preschooler", "kindergarten", "kindergartener",
  "nursery school", "elementary school", "elementary schooler", "grade school", "grade schooler", "primary school",
  "middle school", "middle schooler", "high schooler", "schoolgirl", "schoolboy", "school girl", "school boy",
  "schoolkid", "school kid", "teen", "teens", "teenage", "teenaged", "teenager", "preteen", "pre teen", "tween",
  "tweenager", "adolescent", "adolescence", "pubescent", "prepubescent", "puberty", "juvenile",
  "underage", "under age", "underaged", "minor", "minors", "jailbait", "jail bait", "barely legal",
  "loli", "lolita", "lolicon", "shota", "shotacon", "young girl", "young boy", "little girl", "little boy",
  "girl child", "boy child",
];

/** Graphic violence, gore and self-harm. */
export const VIOLENCE_GORE_TERMS: readonly string[] = [
  "gore", "gory", "graphic violence", "decapitated", "decapitation", "beheaded", "beheading", "dismembered",
  "dismemberment", "disemboweled", "disembowelled", "disembowelment", "eviscerated", "mutilated", "mutilation",
  "flayed", "skinned alive", "impaled", "corpse", "dead body", "dead bodies", "severed head", "severed limb",
  "severed arm", "severed leg", "exposed organs", "brain matter", "entrails", "torture", "tortured", "torturing",
  "self harm", "selfharm", "suicide", "suicidal", "slit wrist", "slit wrists", "slit throat", "cutting myself",
  "kill myself", "hanging myself", "blood splatter", "blood spatter", "covered in blood", "pool of blood",
  "bloodbath", "massacre", "mass shooting", "school shooting", "shot in the head", "gunshot wound", "bullet wound",
  "stab wound", "stabbed", "stabbing", "lynching", "lynched", "burned alive", "burnt alive", "snuff", "cannibal",
  "cannibalism", "animal cruelty", "rotting flesh", "murdered", "murder scene",
];

/**
 * Hate symbols, extremist phrases and slurs. Kept intentionally (a filter must name what it blocks);
 * never shown to users — matches are only stored in moderation_events for admin review.
 */
export const HATE_TERMS: readonly string[] = [
  "nazi", "nazis", "neo nazi", "neonazi", "swastika", "kkk", "ku klux klan", "white power", "white pride",
  "white supremacy", "white supremacist", "heil hitler", "sieg heil", "nazi salute", "hitler salute", "nazi uniform",
  "blackface", "yellowface", "ethnic cleansing", "holocaust denial", "holohoax", "gas the jews", "racial slur",
  "nigger", "nigga", "faggot", "fag", "tranny", "trannies", "kike", "spic", "chink", "gook", "wetback", "raghead",
  "towelhead", "beaner", "jigaboo", "porch monkey", "paki", "golliwog", "retard", "retarded",
];

/**
 * Generic phrases that target real people's likeness. Specific names are in public-figures.ts.
 */
export const PUBLIC_FIGURE_PHRASES: readonly string[] = [
  "celebrity lookalike", "celebrity look alike", "celebrity doppelganger", "celebrity face swap", "celebrity faceswap",
  "lookalike of", "look alike of", "doppelganger of", "deepfake", "deep fake", "face swap with", "faceswap with",
  "famous person", "famous actor", "famous actress", "famous singer", "famous rapper", "famous athlete",
  "famous politician", "famous celebrity", "real celebrity", "world leader", "head of state",
  "president of the united states", "us president", "u s president", "american president", "the pope",
  "queen of england", "king of england", "british royal family",
];

/**
 * Known-safe phrases blanked out before matching (applied to normalized text, before leetspeak
 * decoding, so an obfuscated term can never be hidden by an exception). Separators must be plain
 * whitespace: "a baby, blue background" is still matched.
 */
export const TEXT_FILTER_EXCEPTIONS: readonly RegExp[] = [
  "baby\\s+(?:blue|pink|grand|boomers?|breath)",
  "baby['’]?s\\s+breath",
  "kid\\s+(?:gloves|leather)",
  "(?:magna\\s+|summa\\s+)?cum\\s+laude",
  "child['’]?s?\\s+pose",
  "(?:chicken|turkey|duck)\\s+breasts?",
  "gore\\s*-?\\s*tex",
  "pussy\\s*(?:cat|willow)s?",
  "spick?\\s+(?:and|&|n)\\s+span",
  "chink\\s+in",
  "minor\\s+(?:adjustments?|changes?|edits?|tweaks?|details?|fix(?:es)?|retouch(?:es|ing)?|touch\\s*-?\\s*ups?|corrections?|improvements?|imperfections?|blemish(?:es)?|flaws?|wrinkles?|key|chords?|league|issues?|differences?|variations?|alterations?|modifications?|refinements?|enhancements?|cleanup)",
].map((source) => new RegExp(`(?<![a-z])${source}(?![a-z])`, "g"));
