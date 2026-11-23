/**
 * ECHO — Curated local comics starter collection.
 *
 * A hand-picked set of widely recognised comics works — comic strips,
 * comic series, graphic novels and one landmark individual issue — spanning
 * 1905–2012, twelve countries of origin (US, Belgium, France, Argentina,
 * Spain, Brazil, UK, Italy, Finland, Australia, Iran, France/France) and
 * every major format, so the comics experience stays useful when live
 * providers are disabled, unconfigured or offline.
 *
 * Editorial rules (same contract as data/curatedMovies.ts):
 *  - Factual fields (title, year, writer/artist, publisher or serialization
 *    venue, format subtype, settled volume/issue counts) are widely-known
 *    public information.
 *  - Synopses (EN + AR) are ORIGINAL one/two-liners written for ECHO.
 *  - NO ratings, popularity figures, sales numbers, awards or vote counts.
 *  - A comic SERIES is its own work — distinct from its individual issues,
 *    collected editions and screen adaptations (curatedLinks.ts), never
 *    merged. The `subtype` field carries the distinction:
 *      comic-strip | comic-series | comic-issue | graphic-novel |
 *      collected-edition
 *  - No artwork is bundled — the safe generated placeholder system is used.
 *
 * These records ship under the "echo-demo" registry entry (ECHO's approved
 * local catalogue) and are labelled as ECHO-curated sample content.
 */

import type { DemoSeed } from "./demoCatalogue";

const EN = ["English"];
const FR = ["French"];
const ES = ["Spanish"];
const IT = ["Italian"];
const FI = ["Finnish"];

const USA = ["USA"];
const UK = ["UK"];
const BEL = ["Belgium"];
const FRA = ["France"];
const ARG = ["Argentina"];
const ESP = ["Spain"];
const BRA = ["Brazil"];
const ITA = ["Italy"];
const FIN = ["Finland"];
const AUS = ["Australia"];
const IRN_FR = ["France", "Iran"];
const UK_US = ["UK", "USA"];

const CURATED_ATTRIBUTION = "ECHO curated sample collection — original descriptions";

/** Shared print-media fields on the DemoSeed (v3). */
interface ComicsSeed extends DemoSeed {
  /** comic-strip | comic-series | comic-issue | graphic-novel | collected-edition */
  subtype?: string;
  publicationStatus?: "ongoing" | "completed" | "hiatus" | "cancelled" | "upcoming";
  volumeCount?: number;
  issueCount?: number;
  /** issue number for an individual comic-issue record */
  issueNumber?: number;
  endYear?: number;
}

export const CURATED_COMICS: ComicsSeed[] = [
  // ---------------------------------------------------------- comic strips
  {
    id: "cc-little-nemo",
    mediaType: "comics",
    format: "book",
    subtype: "comic-strip",
    title: "Little Nemo in Slumberland",
    titleAr: "نيمو الصغير في أرض الأحلام",
    year: 1905,
    endYear: 1926,
    publicationStatus: "completed",
    genres: ["fantasy", "adventure", "family"],
    tags: ["whimsical", "beautiful", "surreal", "wordless"],
    creators: ["Winsor McCay"],
    studios: ["New York Herald"],
    languages: EN,
    countries: USA,
    synopsis:
      "A small boy falls asleep every Sunday and wakes in a Slumberland of walking beds and marble skies, waking again just as the best part begins.",
    synopsisAr:
      "صبي صغير ينام كل أحد ليستيقظ في أرض أحلام من أسرّة تمشي وسماء رخامية، ثم يستيقظ في عالمه متى بدأ الجزء الأجمل.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-krazy-kat",
    mediaType: "comics",
    format: "book",
    subtype: "comic-strip",
    title: "Krazy Kat",
    titleAr: "القط كريزي",
    year: 1913,
    endYear: 1944,
    publicationStatus: "completed",
    genres: ["comedy", "romance"],
    tags: ["surreal", "absurdist", "whimsical", "beautiful"],
    creators: ["George Herriman"],
    studios: ["King Features Syndicate"],
    languages: EN,
    countries: USA,
    synopsis:
      "A cat loves a mouse, the mouse throws bricks at the cat, and a dog polices the whole impossible triangle across a moonlit desert county.",
    synopsisAr:
      "قط يحب فأراً، والفأر يقذف القط بالطوب، وكلب يراقب هذا المثلث المستحيل في مقاطعة صحراوية يضيئها القمر.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-peanuts",
    mediaType: "comics",
    format: "book",
    subtype: "comic-strip",
    title: "Peanuts",
    titleAr: "بيتس",
    originalTitle: "Peanuts",
    year: 1950,
    endYear: 2000,
    publicationStatus: "completed",
    genres: ["comedy", "slice-of-life", "family"],
    tags: ["melancholic", "childhood", "philosophical", "emotional"],
    creators: ["Charles M. Schulz"],
    studios: ["United Feature Syndicate"],
    languages: EN,
    countries: USA,
    synopsis:
      "For half a century a round-headed kid fails to fly a kite, field a baseball or understand the little red-haired girl, and says everything worth saying about it.",
    synopsisAr:
      "لنصف قرن يفشل طفل مستدير الرأس في إطلاق طائرته الورقية وإيقاف كرات البيسبول وفهم الفاة ذات الشعر الأحمر، ويقول في ذلك كل ما يستحق القول.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-moomin",
    mediaType: "comics",
    format: "book",
    subtype: "comic-strip",
    title: "Moomin",
    titleAr: "مومن",
    originalTitle: "Muumi (Moomin)",
    year: 1954,
    endYear: 1975,
    publicationStatus: "completed",
    genres: ["slice-of-life", "fantasy", "comedy", "family"],
    tags: ["whimsical", "family-bonds", "melancholic", "hopeful"],
    creators: ["Tove Jansson"],
    studios: ["London Evening News syndication"],
    languages: EN,
    countries: FIN,
    synopsis:
      "A family of round white trolls shares a valley with too many strange guests, and every small polite catastrophe says something kind about being alive.",
    synopsisAr:
      "عائلة من التروللات البيضاء المستديرة تتشارك وادياً مع ضيوف غريبين أكثر من اللازم، وكل كارثة مهذبة صغيرة تقول شيئاً لطيفاً عن كوننا أحياء.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-mafalda",
    mediaType: "comics",
    format: "book",
    subtype: "comic-strip",
    title: "Mafalda",
    titleAr: "مافالدا",
    year: 1964,
    endYear: 1973,
    publicationStatus: "completed",
    genres: ["comedy", "slice-of-life"],
    tags: ["political", "satire", "childhood", "thought-provoking"],
    creators: ["Quino (Joaquín Salvador Lavado)"],
    languages: ES,
    countries: ARG,
    synopsis:
      "A six-year-old who hates soup and loves humanity's future interrogates her family about war, homework and the state of the world, straight-faced.",
    synopsisAr:
      "طفلة في السادسة تكره الحساء وتحب مستقبل البشرية تستجوب عائلتها عن الحرب والواجبات المدرسية وحالة العالم بوجه لا يبتسم.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-calvin-hobbes",
    mediaType: "comics",
    format: "book",
    subtype: "comic-strip",
    title: "Calvin and Hobbes",
    titleAr: "كالفن وهوبز",
    year: 1985,
    endYear: 1995,
    publicationStatus: "completed",
    genres: ["comedy", "slice-of-life", "adventure"],
    tags: ["childhood", "whimsical", "philosophical", "high-energy"],
    creators: ["Bill Watterson"],
    languages: EN,
    countries: USA,
    synopsis:
      "A six-year-old philosopher and his tiger argue about existence between sled rides and snow-art manifestos, for exactly as long as childhood lasts.",
    synopsisAr:
      "فيلسوف في السادسة ونمره يجادلان عن الوجود بين سباقات المزلج وبيانات فن الثلج، ولمدة تقارب مدة الطفولة بالضبط.",
    attribution: CURATED_ATTRIBUTION,
  },
  // -------------------------------------------------------- comics series
  {
    id: "cc-tintin",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "The Adventures of Tintin",
    titleAr: "مغامرات تان تان",
    originalTitle: "Les Aventures de Tintin",
    year: 1929,
    endYear: 1976,
    publicationStatus: "completed",
    volumeCount: 24,
    genres: ["adventure", "mystery", "comedy"],
    tags: ["epic", "high-energy", "friendship", "nostalgia"],
    creators: ["Hergé (Georges Remi)"],
    studios: ["Casterman"],
    languages: FR,
    countries: BEL,
    synopsis:
      "A young reporter with a quiff and a white dog files stories from the moon, Tibet and the bottom of the sea, mostly by refusing to come home.",
    synopsisAr:
      "صحفي شاب بخصلة شعر وكلب أبيض يرسل تقاريره من القمر والتبت وقاع البحر، غالباً لأنه يرفض ببساطة أن يعود إلى بيته.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-lucky-luke",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "Lucky Luke",
    titleAr: "لاكي لوك",
    year: 1946,
    publicationStatus: "ongoing",
    genres: ["western", "comedy", "adventure"],
    tags: ["high-energy", "comedic", "satire"],
    creators: ["Morris (Maurice De Bevere)", "René Goscinny"],
    studios: ["Spirou (Dupuis)"],
    languages: FR,
    countries: BEL,
    synopsis:
      "A lonesome cowboy who shoots faster than his own shadow tames the wildest frontier in gags, with a horse that does the thinking.",
    synopsisAr:
      "راعي بقر وحيد يطلق النار أسرع من ظلّه يروّض أعتى حدود الغرب بمداعبة، ومعه حصان يتكفل بالتفكير.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-asterix",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "Asterix",
    titleAr: "أستريكس",
    originalTitle: "Astérix",
    year: 1959,
    publicationStatus: "ongoing",
    genres: ["comedy", "adventure", "historical"],
    tags: ["satire", "underdog", "friendship", "high-energy"],
    creators: ["René Goscinny", "Albert Uderzo"],
    studios: ["Pilote (Dargaud)"],
    languages: FR,
    countries: FRA,
    synopsis:
      "One small Gallic village holds out against the entire Roman Empire on a magic potion and a bard everyone ducks, and history never stood a chance.",
    synopsisAr:
      "قرية غالية صغيرة تصمد أمام الإمبراطورية الرومانية كلها بجرعة سحرية وشاعر يهرب منه الجميع، ولم يكن للتاريخ أي فرصة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-amazing-spider-man",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "The Amazing Spider-Man",
    titleAr: "الرجل العنكبوت المذهل",
    year: 1963,
    publicationStatus: "ongoing",
    genres: ["superhero", "action", "drama", "romance"],
    tags: ["underdog", "identity", "class-conflict", "iconic-villain"],
    creators: ["Stan Lee", "Steve Ditko"],
    studios: ["Marvel Comics"],
    languages: EN,
    countries: USA,
    synopsis:
      "A broke New York teenager with wall-crawling powers learns that being able to catch crooks doesn't stop the rent or the guilt.",
    synopsisAr:
      "مراهق نيويورك عاجز مادياً يحصل على قدرة تسلق الجدران، فيتعلم أن الإمساك بالمجرمين لا يدفع الإيجار ولا يمحو الذنب.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-x-men",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "X-Men",
    titleAr: "الرجال إكس",
    year: 1963,
    publicationStatus: "ongoing",
    genres: ["superhero", "sci-fi", "action", "drama"],
    tags: ["class-conflict", "identity", "found-family", "political"],
    creators: ["Stan Lee", "Jack Kirby"],
    studios: ["Marvel Comics"],
    languages: EN,
    countries: USA,
    synopsis:
      "Born different in a world that fears them, a school of mutants learns to use the powers that guarantee they'll never be left alone.",
    synopsisAr:
      "مولودون مختلفين في عالم يخافهم، يتعلّم طلاب مدرسة المتحوّلين استخدام القوى التي تضمن ألا يُتركوا في سلام أبداً.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-corto-maltese",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "Corto Maltese",
    titleAr: "كورتو مالتيزي",
    year: 1967,
    endYear: 1992,
    publicationStatus: "completed",
    genres: ["adventure", "historical", "drama"],
    tags: ["morality", "epic", "melancholic", "gritty"],
    creators: ["Hugo Pratt"],
    studios: ["Sgt. Kirk magazine (Pioniere)"],
    languages: IT,
    countries: ITA,
    synopsis:
      "A sailor with an anchor tattooed on his forearm drifts through the early 20th century's revolutions, choosing sides with a shrug and his own quiet code.",
    synopsisAr:
      "بحّار يحمل وشم مرساة على ساعده يجرف قرنَه العشرين المبكر وثوراته، فينحاز بلا مبالاة ظاهرة وبقانونه الصامت الخاص.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-mortadelo-filemon",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "Mortadelo y Filemón",
    titleAr: "مورتاديلو وفيليمون",
    year: 1958,
    publicationStatus: "ongoing",
    genres: ["comedy", "action"],
    tags: ["absurdist", "comedic", "high-energy", "workplace"],
    creators: ["Francisco Ibáñez"],
    studios: ["Pulgarcito (Editorial Bruguera)"],
    languages: ES,
    countries: ESP,
    synopsis:
      "Two disaster spies for a secret agency called T.I.A. take on missions with costumes and contraptions, and everything always collapses exactly on schedule.",
    synopsisAr:
      "جاسوسان كارثيان لوكالة سرية تُدعى T.I.A. ينفذان المهام بالأزياء والأدوات الغريبة، وينهار كل شيء في وقته المحدد بالضبط.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-tex-willer",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "Tex Willer",
    titleAr: "تكس ويلر",
    year: 1948,
    publicationStatus: "ongoing",
    genres: ["western", "adventure", "action"],
    tags: ["epic", "friendship", "morality"],
    creators: ["Gian Luigi Bonelli", "Aurelio Galleppini"],
    studios: ["Sergio Bonelli Editore"],
    languages: IT,
    countries: ITA,
    synopsis:
      "A Texas ranger raised among the Navajo rides the frontier with his son and his friends, in Italy's longest-running western and one of its longest comics.",
    synopsisAr:
      "حارس تكساس نشأ بين شعب النافاهو يجوب الحدود مع ابنه وأصدقائه، في أطول سلسلة ويسترن إيطالية وأحد أطول كوميكسيه.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-judge-dredd",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "Judge Dredd",
    titleAr: "القاضي دريد",
    year: 1977,
    publicationStatus: "ongoing",
    genres: ["sci-fi", "action", "drama"],
    tags: ["dystopia", "dark-comedy", "political", "gritty"],
    creators: ["John Wagner", "Carlos Ezquerra"],
    studios: ["2000 AD"],
    languages: EN,
    countries: UK,
    synopsis:
      "In the mega-city remains of America one judge is police, jury and executioner, and the strip never blinks at what that sentence means.",
    synopsisAr:
      "في بقايا أمريكا المدينية الكبرى، قاضٍ واحد هو الشرطة والمحكمة والجلاد، ولا ترمش السلسلة لحظة أمام معنى هذه الجملة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-the-incal",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "The Incal",
    titleAr: "الإنكال",
    originalTitle: "L'Incal",
    year: 1980,
    endYear: 1988,
    publicationStatus: "completed",
    volumeCount: 6,
    genres: ["sci-fi", "fantasy", "adventure"],
    tags: ["surreal", "epic", "mind-bending", "beautiful"],
    creators: ["Alejandro Jodorowsky", "Moebius (Jean Giraud)"],
    studios: ["Métal Hurlant (Les Humanoïdes Associés)"],
    languages: FR,
    countries: FRA,
    synopsis:
      "A disgraced detective inherits the most powerful object in the galaxy, and a space opera of tarot, betrayal and resurrection carries him toward being a better man.",
    synopsisAr:
      "محقق مطرود من الخدمة يرث أقوى جسم في المجرة، فتحمله أوبرا فضائية من التاروت والخيانة والبعث نحو أن يصبح رجلاً أفضل.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-watchmen",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "Watchmen",
    titleAr: "المراقبون",
    year: 1986,
    endYear: 1987,
    publicationStatus: "completed",
    issueCount: 12,
    genres: ["superhero", "drama", "thriller", "mystery"],
    tags: ["political", "thought-provoking", "dark", "unreliable-narrator"],
    creators: ["Alan Moore", "Dave Gibbons"],
    studios: ["DC Comics"],
    languages: EN,
    countries: UK_US,
    synopsis:
      "Cold-war America retired its masked heroes years ago, and the murder of one of them pulls a bandaged vigilante back out to count the minutes to midnight.",
    synopsisAr:
      "أمريكا الحرب الباردة أحالت أبطالها المقنّعين إلى التقاعد منذ سنوات، فمقتل أحدهم يخرج حارساً معنّداً من ظلّه ليعدّ الدقائق حتى منتصف الليل.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-sandman",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "The Sandman",
    titleAr: "الرجل الرملي",
    year: 1989,
    endYear: 1996,
    publicationStatus: "completed",
    volumeCount: 10,
    genres: ["dark-fantasy", "horror", "drama", "fantasy"],
    tags: ["surreal", "melancholic", "epic", "thought-provoking"],
    creators: ["Neil Gaiman"],
    studios: ["DC Comics / Vertigo"],
    languages: EN,
    countries: UK_US,
    synopsis:
      "The lord of dreams escapes a century of captivity and rebuilds his kingdom through stories about stories, and about what it costs to change.",
    synopsisAr:
      "سيد الأحلام يهرب من قرن في الأسر ويعيد بناء مملكته عبر حكايات عن الحكايات نفسها، وعن ثمن أن تتغيّر.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-bone",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "Bone",
    titleAr: "بون",
    year: 1991,
    endYear: 2004,
    publicationStatus: "completed",
    volumeCount: 9,
    genres: ["fantasy", "adventure", "comedy", "drama"],
    tags: ["epic", "whimsical", "found-family", "hopeful"],
    creators: ["Jeff Smith"],
    studios: ["Cartoon Books"],
    languages: EN,
    countries: USA,
    synopsis:
      "Three cartoon cousins run out of the desert into a valley of talking bugs and bone-throne legends, and a kids' comic grows into a myth.",
    synopsisAr:
      "ثلاثة أبناء عم كرتونيين يخرجون من الصحراء إلى وادٍ من الحشرات الناطقة وأساطير العروش العظمية، فينمو كومكس الأطفال ليصبح ملحمة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-the-walking-dead",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "The Walking Dead",
    titleAr: "الموتى السائرون",
    year: 2003,
    endYear: 2019,
    publicationStatus: "completed",
    volumeCount: 32,
    issueCount: 193,
    genres: ["horror", "drama"],
    tags: ["post-apocalyptic", "survival", "tense", "gritty"],
    creators: ["Robert Kirkman", "Tony Moore", "Charlie Adlard"],
    studios: ["Image Comics"],
    languages: EN,
    countries: USA,
    synopsis:
      "A Kentucky constable wakes into a zombie apocalypse and spends sixteen years of black-and-white issues learning the living are the real outbreak.",
    synopsisAr:
      "شرطي من كنتاكي يستيقظ على وباء الزومبي، ويقضي ستة عشر عاماً من الأعداد بالأبيض والأسود يتعلم أن الأحياء هم الوباء الحقيقي.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-saga",
    mediaType: "comics",
    format: "book",
    subtype: "comic-series",
    title: "Saga",
    titleAr: "ساغا",
    year: 2012,
    publicationStatus: "ongoing",
    genres: ["sci-fi", "fantasy", "romance", "drama"],
    tags: ["war-aftermath", "family-bonds", "epic", "emotional"],
    creators: ["Brian K. Vaughan", "Fiona Staples"],
    studios: ["Image Comics"],
    languages: EN,
    countries: USA,
    synopsis:
      "A soldier and a prisoner from two warring species have a baby, narrate her life, and run from everyone with an interest in ending it.",
    synopsisAr:
      "جندي وأسيرة من نوعين متحاربين ينجبان طفلة وتروي حياتها، ثم يهربان من كل من له مصلحة في إنهائها.",
    attribution: CURATED_ATTRIBUTION,
  },
  // ----------------------------------------------- a landmark single issue
  {
    id: "cc-amazing-fantasy-15",
    mediaType: "comics",
    format: "book",
    subtype: "comic-issue",
    title: "Amazing Fantasy #15",
    titleAr: "أمازينغ فانتازي رقم 15",
    year: 1962,
    publicationStatus: "completed",
    issueNumber: 15,
    genres: ["superhero", "action", "drama"],
    tags: ["underdog", "identity", "tragic", "nostalgia"],
    creators: ["Stan Lee", "Steve Ditko"],
    studios: ["Marvel Comics"],
    languages: EN,
    countries: USA,
    synopsis:
      "The final issue of a dying anthology introduces a teenage hero who loses his uncle to a burglar he chose not to stop — comics' most famous single issue.",
    synopsisAr:
      "العدد الأخير من سلسلة أنثولوجيا تحتضر يقدّم بطلاً مراهقاً يفقد عمه على يد لص قرر ألا يوقفه — أشهر عدد منفرد في تاريخ الكومكس.",
    attribution: CURATED_ATTRIBUTION,
  },
  // ------------------------------------------------------ graphic novels
  {
    id: "cc-maus",
    mediaType: "comics",
    format: "book",
    subtype: "graphic-novel",
    title: "Maus",
    titleAr: "ماوس",
    year: 1980,
    endYear: 1991,
    publicationStatus: "completed",
    volumeCount: 2,
    genres: ["biography", "historical", "drama"],
    tags: ["memory", "war-aftermath", "family-bonds", "thought-provoking"],
    creators: ["Art Spiegelman"],
    languages: EN,
    countries: USA,
    synopsis:
      "A cartoonist interviews his Holocaust-survivor father and draws Germans as cats and Jews as mice, and the frame story is as merciless as the history.",
    synopsisAr:
      "رسام كاريكاتير يُجري مقابلات مع والده الناجي من الهولوكوست فيرسم الألمان قططاً واليهود فئراناً، وتبقى حكاية الابن نفسها قاسية كالتاريخ ذاته.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-persepolis",
    mediaType: "comics",
    format: "book",
    subtype: "graphic-novel",
    title: "Persepolis",
    titleAr: "برسبوليس",
    originalTitle: "Persépolis",
    year: 2000,
    endYear: 2003,
    publicationStatus: "completed",
    volumeCount: 2,
    genres: ["biography", "historical", "drama"],
    tags: ["coming-of-age", "political", "memory", "emotional"],
    creators: ["Marjane Satrapi"],
    studios: ["L'Association"],
    languages: FR,
    countries: IRN_FR,
    synopsis:
      "In stark black-and-white panels a girl grows up through revolution, war, exile and return, never letting the reader look away politely.",
    synopsisAr:
      "برسوم قاسية بالأبيض والأسود تكبر فتاة عبر الثورة والحرب والمنفى والعودة، ولا تدع القارئ يدير وجهه بأدب.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-the-arrival",
    mediaType: "comics",
    format: "book",
    subtype: "graphic-novel",
    title: "The Arrival",
    titleAr: "الوصول",
    year: 2006,
    publicationStatus: "completed",
    genres: ["drama", "slice-of-life"],
    tags: ["wordless", "beautiful", "melancholic", "hopeful"],
    creators: ["Shaun Tan"],
    countries: AUS,
    languages: EN,
    synopsis:
      "A man leaves his family for a country of impossible animals and unreadable alphabets, told entirely in pictures like a found family photo album.",
    synopsisAr:
      "رجل يترك عائلته نحو بلدٍ من الحيوانات المستحيلة والحروف غير المقروءة، تروى الحكاية كلها بالصور كألبوم صور عائلي عتيق.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-blankets",
    mediaType: "comics",
    format: "book",
    subtype: "graphic-novel",
    title: "Blankets",
    titleAr: "أغطية",
    year: 2003,
    publicationStatus: "completed",
    genres: ["biography", "romance", "drama", "family"],
    tags: ["coming-of-age", "emotional", "family-bonds", "grief"],
    creators: ["Craig Thompson"],
    studios: ["Top Shelf Productions"],
    languages: EN,
    countries: USA,
    synopsis:
      "A Wisconsin winter, a first love, a fundamentalist childhood and the snowdrift-sized blanket his grandmother made — one long graphic memory of both.",
    synopsisAr:
      "شتاء ويسكونسين، وحب أول، وطفولة أصولية، وغطاء صوف بحجم انجراف الثلج صنعته جدته — ذاكرة مرسومة طويلة لهما معاً.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-fun-home",
    mediaType: "comics",
    format: "book",
    subtype: "graphic-novel",
    title: "Fun Home",
    titleAr: "البيت المرح",
    year: 2006,
    publicationStatus: "completed",
    genres: ["biography", "drama"],
    tags: ["memory", "family-bonds", "coming-of-age", "thought-provoking"],
    creators: ["Alison Bechdel"],
    studios: ["Houghton Mifflin"],
    languages: EN,
    countries: USA,
    synopsis:
      "A cartoonist unpacks her father's closed-casket life as a small-town funeral director and closeted man, using literature as the family's shared language.",
    synopsisAr:
      "رسامة تُخرج من قبر والدها المغلق حياته كمدير جنازات في بلدة صغيرة ورجل لم يعلن نفسه، مستعينة بالأدب كلغة مشتركة للعائلة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cc-daytripper",
    mediaType: "comics",
    format: "book",
    subtype: "collected-edition",
    title: "Daytripper",
    titleAr: "متسكّع النهار",
    originalTitle: "Daytripper",
    year: 2010,
    publicationStatus: "completed",
    genres: ["drama", "supernatural"],
    tags: ["philosophical", "melancholic", "thought-provoking", "beautiful"],
    creators: ["Fábio Moon", "Gabriel Bá"],
    studios: ["DC Vertigo"],
    languages: EN,
    countries: BRA,
    synopsis:
      "A Brazilian obituary writer keeps dying at the end of each chapter, and every death asks what a day would need to be a life.",
    synopsisAr:
      "كاتب نعي برازيلي يظل يموت في نهاية كل فصل، وكل موت يسأل: ماذا يحتاج اليوم الواحد ليكون حياة كاملة.",
    attribution: CURATED_ATTRIBUTION,
  },
];
