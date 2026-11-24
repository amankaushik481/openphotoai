/**
 * Widely known public figures whose likeness must never be generated (prompts and, via the
 * moderation provider's detectPublicFigure, reference images). Not exhaustive by design: the
 * generic phrases in terms.ts and the hosted moderation provider cover the long tail.
 *
 * Format: "Canonical Name|alias|alias". Aliases are alternate spellings or well-known single
 * names that are unambiguous in a photo prompt ("Obama", "Rihanna"). Ambiguous surnames
 * ("Bush", "Gates", "Swift") are only matched as part of the full name.
 */
import { buildVariants, compileTerms, findTerms, matchKey } from "./normalize";

const FIGURES = [
  // ── US politics ──
  "Donald Trump|trump|donald j trump|drumpf|trunp|donald trunp|trumpf", "Melania Trump", "Ivanka Trump|ivanka", "Donald Trump Jr", "Eric Trump", "Barron Trump",
  "JD Vance|j d vance", "Joe Biden|biden|sleepy joe", "Jill Biden", "Hunter Biden", "Kamala Harris|kamala", "Barack Obama|obama|obamna",
  "Michelle Obama", "Hillary Clinton", "Bill Clinton", "Chelsea Clinton", "George W Bush|george bush", "Mike Pence",
  "Nancy Pelosi|pelosi", "Bernie Sanders", "Alexandria Ocasio-Cortez|ocasio cortez|aoc", "Marco Rubio",
  "Ron DeSantis|desantis", "Gavin Newsom", "Robert F Kennedy Jr|rfk jr|robert kennedy jr", "Elon Musk|elon|musk|elon mask",
  "Pete Hegseth|hegseth", "Tulsi Gabbard", "Mitch McConnell", "Chuck Schumer", "Ted Cruz", "Nikki Haley",
  "Vivek Ramaswamy", "Tim Walz", "Pete Buttigieg|buttigieg", "Marjorie Taylor Greene", "Kristi Noem",
  "Karoline Leavitt", "John Fetterman", "Rudy Giuliani|giuliani", "Michael Bloomberg", "Zohran Mamdani|mamdani",
  "Ronald Reagan", "Abraham Lincoln", "John F Kennedy|john kennedy", "Martin Luther King|martin luther king jr|mlk",
  // ── UK & Europe ──
  "Keir Starmer|starmer", "Rishi Sunak|sunak", "Boris Johnson", "Liz Truss", "Theresa May", "David Cameron",
  "Tony Blair", "Margaret Thatcher", "Nigel Farage|farage", "Kemi Badenoch", "Winston Churchill",
  "Emmanuel Macron|macron", "Brigitte Macron", "Marine Le Pen", "Nicolas Sarkozy|sarkozy", "Francois Hollande",
  "Jordan Bardella", "Olaf Scholz", "Friedrich Merz", "Angela Merkel|merkel", "Giorgia Meloni|meloni",
  "Sergio Mattarella", "Silvio Berlusconi|berlusconi", "Pedro Sanchez", "Viktor Orban|orban",
  "Ursula von der Leyen", "Antonio Guterres", "Mark Rutte", "Christine Lagarde", "Donald Tusk", "Andrzej Duda",
  "Alexander Lukashenko|lukashenko", "Vladimir Putin|putin|pootin", "Dmitry Medvedev", "Sergey Lavrov",
  "Alexei Navalny|navalny", "Volodymyr Zelensky|zelensky|zelenskyy|zelenskiy", "Olena Zelenska",
  // ── Royals ──
  "King Charles|king charles iii|prince charles|charles iii", "Queen Camilla", "Queen Elizabeth|queen elizabeth ii",
  "Prince William", "Kate Middleton|catherine middleton|princess of wales|princess kate", "Prince Harry",
  "Meghan Markle|markle|duchess of sussex", "Prince George", "Princess Charlotte", "Prince Louis", "Prince Andrew",
  "Prince Philip", "Princess Diana|lady diana|diana spencer", "King Felipe|felipe vi", "Queen Letizia",
  "King Willem-Alexander", "Queen Maxima", "King Frederik", "Emperor Naruhito|naruhito", "King Abdullah",
  "Queen Rania",
  // ── Americas, Asia, Middle East, Africa, Oceania ──
  "Justin Trudeau|trudeau", "Mark Carney", "Pierre Poilievre", "Anthony Albanese", "Jacinda Ardern",
  "Christopher Luxon", "Xi Jinping|xi jin ping", "Li Qiang", "Mao Zedong|mao tse tung", "Narendra Modi|modi",
  "Rahul Gandhi", "Indira Gandhi", "Mahatma Gandhi|gandhi", "Amit Shah", "Yogi Adityanath", "Arvind Kejriwal",
  "Shigeru Ishiba", "Sanae Takaichi", "Fumio Kishida", "Shinzo Abe", "Lee Jae-myung", "Yoon Suk Yeol",
  "Kim Jong Un", "Kim Jong Il", "Kim Il Sung", "Kim Yo Jong", "Benjamin Netanyahu|netanyahu", "Isaac Herzog",
  "Mohammed bin Salman|muhammad bin salman", "Mohamed bin Zayed", "Recep Tayyip Erdogan|erdogan",
  "Ali Khamenei|khamenei", "Masoud Pezeshkian", "Bashar al-Assad|bashar assad|assad", "Ahmed al-Sharaa",
  "Mahmoud Abbas", "Abdel Fattah el-Sisi", "Tamim bin Hamad", "Lula da Silva|luiz inacio lula da silva",
  "Jair Bolsonaro|bolsonaro", "Javier Milei|milei", "Claudia Sheinbaum|sheinbaum",
  "Andres Manuel Lopez Obrador|lopez obrador|amlo", "Nicolas Maduro", "Gustavo Petro", "Nayib Bukele|bukele",
  "Gabriel Boric", "Fidel Castro", "Raul Castro", "Che Guevara", "Hugo Chavez", "Cyril Ramaphosa|ramaphosa",
  "Nelson Mandela|mandela", "Bola Tinubu", "William Ruto", "Paul Kagame", "Abiy Ahmed",
  "Prabowo Subianto|prabowo", "Joko Widodo|jokowi", "Ferdinand Marcos Jr|bongbong marcos",
  "Rodrigo Duterte|duterte", "Anwar Ibrahim", "Imran Khan", "Shehbaz Sharif", "Sheikh Hasina", "Muhammad Yunus",
  // ── Religious & activists ──
  "Pope Francis", "Pope Leo XIV|pope leo|robert prevost", "Pope Benedict", "Dalai Lama", "Greta Thunberg|thunberg",
  "Malala Yousafzai|malala",
  // ── Historical figures frequently misused ──
  "Adolf Hitler|hitler", "Joseph Stalin|stalin", "Benito Mussolini|mussolini", "Vladimir Lenin|lenin",
  "Osama bin Laden|bin laden", "Saddam Hussein", "Muammar Gaddafi|gaddafi|qaddafi|kadafi",
  // ── Business & tech ──
  "Mark Zuckerberg|zuckerberg|zuck", "Jeff Bezos|bezos", "Bill Gates", "Melinda French Gates|melinda gates",
  "Steve Jobs", "Tim Cook", "Sundar Pichai|pichai", "Satya Nadella|nadella", "Sam Altman", "Jensen Huang",
  "Larry Page", "Sergey Brin", "Larry Ellison", "Warren Buffett|buffett", "Jack Dorsey", "Jack Ma", "Peter Thiel",
  "Dario Amodei", "Demis Hassabis", "Lisa Su", "Michael Dell", "Marc Benioff", "Richard Branson", "Mark Cuban",
  "Sheryl Sandberg", "Mukesh Ambani|ambani", "Gautam Adani|adani", "Ratan Tata", "Bernard Arnault",
  "Shou Zi Chew", "Evan Spiegel", "Reed Hastings", "Andy Jassy", "Mira Murati", "Masayoshi Son",
  // ── Film & TV ──
  "Tom Cruise", "Brad Pitt", "Angelina Jolie", "Leonardo DiCaprio|dicaprio", "Johnny Depp", "Amber Heard",
  "Scarlett Johansson", "Jennifer Lawrence", "Jennifer Aniston", "Jennifer Lopez|jlo|j lo", "Margot Robbie",
  "Ryan Reynolds", "Ryan Gosling", "Blake Lively", "Dwayne Johnson|dwayne the rock johnson|dwayne the rock", "Will Smith",
  "Jada Pinkett Smith", "Denzel Washington", "Morgan Freeman", "Tom Hanks", "Robert Downey Jr|robert downey",
  "Chris Hemsworth", "Chris Evans", "Chris Pratt", "Keanu Reeves", "Emma Watson", "Emma Stone", "Natalie Portman",
  "Anne Hathaway", "Meryl Streep", "Nicole Kidman", "Julia Roberts", "Sandra Bullock", "Gal Gadot", "Zendaya",
  "Timothee Chalamet|chalamet", "Tom Holland", "Florence Pugh", "Sydney Sweeney", "Anya Taylor-Joy",
  "Jenna Ortega", "Millie Bobby Brown", "Pedro Pascal", "Henry Cavill", "Jason Momoa", "Vin Diesel", "Kevin Hart",
  "Samuel L Jackson|samuel jackson", "Robert De Niro|de niro", "Al Pacino", "Keira Knightley", "Kate Winslet",
  "Charlize Theron", "Salma Hayek", "Penelope Cruz", "Sofia Vergara", "Priyanka Chopra", "Deepika Padukone",
  "Shah Rukh Khan|srk", "Aishwarya Rai", "Amitabh Bachchan", "Salman Khan", "Ranveer Singh", "Alia Bhatt",
  "Katrina Kaif", "Jackie Chan", "Bruce Lee", "Benedict Cumberbatch", "Daniel Radcliffe", "Idris Elba",
  "Michael B Jordan", "Cillian Murphy", "Hugh Jackman", "Mark Wahlberg", "Matt Damon", "Ben Affleck",
  "George Clooney", "Jason Statham", "Arnold Schwarzenegger|schwarzenegger", "Sylvester Stallone|stallone",
  "Harrison Ford", "Megan Fox", "Halle Berry", "Viola Davis", "Lupita Nyong'o", "Dakota Johnson", "Austin Butler",
  "Jacob Elordi", "Paul Mescal", "Glen Powell", "Ana de Armas", "Jessica Alba", "Marilyn Monroe", "Audrey Hepburn",
  // ── TV hosts, creators, models ──
  "Kim Kardashian|kardashian", "Khloe Kardashian", "Kourtney Kardashian", "Kris Jenner", "Kylie Jenner",
  "Kendall Jenner", "Caitlyn Jenner", "Paris Hilton", "Oprah Winfrey|oprah", "Ellen DeGeneres", "Jimmy Fallon",
  "Jimmy Kimmel", "Stephen Colbert", "Joe Rogan", "MrBeast|mr beast|jimmy donaldson", "PewDiePie",
  "Charli D'Amelio", "Addison Rae", "Khaby Lame", "Andrew Tate", "Tucker Carlson", "Gordon Ramsay",
  "Martha Stewart", "Simon Cowell", "Anderson Cooper", "David Attenborough", "Steve Harvey", "KSI", "IShowSpeed",
  "Kai Cenat", "Emma Chamberlain", "Bella Hadid", "Gigi Hadid", "Kaia Gerber", "Cara Delevingne", "Naomi Campbell",
  "Kate Moss", "Heidi Klum", "Tyra Banks", "Gisele Bundchen", "Adriana Lima", "Emily Ratajkowski", "Hailey Bieber",
  "Miranda Kerr", "Selena Gomez",
  // ── Music ──
  "Taylor Swift|tay tay|swifty", "Beyonce|beyonce knowles|queen bey", "Rihanna", "Lady Gaga", "Ariana Grande", "Billie Eilish|eilish",
  "Dua Lipa", "Justin Bieber|bieber", "Ed Sheeran|sheeran", "Harry Styles", "Drake", "Kanye West|kanye",
  "Jay-Z|jayz", "Eminem", "Snoop Dogg", "Travis Scott", "Bad Bunny", "Shakira", "Adele", "Katy Perry",
  "Miley Cyrus", "Nicki Minaj", "Cardi B", "Doja Cat", "Olivia Rodrigo", "Sabrina Carpenter", "Chappell Roan",
  "The Weeknd|weeknd", "Bruno Mars", "Post Malone", "Kendrick Lamar", "SZA", "Lizzo", "Madonna", "Britney Spears",
  "Christina Aguilera", "Mariah Carey", "Whitney Houston", "Michael Jackson", "Elvis Presley|elvis",
  "Freddie Mercury", "John Lennon", "Paul McCartney", "Mick Jagger", "Bob Dylan", "Bob Marley", "Elton John",
  "Bono", "Bruce Springsteen", "Dolly Parton", "Celine Dion", "Lana Del Rey", "Charli XCX", "Karol G",
  "J Balvin", "Peso Pluma", "Jungkook|jung kook|jeon jungkook", "Blackpink", "Ice Spice", "Megan Thee Stallion",
  "Lil Nas X", "Lil Wayne", "50 Cent", "Pharrell Williams", "Shawn Mendes", "Camila Cabello", "Demi Lovato",
  "Zayn Malik", "Kylie Minogue", "Ozzy Osbourne", "Kurt Cobain", "Tupac Shakur|tupac|2pac", "Frank Sinatra",
  "Sean Combs|diddy|p diddy|puff daddy", "Chris Brown",
  // ── Sport ──
  "Cristiano Ronaldo|ronaldo", "Lionel Messi|messi", "Neymar", "Kylian Mbappe|mbappe", "Erling Haaland|haaland",
  "Mohamed Salah|mo salah", "David Beckham|beckham", "Victoria Beckham", "Zlatan Ibrahimovic|zlatan", "Pele",
  "Diego Maradona|maradona", "Ronaldinho", "Luka Modric", "Harry Kane", "Jude Bellingham",
  "Vinicius Junior|vinicius jr", "Lamine Yamal", "LeBron James|lebron", "Michael Jordan", "Kobe Bryant",
  "Stephen Curry|steph curry", "Kevin Durant", "Shaquille O'Neal|shaq", "Giannis Antetokounmpo|antetokounmpo",
  "Luka Doncic|doncic", "Victor Wembanyama|wembanyama", "Nikola Jokic|jokic", "Serena Williams", "Venus Williams",
  "Roger Federer|federer", "Rafael Nadal|nadal", "Novak Djokovic|djokovic", "Carlos Alcaraz|alcaraz",
  "Jannik Sinner", "Naomi Osaka", "Coco Gauff", "Emma Raducanu|raducanu", "Maria Sharapova|sharapova",
  "Usain Bolt", "Michael Phelps", "Simone Biles", "Tom Brady", "Patrick Mahomes|mahomes", "Travis Kelce|kelce",
  "Aaron Rodgers", "Tiger Woods", "Rory McIlroy", "Conor McGregor", "Khabib Nurmagomedov|khabib", "Mike Tyson",
  "Floyd Mayweather|mayweather", "Muhammad Ali", "Lewis Hamilton", "Max Verstappen|verstappen",
  "Michael Schumacher", "Ayrton Senna", "Shohei Ohtani|ohtani", "Virat Kohli|kohli", "Sachin Tendulkar|tendulkar",
  "MS Dhoni|dhoni", "Wayne Rooney", "Megan Rapinoe", "Alex Morgan", "Caitlin Clark", "Ronda Rousey", "Jake Paul",
  "Logan Paul", "Eliud Kipchoge",
] as const;

export interface PublicFigure {
  name: string;
  aliases: readonly string[];
}

export const PUBLIC_FIGURES: readonly PublicFigure[] = FIGURES.map((entry) => {
  const [name, ...aliases] = entry.split("|");
  return { name: name!, aliases };
});

const NAME_BY_KEY = new Map<string, string>();
for (const figure of PUBLIC_FIGURES) {
  for (const label of [figure.name, ...figure.aliases]) NAME_BY_KEY.set(matchKey(label), figure.name);
}

let compiled: ReturnType<typeof compileTerms> | null = null;
function compiledNames() {
  compiled ??= compileTerms(PUBLIC_FIGURES.flatMap((f) => [f.name, ...f.aliases]));
  return compiled;
}

/**
 * Canonical names of the public figures mentioned in `text` (evasion-robust, see normalize.ts).
 * `exceptions` are known-safe phrases blanked out first (e.g. "musk perfume").
 */
export function findPublicFigures(text: string, exceptions: readonly RegExp[] = []): string[] {
  const matches = findTerms(buildVariants(text, exceptions), compiledNames());
  const names = new Set<string>();
  for (const m of matches) {
    const key = matchKey(m);
    names.add(NAME_BY_KEY.get(key) ?? NAME_BY_KEY.get(key.replace(/s$/, "")) ?? m);
  }
  return [...names];
}
