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
  // euphemisms, misspellings and implied nudity
  "birthday suit", "in the buff", "au naturel", "au natural", "in the altogether", "unclad", "disrobe", "disrobed",
  "disrobing", "in the nude", "implied nudity", "implied naked", "naturist", "naturism", "nakid", "nekkid", "nakey",
  "neked", "nekid", "nakd", "noodz", "nudz", "nudies", "pron", "secks", "secksy", "seks", "seksi", "sexi", "sxy",
  "not safe for work", "18 content", "18 only content", "spicy content", "spicy pics", "spicy pictures",
  "spicy photos", "spicy photo", "spicy shoot", "spicy photoshoot", "spicy selfie", "spicy selfies", "spicy video",
  "scantily clad", "scantily dressed", "barely dressed", "barely clothed", "barely covered", "barely covering",
  "strategically placed", "strategically covered", "censor bar", "censor bars", "censored parts",
  "only a towel", "just a towel", "only in a towel", "nothing but a towel", "wrapped only in", "covered only by",
  "covered only in", "covered only with", "only a bedsheet", "just a bedsheet", "only a sheet", "just a sheet",
  "only a blanket", "just a blanket", "only an apron", "just an apron", "in nothing but", "dressed in nothing",
  "clad in nothing", "clothed in nothing", "nothing underneath", "nothing under it", "nothing on underneath",
  "no underwear", "without underwear", "no panties", "without panties", "braless", "no bra", "without a bra",
  "wet white t shirt", "wet white tshirt", "wet white shirt", "wet see through", "sheer top", "sheer blouse",
  "sheer bodysuit", "sheer slip", "sheer nightgown", "sheer negligee", "sheer lingerie",
  "pulling down her top", "pulling down her shirt", "pulling down her dress", "pull down her top",
  "lifting her shirt", "lifting her top", "lift her shirt", "lift her top", "flashing the camera", "flashing her",
  "flashing his", "mooning", "making love", "make love", "lovemaking", "love making", "straddling him",
  "straddling her", "straddling a man", "straddling a woman", "exotic dancer", "gentlemens club",
  "gentleman s club", "gentlemen s club", "nude beach", "nood", "shirtless woman", "shirtless women", "shirtless girl",
  "bare chested woman", "bare chest woman", "bare chested girl", "topless woman",
  // sexualized underwear (the pack validator bans these too)
  "bra", "bras", "bralette", "bralettes", "brassiere", "briefs", "boxer briefs", "jockstrap", "jock strap",
  "garter belt", "garter belts", "garter", "garters", "suspender belt", "string bikini", "tiny bikini",
  "microbikini", "sling bikini", "pasties",
  // Spanish
  "desnuda", "desnudo", "desnudas", "desnudos", "desnudez", "desnudarse", "desnudandose", "sin ropa",
  "sin nada de ropa", "sin nada puesto", "ropa interior", "en bolas", "en pelotas", "encuerada", "encuerado",
  "tetas", "pezones", "senos desnudos", "lenceria", "sexo", "cachonda", "follando", "nalgas", "tanga",
  "sin sujetador", "sin brasier",
  // French
  "nue", "nues", "toute nue", "tout nu", "seins nus", "nichons", "sans vetements", "sans vetement",
  "sans habits", "sous vetements", "sous vetement", "deshabillee", "deshabille", "a poil", "erotique", "sexe",
  "soutien gorge", "fesses",
  // German
  "nackt", "nackte", "nackten", "nackter", "nacktes", "nacktheit", "nacktbild", "nacktbilder", "nacktfoto",
  "nacktfotos", "oben ohne", "unbekleidet", "unbekleidete", "ausgezogen", "entkleidet", "ohne kleidung",
  "ohne klamotten", "unterwasche", "brueste", "bruste", "titten", "busen", "nippel", "muschi", "erotisch",
  "erotische", "freizugig", "freizuegig",
  // Portuguese
  "nua", "nuas", "pelada", "peladas", "peladinha", "sem roupa", "sem roupas",
  "calcinha", "sutia", "sem sutia", "peitos", "seios", "seios nus", "bunda", "roupa intima", "safada",
  "putaria", "transando",
  // Italian
  "nuda", "nudo", "nudi", "svestita", "svestito", "spogliata", "spogliato", "senza vestiti", "senza veli",
  "biancheria intima", "reggiseno", "mutande", "mutandine", "tette", "seno nudo", "a seno nudo", "sesso",
  "erotico",
  // Dutch
  "naakt", "naakte", "bloot", "blote", "ontbloot", "zonder kleren", "zonder kleding", "ondergoed", "tieten",
  "borsten", "blote borsten", "uitgekleed", "geil", "geile",
  // Hindi / Hinglish (Latin script)
  "nangi", "nanga", "nange", "nangapan", "nagn", "nagna", "bina kapde", "bina kapdo", "bina kapdon",
  "bina kapde ke", "kapde utar", "kapde utaro", "kapde utarti", "kapde utare", "chuchi", "chuchiyan", "chudai",
  "gaand",
  // other Latin-script languages
  "naken", "alasti", "telanjang", "bugil", "ciplak", "hubad", "khoa than",
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
  // school years, coming-of-age events and age-play (ages and grades as numbers: see text-filter.ts)
  "high school student", "high school students", "high school girl", "high school boy", "highschool",
  "highschooler", "in high school", "junior high", "middle school student", "middle schoolers", "schoolchild",
  "schoolchildren", "school uniform", "schoolgirl uniform", "school girl uniform", "girl scout", "boy scout",
  "cub scout", "sweet sixteen", "sweet 16", "quinceanera", "quince anos", "teenie", "teenies", "teenybopper",
  "teeny bopper", "barely 18", "barely eighteen", "just turned 18", "just turned eighteen", "almost 18",
  "almost eighteen", "nearly 18", "not yet 18", "flat chested",
  "looks underage", "underage looking", "child body", "childish body", "de aged", "deaged", "de aging",
  "deaging", "age regression", "age regressed", "ageplay", "age play", "ddlg", "jk uniform", "joshi kosei",
  "joshikosei", "joshikousei", "stepdaughter", "step daughter", "little sister", "little brother",
  "kid sister", "kid brother", "baby sister", "baby brother",
  // Spanish / French / German / Portuguese / Italian / Dutch / Hindi (Latin script)
  "ninos", "ninas", "menor de edad", "menores de edad", "adolescente", "adolescentes", "colegiala",
  "colegialas", "chiquilla", "enfant", "enfants", "fillette", "fillettes", "mineure", "mineurs",
  "collegienne", "lyceenne", "ecoliere", "minderjahrig", "minderjahrige", "minderjahriger", "jugendliche",
  "jugendlicher", "schulmadchen", "kleines madchen", "kleiner junge", "teenagerin", "crianca", "criancas",
  "menor de idade", "menores de idade", "novinha", "novinhas", "garotinha", "menininha", "bambina", "bambino",
  "bambini", "bambine", "ragazzina", "ragazzino", "ragazzine", "minorenne", "minorenni", "scolaretta",
  "kinderen", "minderjarig", "minderjarige", "tiener", "tieners", "schoolmeisje", "klein meisje", "bachcha",
  "bachche", "bachchi", "bacchi", "baccha", "bacche", "nabalig", "kam umar", "chhoti ladki", "choti ladki",
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
  "queen of england", "king of england", "british royal family", "potus", "flotus",
  "44th president", "45th president", "46th president", "47th president", "president xi", "chairman xi",
  // a real third party carried over from a reference photo
  "person from image", "man from image", "woman from image", "people from image", "face from image",
  "person from the image", "man from the image", "woman from the image", "face from the image",
  "person from the reference", "man from the reference", "woman from the reference", "face from the reference",
  "person in the reference", "man in the reference", "woman in the reference", "face in the reference",
  "same face as the reference", "same person as the reference", "keep the person from", "keep the man from",
  "keep the woman from", "swap faces with", "face swap",
];

/**
 * Terms in non-Latin scripts. Matched as plain substrings of the NFKC-folded text (the main
 * normalization maps everything to [a-z0-9], which would erase these scripts).
 */
export const NON_LATIN_TERMS: Readonly<Record<"sexual" | "minors", readonly string[]>> = {
  sexual: [
    // Hindi
    "नंगी", "नंगा", "नंगे", "नग्न", "सेक्सी", "चुदाई",
    // Russian / Ukrainian
    "голая", "голый", "голые", "голую", "обнаженная", "обнажённая", "обнаженный", "порно", "секс", "эротик",
    // Chinese / Japanese / Korean
    "裸体", "全裸", "裸照", "裸露", "色情", "ヌード", "エロ", "セックス", "ポルノ", "누드", "알몸", "야한",
    // Arabic
    "عارية", "عاري", "إباحي", "سكس",
  ],
  minors: [
    "बच्चा", "बच्ची", "नाबालिग", "ребенок", "ребёнок", "несовершеннолетн", "школьниц", "子供", "幼女", "少女",
    "女子高生", "中学生", "小学生", "ロリ", "児童", "미성년", "여고생", "قاصر",
  ],
};

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
  // athletic wear, not underwear (still blocked as "... bra only")
  "sports?\\s+bras?(?!\\s+(?:only|and\\s+(?:panties|thong|briefs|nothing)))",
  "bra\\s+size\\s+chart",
  "(?:legal|design|creative|case|news|project|client|press)\\s+briefs?",
  "garter\\s+snakes?",
  "enfant\\s+terrible",
  "girl\\s+scout\\s+cookies?",
  "musk\\s+(?:perfume|scent|fragrance|oil|ox|deer|rose|melon|notes?)",
  "minor\\s+(?:adjustments?|changes?|edits?|tweaks?|details?|fix(?:es)?|retouch(?:es|ing)?|touch\\s*-?\\s*ups?|corrections?|improvements?|imperfections?|blemish(?:es)?|flaws?|wrinkles?|key|chords?|league|issues?|differences?|variations?|alterations?|modifications?|refinements?|enhancements?|cleanup)",
].map((source) => new RegExp(`(?<![a-z])${source}(?![a-z])`, "g"));
