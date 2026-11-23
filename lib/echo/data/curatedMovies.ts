/**
 * ECHO — Curated local movie starter collection (Phase 2).
 *
 * A hand-picked set of widely recognised classics and influential films,
 * spread across decades (1920s–2010s), countries and genres, so the movie
 * experience stays useful when licensed movie providers are disabled,
 * unconfigured or offline.
 *
 * Editorial rules (docs/DATA_PROVIDER_COMPLIANCE.md):
 *  - Factual fields (title, year, director, country, language, genre) are
 *    widely-known public information.
 *  - Synopses (EN + AR) are ORIGINAL one/two-liners written for ECHO —
 *    never copied from IMDb, Wikipedia or any other catalogue.
 *  - NO ratings, popularity figures, awards or vote counts are stored:
 *    every field that ECHO cannot verify is simply omitted.
 *  - Content ratings are omitted rather than approximated.
 *  - No artwork is bundled — the safe generated placeholder system is used.
 *
 * These records ship under the "echo-demo" registry entry (ECHO's approved
 * local catalogue) and are labelled as ECHO-curated sample content in the
 * UI. They are a curated starter collection, NOT a movie database.
 */

import type { DemoSeed } from "./demoCatalogue";

const DE = ["German"];
const EN = ["English"];
const FR = ["French"];
const IT = ["Italian"];
const JA = ["Japanese"];
const ZH = ["Mandarin"];
const YUE = ["Cantonese"];
const AR = ["Arabic"];
const HI = ["Bengali"];
const FA = ["Persian"];
const ES = ["Spanish"];
const PT = ["Portuguese"];
const RU = ["Russian"];

const DEU = ["Germany"];
const USA = ["USA"];
const GBR = ["UK"];
const FRA = ["France"];
const ITA = ["Italy"];
const JPN = ["Japan"];
const IND = ["India"];
const EGY = ["Egypt"];
const HKG = ["Hong Kong"];
const TWN = ["Taiwan"];
const BRA = ["Brazil"];
const IRN = ["Iran"];
const MEX = ["Mexico"];
const LBN = ["Lebanon"];
const NZL = ["New Zealand"];
const SUN = ["USSR"];

const CURATED_ATTRIBUTION = "ECHO curated sample collection — original descriptions";

export const CURATED_MOVIES: DemoSeed[] = [
  // ------------------------------------------------------------- 1920s–1930s
  {
    id: "cm-metropolis",
    mediaType: "movie",
    format: "film",
    title: "Metropolis",
    titleAr: "متروبوليس",
    year: 1927,
    genres: ["sci-fi", "drama"],
    tags: ["dystopian-fiction", "class-conflict", "avant-garde", "thought-provoking"],
    creators: ["Fritz Lang"],
    languages: DE,
    countries: DEU,
    synopsis:
      "In a towering future city, the pampered son of the ruling elite discovers the machine workers who keep it alive below ground, and a robot double blurs the line between saviour and saboteur.",
    synopsisAr:
      "في مدينة مستقبلية شاهقة، يكتشف ابن النخبة الحاكمة العمّال الذين يديرون آلاتها في الأعماق، بينما تمزيق نسخة آلية من فتاة ثورية الخطّ بين المنقذ والمخرب.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-m",
    mediaType: "movie",
    format: "film",
    title: "M",
    titleAr: "إم",
    year: 1931,
    genres: ["crime", "thriller", "mystery"],
    tags: ["serial-killer", "cat-and-mouse", "unreliable-narrator", "thought-provoking"],
    creators: ["Fritz Lang"],
    languages: DE,
    countries: DEU,
    synopsis:
      "When the police crack down hard on a German city to catch a child murderer, the criminal underworld decides to hunt him itself — and stages a shadow trial in a basement.",
    synopsisAr:
      "حين تشدّد الشرطة قبضتها على مدينة ألمانية للقبض على قاتل أطفال، يقرر عالم الجريمة المنظم مطاردته بنفسه، وينظّم له محاكمة موازية في قبو مظلم.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-city-lights",
    mediaType: "movie",
    format: "film",
    title: "City Lights",
    titleAr: "أضواء المدينة",
    year: 1931,
    genres: ["comedy", "romance", "drama"],
    tags: ["silent-classic", "found-family", "slow-burn"],
    creators: ["Charles Chaplin"],
    languages: EN,
    countries: USA,
    synopsis:
      "A kind-hearted tramp falls for a blind flower girl and scrambles through boxing rings and millionaire parties to raise the money that might restore her sight.",
    synopsisAr:
      "يتعلّق متشرد طيّب القلب ببائعة زهور عمياء، فيتنقّل بين حلقات الملاكمة وحفلات الأثرياء بحثاً عن المال الذي قد يعيد إليها بصرها.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-modern-times",
    mediaType: "movie",
    format: "film",
    title: "Modern Times",
    titleAr: "العصر الحديث",
    year: 1936,
    genres: ["comedy", "drama", "romance"],
    tags: ["class-conflict", "technology-anxiety", "silent-classic"],
    creators: ["Charles Chaplin"],
    languages: EN,
    countries: USA,
    synopsis:
      "A factory worker ground down by the assembly line stumbles through the Great Depression with a scrappy orphaned girl, fighting machines, hunger and bad luck with stubborn dignity.",
    synopsisAr:
      "عامل مصنع تسحقه خطوط الإنتاج يخوض سنوات الكساد الكبير برفقة فتاة يتيمة جسورة، مواجهاً الآلات والجوع وسوء الحظ بكرامة عنيدة.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------------ 1940s
  {
    id: "cm-citizen-kane",
    mediaType: "movie",
    format: "film",
    title: "Citizen Kane",
    titleAr: "المواطن كين",
    year: 1941,
    genres: ["drama", "mystery"],
    tags: ["character-study", "unreliable-narrator", "thought-provoking", "mystery-box"],
    creators: ["Orson Welles"],
    languages: EN,
    countries: USA,
    synopsis:
      "A reporter chases the meaning of a dead publishing tycoon's final word through the memories of everyone who knew him, and finds a fortune built on a childhood that was sold away.",
    synopsisAr:
      "يتبع صحفي معنى الكلمة الأخيرة لقطب صحافة متوفّى عبر ذكريات كل من عرفه، ليكتشف ثروة بُنيت على طفولة بِيعت يوماً مقابل المال.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-casablanca",
    mediaType: "movie",
    format: "film",
    title: "Casablanca",
    titleAr: "كازابلانكا",
    year: 1942,
    genres: ["romance", "drama", "war"],
    tags: ["small-town", "slow-burn", "war-aftermath"],
    creators: ["Michael Curtiz"],
    languages: EN,
    countries: USA,
    synopsis:
      "In wartime Casablanca, a cynical café owner's old flame arrives with a resistance leader husband and exit visas he could keep for himself — or surrender for something bigger.",
    synopsisAr:
      "في الدار البيضاء زمن الحرب، تصل حبيبة قديمة إلى مقهى صاحب ساخر بصحبة زوج قائد مقاومة وتأشيرات خروج يمكنه الاحتفاظ بها لنفسه أو التخلي عنها لما هو أكبر.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-bicycle-thieves",
    mediaType: "movie",
    format: "film",
    title: "Bicycle Thieves",
    titleAr: "سارقو الدراجة",
    year: 1948,
    genres: ["drama", "crime"],
    tags: ["class-conflict", "family-bonds", "slow-burn", "thought-provoking"],
    creators: ["Vittorio De Sica"],
    languages: IT,
    countries: ITA,
    synopsis:
      "A father's new poster-pasting job in postwar Rome depends on one bicycle; when it is stolen, he and his small son search the whole city for it and brush against a choice that tests them both.",
    synopsisAr:
      "تعتمد وظيفة أب جديدة في روما ما بعد الحرب على دراجة واحدة؛ وحين تُسرق، يبحث هو وابنه الصغير عنها في أنحاء المدينة حتى يقتربان من خيار يختبرهما معاً.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------------ 1950s
  {
    id: "cm-singin-in-the-rain",
    mediaType: "movie",
    format: "film",
    title: "Singin' in the Rain",
    titleAr: "الغناء تحت المطر",
    year: 1952,
    genres: ["musical", "comedy", "romance"],
    tags: ["music-driven", "high-energy", "coming-of-age"],
    creators: ["Stanley Donen", "Gene Kelly"],
    languages: EN,
    countries: USA,
    synopsis:
      "As Hollywood lurches from silent films to talkies, a matinee idol, his wisecracking best friend and an aspiring actress scramble to save a doomed production by turning it into a musical.",
    synopsisAr:
      "مع انتقال هوليوود من السينما الصامتة إلى الناطقة، يسعى نجم شعبي وصديقه الساخر وممثلة طامحة لإنقاذ فيلم مهدد بالفشل بتحويله إلى استعراض غنائي.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-tokyo-story",
    mediaType: "movie",
    format: "film",
    title: "Tokyo Story",
    titleAr: "حكاية طوكيو",
    year: 1953,
    genres: ["drama", "family"],
    tags: ["family-bonds", "slow-burn", "slice-of-life", "thought-provoking"],
    creators: ["Yasujirō Ozu"],
    languages: JA,
    countries: JPN,
    synopsis:
      "An elderly couple travel from their coastal village to visit their busy grown children in Tokyo, and find that time, distance and politeness have quietly rearranged what family means.",
    synopsisAr:
      "يسافر زوجان مسنّان من قريتهما الساحلية لزيارة أبنائهما المشغولين في طوكيو، ليكتشفا أن الوقت والمسافة واللباقة أعادت بصمت ترتيب معنى العائلة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-seven-samurai",
    mediaType: "movie",
    format: "film",
    title: "Seven Samurai",
    titleAr: "الساموراي السبعة",
    originalTitle: "Shichinin no Samurai",
    year: 1954,
    genres: ["action", "adventure", "drama"],
    tags: ["strategy-battle", "found-family", "iconic-villain"],
    creators: ["Akira Kurosawa"],
    languages: JA,
    countries: JPN,
    synopsis:
      "A starving farming village hires seven masterless warriors to defend its harvest from bandits, and the long, muddy siege that follows bonds them to the people they protect.",
    synopsisAr:
      "تستعين قرية فقيرة بسبعة مقاتلين بلا سيد للدفاع عن حصادها من قطّاع الطرق، ويربط الحصار الطويل الموحل بينهم وبين أهل القرية الذين يحمونهم.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-pather-panchali",
    mediaType: "movie",
    format: "film",
    title: "Pather Panchali",
    titleAr: "أغنية الطريق",
    originalTitle: "পথের পাঁচালী",
    year: 1955,
    genres: ["drama", "family"],
    tags: ["family-bonds", "slice-of-life", "slow-burn", "coming-of-age"],
    creators: ["Satyajit Ray"],
    languages: HI,
    countries: IND,
    synopsis:
      "In a rural Bengali village, a poor priest's family holds together through monsoon, debt and small joys, seen mostly through the wondering eyes of his daughter and young son.",
    synopsisAr:
      "في قرية بنغالية، تصمد عائلة كاهن فقير أمام المونسون والدّين والأفراح الصغيرة، ونرى ذلك كله غالباً عبر عيني ابنته المتطلّبة وطفله الصغير.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-12-angry-men",
    mediaType: "movie",
    format: "film",
    title: "12 Angry Men",
    titleAr: "اثنا عشر رجلاً غاضباً",
    year: 1957,
    genres: ["drama", "crime", "mystery"],
    tags: ["character-study", "thought-provoking", "slow-burn", "detective-stories"],
    creators: ["Sidney Lumet"],
    languages: EN,
    countries: USA,
    synopsis:
      "Locked in one sweltering jury room, eleven men ready to convict are slowed by a single stubborn dissent that takes the evidence apart piece by piece.",
    synopsisAr:
      "في غرفة هيئة محلفين خانقة، يوقف اعتراض واحد عنيد أحد عشر رجلاً عازمين على الإدانة، ليفكّك الأدلة قطعةً قطعة أمامهم.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-cairo-station",
    mediaType: "movie",
    format: "film",
    title: "Cairo Station",
    titleAr: "باب الحديد",
    year: 1958,
    genres: ["drama", "crime", "thriller"],
    tags: ["character-study", "class-conflict", "dark-comedy"],
    creators: ["Youssef Chahine"],
    languages: AR,
    countries: EGY,
    synopsis:
      "Around Cairo's main railway station, a lonely newspaper vendor fixates on a lemonade seller who is promised to another man, while the station's everyday commerce hums around his unraveling.",
    synopsisAr:
      "في محطة سكك حديد مصر الرئيسية، يتعلّق بائع صحف وحيد ببائعة عصير قمون مُخطوبة لرجل آخر، بينما يدور نشاط المحطة اليومي حول انهياره الصامت.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-vertigo",
    mediaType: "movie",
    format: "film",
    title: "Vertigo",
    titleAr: "دوار",
    year: 1958,
    genres: ["mystery", "thriller", "romance"],
    tags: ["mystery-box", "unreliable-narrator", "mind-bending", "slow-burn"],
    creators: ["Alfred Hitchcock"],
    languages: EN,
    countries: USA,
    synopsis:
      "A detective sidelined by a fear of heights is hired to follow a friend's restless wife through San Francisco, and becomes trapped in an obsession that outlives the truth.",
    synopsisAr:
      "محقّق أوقفه رهاب المرتفعات عن العمل يُستأجر لمراقبة زوجة صديق القلقة عبر سان فرانسيسكو، فيقع في هاوس يبقى بعد انكشاف الحقيقة.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------------ 1960s
  {
    id: "cm-psycho",
    mediaType: "movie",
    format: "film",
    title: "Psycho",
    titleAr: "سايكو",
    year: 1960,
    genres: ["horror", "thriller", "mystery"],
    tags: ["serial-killer", "iconic-villain", "mystery-box", "mind-bending"],
    creators: ["Alfred Hitchcock"],
    languages: EN,
    countries: USA,
    synopsis:
      "A secretary on the run with stolen cash stops at a quiet roadside motel run by a deferential young man and his unseen mother, and a shower scene rewires what movies can make us fear.",
    synopsisAr:
      "سكرتيرة هاربة بمال مسروق تنزل في فندق صغير على الطريق يديره شاب خجول وأمّه التي لا يراها أحد، في مشهد دُشّ يغيّر مفهوم الرعب في السينما.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-breathless",
    mediaType: "movie",
    format: "film",
    title: "Breathless",
    titleAr: "بلا أنفاس",
    originalTitle: "À bout de souffle",
    year: 1960,
    genres: ["crime", "drama", "romance"],
    tags: ["avant-garde", "cat-and-mouse", "road-trip", "nihilist-comedy"],
    creators: ["Jean-Luc Godard"],
    languages: FR,
    countries: FRA,
    synopsis:
      "A small-time Paris thief who models himself on Bogart shoots a cop, hides out with an American student, and talks himself toward the end of the street as the net closes.",
    synopsisAr:
      "لصّ صغير في باريس يتقمّص هيئة نجوم هوليوود يقتل شرطياً ويختبئ مع طالبة أمريكية، وحواراته تقوده خطوة خطوة نحو نهاية الشارع مع اقتراب الشبكة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-lawrence-of-arabia",
    mediaType: "movie",
    format: "film",
    title: "Lawrence of Arabia",
    titleAr: "لورنس العرب",
    year: 1962,
    genres: ["adventure", "drama", "war", "historical"],
    tags: ["character-study", "desert-epic", "thought-provoking", "war-aftermath"],
    creators: ["David Lean"],
    languages: EN,
    countries: GBR,
    synopsis:
      "A young British officer unites rival desert tribes during the Arab Revolt, and the vast sand and war grind away at the legend he is busy becoming.",
    synopsisAr:
      "ضابط بريطاني شاب يوحّد قبائل الصحراء المتنازعة أثناء الثورة العربية الكبرى، بينما تنحت الرمال والحرب في الأسطورة التي يصنعها لنفسه.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-eight-and-a-half",
    mediaType: "movie",
    format: "film",
    title: "8½",
    titleAr: "ثمانية ونصف",
    originalTitle: "Otto e mezzo",
    year: 1963,
    genres: ["drama", "comedy"],
    tags: ["avant-garde", "fourth-wall", "dream-heist", "character-study"],
    creators: ["Federico Fellini"],
    languages: IT,
    countries: ITA,
    synopsis:
      "A famous director with director's block retreats into memories, fantasies and a sanatorium while a film crew waits for him to decide what his next film is even about.",
    synopsisAr:
      "مخرج شهير يعاني جفافاً إبداعياً يلوذ بالذكريات والأحلام ومنتجع صحي، فيما ينتظر فريق التصوير أن يقرر موضوع فيلمه القادم أصلاً.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-dr-strangelove",
    mediaType: "movie",
    format: "film",
    title: "Dr. Strangelove",
    titleAr: "دكتور سترينج لوف",
    year: 1964,
    genres: ["comedy", "war", "sci-fi"],
    tags: ["dark-comedy", "nihilist-comedy", "thought-provoking", "war-aftermath"],
    creators: ["Stanley Kubrick"],
    languages: EN,
    countries: GBR,
    synopsis:
      "A rogue general orders a nuclear strike, and from a single war room the American president, his advisors and the Soviet ambassador fail, hilariously and completely, to stop the end of the world.",
    synopsisAr:
      "جنرال متمرّد يأمر بضربة نووية، ومن غرفة عمليات واحدة يفشل الرئيس الأمريكي ومستشاروه والسفير السوفييتي — بأسلوب هزلي تام — في منع نهاية العالم.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-good-bad-ugly",
    mediaType: "movie",
    format: "film",
    title: "The Good, the Bad and the Ugly",
    titleAr: "الطيب والشرير والقبيح",
    originalTitle: "Il buono, il brutto, il cattivo",
    year: 1966,
    genres: ["action", "adventure", "western"],
    tags: ["cat-and-mouse", "iconic-villain", "high-energy"],
    creators: ["Sergio Leone"],
    languages: IT,
    countries: ITA,
    synopsis:
      "Three gunmen — a stoic drifter, a ruthless mercenary and a bandit with survival instincts — race across a war-torn country for a cache of Confederate gold only one of them can name.",
    synopsisAr:
      "ثلاثة رماحة — رحّال صامت، وقاتل مأجور بلا رحمة، ولصّ يقتل ليبقى — يتسابقون عبر بلد ممزق بالحرب على كنز ذهبي لا يعرف مكانه إلا واحد منهم.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-2001-space-odyssey",
    mediaType: "movie",
    format: "film",
    title: "2001: A Space Odyssey",
    titleAr: "أوديسا الفضاء ٢٠٠١",
    year: 1968,
    genres: ["sci-fi", "adventure", "drama"],
    tags: ["first-contact", "mind-bending", "thought-provoking", "avant-garde"],
    creators: ["Stanley Kubrick"],
    languages: EN,
    countries: GBR,
    synopsis:
      "From a pre-human ape colony to a lunar excavation to a mission to Jupiter, a silent black monogram-monolith nudges evolution along, and one crew faces a computer that would rather not be switched off.",
    synopsisAr:
      "من مستعمرة قردة ما قبل الإنسان إلى حفريات القمر إلى مهمة نحو المشتري، يرافقنا لوح أسود صامت يدفع التطور قدماً، ويواجه طاقم واحد حاسوباً يرفض أن يُطفأ.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------------ 1970s
  {
    id: "cm-the-godfather",
    mediaType: "movie",
    format: "film",
    title: "The Godfather",
    titleAr: "الأب الروحي",
    year: 1972,
    genres: ["crime", "drama"],
    tags: ["family-bonds", "character-study", "iconic-villain", "slow-burn"],
    creators: ["Francis Ford Coppola"],
    languages: EN,
    countries: USA,
    synopsis:
      "The aging patriarch of a New York crime family tries to hand his empire to his sons, and the war-hero youngest who wanted no part of it is drawn in step by reluctant step.",
    synopsisAr:
      "زعيم عائلة مافيا في نيويورك يحاول توريث إمبراطوريته لأبنائه، فينجرف الابن الأصغر، بطل الحرب الذي لم يرد دخول هذا العالم، خطوةً خطوة نحو القمة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-aguirre-wrath-of-god",
    mediaType: "movie",
    format: "film",
    title: "Aguirre, the Wrath of God",
    titleAr: "أغويري، غضب الله",
    year: 1972,
    genres: ["adventure", "drama", "historical"],
    tags: ["character-study", "nature-conflict", "nihilist-comedy", "thought-provoking"],
    creators: ["Werner Herzog"],
    languages: DE,
    countries: DEU,
    synopsis:
      "A Spanish expedition abandons itself to the Amazon in search of El Dorado, and a ranting conquistador leads the starving remnant downriver on a raft that becomes a slow delusion.",
    synopsisAr:
      "بعثة إسبانية تنقاد إلى الأمازون بحثاً عن مدينة الذهب، ويقود غازٍ مهووس ما تبقى من رجاله، جياعاً، على طوف يتحول تدريجياً إلى وهم جامح.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-chinatown",
    mediaType: "movie",
    format: "film",
    title: "Chinatown",
    titleAr: "الحى الصيني",
    year: 1974,
    genres: ["mystery", "crime", "thriller"],
    tags: ["detective-stories", "mystery-box", "class-conflict", "slow-burn"],
    creators: ["Roman Polanski"],
    languages: EN,
    countries: USA,
    synopsis:
      "A cocky Los Angeles private eye takes what looks like a routine adultery case and pulls a thread that unravels into murder, drought-era water theft and one family's unspeakable arrangement.",
    synopsisAr:
      "محقق خاص مغرور في لوس أنجلوس يتسلم قضية خيانة زوجية عادية، فيسحب خيطاً يتكشّف عن جريمة قتل وسرقة ماء في زمن الجفاف واتفاق عائلي لا يُتصور.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-taxi-driver",
    mediaType: "movie",
    format: "film",
    title: "Taxi Driver",
    titleAr: "سائق التاكسي",
    year: 1976,
    genres: ["crime", "drama", "thriller"],
    tags: ["character-study", "violence-questioned", "unreliable-narrator", "urban-loneliness"],
    creators: ["Martin Scorsese"],
    languages: EN,
    countries: USA,
    synopsis:
      "An insomniac Vietnam veteran drives a New York cab through the night shift, keeping a diary that curdles from loneliness into a mission only he understands.",
    synopsisAr:
      "محارب قديم أرقّ من فيتنام يقود تاكسي في ليل نيويورك، ودفتر يومياته يتحول من وحدة إلى مهمة لا يفهمها إلا هو.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-star-wars",
    mediaType: "movie",
    format: "film",
    title: "Star Wars: A New Hope",
    titleAr: "حرب النجوم: أمل جديد",
    year: 1977,
    genres: ["sci-fi", "adventure", "action", "fantasy"],
    tags: ["chosen-one", "found-family", "high-energy", "first-contact"],
    creators: ["George Lucas"],
    languages: EN,
    countries: USA,
    synopsis:
      "A farm boy joins a smuggler, an old knight and two droids to rescue a princess from a planet-killing battle station, and a rebellion gets its first real win.",
    synopsisAr:
      "فتى مزرعة يلتحق بمهرب وفارس عجوز وروبوتين لإنقاذ أميرة من محطة قادرة على إبادة كوكب، فتحقق المقاومة أول انتصار حقيقي لها.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-alien",
    mediaType: "movie",
    format: "film",
    title: "Alien",
    titleAr: "المخلوق الغريب",
    year: 1979,
    genres: ["sci-fi", "horror", "thriller"],
    tags: ["monster-hunting", "iconic-villain", "survival-game", "first-contact"],
    creators: ["Ridley Scott"],
    languages: EN,
    countries: GBR,
    synopsis:
      "The crew of a commercial towing vessel answers a distress signal on a barren moon and brings something perfect and hostile aboard, where corridors, air ducts and silence become weapons.",
    synopsisAr:
      "طاقم سفينة شحن تجارية يستجيب لنداء استغاثة على قمر مقفر، فيُدخل على متنه كائناً معتاداً على القتل، لتصبح الممرات وأنفاق التهوية والصمت فّراغاً للرعب.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------------ 1980s
  {
    id: "cm-the-shining",
    mediaType: "movie",
    format: "film",
    title: "The Shining",
    titleAr: "البريق",
    year: 1980,
    genres: ["horror", "thriller", "mystery"],
    tags: ["family-bonds", "unreliable-narrator", "mind-bending", "iconic-villain"],
    creators: ["Stanley Kubrick"],
    languages: EN,
    countries: GBR,
    synopsis:
      "A writer takes a winter caretaking job at a vast, snowed-in Colorado hotel with his wife and small son, and the building begins working on him long before the axe appears.",
    synopsisAr:
      "كاتب يقبل وظيفة حارس شتوي لفندق ضخم محاصر بالثلوج في كولورادو مع زوجته وابنه الصغير، فيبدأ المبنى بالعمل على عقله قبل أن يظهر الفأس بوقت طويل.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-blade-runner",
    mediaType: "movie",
    format: "film",
    title: "Blade Runner",
    titleAr: "عدّاء النصل",
    year: 1982,
    genres: ["sci-fi", "thriller", "drama"],
    tags: ["dystopian-fiction", "technology-anxiety", "thought-provoking", "slow-burn"],
    creators: ["Ridley Scott"],
    languages: EN,
    countries: USA,
    synopsis:
      "In a rain-soaked future Los Angeles, a weary detective is pulled back in to retire four escaped artificial humans who have come looking for their maker and more life.",
    synopsisAr:
      "في لوس أنجلوس مستقبلية تغرقها الأمطار، يُستدعى محقق منهك لإيقاف أربعة بشر اصطناعيين هاربين جاؤوا يبحثون عن صانعهم وعن عمر أطول.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-back-to-the-future",
    mediaType: "movie",
    format: "film",
    title: "Back to the Future",
    titleAr: "العودة إلى المستقبل",
    year: 1985,
    genres: ["sci-fi", "comedy", "adventure"],
    tags: ["time-travel", "high-energy", "body-swap", "small-town"],
    creators: ["Robert Zemeckis"],
    languages: EN,
    countries: USA,
    synopsis:
      "A teenager is accidentally sent thirty years into the past in a plutonium-powered DeLorean, where he must engineer his own parents' first date or fade out of existence.",
    synopsisAr:
      "مراهق يُرسل بالخطأ ثلاثين عاماً إلى الماضي في سيارة ديلوريان تعمل بالبلوتونيوم، فيضطر أن يرتب أول لقاء بين والديه وإلا تلاشى من الوجود.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-ran",
    mediaType: "movie",
    format: "film",
    title: "Ran",
    titleAr: "ران",
    year: 1985,
    genres: ["action", "drama", "war", "historical"],
    tags: ["family-bonds", "war-aftermath", "thought-provoking", "strategy-battle"],
    creators: ["Akira Kurosawa"],
    languages: JA,
    countries: JPN,
    synopsis:
      "An aging warlord divides his kingdom among his three sons on the promise of loyalty, and pride, flattery and ambition turn the handover into a slow, colour-drenched catastrophe.",
    synopsisAr:
      "زعيم حرب مسنّ يقسم مملكته على أبنائه الثلاثة مقابل وعد بالولاء، فتحوّل الكبرياء والنفاق والطموح التسليم إلى كارثة بطيئة تفيض بالألوان.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-come-and-see",
    mediaType: "movie",
    format: "film",
    title: "Come and See",
    titleAr: "تعال وشاهد",
    originalTitle: "Иди и смотри",
    year: 1985,
    genres: ["war", "drama", "historical"],
    tags: ["war-aftermath", "violence-questioned", "thought-provoking", "character-study"],
    creators: ["Elem Klimov"],
    languages: RU,
    countries: SUN,
    synopsis:
      "A Belarusian boy digs a rifle from the sand to join the partisans, and the German reprisal campaign that follows ages his face and his soul in a matter of days.",
    synopsisAr:
      "صبي بيلاروسي ينبش بندقية من الرمل ليلتحق بالثوار، فتقوم الحملة الألمانية الانتقامية بمن حوله بتشييخ وجهه وروحه في أيام معدودة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-do-the-right-thing",
    mediaType: "movie",
    format: "film",
    title: "Do the Right Thing",
    titleAr: "اصنع الصواب",
    year: 1989,
    genres: ["drama", "comedy"],
    tags: ["social-horror", "small-town", "class-conflict", "high-energy"],
    creators: ["Spike Lee"],
    languages: EN,
    countries: USA,
    synopsis:
      "On the hottest day of the year in one Brooklyn block, a pizza delivery kid, a wall of fame, boom boxes and small indignities keep turning the temperature up until the street boils over.",
    synopsisAr:
      "في أشد أيام السنة حرارة في شارع بروكلين واحد، يرفع فتى يوزع البيتزا وجدار صور المشاهير ومسجلات الصوت والإهانات الصغيرة حرارة الشارع حتى الغليان.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------------ 1990s
  {
    id: "cm-silence-of-the-lambs",
    mediaType: "movie",
    format: "film",
    title: "The Silence of the Lambs",
    titleAr: "صمت الحملان",
    year: 1991,
    genres: ["thriller", "crime", "horror", "mystery"],
    tags: ["serial-killer", "detective-stories", "cat-and-mouse", "iconic-villain"],
    creators: ["Jonathan Demme"],
    languages: EN,
    countries: USA,
    synopsis:
      "An FBI trainee bargains with an imprisoned cannibal psychiatrist for insight into a kidnapper at large, trading fragments of herself for each step closer to the missing girl.",
    synopsisAr:
      "متدربة في الـFBI تفاوض طبيباً نفسياً سجيناً على خيوط تقودها إلى خاطف هارب، فتدفع من نفسها ثمناً مع كل خطوة تقترب بها من الفتاة المفقودة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-schindlers-list",
    mediaType: "movie",
    format: "film",
    title: "Schindler's List",
    titleAr: "قائمة شيندلر",
    year: 1993,
    genres: ["drama", "war", "historical", "biography"],
    tags: ["war-aftermath", "class-conflict", "thought-provoking"],
    creators: ["Steven Spielberg"],
    languages: EN,
    countries: USA,
    synopsis:
      "A German businessman arrives in occupied Kraków to profit from the war and leaves it having spent that fortune keeping over a thousand of his Jewish workers alive.",
    synopsisAr:
      "رجل أعمال ألماني يصل إلى كراكوف المحتلة ليحقق أرباحاً من الحرب، ثم ينفق تلك الثروة كلها ليبقى أكثر من ألف عامل يهودي لديه على قيد الحياة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-pulp-fiction",
    mediaType: "movie",
    format: "film",
    title: "Pulp Fiction",
    titleAr: "خيال رخيص",
    year: 1994,
    genres: ["crime", "drama"],
    tags: ["dark-comedy", "unreliable-narrator", "high-energy", "character-study"],
    creators: ["Quentin Tarantino"],
    languages: EN,
    countries: USA,
    synopsis:
      "Two hitmen, a boxer, a gangster's wife and a briefcase collide across Los Angeles in stories told out of order, held together by diner booths and Scripture-quoting gun barrels.",
    synopsisAr:
      "قاتلان مأجوران وملاكم وزعيم عصابة وحقيفة غامضة تتقاطع مصائرهم في لوس أنجلوس عبر حكايات مبعثرة الترتيب، يجمعها مقاعد مطعم ومسدسات تتلو الموعظة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-chungking-express",
    mediaType: "movie",
    format: "film",
    title: "Chungking Express",
    titleAr: "تشيونغ كينغ إكسبريس",
    originalTitle: "重慶森林",
    year: 1994,
    genres: ["romance", "drama", "crime"],
    tags: ["slice-of-life", "slow-burn", "dream-vs-love", "music-driven"],
    creators: ["Wong Kar-wai"],
    languages: YUE,
    countries: HKG,
    synopsis:
      "Two lovesick Hong Kong policemen orbit the same late-night snack bar — one mourning with tins of expired pineapple, one falling for a woman who breaks into his apartment.",
    synopsisAr:
      "شرطيان هونغ كونغيان عاشقان يدوران حول البار الليلي نفسه: واحد يحتسي الحزن مع علب أناناس منتهية الصلاحية، وآخر يقع على فتاة تتسلل إلى شقته وتعيد ترتيبها.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------------ 2000s
  {
    id: "cm-in-the-mood-for-love",
    mediaType: "movie",
    format: "film",
    title: "In the Mood for Love",
    titleAr: "في مزاج للحب",
    originalTitle: "花樣年華",
    year: 2000,
    genres: ["romance", "drama"],
    tags: ["slow-burn", "dream-vs-love", "music-driven", "character-study"],
    creators: ["Wong Kar-wai"],
    languages: YUE,
    countries: HKG,
    synopsis:
      "Two neighbours in 1960s Hong Kong discover their spouses are having an affair with each other, and the rehearsals they stage of that betrayal grow into something they refuse to name.",
    synopsisAr:
      "جاران في هونغ كونغ الستينيات يكتشفان أن زوجيهما على علاقة ببعضهما، فتتحول تمثيلياتهما لتلك الخيانة إلى شيء أكبر يرفض كلاهما تسميته.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-crouching-tiger",
    mediaType: "movie",
    format: "film",
    title: "Crouching Tiger, Hidden Dragon",
    titleAr: "النمر الرابض والتنين الخفي",
    originalTitle: "臥虎藏龍",
    year: 2000,
    genres: ["action", "romance", "fantasy", "adventure"],
    tags: ["martial-arts", "fairy-tale-dark", "chosen-one", "high-energy"],
    creators: ["Ang Lee"],
    languages: ZH,
    countries: TWN,
    synopsis:
      "A legendary warrior tries to retire, but the theft of a fabled sword by a restless young aristocrat pulls him back toward an old love, a vengeful outcast and rooftops worth crossing.",
    synopsisAr:
      "محارب أسطوري يحاول الاعتزال، لكن سرقة سيف خرافي على يد نبيلة شابة متمردة تعيده نحو حب قديم ومنفية ثأرة وأسطح بيوت تستحق العبور.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-fellowship-of-the-ring",
    mediaType: "movie",
    format: "film",
    title: "The Lord of the Rings: The Fellowship of the Ring",
    titleAr: "سيد الخواتم: رفقة الخاتم",
    year: 2001,
    genres: ["fantasy", "adventure", "drama"],
    tags: ["chosen-one", "found-family", "fairy-tale-dark", "high-energy"],
    creators: ["Peter Jackson"],
    languages: EN,
    countries: ["USA", "New Zealand"],
    synopsis:
      "A shy hobbit inherits a ring of terrible power and sets out from his village with a fellowship of hobbits, men, an elf, a dwarf and a wizard — pursued by the thing it belongs to.",
    synopsisAr:
      "هوبيت خجول يرث خاتماً ذا قوة مرعبة فينطلق من قريته برفقة رفقة من الهوبيت والبشر وجني وقزم وساحر، تطاردهم القوة التي يملك الخاتم سيدها الحقيقي.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-amelie",
    mediaType: "movie",
    format: "film",
    title: "Amélie",
    titleAr: "أميلي",
    year: 2001,
    genres: ["romance", "comedy"],
    tags: ["slice-of-life", "small-town", "found-family", "music-driven"],
    creators: ["Jean-Pierre Jeunet"],
    languages: FR,
    countries: FRA,
    synopsis:
      "A shy Montmartre waitress decides to engineer small, secret happinesses for the people around her — and nearly misses the one meant for her while hiding behind her own schemes.",
    synopsisAr:
      "نادلة خجولة في حي مونمارتر تقرر أن تصنع لحظات سعادة صغيرة سرية لمن حولها، وتكاد تفوّت السعادة المكتوبة لها لأنها تختبئ خططها.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-city-of-god",
    mediaType: "movie",
    format: "film",
    title: "City of God",
    titleAr: "مدينة الله",
    originalTitle: "Cidade de Deus",
    year: 2002,
    genres: ["crime", "drama"],
    tags: ["coming-of-age", "class-conflict", "violence-questioned", "high-energy"],
    creators: ["Fernando Meirelles"],
    languages: PT,
    countries: BRA,
    synopsis:
      "A boy with a camera narrates two decades of a Rio housing project, where his older brother's generation gambled and danced and the next raised war for the drug corners.",
    synopsisAr:
      "فتى يحمل كاميرا يروي عقدين من حياة حي فقير في ريو، حيث راهن جيل أخيه ورقص، ثم ورّث الزوايا لجيل أضمر الحرب على زوايا المخدرات.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-there-will-be-blood",
    mediaType: "movie",
    format: "film",
    title: "There Will Be Blood",
    titleAr: "سيكون هناك دم",
    year: 2007,
    genres: ["drama", "historical"],
    tags: ["character-study", "class-conflict", "nature-conflict", "slow-burn"],
    creators: ["Paul Thomas Anderson"],
    languages: EN,
    countries: USA,
    synopsis:
      "A ruthless silver prospector turns oilman at the dawn of the California boom, and his contempt for men and a preacher's hunger for power drill each other down to the bone.",
    synopsisAr:
      "منقّب فضة قاسٍ يتحول إلى رجل نفط مع فجر طفرة كاليفورنيا، فيتبادل احتقاره للبشر وجوع واعظ للسلطة حفريات تصل إلى العظم.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------------ 2010s
  {
    id: "cm-a-separation",
    mediaType: "movie",
    format: "film",
    title: "A Separation",
    titleAr: "جدایی نادر از سیمین",
    originalTitle: "جدایی نادر از سیمین",
    year: 2011,
    genres: ["drama", "family", "mystery"],
    tags: ["family-bonds", "mystery-box", "class-conflict", "thought-provoking"],
    creators: ["Asghar Farhadi"],
    languages: FA,
    countries: IRN,
    synopsis:
      "A Tehran couple's divorce over emigration leaves their daughter and an ailing grandfather in the middle, and a domestic dispute escalates into a case where everyone lies to protect someone.",
    synopsisAr:
      "طلاق زوجين طهرانيين بسبب قرار الهجرة يترك ابنتهما والداً مريضاً في المنتصف، ويتصاعد خلاف منزلي إلى قضية يكذب فيها الجميع ليحمي أحدهم.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-her",
    mediaType: "movie",
    format: "film",
    title: "Her",
    titleAr: "هي",
    year: 2013,
    genres: ["romance", "sci-fi", "drama"],
    tags: ["technology-anxiety", "dream-vs-love", "slow-burn", "thought-provoking"],
    creators: ["Spike Jonze"],
    languages: EN,
    countries: USA,
    synopsis:
      "A lonely letter-writer in near-future Los Angeles falls in love with his operating system's voice, and the relationship grows in ways no body could keep up with.",
    synopsisAr:
      "كاتب رسائل وحيد في لوس أنجلوس القريبة يقع في حب صوت نظام تشغيله، فتنمو العلاقة في اتجاهات لا يستطيع جسد أن يلاحقها.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-moonlight",
    mediaType: "movie",
    format: "film",
    title: "Moonlight",
    titleAr: "ضوء القمر",
    year: 2016,
    genres: ["drama", "crime"],
    tags: ["coming-of-age", "character-study", "found-family", "slow-burn"],
    creators: ["Barry Jenkins"],
    languages: EN,
    countries: USA,
    synopsis:
      "In three chapters — child, teenager, man — a boy growing up in Miami learns what tenderness costs when the street, his mother and his own silence all demand he be someone else.",
    synopsisAr:
      "في ثلاثة فصول — طفل، فتى، رجل — يتعلم صبي يكبر في ميامي ثمن الرقة حين يطالب الشارع وأمه وصمته بأن يكون شخصاً آخر.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-roma",
    mediaType: "movie",
    format: "film",
    title: "Roma",
    titleAr: "روما",
    year: 2018,
    genres: ["drama", "family"],
    tags: ["family-bonds", "slice-of-life", "class-conflict", "slow-burn"],
    creators: ["Alfonso Cuarón"],
    languages: ES,
    countries: MEX,
    synopsis:
      "A domestic worker holds a middle-class Mexico City household together through a year of abandonments and unrest, in black-and-white images that remember every detail.",
    synopsisAr:
      "عاملة منزلية تُبقي بيتاً من الطبقة الوسطى في مكسيكو سيتي متماسكاً خلال عام من الهجر والاضطرابات، بصور بالأبيض والأسود تتذكر كل تفصيلة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cm-capernaum",
    mediaType: "movie",
    format: "film",
    title: "Capernaum",
    titleAr: "كفرناحوم",
    year: 2018,
    genres: ["drama"],
    tags: ["coming-of-age", "class-conflict", "family-bonds", "thought-provoking"],
    creators: ["Nadine Labaki"],
    languages: AR,
    countries: LBN,
    synopsis:
      "A Beirut street kid sues his parents for giving him life, and the case unspools the slums, shelters and scrapes that raised him while nobody was watching.",
    synopsisAr:
      "طفل شوارع بيروتي يقاضي والديه لأنهما أنجباه، فتكشف القضية الأحياء الفقيرة والملاجئ والمهارب التي ربّته بينما لم يكن أحد يراقب.",
    attribution: CURATED_ATTRIBUTION,
  },
];
