/**
 * ECHO — Curated local book starter collection (Phase 3).
 *
 * A hand-picked set of widely recognised literary classics and influential
 * modern works, spread across four centuries (1600s–2010s), countries and
 * languages — including a strong Arabic-literature presence for the app's
 * Arabic interface — so the book experience stays useful when Open Library
 * is disabled, failing or the device is offline.
 *
 * Editorial rules (docs/DATA_PROVIDER_COMPLIANCE.md, same as Phase 2):
 *  - Factual fields (title, author, year, original title, language,
 *    country, genre) are widely-known public information.
 *  - Synopses (EN + AR) are ORIGINAL one/two-liners written for ECHO —
 *    never copied from publisher blurbs, reviews or any other catalogue.
 *  - No copyrighted cover art, jacket copy or book text is reproduced;
 *    the safe generated placeholder system is used.
 *  - NO ratings, sales figures, bestseller claims, awards or popularity
 *    rankings are stored: fields ECHO cannot verify are simply omitted.
 *  - Authors go to `creators` (matching the Open Library adapter mapping).
 *
 * These records ship under the "echo-demo" registry entry (ECHO's approved
 * local catalogue) and are labelled as ECHO-curated sample content in the
 * UI. They are a curated starter collection, NOT a book database.
 */

import type { DemoSeed } from "./demoCatalogue";

const EN = ["English"];
const ES = ["Spanish"];
const FR = ["French"];
const DE = ["German"];
const RU = ["Russian"];
const AR = ["Arabic"];
const NL = ["Dutch"];
const JA = ["Japanese"];
const ZH = ["Chinese"];
const IT = ["Italian"];

const ESP = ["Spain"];
const GBR = ["UK"];
const USA = ["USA"];
const FRA = ["France"];
const RUS = ["Russia"];
const AUH = ["Austria-Hungary"];
const IRL = ["Ireland"];
const LBN = ["Lebanon"];
const EGY = ["Egypt"];
const NLD = ["Netherlands"];
const NGA = ["Nigeria"];
const SDN = ["Sudan"];
const COL = ["Colombia"];
const IND = ["India"];
const CAN = ["Canada"];
const JPN = ["Japan"];
const CHN = ["China"];
const ITA = ["Italy"];

const CURATED_ATTRIBUTION = "ECHO curated sample collection — original descriptions";

const POL = ["Poland"];

/** Shared print-media fields on the DemoSeed (v3). */
interface BookSeed extends DemoSeed {
  subtype?: string;
  volumeCount?: number;
  endYear?: number;
  publicationStatus?: "ongoing" | "completed" | "hiatus" | "cancelled" | "upcoming";
}

export const CURATED_BOOKS: BookSeed[] = [
  // --------------------------------------------------- 17th–19th century
  {
    id: "cb-don-quixote",
    mediaType: "book",
    format: "book",
    title: "Don Quixote",
    titleAr: "دون كيخوته",
    originalTitle: "El ingenioso hidalgo don Quijote de la Mancha",
    year: 1605,
    genres: ["adventure", "classics", "humor"],
    tags: ["satire", "obsession", "tragic"],
    creators: ["Miguel de Cervantes"],
    languages: ES,
    countries: ESP,
    synopsis:
      "An aging gentleman, addled by chivalric romances, rides out as a knight-errant with a farmer as his squire, mistaking windmills for giants and inns for castles.",
    synopsisAr:
      "نبيّل مسنّ اختلّ عقله من كثرة قراءة أخبار الفروسية، يخرج فارساً جوّالاً بصحبة مزارع سائر، يحسب الطواحين عمالقة والخانات قلاعاً.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-pride-prejudice",
    mediaType: "book",
    format: "book",
    title: "Pride and Prejudice",
    titleAr: "كبرياء وهوى",
    year: 1813,
    genres: ["romance", "classics", "drama"],
    tags: ["class-conflict", "slow-burn", "family-bonds"],
    creators: ["Jane Austen"],
    languages: EN,
    countries: GBR,
    synopsis:
      "In rural Regency England, the sharp-witted Elizabeth Bennet spars with the proud Mr Darcy while marriage, money and reputation decide her sisters' fates.",
    synopsisAr:
      "في إنجلترا الريفية زمن الوصاية على العرش، تتبارز إليزابيث بينيت الذكية مع السيد دارسي المتعالي، بينما يقرر الزواج والمال والسمعة مصائر أخواتها.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-frankenstein",
    mediaType: "book",
    format: "book",
    title: "Frankenstein",
    titleAr: "فرانكنشتاين",
    year: 1818,
    genres: ["sci-fi", "horror", "classics"],
    tags: ["morality", "obsession", "dark", "thought-provoking"],
    creators: ["Mary Shelley"],
    languages: EN,
    countries: GBR,
    synopsis:
      "A young scientist assembles a living creature from dead matter, then abandons it — and the creature's search for answers becomes a vendetta against its maker.",
    synopsisAr:
      "عالِم شاب يركّب كائناً حياً من مادة ميتة ثم يتخلى عنه، فتتحول رحلة الكائن بحثاً عن إجابات إلى ثأر طويل من صانعه.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-count-monte-cristo",
    mediaType: "book",
    format: "book",
    title: "The Count of Monte Cristo",
    titleAr: "الكونت دي مونت كريستو",
    originalTitle: "Le Comte de Monte-Cristo",
    year: 1844,
    genres: ["adventure", "classics", "drama"],
    tags: ["revenge", "betrayal", "transformation", "prison"],
    creators: ["Alexandre Dumas"],
    languages: FR,
    countries: FRA,
    synopsis:
      "A betrayed sailor spends fourteen years in an island prison, escapes with a secret fortune, and returns as an untouchable count to reward his friends and ruin his enemies.",
    synopsisAr:
      "بحّار مغدور به يقضي أربعة عشر عاماً في سجن جزري، يهرب بثروة سرّية ويعود كوناً لا يُقهر يكافئ أصدقاءه ويدمّر أعداءه واحداً تلو الآخر.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-moby-dick",
    mediaType: "book",
    format: "book",
    title: "Moby-Dick",
    titleAr: "موبي ديك",
    year: 1851,
    genres: ["adventure", "drama", "classics"],
    tags: ["obsession", "revenge", "gritty", "thought-provoking"],
    creators: ["Herman Melville"],
    languages: EN,
    countries: USA,
    synopsis:
      "A restless schoolmaster ships aboard a whaler whose captain drags the crew around the globe in a monomaniac hunt for the white whale that maimed him.",
    synopsisAr:
      "مدرّس ملول يلتحق بسفينة صيد حيتان يقودها ربّان يجاذ طاقمه حول الكرة الأرضية في مطاردة مهووسة للحوت الأبيض الذي فقأ عينه.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-crime-punishment",
    mediaType: "book",
    format: "book",
    title: "Crime and Punishment",
    titleAr: "الجريمة والعقاب",
    originalTitle: "Преступление и наказание",
    year: 1866,
    genres: ["crime", "psychological", "classics"],
    tags: ["morality", "thought-provoking", "dark"],
    creators: ["Fyodor Dostoevsky"],
    languages: RU,
    countries: RUS,
    synopsis:
      "A penniless student in St Petersburg murders a pawnbroker to prove a theory about extraordinary men, then unravels under guilt until a stranger's compassion points him toward confession.",
    synopsisAr:
      "طالب مفلس في سانت بطرسبرغ يقتل مرابية ليبرهن على نظرية عن الرجال الاستثنائيين، ثم يتفكك تحت وطأة الذنب حتى تدله رحمة فتاة مكروبة على طريق الاعتراف.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-war-peace",
    mediaType: "book",
    format: "book",
    title: "War and Peace",
    titleAr: "الحرب والسلم",
    originalTitle: "Война и мир",
    year: 1869,
    genres: ["historical", "war", "drama"],
    tags: ["ensemble", "generational", "epic"],
    creators: ["Leo Tolstoy"],
    languages: RU,
    countries: RUS,
    synopsis:
      "Five aristocratic families live through Napoleon's invasion of Russia, their romances and rivalries unfolding against battles, burning cities and rebirth.",
    synopsisAr:
      "خمس عائلات أرستقراطية تعيش غزو نابليون لروسيا، وتتعرى قصص حبها وتنافسها على خلفية المعارك والمدن المحترقة والنهوض من جديد.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-huckleberry-finn",
    mediaType: "book",
    format: "book",
    title: "Adventures of Huckleberry Finn",
    titleAr: "مغامرات هكلبيري فين",
    year: 1884,
    genres: ["adventure", "classics", "humor"],
    tags: ["friendship", "coming-of-age", "satire"],
    creators: ["Mark Twain"],
    languages: EN,
    countries: USA,
    synopsis:
      "A boy fakes his own death and rafts down the Mississippi with an escaped enslaved man, trading small-town lies for a slowly growing moral conscience.",
    synopsisAr:
      "صبي يتظاهر بموته ويهبط نهر المسيسيبي على طوف برفقة رجل هارب من العبودية، مبادلاً أكاذيب البلدات الصغيرة بضمير أخلاقي ينمو رويداً رويداً.",
    attribution: CURATED_ATTRIBUTION,
  },

  // --------------------------------------------------- 1900s–1940s
  {
    id: "cb-hound-baskervilles",
    mediaType: "book",
    format: "book",
    title: "The Hound of the Baskervilles",
    titleAr: "كلب آل باسكرفيل",
    year: 1902,
    genres: ["mystery", "crime", "classics"],
    tags: ["investigation", "tense", "mystery-box"],
    creators: ["Arthur Conan Doyle"],
    languages: EN,
    countries: GBR,
    synopsis:
      "Sherlock Holmes and Dr Watson investigate a family legend: a spectral hound haunting a Devon moor, where the latest Baskerville heir has just died of fright.",
    synopsisAr:
      "شرلوك هولمز والدكتور واتسون يحققان في أسطورة عائلية عن كلب شبحي يطارد سهوب ديفون، حيث مات آخر ورثة آل باسكرفيل للتو من الرعب.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-metamorphosis",
    mediaType: "book",
    format: "book",
    title: "The Metamorphosis",
    titleAr: "المسخ",
    originalTitle: "Die Verwandlung",
    year: 1915,
    genres: ["classics", "drama"],
    tags: ["surreal", "absurdist", "dark", "family-bonds"],
    creators: ["Franz Kafka"],
    languages: DE,
    countries: AUH,
    synopsis:
      "A travelling salesman wakes to find himself transformed into a monstrous insect, and watches his family's care curdle into disgust as his voice fades.",
    synopsisAr:
      "مدير مبيعات متجول يستيقظ ليجد نفسه قد تحول إلى حشرة هائلة، ويرى عناية أسرته تتحول شيئاً فشيئاً إلى اشمئزاز مع خفوت صوته.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-ulysses",
    mediaType: "book",
    format: "book",
    title: "Ulysses",
    titleAr: "أوليسيس",
    year: 1922,
    genres: ["classics", "drama"],
    tags: ["nonlinear", "urban-loneliness", "thought-provoking"],
    creators: ["James Joyce"],
    languages: EN,
    countries: IRL,
    synopsis:
      "A single Dublin day in the lives of Leopold Bloom, his wife Molly and the young Stephen Dedalus, retold through constantly shifting styles — from newspaper prose to unpunctuated inner monologue.",
    synopsisAr:
      "يوم واحد في دبلن من حياة ليوبولد بلوم وزوجته مولي والشاب ستيفن ديدالوس، يُروى بأساليب متبدلة بلا توقف — من نثر الصحف إلى المونولوج الداخلي بلا علامات ترقيم.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-the-prophet",
    mediaType: "book",
    format: "book",
    title: "The Prophet",
    titleAr: "النبي",
    originalTitle: "النبي",
    year: 1923,
    genres: ["poetry", "philosophy", "classics"],
    tags: ["philosophical", "melancholic", "hopeful"],
    creators: ["Kahlil Gibran"],
    languages: AR,
    countries: LBN,
    synopsis:
      "Before boarding a ship home, the prophet Almustafa answers the people of Orphalese on love, work, freedom and sorrow, in short prose poems.",
    synopsisAr:
      "قبل أن يركب السفينة عائداً إلى وطنه، يجيب النبي المصطفى أهل أورفاليس عن الحب والعمل والحرية والحزن في قصائد نثرية قصيرة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-great-gatsby",
    mediaType: "book",
    format: "book",
    title: "The Great Gatsby",
    titleAr: "غاتسبي العظيم",
    year: 1925,
    genres: ["classics", "drama"],
    tags: ["ambition", "class-conflict", "tragic", "jazz-scored"],
    creators: ["F. Scott Fitzgerald"],
    languages: EN,
    countries: USA,
    synopsis:
      "A mysterious millionaire throws lavish Long Island parties to win back a woman he loved five years ago, while his neighbour — the narrator — watches the dream rot.",
    synopsisAr:
      "مليونيرير غامض يقيم حفلات باذخة في لونغ آيلاند لاستعادة امرأة أحبها قبل خمس سنوات، بينما يراقب جاره الراوي الحلم وهو يتعفن.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-the-days",
    mediaType: "book",
    format: "book",
    title: "The Days",
    titleAr: "الأيام",
    originalTitle: "الأيام",
    year: 1926,
    genres: ["biography", "classics"],
    tags: ["coming-of-age", "memory", "underdog", "hopeful"],
    creators: ["Taha Hussein"],
    languages: AR,
    countries: EGY,
    synopsis:
      "The autobiography of a boy from a Nile village who loses his sight young, carries his recited lessons to Al-Azhar, and fights his way onward to the Sorbonne.",
    synopsisAr:
      "سيرة ذاتية لفتى من قرية على النيل يفقد بصره في سنّ مبكرة، ويحمل دروسه المحفوظة إلى الأزهر، ثم يواصل نضاله حتى السوربون.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-hobbit",
    mediaType: "book",
    format: "book",
    title: "The Hobbit",
    titleAr: "الهوبيت",
    year: 1937,
    genres: ["fantasy", "adventure", "family"],
    tags: ["epic", "coming-of-age", "whimsical"],
    creators: ["J. R. R. Tolkien"],
    languages: EN,
    countries: GBR,
    synopsis:
      "A comfort-loving hobbit is swept off by thirteen dwarves and a wizard to steal back a mountain hoard from a dragon — and finds he is braver than he believed.",
    synopsisAr:
      "هوبيت محب للراحة تقتحم حياته ثلاثة عشر قزماً وساحر في رحلة لاسترداد كنز جبل من تنين، ليكتشف أنه أشجع مما كان يظن.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-little-prince",
    mediaType: "book",
    format: "book",
    title: "The Little Prince",
    titleAr: "الأمير الصغير",
    originalTitle: "Le Petit Prince",
    year: 1943,
    genres: ["children", "fantasy", "philosophy"],
    tags: ["whimsical", "melancholic", "hopeful", "philosophical"],
    creators: ["Antoine de Saint-Exupéry"],
    languages: FR,
    countries: FRA,
    synopsis:
      "A pilot stranded in the Sahara meets a golden-haired prince from a tiny asteroid, and through his tales of odd little planets relearns what truly matters.",
    synopsisAr:
      "طيار تقطعت به السبل في الصحراء يلتقي أميراً أشقر من كويكب صغير، ومن حكاياته عن كواكب غريبة صغيرة يعيد تعلم ما يهمّ حقاً.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-diary-young-girl",
    mediaType: "book",
    format: "book",
    title: "The Diary of a Young Girl",
    titleAr: "مذكرات آن فرانك",
    originalTitle: "Het Achterhuis",
    year: 1947,
    genres: ["biography", "history", "war"],
    tags: ["coming-of-age", "memory", "hopeful", "tragic"],
    creators: ["Anne Frank"],
    languages: NL,
    countries: NLD,
    synopsis:
      "The real diary of a Jewish teenager hiding with her family in a cramped Amsterdam annexe during the Nazi occupation, addressed to an imaginary friend named Kitty.",
    synopsisAr:
      "المذكرات الحقيقية لفتاة يهودية مراهقة تختبئ مع عائلتها في ملحق منزلي ضيق في أمستردام خلال الاحتلال النازي، تخاطب فيها صديقة خيالية تدعى كيتي.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-1984",
    mediaType: "book",
    format: "book",
    title: "Nineteen Eighty-Four",
    titleAr: "1984",
    year: 1949,
    genres: ["sci-fi", "drama", "dystopian-fiction"],
    tags: ["dystopia", "political", "tense", "thought-provoking"],
    creators: ["George Orwell"],
    languages: EN,
    countries: GBR,
    synopsis:
      "Winston Smith rewrites old newspapers for the Party, until a forbidden love affair and a hidden book pull him toward Big Brother's ever-watching telescreens.",
    synopsisAr:
      "وينستون سميث يعيد كتابة الصحف القديمة لصالح الحزب، حتى تقوده علاقة حب ممنوعة وكتاب مخفي نحو شاشات الأخ الأكبر التي لا تنقطع عن المراقبة.",
    attribution: CURATED_ATTRIBUTION,
  },

  // --------------------------------------------------- 1950s–1990s
  {
    id: "cb-palace-walk",
    mediaType: "book",
    format: "book",
    title: "Palace Walk",
    titleAr: "بين القصرين",
    originalTitle: "بين القصرين",
    year: 1956,
    genres: ["historical", "drama", "family"],
    tags: ["generational", "family-bonds", "political", "class-conflict"],
    creators: ["Naguib Mahfouz"],
    languages: AR,
    countries: EGY,
    synopsis:
      "The opening volume of the Cairo Trilogy: a stern patriarch rules his household in a Cairo alley through the 1919 revolution, while his children quietly break his rules.",
    synopsisAr:
      "الجزء الأول من ثلاثية القاهرة: أبّ صارم يحكم بيته في حارة قاهرية أيام ثورة 1919، بينما يتخطى أبناؤه قواعده في صمت.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-things-fall-apart",
    mediaType: "book",
    format: "book",
    title: "Things Fall Apart",
    titleAr: "الأشياء تتداعى",
    year: 1958,
    genres: ["historical", "drama", "classics"],
    tags: ["tragic", "thought-provoking", "transformation"],
    creators: ["Chinua Achebe"],
    languages: EN,
    countries: NGA,
    synopsis:
      "Okonkwo wrestles his way to prominence in Igbo villages just as missionaries and colonial officers arrive, and the balance of his world begins to give way.",
    synopsisAr:
      "أوكونكو يصارع طريقه إلى المكانة في قرى الإيغبو، لتصل الإرساليات التبشيرية والموظفون الاستعماريون في تلك اللحظة بالذات، فيبدأ توازن عالمه بالانهيار.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-to-kill-mockingbird",
    mediaType: "book",
    format: "book",
    title: "To Kill a Mockingbird",
    titleAr: "اقتل طائر المحاكي",
    year: 1960,
    genres: ["drama", "legal", "classics"],
    tags: ["justice", "coming-of-age", "class-conflict", "thought-provoking"],
    creators: ["Harper Lee"],
    languages: EN,
    countries: USA,
    synopsis:
      "In Depression-era Alabama, young Scout watches her lawyer father defend a Black man falsely accused of a crime, learning what decency costs in a small town.",
    synopsisAr:
      "في ألاباما زمن الكساد، تراقب الطفلة سكاوت والدها المحامي يدافع عن رجل أسود متهم زوراً، فتتعلم ثمن النزاهة في بلدة صغيرة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-dune",
    mediaType: "book",
    format: "book",
    title: "Dune",
    titleAr: "الكثيب",
    year: 1965,
    genres: ["sci-fi", "classics", "adventure"],
    tags: ["political", "epic", "desert-epic", "chosen-one"],
    creators: ["Frank Herbert"],
    languages: EN,
    countries: USA,
    synopsis:
      "The heir of a noble house is betrayed into the desert of Arrakis, where spice, sandworms and Fremen prophecy begin to rewrite who he must become.",
    synopsisAr:
      "وريث بيت نبيل يُسلَّم خديعةً إلى صحراء أراكيس، حيث تبدأ التوابل وديدان الرمال ونبوءات الفريمن في إعادة كتابة ما عليه أن يصير إليه.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-season-migration",
    mediaType: "book",
    format: "book",
    title: "Season of Migration to the North",
    titleAr: "موسم الهجرة إلى الشمال",
    originalTitle: "موسم الهجرة إلى الشمال",
    year: 1966,
    genres: ["drama", "politics"],
    tags: ["identity", "betrayal", "tragic", "thought-provoking"],
    creators: ["Tayeb Salih"],
    languages: AR,
    countries: SDN,
    synopsis:
      "A Sudanese villager returned from London tells his story to a narrator who resembles him: brilliant studies abroad, an Englishwoman, and a reckoning neither culture will forgive.",
    synopsisAr:
      "قروي سوداني عائد من لندن يحكي حكايته لراوٍ يشبهه: دراسات لامعة في الخارج، وامرأة إنجليزية، وحساب عسير لا تغفره ثقافتان.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-one-hundred-years",
    mediaType: "book",
    format: "book",
    title: "One Hundred Years of Solitude",
    titleAr: "مئة عام من العزلة",
    originalTitle: "Cien años de soledad",
    year: 1967,
    genres: ["classics", "historical", "fantasy"],
    tags: ["generational", "surreal", "melancholic", "epic"],
    creators: ["Gabriel García Márquez"],
    languages: ES,
    countries: COL,
    synopsis:
      "Seven generations of the Buendía family live, love and repeat their mistakes in Macondo, a jungle town where miracles, ghosts and banana-company men arrive in turn.",
    synopsisAr:
      "سبعة أجيال من عائلة بوينديا تعيش وتحب وتكرر أخطاءها في ماكوندو، بلدة أدغال تتعاقب عليها المعجزات والأشباح ورجال شركة الموز.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-hitchhikers",
    mediaType: "book",
    format: "book",
    title: "The Hitchhiker's Guide to the Galaxy",
    titleAr: "دليل المسافر إلى المجرة",
    year: 1979,
    genres: ["sci-fi", "comedy"],
    tags: ["absurdist", "whimsical", "space", "satire"],
    creators: ["Douglas Adams"],
    languages: EN,
    countries: GBR,
    synopsis:
      "Seconds after Earth is demolished to make way for a hyperspace bypass, a hapless human tours the galaxy with his alien friend, a depressed robot and a towel.",
    synopsisAr:
      "بثوانٍ من هدم كوكب الأرض لشق ممر فضائي فائق السرعة، إنسان مسكين يطوف المجرة برفقة صديقه الفضائي وروبوت مكتئب ومنشفة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-midnights-children",
    mediaType: "book",
    format: "book",
    title: "Midnight's Children",
    titleAr: "أطفال منتصف الليل",
    year: 1981,
    genres: ["historical", "fantasy", "drama"],
    tags: ["generational", "political", "surreal", "nonlinear"],
    creators: ["Salman Rushdie"],
    languages: EN,
    countries: IND,
    synopsis:
      "Born at the stroke of midnight as India becomes independent, Saleem Sinai shares a telepathic bond with a thousand other midnight children while the young nation's history entangles with his own.",
    synopsisAr:
      "وُلد ساليم سيناي مع أول خيط من نور استقلال الهند، فتربطه صلة تخاطرية بألف طفل آخرين من أطفال منتصف الليل بينما يتشابك تاريخ الوطن الفتي مع حكايته الشخصية.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-handmaids-tale",
    mediaType: "book",
    format: "book",
    title: "The Handmaid's Tale",
    titleAr: "حكاية الخادمة",
    year: 1985,
    genres: ["sci-fi", "drama", "dystopian-fiction"],
    tags: ["dystopia", "political", "unsettling", "identity"],
    creators: ["Margaret Atwood"],
    languages: EN,
    countries: CAN,
    synopsis:
      "In the Republic of Gilead, fertile women are conscripted as handmaids; Offred records the small tyrannies, the punishments and the memories that keep her alive.",
    synopsisAr:
      "في جمهورية جلعاد، تُجنَّد النساء الخصبات خادمات؛ وتدوّن أوفريد الطغيان الصغير والعقوبات والذكريات التي تبقيها على قيد الحياة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-beloved",
    mediaType: "book",
    format: "book",
    title: "Beloved",
    titleAr: "الحبيب",
    year: 1987,
    genres: ["historical", "drama", "supernatural"],
    tags: ["grief", "memory", "thought-provoking", "tragic"],
    creators: ["Toni Morrison"],
    languages: EN,
    countries: USA,
    synopsis:
      "A formerly enslaved woman in Ohio is haunted — literally — by the daughter she killed rather than see returned to slavery.",
    synopsisAr:
      "امرأة تحررت من العبودية في أوهايو تطاردها — حرفياً — روح الابنة التي قتلتها بيدها كي لا تُعاد إلى العبودية.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-norwegian-wood",
    mediaType: "book",
    format: "book",
    title: "Norwegian Wood",
    titleAr: "الغابة النرويجية",
    originalTitle: "ノルウェイの森",
    year: 1987,
    genres: ["romance", "drama"],
    tags: ["melancholic", "grief", "emotional", "memory"],
    creators: ["Haruki Murakami"],
    languages: JA,
    countries: JPN,
    synopsis:
      "Toru looks back on his Tokyo student years spent between two women: his dead best friend's fragile girlfriend, and a self-possessed fellow student.",
    synopsisAr:
      "يستذكر تورو سنوات دراسته في طوكيو معلقاً بين امرأتين: حبيبة صديقه الراحل الهشّة، وزميلته الجامعية الواثقة من نفسها.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-brief-history-time",
    mediaType: "book",
    format: "book",
    title: "A Brief History of Time",
    titleAr: "تاريخ موجز للزمن",
    year: 1988,
    genres: ["science", "non-fiction"],
    tags: ["thought-provoking", "philosophical"],
    creators: ["Stephen Hawking"],
    languages: EN,
    countries: GBR,
    synopsis:
      "A physicist's guided tour of space, time, black holes and the origin of the universe, written for readers who own no equations.",
    synopsisAr:
      "جولة فيزيائي موجّهة في الفضاء والزمان والثقوب السوداء وأصل الكون، كُتبت لقرّاء لا يحملون أي معادلات.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-game-thrones",
    mediaType: "book",
    format: "book",
    title: "A Game of Thrones",
    titleAr: "صراع العروش",
    year: 1996,
    genres: ["fantasy", "drama", "adventure"],
    tags: ["political", "betrayal", "epic", "gritty", "ensemble"],
    creators: ["George R. R. Martin"],
    languages: EN,
    countries: USA,
    synopsis:
      "Noble houses scheme for an iron throne while an ignored ancient threat stirs in the north, and an exiled princess across the sea hatches dragons from stone eggs.",
    synopsisAr:
      "بيوت نبيلة تتحارب على العرش الحديدي بينما يستيقظ في الشمال خطرٌ قديم أهمله الجميع، وأميرة منفية وراء البحر تُفقس التنانين من بيوضٍ حجرية.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-harry-potter-1",
    mediaType: "book",
    format: "book",
    title: "Harry Potter and the Philosopher's Stone",
    titleAr: "هاري بوتر وحجر الفيلسوف",
    year: 1997,
    genres: ["fantasy", "family", "adventure"],
    tags: ["chosen-one", "coming-of-age", "whimsical", "school"],
    creators: ["J. K. Rowling"],
    languages: EN,
    countries: GBR,
    synopsis:
      "An orphan raised in a cupboard under the stairs learns on his eleventh birthday that he is a wizard, and boards a scarlet train to a school where his fame arrived before him.",
    synopsisAr:
      "طفل يتيم نشأ في خزانة تحت الدرج يعلم في عيد ميلاده الحادي عشر أنه ساحر، فيركب قطاراً قرمزياً إلى مدرسة سبقته شهرته إليها.",
    attribution: CURATED_ATTRIBUTION,
  },

  // --------------------------------------------------- 2000s–2010s
  {
    id: "cb-yacoubian",
    mediaType: "book",
    format: "book",
    title: "The Yacoubian Building",
    titleAr: "عمارة يعقوبيان",
    originalTitle: "عمارة يعقوبيان",
    year: 2002,
    genres: ["drama", "politics"],
    tags: ["ensemble", "class-conflict", "political", "urban-loneliness"],
    creators: ["Alaa Al Aswany"],
    languages: AR,
    countries: EGY,
    synopsis:
      "Tenants old and new — from a fading aristocrat to roof-shack dwellers — cross paths in a single Cairo building, mapping Egypt's drift from its cosmopolitan past to the present.",
    synopsisAr:
      "سكان قدامى وجدد — من أرستقراطي أفلت عهده إلى سكان الأكواخ فوق السطح — تتصادم مساراتهم في عمارة قاهرية واحدة، فرسموا خريطة انزياح مصر من ماضيها الكوزموبوليتاني إلى الحاضر.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-three-body",
    mediaType: "book",
    format: "book",
    title: "The Three-Body Problem",
    titleAr: "مشكلة الأجسام الثلاثة",
    originalTitle: "三体",
    year: 2008,
    genres: ["sci-fi", "mystery"],
    tags: ["first-contact", "political", "thought-provoking", "tense"],
    creators: ["Liu Cixin"],
    languages: ZH,
    countries: CHN,
    synopsis:
      "A physicist investigates a wave of scientist suicides and a strange virtual-reality game, tracing both back to a first contact seeded during China's Cultural Revolution.",
    synopsisAr:
      "فيزيائية تبحث في موجة انتحارات بين العلماء وفي لعبة واقع افتراضي غريبة، ليتتبع الخيطين إلى اتصال أول بُذرت بذوره أيام الثورة الثقافية في الصين.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-my-brilliant-friend",
    mediaType: "book",
    format: "book",
    title: "My Brilliant Friend",
    titleAr: "صديقتي العبقرية",
    originalTitle: "L'amica geniale",
    year: 2011,
    genres: ["drama", "fiction"],
    tags: ["friendship", "class-conflict", "ensemble", "school"],
    creators: ["Elena Ferrante"],
    languages: IT,
    countries: ITA,
    synopsis:
      "Two girls grow up side by side in a rough postwar Naples neighbourhood, their friendship a lifelong rivalry of talent, class and escape.",
    synopsisAr:
      "فتاتان تكبران جنباً إلى جنب في حي نابولي قاسٍ بعد الحرب، وصداقتهما تنافسٌ يمتد العمر كله على الموهبة والطبقة والهروب.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------- 2010s–2020s + cross-media links
  {
    id: "cb-violet-evergarden-ln",
    mediaType: "book",
    format: "book",
    subtype: "light-novel",
    title: "Violet Evergarden",
    titleAr: "فايوليت إيفرغاردن",
    originalTitle: "ヴァイオレット・エヴァーガーデン (Vaioretto Evāgāden)",
    year: 2015,
    publicationStatus: "completed",
    volumeCount: 3,
    genres: ["drama", "slice-of-life"],
    tags: ["grief", "emotional", "memory", "war-aftermath"],
    creators: ["Kana Akatsuki"],
    studios: ["KA Esuma Bunko (Kyoto Animation)"],
    languages: JA,
    countries: JPN,
    synopsis:
      "A child soldier discharged into peacetime takes work writing other people's letters, and learns feeling word by word on the page.",
    synopsisAr:
      "طفلة جندي تُسرّح إلى زمن السلم فتعمل في كتابة رسائل الآخرين، وتتعلم الإحساس كلمةً كلمة على الورق.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-lotr",
    mediaType: "book",
    format: "book",
    title: "The Lord of the Rings",
    titleAr: "سيد الخواتم",
    year: 1954,
    endYear: 1955,
    publicationStatus: "completed",
    volumeCount: 3,
    genres: ["fantasy", "adventure", "drama"],
    tags: ["epic", "medieval", "friendship", "morality"],
    creators: ["J. R. R. Tolkien"],
    languages: EN,
    countries: GBR,
    synopsis:
      "A hobbit inherits a ring that would enslave the world, and the smallest people in the story carry it into the dark heart of the largest war it has ever had.",
    synopsisAr:
      "هوبيت يرث خاتماً يستعبد العالم، فيحمل أصغر شعوب الحكاية الخاتم إلى قلب الظلمة في أعظم حرب عرفتها الأرض الوسطى.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cb-last-wish",
    mediaType: "book",
    format: "book",
    title: "The Last Wish",
    titleAr: "الأمنية الأخيرة",
    originalTitle: "Ostatnie życzenie",
    year: 1993,
    genres: ["fantasy", "dark-fantasy", "fiction"],
    tags: ["monster-hunting", "nonlinear", "dark", "morality"],
    creators: ["Andrzej Sapkowski"],
    languages: ["Polish"],
    countries: POL,
    synopsis:
      "A mutated monster-hunter who insists he has no feelings keeps collecting people who prove otherwise, in the story collection where the Witcher began.",
    synopsisAr:
      "صائد وحوش متحوّل يصرّ أنه بلا مشاعر يظل يجمع حوله من يثبت العكس، في المجموعة القصصية التي بدأت منها ملحمة الويتشر.",
    attribution: CURATED_ATTRIBUTION,
  },
];
