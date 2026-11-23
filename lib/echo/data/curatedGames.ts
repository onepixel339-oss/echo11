/**
 * ECHO — Curated local video-game starter collection (Phase 3).
 *
 * A hand-picked set of widely recognised games — arcade origins, console
 * landmarks and modern titles — spread across decades (1970s–2020s),
 * genres, platforms and developer regions, so the game experience stays
 * useful when RAWG is unconfigured (no deployment API key), disabled
 * or the device is offline.
 *
 * Editorial rules (docs/DATA_PROVIDER_COMPLIANCE.md, same as Phase 2):
 *  - Factual fields (title, year, developer, genre, platform) are
 *    widely-known public information.
 *  - Synopses (EN + AR) are ORIGINAL one/two-liners written for ECHO —
 *    never copied from store pages, wikis or any other catalogue.
 *  - NO ratings, player counts, review scores, sales figures, awards or
 *    popularity claims are stored: fields ECHO cannot verify are omitted.
 *  - Playtime/runtimes are omitted rather than approximated.
 *  - Content ratings are omitted rather than approximated.
 *  - No artwork is bundled — the safe generated placeholder system is used.
 *  - Developer credits go to `studios` (matching the RAWG adapter mapping);
 *    individual designers appear in `creators` only where the attribution
 *    is unambiguous public knowledge.
 *
 * These records ship under the "echo-demo" registry entry (ECHO's approved
 * local catalogue) and are labelled as ECHO-curated sample content in the
 * UI. They are a curated starter collection, NOT a game database.
 */

import type { DemoSeed } from "./demoCatalogue";

const USA = ["USA"];
const JPN = ["Japan"];
const GBR = ["UK"];
const SUN = ["USSR"];
const SWE = ["Sweden"];
const POL = ["Poland"];
const EST = ["Estonia"];
const CHN = ["China"];

const CURATED_ATTRIBUTION = "ECHO curated sample collection — original descriptions";

export const CURATED_GAMES: DemoSeed[] = [
  // ------------------------------------------------------------- 1970s
  {
    id: "cg-pong",
    mediaType: "game",
    format: "game",
    title: "Pong",
    titleAr: "بونغ",
    year: 1972,
    genres: ["sports", "arcade"],
    tags: ["arcade", "high-energy", "nostalgia"],
    studios: ["Atari"],
    countries: USA,
    synopsis:
      "Two paddles and one bouncing ball: a minimalist electronic table-tennis duel that helped start the arcade industry.",
    synopsisAr:
      "مضربان وكرة واحدة تتقافز: مباراة تنس طاولة إلكترونية بمنتهى البساطة ساهمت في انطلاق صناعة ألعاب الأركيد.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-space-invaders",
    mediaType: "game",
    format: "game",
    title: "Space Invaders",
    titleAr: "غزاة الفضاء",
    year: 1978,
    genres: ["shooter", "arcade"],
    tags: ["arcade", "space", "tense"],
    studios: ["Taito"],
    creators: ["Tomohiro Nishikado"],
    countries: JPN,
    synopsis:
      "Rows of pixel aliens march downward while you shuffle a lone laser cannon beneath crumbling bunkers — and the survivors speed up as their formation thins.",
    synopsisAr:
      "صفوف من الغزاة الفضائيين تنزل ببطء بينما تحرك مدفعك الليزري تحت حواجز تتصدّع، ويزداد الباقون سرعة كلما قلّ عددهم.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------- 1980s
  {
    id: "cg-pac-man",
    mediaType: "game",
    format: "game",
    title: "Pac-Man",
    titleAr: "باك مان",
    originalTitle: "Puck Man",
    year: 1980,
    genres: ["arcade", "action"],
    tags: ["arcade", "chase", "high-energy"],
    studios: ["Namco"],
    creators: ["Toru Iwatani"],
    countries: JPN,
    synopsis:
      "A yellow circle eats its way through a maze of dots while four ghosts give chase — each with its own hunting style — until power pellets briefly turn the tables.",
    synopsisAr:
      "دائرة صفراء تلتهم نقاط المتاهة بينما تطاردها أربعة أشباح لكل منها أسلوب مطاردته الخاص، حتى تقلب حبوب الطاقة الموازين لحظياً.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-donkey-kong",
    mediaType: "game",
    format: "game",
    title: "Donkey Kong",
    titleAr: "دونكي كونغ",
    year: 1981,
    genres: ["platformer", "arcade"],
    tags: ["arcade", "chase", "high-energy"],
    studios: ["Nintendo"],
    creators: ["Shigeru Miyamoto"],
    countries: JPN,
    synopsis:
      "A carpenter climbs girders and dodges barrels hurled by a giant ape, trying to reach a captive woman at the top of the construction site.",
    synopsisAr:
      "نجّار يتسلق السقالات ويتفادى البراميل التي يقذفها قرد ضخم، ساعياً للوصول إلى امرأة محتجزة في أعلى موقع البناء.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-tetris",
    mediaType: "game",
    format: "game",
    title: "Tetris",
    titleAr: "تتريس",
    year: 1984,
    genres: ["puzzle"],
    tags: ["puzzle", "nostalgia"],
    creators: ["Alexey Pajitnov"],
    countries: SUN,
    synopsis:
      "Falling shapes must be rotated and slotted into gapless lines; completed rows vanish while the stack keeps rising. Born in the Soviet Union, it later travelled the world on the Game Boy.",
    synopsisAr:
      "أشكال تسقط من الأعلى يجب تدويرها ورصّها في صفوف بلا فراغات تختفي فور اكتمالها بينما يستمر المكدس بالارتفاع. وُلدت في الاتحاد السوفيتي ثم جالت العالم على جهاز غيم بوي.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-super-mario-bros",
    mediaType: "game",
    format: "game",
    title: "Super Mario Bros.",
    titleAr: "سوبر ماريو",
    year: 1985,
    genres: ["platformer"],
    tags: ["nintendo", "whimsical", "high-energy"],
    studios: ["Nintendo"],
    creators: ["Shigeru Miyamoto"],
    countries: JPN,
    franchise: "super-mario",
    synopsis:
      "A plumber sprints through the Mushroom Kingdom, stomping enemies and growing on mushrooms, on his way to rescue a princess from a fire-breathing turtle-dragon.",
    synopsisAr:
      "سبّاك يعدو في مملكة الفطر يدوس على الأعداء ويكبر بتأثير الفطر، في طريقه لإنقاذ أميرة محتجزة لدى تنين سلحفاة ينفث النار.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-legend-of-zelda",
    mediaType: "game",
    format: "game",
    title: "The Legend of Zelda",
    titleAr: "أسطورة زيلدا",
    year: 1986,
    genres: ["action", "adventure"],
    tags: ["nintendo", "exploration", "epic"],
    studios: ["Nintendo"],
    creators: ["Shigeru Miyamoto"],
    countries: JPN,
    franchise: "zelda",
    synopsis:
      "A young explorer roams an open overworld of caves and dungeons, collecting items that unlock new paths, on a quest to gather the scattered pieces of the Triforce.",
    synopsisAr:
      "مستكشف شاب يجوب عالماً مفتوحاً من الكهوف والأبراج، يجمع أدوات تفتح له دروباً جديدة في رحلة جمع قطع الترايفورس المتناثرة.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------- 1990s
  {
    id: "cg-monkey-island",
    mediaType: "game",
    format: "game",
    title: "The Secret of Monkey Island",
    titleAr: "سر جزيرة القرود",
    year: 1990,
    genres: ["adventure", "point-and-click", "comedy"],
    tags: ["pc", "satire", "whimsical"],
    studios: ["Lucasfilm Games"],
    countries: USA,
    synopsis:
      "A wannabe pirate solves insult-based sword duels and absurd puzzles across a quirky Caribbean, out to prove himself and rescue a governor from a ghostly captain.",
    synopsisAr:
      "قرصان طامح يحلّ مبارزات سيوف قائمة على التعبير ومواجهة ألغاز عبثية في كاريبي غريب الأطوار، ليثبت نفسه وينقذ حاكمة من قبطان شبحي.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-sonic",
    mediaType: "game",
    format: "game",
    title: "Sonic the Hedgehog",
    titleAr: "سونيك",
    year: 1991,
    genres: ["platformer"],
    tags: ["high-energy", "chase", "nostalgia"],
    studios: ["Sega"],
    creators: ["Yuji Naka", "Naoto Ohshima"],
    countries: JPN,
    synopsis:
      "A blue hedgehog with attitude blazes through loop-the-loop levels, collecting golden rings and freeing animal friends from a doctor who turns them into robots.",
    synopsisAr:
      "قنفذ أزرق متهور يشق المراحل المليئة بالحلقات بسرعة خاطفة، جامعاً الخواتم الذهبية ومحرراً الأصدقاء الحيوانات من طبيب يحوّلهم إلى روبوتات.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-street-fighter-ii",
    mediaType: "game",
    format: "game",
    title: "Street Fighter II",
    titleAr: "ستريت فايتر 2",
    year: 1991,
    genres: ["fighting", "arcade"],
    tags: ["arcade", "tournament", "martial-arts"],
    studios: ["Capcom"],
    countries: JPN,
    synopsis:
      "A worldwide roster of martial artists, each with signature moves and special attacks, meets in one-on-one bouts that helped define the competitive fighting genre.",
    synopsisAr:
      "قائمة من المقاتلين من مختلف أنحاء العالم، لكل منهم ضرباته المميزة وهجماته الخاصة، يلتقون في نزالات فردية أسست لعرش ألعاب القتال التنافسية.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-doom",
    mediaType: "game",
    format: "game",
    title: "DOOM",
    titleAr: "دوم",
    year: 1993,
    genres: ["shooter"],
    tags: ["pc", "dark", "gritty", "high-energy"],
    studios: ["id Software"],
    creators: ["John Carmack", "John Romero"],
    countries: USA,
    synopsis:
      "A space marine rips through demon-infested Mars bases with a growing arsenal, in the fast first-person shooter that popularized the genre and its mod scene.",
    synopsisAr:
      "جندي من قوات المارينز يخترق قواعد المريخ الغارقة بالشياطين بترسانة تتوسع باستمرار، في لعبة تصويب سريعة من منظور الشخص الأول التي أشاعت النوع وثقافة تعديل الألعاب.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-super-mario-64",
    mediaType: "game",
    format: "game",
    title: "Super Mario 64",
    titleAr: "سوبر ماريو 64",
    year: 1996,
    genres: ["platformer", "adventure"],
    tags: ["nintendo", "exploration", "whimsical"],
    studios: ["Nintendo"],
    creators: ["Shigeru Miyamoto"],
    countries: JPN,
    franchise: "super-mario",
    synopsis:
      "The plumber's first 3D outing: an open castle of paintings, each hiding a world full of stars to collect, with a free-running moveset that set the template for 3D platformers.",
    synopsisAr:
      "أول مغامرة ثلاثية الأبعاد للسبّاك: قلعة مفتوحة من اللوحات يخفي كل لوحة فيها عالماً مليئاً بالنجوم، وبمجموعة حركات حرة أرست قالب ألعاب المنصات ثلاثية الأبعاد.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-final-fantasy-vii",
    mediaType: "game",
    format: "game",
    title: "Final Fantasy VII",
    titleAr: "فاينل فانتسي 7",
    year: 1997,
    genres: ["rpg", "fantasy"],
    tags: ["playstation", "epic", "melancholic", "morality"],
    studios: ["Square"],
    creators: ["Hironobu Sakaguchi"],
    countries: JPN,
    franchise: "final-fantasy",
    synopsis:
      "A mercenary with an oversized sword joins eco-terrorists fighting a corporation that drains the planet's life force, in a Japanese RPG spanning cities, continents and identity crises.",
    synopsisAr:
      "مرتزق يحمل سيفاً ضخماً ينضم إلى مجموعات بيئية مسلحة تقاتل شركة تستنزف قوة الكوكب الحيوية، في لعبة تقمص أدوار يابانية تمتد عبر مدن وقارات وأزمات هوية.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-goldeneye-007",
    mediaType: "game",
    format: "game",
    title: "GoldenEye 007",
    titleAr: "غولدن آي 007",
    year: 1997,
    genres: ["shooter"],
    tags: ["nintendo", "espionage", "tense", "teamwork"],
    studios: ["Rare"],
    countries: GBR,
    synopsis:
      "A Nintendo 64 spy shooter in which James Bond infiltrates installations and silences alarms — and, for a generation of living rooms, defined split-screen multiplayer.",
    synopsisAr:
      "لعبة تجسس على نينتندو 64 يتسلل فيها جيمس بوند إلى المنشآت ويكتم أصوات الإنذارات، وحددت لجيل كامل من غرف المعيشة معنى اللعب الجماعي على الشاشة المنقسمة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-ocarina-of-time",
    mediaType: "game",
    format: "game",
    title: "The Legend of Zelda: Ocarina of Time",
    titleAr: "أسطورة زيلدا: ناي الزمن",
    year: 1998,
    genres: ["action", "adventure", "fantasy"],
    tags: ["nintendo", "time-travel", "epic"],
    studios: ["Nintendo"],
    countries: JPN,
    franchise: "zelda",
    synopsis:
      "A forest boy travels between a bright childhood and a ruined adult future, playing melodies on an ocarina to bend time and confront a desert-born usurper.",
    synopsisAr:
      "فتى الغابة يتنقل بين طفولة مشرقة ومستقبل راشد مدمر، يعزف على الناي أنغاماً تحني الزمن لمواجهة مغتصب جاء من الصحراء.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-half-life",
    mediaType: "game",
    format: "game",
    title: "Half-Life",
    titleAr: "هاف-لايف",
    year: 1998,
    genres: ["shooter", "sci-fi"],
    tags: ["pc", "ai", "tense", "thought-provoking"],
    studios: ["Valve"],
    countries: USA,
    synopsis:
      "A physicist survives a lab experiment gone catastrophically wrong and fights through an alien-infested research facility, with unbroken first-person storytelling and no cutscenes.",
    synopsisAr:
      "فيزيائي ينجو من تجربة مختبرية فشلت فشلاً كارثياً ويقاتل عبر منشأة بحثية تغصّ بالكائنات الفضائية، بسرد متواصل من منظور الشخص الأول دون أي مشاهد مقطوعة.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-metal-gear-solid",
    mediaType: "game",
    format: "game",
    title: "Metal Gear Solid",
    titleAr: "ميتال جير سوليد",
    year: 1998,
    genres: ["action", "adventure", "sci-fi"],
    tags: ["playstation", "espionage", "tense", "thought-provoking"],
    studios: ["Konami"],
    creators: ["Hideo Kojima"],
    countries: JPN,
    synopsis:
      "A special-forces infiltrator sneaks past guards and cameras — favouring stealth over gunfire — to stop a walking nuclear tank, in a cinematic tale of soldiers and their genes.",
    synopsisAr:
      "جندي من القوات الخاصة يتسلل عبر الحراس والكاميرات مقدّماً التخفي على إطلاق النار، ليوقف دبابة نووية ماشية في حكاية سينمائية عن الجنود وجيناتهم.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-starcraft",
    mediaType: "game",
    format: "game",
    title: "StarCraft",
    titleAr: "ستار كرافت",
    year: 1998,
    genres: ["strategy", "sci-fi"],
    tags: ["pc", "space", "strategy-battle", "tactical"],
    studios: ["Blizzard"],
    countries: USA,
    synopsis:
      "Three asymmetric factions — human exiles, insectoid swarms and psychic aliens — wage war across a distant star sector in the real-time strategy classic that became a spectator esport.",
    synopsisAr:
      "ثلاث قوى غير متكافئة — منفيون بشريّون وأسراب حشرية وكائنات ذات قدرات ذهنية — تخوض حرباً في قطاع نجمي بعيد، في كلاسيكية الاستراتيجية اللحظية التي تحولت إلى رياضة يُشاهدها الملايين.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------- 2000s
  {
    id: "cg-the-sims",
    mediaType: "game",
    format: "game",
    title: "The Sims",
    titleAr: "ذا سيمز",
    year: 2000,
    genres: ["simulation", "casual"],
    tags: ["pc", "family-bonds", "transformation"],
    studios: ["Maxis"],
    creators: ["Will Wright"],
    countries: USA,
    synopsis:
      "A dollhouse of everyday life: build homes, steer careers and relationships, and meddle in the small dramas of simulated people who speak in cheerful gibberish.",
    synopsisAr:
      "بيت دمى من الحياة اليومية: ابنِ المنازل وقُد المسارات المهنية والعلاقات، وتدخّل في المسرات الصغيرة لأناس محاكين يتحدثون بلسان مرح غير مفهوم.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-gta-iii",
    mediaType: "game",
    format: "game",
    title: "Grand Theft Auto III",
    titleAr: "غراند ثيفت أوتو 3",
    year: 2001,
    genres: ["action", "adventure", "crime"],
    tags: ["playstation", "satire", "gritty", "high-energy"],
    studios: ["Rockstar North"],
    countries: GBR,
    franchise: "gta",
    synopsis:
      "A silent criminal claws through a fully 3D open city, running errands for mob bosses while the radio drips satire — the sandbox template that countless games followed.",
    synopsisAr:
      "مجرم صامت يزحف عبر مدينة مفتوحة ثلاثية الأبعاد بالكامل، منفذاً مهام زعماء المافيا بينما تقطر الإذاعات هجاءها — قالب العالم المفتوح الذي احتذته ألعاب لا تُحصى.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-halo",
    mediaType: "game",
    format: "game",
    title: "Halo: Combat Evolved",
    titleAr: "هالو: كومبات إيفولفد",
    year: 2001,
    genres: ["shooter", "sci-fi"],
    tags: ["xbox", "space", "teamwork", "epic"],
    studios: ["Bungie"],
    countries: USA,
    synopsis:
      "A super-soldier wakes on a mysterious ringworld and fights an alien war-covenant alongside a talkative artificial intelligence, with two-weapon gunplay, grenades and recharging shields.",
    synopsisAr:
      "جندي خارق يستيقظ على عالم حلقي غامض ويحارب عهداً فضائياً متحارباً برفقة ذكاء اصطناعي ثرثار، بأسلوب قتال بسلاحين وقنابل ودروع تتجدد.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-wow",
    mediaType: "game",
    format: "game",
    title: "World of Warcraft",
    titleAr: "وورلد أوف ووركرافت",
    year: 2004,
    genres: ["mmo", "rpg", "fantasy"],
    tags: ["pc", "epic", "teamwork", "exploration"],
    studios: ["Blizzard"],
    countries: USA,
    synopsis:
      "A persistent online fantasy world where heroes of two warring factions quest, raid and trade across continents — the massively multiplayer game that carried the genre into the mainstream.",
    synopsisAr:
      "عالم فانتازي دائم على الإنترنت يخوض فيه أبطال فريقين متحاربين المهام والغارات والتجارة عبر القارات — اللعبة الجماعية الضخمة التي قادت هذا النوع إلى التيار الرئيسي.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-shadow-of-colossus",
    mediaType: "game",
    format: "game",
    title: "Shadow of the Colossus",
    titleAr: "ظل الكولوسوس",
    originalTitle: "Wanda to Kyozō",
    year: 2005,
    genres: ["action", "adventure", "fantasy"],
    tags: ["playstation", "melancholic", "thought-provoking", "beautiful"],
    studios: ["Team Ico"],
    creators: ["Fumito Ueda"],
    countries: JPN,
    synopsis:
      "A lone rider crosses empty, silent landscapes to fell sixteen towering colossi one by one, in a spare and melancholy quest that weighs the cost of every victory.",
    synopsisAr:
      "فارس وحيد يعبر أراضي خالية صامتة ليُسقط ستة عشر كولوسوساً شامخاً واحداً تلو الآخر، في رحلة متقشفة كئيبة تزن ثمن كل انتصار.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-wii-sports",
    mediaType: "game",
    format: "game",
    title: "Wii Sports",
    titleAr: "وي سبورتس",
    year: 2006,
    genres: ["sports", "family", "casual"],
    tags: ["nintendo", "teamwork", "high-energy"],
    studios: ["Nintendo"],
    countries: JPN,
    synopsis:
      "Tennis, bowling, boxing, golf and baseball played with a wave of the motion-sensing remote — the pack-in game that pulled whole living rooms into playing together.",
    synopsisAr:
      "تنس وبولينغ وملاكمة وجولف وكرة قاعدة تُلعب بتلويح بمشغّل يستشعر الحركة — اللعبة المرفقة مع الجهاز التي جرّت غرف المعيشة بأكملها إلى اللعب معاً.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-portal",
    mediaType: "game",
    format: "game",
    title: "Portal",
    titleAr: "بورتال",
    year: 2007,
    genres: ["puzzle", "sci-fi"],
    tags: ["pc", "mind-bending", "dark-comedy", "thought-provoking"],
    studios: ["Valve"],
    countries: USA,
    synopsis:
      "A test subject solves lethal laboratory chambers by placing two linked portals on any surface, guided — and needled — by a sardonic machine intelligence.",
    synopsisAr:
      "فرد اختبار تحلّ غرف مختبر قاتلة بوضع بوابتين مترابطتين على أي سطح، بمرافقة ذكاء اصطناعي ساخر لا يكف عن التطاول عليها.",
    attribution: CURATED_ATTRIBUTION,
  },

  // ------------------------------------------------------------- 2010s–2020s
  {
    id: "cg-minecraft",
    mediaType: "game",
    format: "game",
    title: "Minecraft",
    titleAr: "ماين كرافت",
    year: 2011,
    genres: ["simulation", "adventure"],
    tags: ["pc", "survival", "exploration", "teamwork"],
    studios: ["Mojang"],
    creators: ["Markus Persson"],
    countries: SWE,
    synopsis:
      "An endless world of blocks to mine, craft and reshape — alone or with friends — where survival, architecture and player-built contraptions all become personal stories.",
    synopsisAr:
      "عالم لا نهائي من المكعبات تُعدّن وتصنع وتعيد تشكيله — منفرداً أو مع الأصدقاء — حيث البقاء والعمارة والآلات التي يبنيها اللاعبون تتحول كلها إلى حكايات شخصية.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-skyrim",
    mediaType: "game",
    format: "game",
    title: "The Elder Scrolls V: Skyrim",
    titleAr: "سكايريم",
    year: 2011,
    genres: ["rpg", "fantasy"],
    tags: ["pc", "playstation", "xbox", "epic", "exploration"],
    studios: ["Bethesda Game Studios"],
    creators: ["Todd Howard"],
    countries: USA,
    synopsis:
      "A dragon-tongued hero roams a snowy Nordic province of mountains, crypts and civil war, shouting words of power while guilds, demons and side quests swallow the main story.",
    synopsisAr:
      "بطل يتكلم لسان التنانين يجوب مقاطعة نوردية مثلجة من جبال وأسراب وحروب أهلية، صائحاً بكلمات القوة بينما تبتلع النقابات والكائنات والمهام الجانبية الحكاية الرئيسية.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-dark-souls",
    mediaType: "game",
    format: "game",
    title: "Dark Souls",
    titleAr: "دارك سولز",
    year: 2011,
    genres: ["rpg", "action", "fantasy"],
    tags: ["playstation", "xbox", "dark", "gritty", "morality"],
    studios: ["FromSoftware"],
    creators: ["Hidetaka Miyazaki"],
    countries: JPN,
    synopsis:
      "A cursed undead wanders a decaying kingdom of deliberate dangers, where every enemy is lethal, death is a mechanic, and progress is earned through patience.",
    synopsisAr:
      "ميت حيّ ملعون يتجول في مملكة متداعية صُممت أخطارها بعناية، حيث كل عدو قاتل، والموت جزء من المنظومة، والتقدم لا يُنال إلا بالصبر.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-last-of-us",
    mediaType: "game",
    format: "game",
    title: "The Last of Us",
    titleAr: "ذا لاست أوف أس",
    year: 2013,
    genres: ["action", "adventure", "horror", "drama"],
    tags: ["playstation", "emotional", "gritty", "survival"],
    studios: ["Naughty Dog"],
    creators: ["Neil Druckmann"],
    countries: USA,
    synopsis:
      "A hardened smuggler escorts a teenage girl across an America ravaged by a fungal plague; the infected are the hazard, but people are the real threat.",
    synopsisAr:
      "مهرب قاسٍ يرافق فتاة مراهقة عبر أمريكا أنهكها طاعون فطري؛ المصابون خطر دائم، لكن البشر هم التهديد الأخطر.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-undertale",
    mediaType: "game",
    format: "game",
    title: "Undertale",
    titleAr: "أندرتيل",
    year: 2015,
    genres: ["rpg", "indie"],
    tags: ["pc", "fourth-wall", "whimsical"],
    studios: ["tobyfox"],
    creators: ["Toby Fox"],
    countries: USA,
    synopsis:
      "A child falls into an underworld of monsters where every fight can be ended with mercy instead of violence — and the game remembers every choice, including yours.",
    synopsisAr:
      "طفل يسقط في عالم سفلي تسكنه الوحوش حيث يمكن إنهاء كل معركة بالرحمة بدل العنف — واللعبة تتذكر كل خيار، بما فيها خياراتك أنت.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-witcher-3",
    mediaType: "game",
    format: "game",
    title: "The Witcher 3: Wild Hunt",
    titleAr: "ذا ويتشر 3",
    year: 2015,
    genres: ["rpg", "fantasy", "adventure"],
    tags: ["pc", "playstation", "xbox", "monster-hunting", "morality"],
    studios: ["CD Projekt Red"],
    countries: POL,
    synopsis:
      "A monster-hunter for hire chases his adopted daughter across a war-torn continent of muddy villages and political intrigue, where every contract hides a moral fog.",
    synopsisAr:
      "صائد وحوش مأجور يلاحق ابنته بالتبني عبر قارة ممزقة بالحرب من قرى موحلة ومؤامرات سياسية، حيث تخفي كل مهمة عقوداً ضباباً أخلاقياً.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-breath-of-the-wild",
    mediaType: "game",
    format: "game",
    title: "The Legend of Zelda: Breath of the Wild",
    titleAr: "أسطورة زيلدا: أنفاس البرية",
    year: 2017,
    genres: ["action", "adventure"],
    tags: ["nintendo", "exploration", "epic", "beautiful"],
    studios: ["Nintendo"],
    countries: JPN,
    franchise: "zelda",
    synopsis:
      "Link wakes from a long slumber to a ruined Hyrule he may climb, cook and glide across in any order — a physics-driven open world that rewired the whole series.",
    synopsisAr:
      "يستيقظ لينك من سبات طويل على هيرول مدمرة يستطيع تسلقها وطهي الطعام فيها والتحليق فوقها بأي ترتيب يختاره — عالم مفتوح يحكمه الفيزياء غيّر مسار السلسلة كلها.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-disco-elysium",
    mediaType: "game",
    format: "game",
    title: "Disco Elysium",
    titleAr: "ديسكو إيليزيوم",
    year: 2019,
    genres: ["rpg", "indie", "mystery"],
    tags: ["pc", "thought-provoking", "melancholic", "investigation"],
    studios: ["ZA/UM"],
    creators: ["Robert Kurvitz"],
    countries: EST,
    synopsis:
      "An amnesiac, spectacularly hung-over detective interrogates a whole town — and his own warring inner voices — in a detective RPG without combat, where skills argue with you and failure writes the story.",
    synopsisAr:
      "محقق فقد ذاكرته ويستيقظ من سُكر مهول يستجوب بلدة بأكملها — وأصواته الداخلية المتنازعة أيضاً — في لعبة تحقيق بلا قتال، حيث تجادله مهاراته والفشل يكتب الحكاية.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-genshin-impact",
    mediaType: "game",
    format: "game",
    title: "Genshin Impact",
    titleAr: "غينشن إمباكت",
    originalTitle: "原神",
    year: 2020,
    genres: ["rpg", "action", "fantasy"],
    tags: ["pc", "playstation", "mobile", "exploration", "epic"],
    studios: ["miHoYo"],
    countries: CHN,
    synopsis:
      "A traveller searches a sprawling anime-styled world of seven nations for a lost sibling, swapping between elemental characters mid-combat in an open world built on free exploration.",
    synopsisAr:
      "مسافر يبحث في عالم شاسع بطابع الأنمي من سبع أمم عن أخٍ ضائع، متنقلاً بين شخصيات عناصرية أثناء القتال في عالم مفتوح بُني على حرية الاستكشاف.",
    attribution: CURATED_ATTRIBUTION,
  },
  {
    id: "cg-elden-ring",
    mediaType: "game",
    format: "game",
    title: "Elden Ring",
    titleAr: "إلدن رينغ",
    year: 2022,
    genres: ["rpg", "action", "fantasy"],
    tags: ["pc", "playstation", "xbox", "dark", "epic"],
    studios: ["FromSoftware"],
    creators: ["Hidetaka Miyazaki"],
    countries: JPN,
    synopsis:
      "A tarnished wanderer rides freely across the Lands Between, toppling demigods and gathering their Great Runes in any order, in the open-world epic from the studio behind Dark Souls.",
    synopsisAr:
      "متشرد مدنّس يعبر الأراضي البينية بحرّية تامة راكباً، مُسقطاً أنصاف الآلهة وجامعاً رموزهم العظيمة بأي ترتيب يشاء، في ملحمة العالم المفتوح من الاستوديو صانع دارك سولز.",
    attribution: CURATED_ATTRIBUTION,
  },
];
