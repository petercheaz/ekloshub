export const publishers = [
  { id: "lifeway", name: "Lifeway VBS" },
  { id: "answers", name: "Answers in Genesis" },
  { id: "group", name: "Group Publishing" },
  { id: "cokesbury", name: "Cokesbury" },
  { id: "concordia", name: "Concordia Publishing House" },
] as const;

export type PublisherId = (typeof publishers)[number]["id"];

export type Program = {
  id: string;
  year: number;
  publisherId: PublisherId;
  theme: string;
};

export type Review = {
  id: string;
  programId: string;
  username: string;
  createdAt: string;
  whatPeopleSay: string;
  biblicalTeaching: number;
  biblicalTeachingNotes: string;
  merchHelp: number;
  merchHelpNotes: string;
  fun: number;
  funNotes: string;
  criticisms: string;
  cost: string;
};

export const programs: Program[] = [
  { id: "lifeway-2024", year: 2024, publisherId: "lifeway", theme: "Breaker Rock Beach" },
  { id: "answers-2024", year: 2024, publisherId: "answers", theme: "The Great Jungle Journey" },
  { id: "group-2024", year: 2024, publisherId: "group", theme: "Scuba" },
  { id: "cokesbury-2024", year: 2024, publisherId: "cokesbury", theme: "Camp Firelight" },
  { id: "concordia-2024", year: 2024, publisherId: "concordia", theme: "Celebrate the Savior" },
  { id: "lifeway-2025", year: 2025, publisherId: "lifeway", theme: "Magnified!" },
  { id: "answers-2025", year: 2025, publisherId: "answers", theme: "Wonder Junction" },
  { id: "group-2025", year: 2025, publisherId: "group", theme: "True North" },
  { id: "cokesbury-2025", year: 2025, publisherId: "cokesbury", theme: "Road Trip" },
  { id: "concordia-2025", year: 2025, publisherId: "concordia", theme: "Epic Australian Adventure" },
  { id: "lifeway-2026", year: 2026, publisherId: "lifeway", theme: "Illumination Station" },
  { id: "answers-2026", year: 2026, publisherId: "answers", theme: "Emerald Crossing" },
  { id: "group-2026", year: 2026, publisherId: "group", theme: "Rainforest Falls" },
  { id: "cokesbury-2026", year: 2026, publisherId: "cokesbury", theme: "Snowball Mountain Challenge" },
  { id: "concordia-2026", year: 2026, publisherId: "concordia", theme: "Tropical Trek" },
  { id: "lifeway-2027", year: 2027, publisherId: "lifeway", theme: "Take Flight" },
  { id: "answers-2027", year: 2027, publisherId: "answers", theme: "Spy U" },
  { id: "group-2027", year: 2027, publisherId: "group", theme: "Crave" },
  { id: "cokesbury-2027", year: 2027, publisherId: "cokesbury", theme: "On the Boardwalk" },
  { id: "concordia-2027", year: 2027, publisherId: "concordia", theme: "Safari Expedition" },
];

export const seedReviews: Review[] = [
  {
    id: "admin-lifeway-2024",
    programId: "lifeway-2024",
    username: "admin",
    createdAt: "2024-03-12T12:00:00.000Z",
    whatPeopleSay:
      "Churches liked the beach energy and the clear gospel invitations. Volunteers said rotation schedules were easy to staff, and kids remembered the 'God is a firm foundation' language weeks later.",
    biblicalTeaching: 4,
    biblicalTeachingNotes:
      "Solid Baptist conservative lessons with daily application. Not as verse-dense as Answers, but Jesus and Scripture stay at the center.",
    merchHelp: 5,
    merchHelpNotes:
      "T-shirts, inflatables, and décor kits are everywhere. Lifeway’s shop and third-party printers made volunteer shirts and photo backdrops simple.",
    fun: 5,
    funNotes: "Surf-and-sand games, snacks, and music were a hit with elementary kids. Preschool rooms needed extra shade/décor help.",
    criticisms:
      "Some directors felt the Bible content was thinner than the décor. Outdoor/beach execution is pricey if you do not already own large set pieces.",
    cost: "Starter kit about $150–$200; decorating and shirts often $12–$18 per child.",
  },
  {
    id: "admin-answers-2024",
    programId: "answers-2024",
    username: "admin",
    createdAt: "2024-03-18T12:00:00.000Z",
    whatPeopleSay:
      "Families who wanted creation-focused teaching praised The Great Jungle Journey. Directors called the leader guides exhaustive—almost a training course in a box.",
    biblicalTeaching: 5,
    biblicalTeachingNotes:
      "Strongest doctrinal load of the year: Genesis, gospel, and apologetics for kids. Teachers need prep time; it does not skim.",
    merchHelp: 3,
    merchHelpNotes:
      "Official shirts and jungle décor exist, but the catalog is smaller than Lifeway or Group. Many churches mixed in generic jungle sets.",
    fun: 4,
    funNotes: "Missions, crafts, and animal motifs kept kids engaged. A few reported the teaching blocks ran long for younger grades.",
    criticisms:
      "Heavy content can overwhelm brand-new teachers. Music and merch feel less 'wow' than Group’s ocean set.",
    cost: "Super Starter Kit often $200–$280; per-child extras usually $10–$14 if you keep décor simple.",
  },
  {
    id: "admin-group-2024",
    programId: "group-2024",
    username: "admin",
    createdAt: "2024-03-20T12:00:00.000Z",
    whatPeopleSay:
      "Scuba was the crowd-pleaser. People talked about the underwater room makeovers, the music, and how easy it was to recruit because kids begged to come back.",
    biblicalTeaching: 3,
    biblicalTeachingNotes:
      "Relationship-with-God themes more than systematic Bible. Fine for many churches; some pastors wanted more Scripture memory and doctrine.",
    merchHelp: 5,
    merchHelpNotes:
      "Group’s decorating philosophy is the product. Purchasable backdrops, inflatables, shirts, and station kits are excellent and well documented.",
    fun: 5,
    funNotes: "Highest fun scores of 2024. Games and snacks matched the scuba theme without much DIY invention.",
    criticisms:
      "Cost is the recurring complaint. Bible depth is lighter. If you skip the big décor package, the 'wow' drops fast.",
    cost: "Ultimate Starter Kit often $400+; themed décor and shirts commonly $18–$25 per child.",
  },
  {
    id: "admin-cokesbury-2024",
    programId: "cokesbury-2024",
    username: "admin",
    createdAt: "2024-03-22T12:00:00.000Z",
    whatPeopleSay:
      "Camp Firelight felt warm and manageable for smaller United Methodist and mainline churches. Volunteers liked the campfire storytelling tone.",
    biblicalTeaching: 3,
    biblicalTeachingNotes:
      "Trusting God / community themes. More narrative than doctrinal. Works if your church already supplies theological framing.",
    merchHelp: 4,
    merchHelpNotes:
      "Camp-style shirts and modest décor packs are available. Not as cinematic as Group, but enough lanterns, banners, and tees to look finished.",
    fun: 4,
    funNotes: "Camp games and evening-glow motifs were a sweet spot for mixed-age groups. Not as loud as Scuba.",
    criticisms:
      "Some evangelical directors wanted a clearer salvation presentation. Promo videos and merch drop later than Lifeway’s.",
    cost: "Starter kits typically $120–$180; shirts and décor often $9–$14 per child.",
  },
  {
    id: "admin-concordia-2024",
    programId: "concordia-2024",
    username: "admin",
    createdAt: "2024-03-25T12:00:00.000Z",
    whatPeopleSay:
      "Lutheran churches appreciated Celebrate the Savior staying on Jesus rather than a gimmick. People said it felt like church, not a theme park.",
    biblicalTeaching: 5,
    biblicalTeachingNotes:
      "Christ-centered, law-and-gospel friendly. Daily Bible stories aim at the Savior, not just character traits.",
    merchHelp: 3,
    merchHelpNotes:
      "Basic tees and classroom kits exist. Decorating help is thinner; churches often DIY banners and use what they already own.",
    fun: 3,
    funNotes: "Steady crafts and games, less spectacle. Kids who wanted a big set felt it was quieter.",
    criticisms:
      "Theme identity is softer, so social media photos look less 'VBS viral.' Fewer purchasable large décor items.",
    cost: "Starter kit often $100–$160; extras usually $8–$12 per child.",
  },
  {
    id: "admin-lifeway-2025",
    programId: "lifeway-2025",
    username: "admin",
    createdAt: "2025-02-08T12:00:00.000Z",
    whatPeopleSay:
      "Magnified! got praise for helping kids talk about God’s greatness without watering down the gospel. Music was stuck in volunteers’ heads all summer.",
    biblicalTeaching: 4,
    biblicalTeachingNotes:
      "Psalm 34:3 thread, daily attributes of God, and clear gospel conversations. A notch more focused than the 2024 beach year.",
    merchHelp: 5,
    merchHelpNotes:
      "Bug/ magnify décor, shirts, and photo ops were easy to buy. Lifeway plus Etsy/LifeWay Marketplace filled gaps fast.",
    fun: 4,
    funNotes: "Crafts with lenses and 'tiny wonders' were clever. A few said the science-lab vibe needed more games to stay high-energy.",
    criticisms:
      "Décor can look busy if you buy every SKU. Some preschool teachers wanted simpler Bible phrasing.",
    cost: "Starter kit about $160–$210; shirts and décor commonly $12–$18 per child.",
  },
  {
    id: "admin-answers-2025",
    programId: "answers-2025",
    username: "admin",
    createdAt: "2025-02-11T12:00:00.000Z",
    whatPeopleSay:
      "Wonder Junction felt like a teaching railroad: tightly planned, creation-affirming, and serious about Scripture. Homeschool-heavy churches loved it.",
    biblicalTeaching: 5,
    biblicalTeachingNotes:
      "Train-station theme wrapped around biblical authority and the gospel. Teacher books assume you will actually study.",
    merchHelp: 3,
    merchHelpNotes:
      "Railroad shirts and some set pieces are sold, but you will still build cardboard trains. Not a one-click décor universe.",
    fun: 4,
    funNotes: "Station rotations and conductor bits were fun. Younger kids needed shorter lesson segments.",
    criticisms:
      "Prep hours are high. Churches wanting a turnkey party atmosphere picked Group instead.",
    cost: "Kits often $210–$290; modest décor path about $10–$15 per child.",
  },
  {
    id: "admin-group-2025",
    programId: "group-2025",
    username: "admin",
    createdAt: "2025-02-14T12:00:00.000Z",
    whatPeopleSay:
      "True North was called 'camp week at church.' People raved about wilderness décor and how easy it was to get dads to volunteer for games.",
    biblicalTeaching: 3,
    biblicalTeachingNotes:
      "God as guide / trust themes. Experiential and sticky, lighter on verse-by-verse or doctrine.",
    merchHelp: 5,
    merchHelpNotes:
      "Tents, trees, trail signs, and shirts are a well-oiled catalog. Decorating instructions are among the best in the industry.",
    fun: 5,
    funNotes: "Outdoor-feel games even indoors. Kids rated it a highlight year.",
    criticisms:
      "Price and storage of bulky décor. A minority wanted a more explicit cross-centered close each day.",
    cost: "Ultimate kits $400–$500 range; all-in shirts and sets often $18–$26 per child.",
  },
  {
    id: "admin-cokesbury-2025",
    programId: "cokesbury-2025",
    username: "admin",
    createdAt: "2025-02-16T12:00:00.000Z",
    whatPeopleSay:
      "Road Trip was easy to explain to families: pack the van, follow God. Small churches said it scaled without a warehouse of props.",
    biblicalTeaching: 3,
    biblicalTeachingNotes:
      "Journey stories and trusting God on the way. Accessible, not a systematic theology week.",
    merchHelp: 4,
    merchHelpNotes:
      "Suitable tees, suitcase cutouts, and road signs. Enough purchasable décor to look themed without a full studio.",
    fun: 4,
    funNotes: "License-plate crafts and 'pit stop' games were a hit. Energy sits between Concordia and Group.",
    criticisms:
      "Some found the metaphor cute but the Bible spine forgettable. Marketing is quieter than Lifeway.",
    cost: "Starter kits $125–$185; extras about $9–$14 per child.",
  },
  {
    id: "admin-concordia-2025",
    programId: "concordia-2025",
    username: "admin",
    createdAt: "2025-02-19T12:00:00.000Z",
    whatPeopleSay:
      "Epic Australian Adventure gave Lutheran VBS a clearer visual hook than 2024. Directors liked that the Savior still showed up in every lesson.",
    biblicalTeaching: 5,
    biblicalTeachingNotes:
      "Outback wrapper, Jesus core. Daily stories stay gospel-forward rather than only marveling at creation.",
    merchHelp: 3,
    merchHelpNotes:
      "Some animal/outback shirts and printables. Large décor still mostly DIY corrugated and print-your-own.",
    fun: 4,
    funNotes: "Kids liked the animals and 'walkabout' stations. More playful than Celebrate the Savior.",
    criticisms:
      "Theme can overshadow the Lutheran catechesis if teachers lean too hard on kangaroos. Merch catalog is still slim.",
    cost: "Kits about $110–$170; typical extras $8–$13 per child.",
  },
  {
    id: "admin-lifeway-2026",
    programId: "lifeway-2026",
    username: "admin",
    createdAt: "2026-01-20T12:00:00.000Z",
    whatPeopleSay:
      "Illumination Station was the 'who is Jesus?' year. Pastors liked the cultural-questions angle; kids liked glow, light, and music.",
    biblicalTeaching: 5,
    biblicalTeachingNotes:
      "John 8:12 and daily claims about Jesus. Stronger Christology than several recent Lifeway themes.",
    merchHelp: 5,
    merchHelpNotes:
      "Glow-in-the-dark shirts, light-up décor, and station kits sold well. Plenty of official and unofficial suppliers.",
    fun: 4,
    funNotes: "Black-light rooms were memorable. A few safety/volunteer notes about dark rooms and preschoolers.",
    criticisms:
      "Glow décor adds cost and fire-code questions. Some felt five days of 'who Jesus is' still needed more Old Testament story variety.",
    cost: "Starter kit $160–$220; glow décor and shirts often $13–$19 per child.",
  },
  {
    id: "admin-answers-2026",
    programId: "answers-2026",
    username: "admin",
    createdAt: "2026-01-22T12:00:00.000Z",
    whatPeopleSay:
      "Emerald Crossing’s Ireland setting was fresh. Creation-defending churches said the teaching still had the Answers backbone.",
    biblicalTeaching: 5,
    biblicalTeachingNotes:
      "Biblical authority and gospel through a Celtic-adventure frame. Teacher guides remain the densest in this comparison.",
    merchHelp: 3,
    merchHelpNotes:
      "Limited official tees and castle/green décor. Most 'wow' walls were volunteer-built.",
    fun: 4,
    funNotes: "Maps, quests, and music worked. Less instantly recognizable than jungle or scuba.",
    criticisms:
      "Theme is less merchandised. New volunteers can bounce off the lesson length.",
    cost: "Kits $210–$300; DIY-heavy décor path $10–$16 per child.",
  },
  {
    id: "admin-group-2026",
    programId: "group-2026",
    username: "admin",
    createdAt: "2026-01-25T12:00:00.000Z",
    whatPeopleSay:
      "Rainforest Falls looked incredible in photos. People said attendance jumped because last year’s families wanted another Group production.",
    biblicalTeaching: 3,
    biblicalTeachingNotes:
      "God’s character and belonging. High experiential learning, moderate Bible literacy goals.",
    merchHelp: 5,
    merchHelpNotes:
      "Waterfall walls, canopy ceilings, shirts, and station crates. Decorating help is still Group’s superpower.",
    fun: 5,
    funNotes: "Kinetic, colorful, snack-friendly. Middle school helpers wanted to stay in the rooms.",
    criticisms:
      "Budget shock. Some theology watchers wanted more sin/grace language and fewer vibes.",
    cost: "Ultimate kits often $425–$550; immersive décor plus tees $20–$28 per child.",
  },
  {
    id: "admin-cokesbury-2026",
    programId: "cokesbury-2026",
    username: "admin",
    createdAt: "2026-01-28T12:00:00.000Z",
    whatPeopleSay:
      "Snowball Mountain Challenge was a sleeper hit for winter-loving teams in July. Easy to theme with what thrift stores already have.",
    biblicalTeaching: 3,
    biblicalTeachingNotes:
      "Perseverance and trusting God on the mountain. Fine stories; not a doctrine boot camp.",
    merchHelp: 4,
    merchHelpNotes:
      "Beanies, snow-themed tees, and cardboard peaks are buyable. Less SKU explosion than Group, which some directors preferred.",
    fun: 4,
    funNotes: "Indoor 'snow' games (pom-poms, plastic) made July funny. Energy is playful rather than epic.",
    criticisms:
      "Snow in summer confused a few families. Bible takeaway varied by teacher quality.",
    cost: "Starter kits $130–$190; extras about $10–$15 per child.",
  },
  {
    id: "admin-concordia-2026",
    programId: "concordia-2026",
    username: "admin",
    createdAt: "2026-02-02T12:00:00.000Z",
    whatPeopleSay:
      "Tropical Trek felt like Concordia answering the 'we need a look' complaint. Lutheran directors still trusted the lessons.",
    biblicalTeaching: 5,
    biblicalTeachingNotes:
      "Jungle wrapper, Jesus still the destination. Catechism-friendly language available if you use their extras.",
    merchHelp: 4,
    merchHelpNotes:
      "Better shirt and leaf/vine options than 2024. Still not a full marketplace like Lifeway.",
    fun: 4,
    funNotes: "Tropical snacks and explorer games lifted the fun score without turning it into a theme park.",
    criticisms:
      "Can look like every other jungle VBS from across the street. Some wanted more distinctly Lutheran songs.",
    cost: "Kits $115–$175; shirts and plants $9–$14 per child.",
  },
  {
    id: "admin-lifeway-2027",
    programId: "lifeway-2027",
    username: "admin",
    createdAt: "2026-09-15T12:00:00.000Z",
    whatPeopleSay:
      "Early Take Flight samples and the theme reveal landed well: God’s faithfulness, aviation, and a verse people already know (Psalm 100:5). Planning teams expect strong music and a clear gospel close.",
    biblicalTeaching: 4,
    biblicalTeachingNotes:
      "Promised daily stories on God’s faithfulness. Looks like classic Lifeway: conservative, invitational, not as apologetics-heavy as Answers.",
    merchHelp: 5,
    merchHelpNotes:
      "Clouds, planes, and sky shirts are already showing up from official and third-party shops. Decorating help should be abundant by spring.",
    fun: 4,
    funNotes: "Flight-themed rec and crafts should play. Watch ceiling clutter and 'airplane' noise in small fellowships.",
    criticisms:
      "Aviation décor can get expensive if you chase inflatable planes. Preview materials are still rolling out, so rotation details may shift.",
    cost: "Expect starter kits around $165–$225; shirts and sky décor likely $13–$20 per child.",
  },
  {
    id: "admin-answers-2027",
    programId: "answers-2027",
    username: "admin",
    createdAt: "2026-09-16T12:00:00.000Z",
    whatPeopleSay:
      "Spy U is the curiosity pick: kids love spies, and Answers is framing it as spotting counterfeits and finding the one true God. Creation-minded churches are already holding dates.",
    biblicalTeaching: 5,
    biblicalTeachingNotes:
      "Psalm 86:10 and discernment/gospel. Expect the usual Answers depth—teachers should not wing it.",
    merchHelp: 3,
    merchHelpNotes:
      "Spy badges and dark-shirt merch will exist; giant official set pieces will be fewer than Group. Plan on DIY 'headquarters.'",
    fun: 5,
    funNotes: "Missions, codes, and gadgets should be extremely fun if you do not let lessons run past kids’ attention.",
    criticisms:
      "Spy themes can drift into scare or sarcasm if volunteers improvise. Prep time will still be the tax you pay for the theology.",
    cost: "Kits likely $220–$310; gadget crafts and tees about $11–$17 per child.",
  },
  {
    id: "admin-group-2027",
    programId: "group-2027",
    username: "admin",
    createdAt: "2026-09-18T12:00:00.000Z",
    whatPeopleSay:
      "Crave is being talked about as Group’s hunger/fulfillment year. People who buy Group for the room transform are waiting on the decorating playbook.",
    biblicalTeaching: 3,
    biblicalTeachingNotes:
      "Expect God-satisfies / Jesus-meets-our-need themes. Historically Group stays experiential over exegetical.",
    merchHelp: 5,
    merchHelpNotes:
      "If the last five years hold, shirts, snack-station décor, and large visuals will be the easiest in this set to purchase.",
    fun: 5,
    funNotes: "Food-adjacent themes usually score high on snacks and games. Anticipate high energy and high mess.",
    criticisms:
      "Name and food motif may feel gimmicky to some boards. Budget will almost certainly be the top complaint again.",
    cost: "Ultimate kits historically $430+; plan $20–$28 per child if you decorate like the catalog.",
  },
  {
    id: "admin-cokesbury-2027",
    programId: "cokesbury-2027",
    username: "admin",
    createdAt: "2026-09-20T12:00:00.000Z",
    whatPeopleSay:
      "On the Boardwalk reads as friendly and photogenic for mid-size churches. Directors comparing 2027 options like that it does not require a warehouse.",
    biblicalTeaching: 3,
    biblicalTeachingNotes:
      "Likely community, joy, and following Jesus on the way. Confirm the salvation language against your church’s expectations.",
    merchHelp: 4,
    merchHelpNotes:
      "Stripes, tickets, and boardwalk tees should be easy. Purchasable décor should beat Concordia, trail Group.",
    fun: 4,
    funNotes: "Carnival/boardwalk games are naturally fun without a $2,000 backdrop.",
    criticisms:
      "Can look secular-carnival if the Bible thread is weak. Promo volume is smaller, so recruiting via theme video may lag.",
    cost: "Starter kits likely $135–$195; tees and tickets décor about $10–$16 per child.",
  },
  {
    id: "admin-concordia-2027",
    programId: "concordia-2027",
    username: "admin",
    createdAt: "2026-09-22T12:00:00.000Z",
    whatPeopleSay:
      "Safari Expedition is Concordia leaning into a classic kids theme while keeping James 1:17 / God’s gifts in view. Lutheran teams see it as the most 'decorate-able' CPH year in this set.",
    biblicalTeaching: 5,
    biblicalTeachingNotes:
      "Explorer theme, God as giver, Christ still the gift. Should remain the most confessionally careful option.",
    merchHelp: 4,
    merchHelpNotes:
      "Animal tees and safari hats will be easy to source even if CPH’s own SKU list stays short. Binocular crafts are cheap.",
    fun: 4,
    funNotes: "Safari stations and animals should raise fun without Group’s price tag.",
    criticisms:
      "Safari is a crowded VBS look. If lessons go generic, it will not differentiate from older jungle years.",
    cost: "Kits likely $115–$180; hats, tees, and printables $9–$14 per child.",
  },
  {
    id: "maria-lifeway-2024",
    programId: "lifeway-2024",
    username: "maria.santos",
    createdAt: "2024-06-22T15:10:00.000Z",
    whatPeopleSay:
      "Breaker Rock Beach was easy to staff with bilingual helpers. Kids sang the foundation songs in the car all week.",
    biblicalTeaching: 4,
    biblicalTeachingNotes: "Clear gospel invitation each day. Spanish resources existed but we still translated two crafts.",
    merchHelp: 5,
    merchHelpNotes: "Shirt colors matched the backdrop. We ordered extras from a local printer using Lifeway art.",
    fun: 5,
    funNotes: "Beach games and the foam rock wall were the photo magnets.",
    criticisms: "Sand table made a mess of the fellowship hall HVAC vents.",
    cost: "About $17 per child with shirts.",
  },
  {
    id: "tom-lifeway-2024",
    programId: "lifeway-2024",
    username: "tom.walters",
    createdAt: "2024-07-08T11:00:00.000Z",
    whatPeopleSay: "Fun week, but our pastor wanted more verse work than the leader guide pushed.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "Application-heavy. We added a memory-verse station.",
    merchHelp: 4,
    merchHelpNotes: "Décor kit looked finished once we owned the inflatable.",
    fun: 4,
    funNotes: "Elementary loved it. Preschool needed a quieter room.",
    criticisms: "Outdoor beach execution is expensive if you do not already own sets.",
    cost: "We spent closer to $22 per child chasing the catalog look.",
  },
  {
    id: "james-answers-2024",
    programId: "answers-2024",
    username: "james.okonkwo",
    createdAt: "2024-06-30T13:40:00.000Z",
    whatPeopleSay:
      "The Great Jungle Journey trained our new teachers. Parents who wanted creation teaching stayed for the closing program.",
    biblicalTeaching: 5,
    biblicalTeachingNotes: "Genesis through gospel without apology. Prep nights were required.",
    merchHelp: 3,
    merchHelpNotes: "We mixed Answers banners with generic jungle cloth.",
    fun: 4,
    funNotes: "Animal crafts landed. Teaching blocks ran long for first grade.",
    criticisms: "Not a last-minute curriculum. Music is thinner than Group.",
    cost: "Super Starter plus copies ran about $12 per child.",
  },
  {
    id: "sofia-group-2024",
    programId: "group-2024",
    username: "sofia.nguyen",
    createdAt: "2024-07-14T16:20:00.000Z",
    whatPeopleSay: "Scuba filled the building. Kids dragged neighbors. The underwater hallway was worth the late nights.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "Warm Jesus-loves-you tone. We added a pastor talk on Wednesday.",
    merchHelp: 5,
    merchHelpNotes: "If you buy the decorating philosophy, it just works.",
    fun: 5,
    funNotes: "Highest energy week we have hosted.",
    criticisms: "Budget meeting was uncomfortable. Skipping décor kills the wow.",
    cost: "North of $24 per child once shirts and the kit landed.",
  },
  {
    id: "pastor-cokesbury-2024",
    programId: "cokesbury-2024",
    username: "pastor.reed",
    createdAt: "2024-07-02T10:05:00.000Z",
    whatPeopleSay: "Camp Firelight fit a small UMC. Volunteers were not scared of the leader guides.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "Trust and community stories. We framed salvation on Friday ourselves.",
    merchHelp: 4,
    merchHelpNotes: "Lanterns and camp tees were enough.",
    fun: 4,
    funNotes: "Mixed-age games felt like actual camp.",
    criticisms: "Promo dropped late. Not a spectacle week.",
    cost: "Starter and shirts about $11 per child.",
  },
  {
    id: "dce-concordia-2024",
    programId: "concordia-2024",
    username: "dce.hanna",
    createdAt: "2024-06-18T12:30:00.000Z",
    whatPeopleSay: "Celebrate the Savior felt like church. Parents thanked us for keeping Jesus in the title.",
    biblicalTeaching: 5,
    biblicalTeachingNotes: "Law and gospel held. Daily stories aimed at the Savior.",
    merchHelp: 3,
    merchHelpNotes: "We printed our own banners. Official tees were plain.",
    fun: 3,
    funNotes: "Steady crafts. Kids who wanted a big set called it quiet.",
    criticisms: "Social photos looked less like VBS viral.",
    cost: "Kit plus copies near $10 per child.",
  },
  {
    id: "lily-lifeway-2025",
    programId: "lifeway-2025",
    username: "lily.chen",
    createdAt: "2025-07-11T14:00:00.000Z",
    whatPeopleSay: "Magnified! science motifs helped us recruit public-school families. Gospel presentations were still clear.",
    biblicalTeaching: 4,
    biblicalTeachingNotes: "Wonder at creation plus Jesus. We wished for one more memory verse.",
    merchHelp: 5,
    merchHelpNotes: "Glow and magnify décor is everywhere. Shirts sold out locally.",
    fun: 5,
    funNotes: "Lab snacks and flashlight games were a hit.",
    criticisms: "Black lights make some kids overstimulated.",
    cost: "About $16 per child.",
  },
  {
    id: "rachel-lifeway-2025",
    programId: "lifeway-2025",
    username: "rachel.owens",
    createdAt: "2025-08-01T09:40:00.000Z",
    whatPeopleSay: "We liked Magnified! but the rotation chart assumed more rooms than we have.",
    biblicalTeaching: 4,
    biblicalTeachingNotes: "Solid. Not as dense as Answers.",
    merchHelp: 4,
    merchHelpNotes: "Third-party shirts looked official enough.",
    fun: 4,
    funNotes: "Elementary loved it. Twos needed a simpler craft.",
    criticisms: "Music USB went missing day two and nobody had a backup login.",
    cost: "$15 per child without the inflatable.",
  },
  {
    id: "grace-answers-2025",
    programId: "answers-2025",
    username: "grace.kim",
    createdAt: "2025-07-20T18:15:00.000Z",
    whatPeopleSay: "Wonder Junction felt like a teaching week, not a party. Our older kids asked better questions.",
    biblicalTeaching: 5,
    biblicalTeachingNotes: "Railroad theme did not dilute the Bible. Teacher books are thick.",
    merchHelp: 3,
    merchHelpNotes: "We built a depot from cardboard. Official shirts were fine.",
    fun: 4,
    funNotes: "Train games worked. Younger kids glazed during the longest talks.",
    criticisms: "New volunteers need a training night.",
    cost: "About $13 per child.",
  },
  {
    id: "marcus-group-2025",
    programId: "group-2025",
    username: "marcus.bell",
    createdAt: "2025-07-28T12:00:00.000Z",
    whatPeopleSay: "True North looked incredible on Instagram. Kids came back all five nights.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "Following God / adventure. We inserted extra Scripture cards.",
    merchHelp: 5,
    merchHelpNotes: "Trail signs and trees are the product.",
    fun: 5,
    funNotes: "Camp energy without leaving the gym.",
    criticisms: "Price. Also storage after week is over.",
    cost: "We hit $26 per child with the decorating kit.",
  },
  {
    id: "kim-cokesbury-2025",
    programId: "cokesbury-2025",
    username: "kim.patel",
    createdAt: "2025-07-16T11:25:00.000Z",
    whatPeopleSay: "Road Trip was cute for a church that travels light. Suitcase photo booth was the whole décor plan.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "Journey with God stories. Fine if you add your own invitation.",
    merchHelp: 4,
    merchHelpNotes: "License-plate crafts and tees were enough.",
    fun: 4,
    funNotes: "Map games and snacks traveled well between sites.",
    criticisms: "Felt smaller than Lifeway that year.",
    cost: "Around $12 per child.",
  },
  {
    id: "pastor-concordia-2025",
    programId: "concordia-2025",
    username: "pastor.reed",
    createdAt: "2025-06-29T17:00:00.000Z",
    whatPeopleSay: "Epic Australian Adventure kept Jesus in view even with the animals. Our DCE liked the lesson cadence.",
    biblicalTeaching: 5,
    biblicalTeachingNotes: "Christ-centered with a travel wrapper.",
    merchHelp: 3,
    merchHelpNotes: "Hats were the merch. We printed maps.",
    fun: 4,
    funNotes: "Kids liked the animal stations more than the songs.",
    criticisms: "Theme is easy to confuse with older jungle years.",
    cost: "Kit plus hats about $11 per child.",
  },
  {
    id: "maria-lifeway-2026",
    programId: "lifeway-2026",
    username: "maria.santos",
    createdAt: "2026-07-09T13:50:00.000Z",
    whatPeopleSay: "Illumination Station glow rooms made recruiting easy. Families posted photos every night.",
    biblicalTeaching: 4,
    biblicalTeachingNotes: "Light of the world held together. We wanted one deeper discussion prompt for 5th grade.",
    merchHelp: 5,
    merchHelpNotes: "Black-light kits and shirts were simple to source.",
    fun: 5,
    funNotes: "Glow games were the week.",
    criticisms: "Need extra adult eyes in dark rooms.",
    cost: "About $18 per child with bulbs.",
  },
  {
    id: "nina-lifeway-2026",
    programId: "lifeway-2026",
    username: "nina.brooks",
    createdAt: "2026-08-02T19:10:00.000Z",
    whatPeopleSay: "Pretty week. A few parents said it felt more décor than Bible.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "We padded Wednesday with a pastor story.",
    merchHelp: 5,
    merchHelpNotes: "Catalog looks finished if you buy it.",
    fun: 4,
    funNotes: "Kids had a blast. Volunteers were tired of tape.",
    criticisms: "Dark rooms plus sugar snacks was a lot.",
    cost: "$19 per child.",
  },
  {
    id: "james-answers-2026",
    programId: "answers-2026",
    username: "james.okonkwo",
    createdAt: "2026-07-18T15:00:00.000Z",
    whatPeopleSay: "Emerald Crossing asked more of teachers and they rose to it. Parents noticed the difference.",
    biblicalTeaching: 5,
    biblicalTeachingNotes: "Doctrinal without being dry if you prep.",
    merchHelp: 3,
    merchHelpNotes: "Castle flats were DIY from the plans.",
    fun: 4,
    funNotes: "Celtic games worked. Not a glow-party week.",
    criticisms: "Cannot assign this to a last-minute volunteer.",
    cost: "About $14 per child.",
  },
  {
    id: "dce-group-2026",
    programId: "group-2026",
    username: "dce.hanna",
    createdAt: "2026-07-25T12:40:00.000Z",
    whatPeopleSay: "Rainforest Falls is Group doing what Group does. Attendance jumped. Storage after was the tax.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "God’s love / creation care lean. We added verse cards.",
    merchHelp: 5,
    merchHelpNotes: "Waterfall and leaves are gorgeous and bulky.",
    fun: 5,
    funNotes: "Kids did not want to leave the gym.",
    criticisms: "Cost and closet space.",
    cost: "Near $25 per child.",
  },
  {
    id: "andre-cokesbury-2026",
    programId: "cokesbury-2026",
    username: "andre.louis",
    createdAt: "2026-07-21T10:20:00.000Z",
    whatPeopleSay: "Snowball Mountain Challenge in July was a novelty. Kids talked about it for weeks.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "Challenge / trust themes. We wrote our own Friday invitation.",
    merchHelp: 4,
    merchHelpNotes: "Indoor snow kits and cardboard peaks were enough.",
    fun: 5,
    funNotes: "Pom-pom snow fights, contained.",
    criticisms: "Cleanup of ‘snow’ is real.",
    cost: "About $13 per child.",
  },
  {
    id: "lily-concordia-2026",
    programId: "concordia-2026",
    username: "lily.chen",
    createdAt: "2026-07-12T16:55:00.000Z",
    whatPeopleSay: "Tropical Trek stayed on Jesus. We did not need a warehouse.",
    biblicalTeaching: 5,
    biblicalTeachingNotes: "Explorer wrapper, Savior center.",
    merchHelp: 3,
    merchHelpNotes: "Vines and maps were DIY plus a few CPH tees.",
    fun: 4,
    funNotes: "Rec with pool-noodle vines was plenty.",
    criticisms: "Less ‘wow’ on social than Lifeway glow.",
    cost: "About $10 per child.",
  },
  {
    id: "pastor-lifeway-2027",
    programId: "lifeway-2027",
    username: "pastor.reed",
    createdAt: "2026-09-28T14:30:00.000Z",
    whatPeopleSay: "Take Flight samples feel like Lifeway’s usual mix of fun and a clear invitation. We are planning it for next summer.",
    biblicalTeaching: 4,
    biblicalTeachingNotes: "Early lessons we have seen keep Scripture in the rotation, not just aviation metaphors.",
    merchHelp: 5,
    merchHelpNotes: "Aviation tees and cloud décor will be easy to find.",
    fun: 5,
    funNotes: "Paper-plane stations almost write themselves.",
    criticisms: "Could get gimmicky if the gospel is only a landing at the end.",
    cost: "Expect $16–$20 per child if we chase the catalog.",
  },
  {
    id: "caleb-lifeway-2027",
    programId: "lifeway-2027",
    username: "caleb.ortiz",
    createdAt: "2026-09-30T11:15:00.000Z",
    whatPeopleSay: "Promo looks fun. Waiting to see if the Bible content is thicker than 2026 glow year.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "Only sample lessons so far.",
    merchHelp: 4,
    merchHelpNotes: "Shirts already showing up on print sites.",
    fun: 4,
    funNotes: "Kids will like planes. That is not in doubt.",
    criticisms: "Hard to judge until the full kit ships.",
    cost: "Budgeting $18 per child.",
  },
  {
    id: "maria-answers-2027",
    programId: "answers-2027",
    username: "maria.santos",
    createdAt: "2026-09-26T09:00:00.000Z",
    whatPeopleSay: "Spy U looks like Answers still doing the heavy teaching. Our board is leaning this way for families who asked for more Bible.",
    biblicalTeaching: 5,
    biblicalTeachingNotes: "Spy wrapper, not a spy gospel. Sample talks stay doctrinal.",
    merchHelp: 3,
    merchHelpNotes: "Decoder badges are cheap. Big sets will be DIY.",
    fun: 4,
    funNotes: "Missions and clues should keep older kids.",
    criticisms: "Training night will still be mandatory.",
    cost: "Planning $13 per child.",
  },
  {
    id: "elena-group-2027",
    programId: "group-2027",
    username: "elena.vargas",
    createdAt: "2026-09-27T20:05:00.000Z",
    whatPeopleSay: "Crave already looks like a Group attendance machine. Our team is nervous about the invoice.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "Hunger / Jesus as satisfaction. We will add memory work.",
    merchHelp: 5,
    merchHelpNotes: "If the kit is like Rainforest, décor will carry the week.",
    fun: 5,
    funNotes: "Food and neon snack stations will be chaos in a good way.",
    criticisms: "Price, always.",
    cost: "Budgeting $24+ per child.",
  },
  {
    id: "grace-cokesbury-2027",
    programId: "cokesbury-2027",
    username: "grace.kim",
    createdAt: "2026-09-21T13:12:00.000Z",
    whatPeopleSay: "On the Boardwalk looks photogenic without a warehouse. Good middle option for us.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "Joy and following Jesus. We will check the invitation language.",
    merchHelp: 4,
    merchHelpNotes: "Tickets, stripes, tees. Manageable.",
    fun: 4,
    funNotes: "Carnival games do not need a $2,000 backdrop.",
    criticisms: "Can look like a fair if the Bible thread is thin.",
    cost: "Expect $12–$16 per child.",
  },
  {
    id: "james-concordia-2027",
    programId: "concordia-2027",
    username: "james.okonkwo",
    createdAt: "2026-09-23T15:45:00.000Z",
    whatPeopleSay: "Safari Expedition is the Concordia year I would actually decorate. Still sounds like church.",
    biblicalTeaching: 5,
    biblicalTeachingNotes: "God as giver, Christ as gift. That is the filter.",
    merchHelp: 4,
    merchHelpNotes: "Hats and animal tees are easy even if CPH SKUs stay short.",
    fun: 4,
    funNotes: "Safari stations should lift fun without Group pricing.",
    criticisms: "Safari is a crowded look. Lessons must not go generic.",
    cost: "Planning $11 per child.",
  },
  {
    id: "jordan-group-2026",
    programId: "group-2026",
    username: "jordan.miles",
    createdAt: "2026-08-08T08:30:00.000Z",
    whatPeopleSay: "Kids loved Rainforest Falls. I would not run it again unless someone donates storage.",
    biblicalTeaching: 3,
    biblicalTeachingNotes: "Fine. Not why we picked it.",
    merchHelp: 5,
    merchHelpNotes: "The leaves are still in my garage.",
    fun: 5,
    funNotes: "Best games of the summer.",
    criticisms: "You become a décor warehouse.",
    cost: "Too much. I stopped adding it up.",
  },
];

export function defaultCurriculumYear(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month < 9 ? year : year + 1;
}

export function availableYears() {
  const years = [...new Set(programs.map((program) => program.year))].sort((a, b) => b - a);
  const def = defaultCurriculumYear();
  if (!years.includes(def)) {
    years.unshift(def);
  }
  return years;
}
