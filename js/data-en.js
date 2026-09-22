/* ============================================================
   AMIRNETSIM — English question bank (original, exam-style)
   Sentence completion: 6 sections x 4 questions
   Restatements: 2 sections x 3 questions
   Reading: 6 passages x 5 questions
   Vocabulary trainer: 50 words
   All questions are original, written in the style of the
   English sections of the Israeli Psychometric Entrance Test.
   ============================================================ */

const INSTRUCTIONS = {
  sc: {
    en: `<p>In each of the following questions, <b>choose the word or words that best complete the sentence in meaning</b>.</p>
         <p>Your chosen answer will appear within the sentence itself. You may move freely between the questions of the section
         and change your answers until the time for the section ends.</p>`,
    he: `<p>בכל אחת מהשאלות שלפניך, <b>בחרי את המילה או המילים המשלימות את המשפט בצורה הטובה ביותר מבחינת המשמעות</b>.</p>
         <p>התשובה שתבחרי תופיע בתוך המשפט עצמו. אפשר לעבור בחופשיות בין שאלות הפרק ולשנות תשובות עד תום הזמן המוקצב לפרק.</p>`
  },
  restate: {
    en: `<p>In this section, <b>choose the sentence that has the same meaning as the given sentence</b>.</p>
         <p>Only one of the four options restates the original sentence accurately. The other options may look similar,
         but they change, weaken or reverse its meaning.</p>`,
    he: `<p>בפרק זה, <b>בחרי את המשפט שמשמעותו זהה למשפט הנתון</b>.</p>
         <p>רק אחת מארבע האפשרויות משמרת במדויק את משמעות המשפט המקורי. האפשרויות האחרות עשויות להיראות דומות,
         אך הן משנות, מחלישות או הופכות את המשמעות.</p>`
  },
  reading: {
    en: `<p><b>The reading passage appears on the left and the questions on the right.</b> Answer all questions according
         to the information given in the passage.</p>
         <p>In questions that refer to specific words or phrases in the passage, the relevant text is highlighted.
         You may hide the questions at any time with the Hide Questions button.</p>`,
    he: `<p><b>קטע הקריאה מוצג משמאל והשאלות מימין.</b> עני על כל השאלות על פי המידע המופיע בקטע בלבד.</p>
         <p>בשאלות שבהן יש התייחסות למילים או לביטויים מסוימים בקטע, הטקסט הרלוונטי יסומן.
         אפשר להסתיר את השאלות בכל עת בלחיצה על Hide Questions.</p>`
  }
};

const SC = {
  A: [
    {
      stem: "Because a major road was under construction, the bus arrived ___ than usual.",
      options: ["quicker", "later", "faster", "straighter"], answer: 1, level: 1,
      exp: "Road construction causes delay. Only 'later than usual' fits; quicker/faster contradict the reason; 'straighter' is illogical.",
      hint: "What happens to buses when roads are blocked?",
      he: {
        stem: "מכיוון שכביש ראשי היה בעבודות בנייה, האוטובוס הגיע ___ מהרגיל.",
        options: ["מהר יותר", "מאוחר יותר", "מהיר יותר", "ישר יותר"],
        exp: "עבודות בנייה גורמות לעיכוב. רק 'מאוחר יותר מהרגיל' מתאים; 'מהר יותר' ו'מהר יותר' סותרים את הסיבה; 'ישר יותר' אינו הגיוני."
      }
    },
    {
      stem: "Although she had studied all night, Maya felt ___ and ready for the exam.",
      options: ["exhausted", "prepared", "anxious", "clueless"], answer: 1, level: 1,
      exp: "'Although' signals contrast with 'studied all night' — the expected result (tiredness) is denied, so a positive word fits with 'ready'.",
      hint: "'Although' sets up a contrast. Ready for what — and why despite the all-nighter?",
      he: {
        stem: "למרות שלמדה כל הלילה, מאיה הרגישה ___ ומוכנה לבחינה.",
        options: ["מותשת", "מוכנה", "חרדה", "אבודה"],
        exp: "'Although' מבטא ניגוד ל'למדה כל הלילה' — התוצאה הצפויה (עייפות) נשללת, ולכן מילה חיובית מתאימה עם 'מוכנה'."
      }
    },
    {
      stem: "The museum's newest exhibit, ___ features interactive displays, has attracted record crowds.",
      options: ["that", "which", "who", "it"], answer: 1, level: 2,
      exp: "A comma before the gap shows a non-restrictive clause, which in English takes 'which' (not 'that'). 'Who' is for people; 'it' creates a run-on.",
      hint: "Is this clause essential to identify the exhibit, or extra information?",
      he: {
        stem: "התערוכה החדשה ביותר של המוזיאון, ___ כוללת תצוגות אינטראקטיביות, משכה קהל שיא.",
        options: ["שהיא", "אשר כוללת", "שהוא", "היא"],
        exp: "פסיק לפני החלל מצביע על פסוקית לא-מגבילה, שבאנגלית מקבלת 'which' (ולא 'that'). 'Who' מיועד לאנשים; 'it' יוצר משפט רץ."
      }
    },
    {
      stem: "Scientists once believed tomatoes were poisonous; ___, they are now among the world's most common foods.",
      options: ["therefore", "moreover", "however", "likewise"], answer: 2, level: 2,
      exp: "The two clauses are opposite in content (believed poisonous → common food), so a contrast connector is required: 'however'.",
      hint: "Are the two clauses agreeing, adding, or contrasting?",
      he: {
        stem: "בעבר האמינו המדענים שעגבניות הן רעילות; ___, כיום הן מהמזונות הנפוצים בעולם.",
        options: ["לכן", "יתר על כן", "עם זאת", "באופן דומה"],
        exp: "שני חלכי המשפט הפוכים בתוכנם (האמינו שרעילות → מזון נפוץ), ולכן נדרשת מילת קישור מנגדת: 'however' (עם זאת)."
      }
    }
  ],
  B: [
    {
      stem: "The instructions were written in simple language so that even beginners could ___ them.",
      options: ["compile", "follow", "reject", "reverse"], answer: 1, level: 1,
      exp: "Simple language exists so beginners can 'follow' (understand and obey) the instructions.",
      hint: "What do you do with instructions?",
      he: {
        stem: "ההוראות נכתבו בשפה פשוטה כדי שגם מתחילים יוכלו ___ אותן.",
        options: ["להרכיב", "לעקוב אחר", "לדחות", "להפוך"],
        exp: "שפה פשוטה נועדה כדי שמתחילים יוכלו 'לעקוב אחר' (להבין ולציית ל) ההוראות."
      }
    },
    {
      stem: "The novel's plot was ___ complex that readers often needed to reread entire chapters.",
      options: ["so", "such", "too", "very"], answer: 0, level: 2,
      exp: "'So + adjective + that + result' is the required structure: so complex that… 'Too' would need an infinitive; 'such' must be followed by a noun phrase.",
      hint: "Look at what follows the blank: 'complex that…'.",
      he: {
        stem: "עלילת הרומן הייתה ___ מורכבת שקוראים נאלצו לעיתים קרובות לקרוא מחדש פרקים שלמים.",
        options: ["כל כך", "כזו", "מדי", "מאוד"],
        exp: "המבנה הנדרש הוא 'so + תואר + that + תוצאה': כל כך מורכבת ש…' too' דורש מטרה; 'such' חייב אחריו שם עצם."
      }
    },
    {
      stem: "The company's profits rose sharply this quarter; ___, its share price climbed to a record high.",
      options: ["consequently", "nevertheless", "instead", "otherwise"], answer: 0, level: 2,
      exp: "Rising profits causing a rising share price is a result relationship: 'consequently'.",
      hint: "Does the second clause show a result, a contrast, or a replacement?",
      he: {
        stem: "רווחי החברה זינקו ברבעון זה; ___, מחיר המניה שלה טיפס לשיא כל הזמנים.",
        options: ["כתוצאה מכך", "עם זאת", "במקום זאת", "אחרת"],
        exp: "עלייה ברווחים המביאה לעלייה במחיר המניה היא יחס של תוצאה: 'consequently' (כתוצאה מכך)."
      }
    },
    {
      stem: "Far from being ___, the ancient settlement revealed sophisticated drainage systems that surprised archaeologists.",
      options: ["crude", "distant", "recent", "uninhabited"], answer: 0, level: 3,
      exp: "'Far from being' + opposite of what follows. 'Sophisticated drainage' surprised archaeologists, so the surprise is the absence of crudeness: 'crude'.",
      hint: "Sophisticated systems surprised them — so what did everyone assume the settlement was?",
      he: {
        stem: "הרחוק מלהיות ___, ההתיישבות הקדומה חשפה מערכות ניקוז מתוחכמות שהפתיעו את הארכיאולוגים.",
        options: ["גסה", "מרוחקת", "חדישה", "בלתי מיושבת"],
        exp: "'Far from being' דורש אחריו היפוך של מה שבא לאחר מכן. 'מערכות ניקוז מתוחכמות' הפתיעו, ולכן ההפתעה היא היעדר גסות: 'crude'."
      }
    }
  ],
  C: [
    {
      stem: "The librarian reminded students that books borrowed overnight must be ___ the next morning.",
      options: ["returned", "purchased", "translated", "audited"], answer: 0, level: 1,
      exp: "A borrowed item is 'returned'. The other verbs are possible English, but not with 'borrowed overnight' + deadline logic.",
      hint: "Overnight loan — what must happen in the morning?",
      he: {
        stem: "הספרנית הזכירה לתלמידים שספרים שהושאלו ללילה אחד יש להחזיר ___ למחרת בבוקר.",
        options: ["בבוקר", "בסוף השבוע", "בערב", "בחודש"],
        exp: "פריט שהושאל חייב 'להיות מוחזר'. שאר הפעלים אפשריים באנגלית אך אינם הגיוניים עם 'הושאל ללילה' + מועד."
      }
    },
    {
      stem: "___ its small size, the country leads the world in water-technology exports.",
      options: ["Despite of", "In spite of", "Although", "However"], answer: 1, level: 2,
      exp: "A noun phrase ('its small size') requires 'In spite of'. 'Despite of' does not exist; 'Although' needs a full clause; 'However' needs a comma and a clause.",
      hint: "What kind of phrase follows the blank — a noun phrase or a verb clause?",
      he: {
        stem: "___ גודלה הקטן, המדינה מובילה את העולם ביצוא טכנולוגיות מים.",
        options: ["Despite of", "למרות", "אף על פי ש", "עם זאת"],
        exp: "שם עצם ('גודלה הקטן') מחייב 'In spite of'. 'Despite of' אינו קיים באנגלית; 'Although' דורש פסוקית מלאה; 'However' דורש פסיק ופסוקית."
      }
    },
    {
      stem: "The witness's account ___ with the security footage, casting doubt on the defendant's alibi.",
      options: ["harmonized", "conflicted", "overlapped", "blended"], answer: 1, level: 2,
      exp: "'Casting doubt on the alibi' means the account contradicted the footage: 'conflicted with'.",
      hint: "Look at the result: doubt was cast on the alibi.",
      he: {
        stem: "גרסת העד ___ עם צילומי האבטחה, וערערה את אמינות אליבי הנאשם.",
        options: ["הסתדרה", "סתרה", "חפפה", "התמזגה"],
        exp: "'ערעור אמון באליבי' משמעו שהגרסה סתרה את הצילומים: 'conflicted with' (סתרה עם)."
      }
    },
    {
      stem: "Not until the film's final scene ___ the twist that recontextualized everything.",
      options: ["viewers understood", "did viewers understand", "viewers did understand", "understood viewers"], answer: 1, level: 3,
      exp: "A sentence beginning with the negative adverbial 'Not until' demands subject–verb inversion: 'did viewers understand'.",
      hint: "Negative adverb at the start of a sentence triggers which grammatical change?",
      he: {
        stem: "רק בסצנה הסופית של הסרט ___ הפיתול ששינה הכול.",
        options: ["הצופים הבינו", "הבינו הצופים", "הצופים כן הבינו", "הבינו את הצופים"],
        exp: "משפט המתחיל בתיאור השלילי 'Not until' מחייב היפוך נושא-נשוא: 'did viewers understand'."
      }
    }
  ]
};

const RESTATES = {
  S1: [
    {
      text: "The committee postponed its decision until the environmental report was released.",
      options: [
        "The committee waited for the environmental report before deciding.",
        "After deciding, the committee released the environmental report.",
        "The committee decided to release the environmental report.",
        "The environmental report postponed the committee's release."
      ], answer: 0, level: 2,
      exp: "'Postponed its decision until X' = the decision waited for X. Option A keeps both elements; the others swap who acts or reverse the order.",
      hint: "Who postponed — and postponed what, until when?",
      he: {
        text: "הוועדה דחתה את החלטתה עד לפרסום הדוח הסביבתי.",
        options: [
          "הוועדה המתינה לדוח הסביבתי לפני שתחליט.",
          "לאחר שהחליטה, פרסמה הוועדה את הדוח הסביבתי.",
          "הוועדה החליטה לפרסם את הדוח הסביבתי.",
          "הדוח הסביבתי דחה את פרסום החלטת הוועדה."
        ],
        exp: "'דחתה את החלטתה עד X' = ההחלטה המתינה ל-X. אפשרות A משמרת את שני הגורמים; באחרות מתחלף מי פועל או שהסדר מתהפך."
      }
    },
    {
      text: "Hardly had the concert begun when the power failed.",
      options: [
        "The power failed almost immediately after the concert started.",
        "The concert began only after the power was restored.",
        "The power failure prevented the concert from ever starting.",
        "When the power failed, the concert was already over."
      ], answer: 0, level: 3,
      exp: "'Hardly had X begun when Y' = Y happened right at the start of X. The concert did start; the failure came immediately after. Option D reverses the order.",
      hint: "Did the concert start at all — and how soon did the power fail?",
      he: {
        text: "בקושי החלה ההופעה וכבר נפסק החשמל.",
        options: [
          "החשמל נפסק כמעט מיד לאחר שההופעה החלה.",
          "ההופעה החלה רק לאחר שהחשמל חזר.",
          "תקלת החשמל מנעה מההופעה להתחיל כלל.",
          "כשנפסק החשמל, ההופעה כבר הסתיימה."
        ],
        exp: "'Hardly had X begun when Y' = Y קרה ממש בתחילת X. ההופעה כן התחילה; ההפסקה באה מיד אחרי. אפשרות D הופכת את הסדר."
      }
    },
    {
      text: "Not everyone finds the city's new traffic plan an improvement.",
      options: [
        "Some people do not consider the new traffic plan an improvement.",
        "Everyone agrees that the new traffic plan improved the city.",
        "The city's new traffic plan improved nothing for anyone.",
        "Only a few residents noticed the new traffic plan at all."
      ], answer: 0, level: 2,
      exp: "'Not everyone finds X good' = at least some people disagree. It neither claims universal objection (C) nor universal approval (B), and it says nothing about noticing (D).",
      hint: "The original makes a partial claim. Which option keeps it partial?",
      he: {
        text: "לא כולם רואים בתוכנית התנועה החדשה של העיר שיפור.",
        options: [
          "יש אנשים שאינם רואים בתוכנית התנועה החדשה שיפור.",
          "כולם מסכימים שתוכנית התנועה החדשה שיפרה את העיר.",
          "תוכנית התנועה החדשה לא שיפרה דבר עבור אף אחד.",
          "רק מעטים מהתושבים שמו לב כלל לתוכנית התנועה החדשה."
        ],
        exp: "'לא כולם סבורים ש-X טוב' = לפחות חלק מתנגדים. זה לא טוען התנגדות אוניברסלית (C) ולא אישור אוניברסלי (B), ואינו עוסק בכלל בהבחנה (D)."
      }
    }
  ],
  S2: [
    {
      text: "The storm, which had been forecast to weaken, actually gained strength overnight.",
      options: [
        "Contrary to the forecast, the storm intensified overnight.",
        "The storm weakened overnight, just as forecasters had predicted.",
        "Forecasters were unable to predict the overnight storm.",
        "The forecast said the overnight storm would gain strength."
      ], answer: 0, level: 2,
      exp: "Reality (gained strength) contradicted the forecast (predicted weakening). 'Contrary to the forecast' + 'intensified' preserves exactly this reversal.",
      hint: "What was forecast, and what actually happened — same or opposite?",
      he: {
        text: "הסערה, שתוחזת להיחלש, דווקא התחזקה במהלך הלילה.",
        options: [
          "בניגוד לתחזית, הסערה התגברה במהלך הלילה.",
          "הסערה נחלשה במהלך הלילה, בדיוק כפי שחזו המטאורולוגים.",
          "המטאורולוגים לא הצליחו לחזות את הסערה הלילית.",
          "התחזית אמרה שהסערה הלילית תתגבר."
        ],
        exp: "המציאות (התחזקה) סתרה את התחזית (ניבאו התחזקות-הפך). 'בניגוד לתחזית' + 'התגברה' משמר בדיוק את ההיפוך הזה."
      }
    },
    {
      text: "Despite his limited experience, Amir was entrusted with managing the entire project.",
      options: [
        "Amir was put in charge of the whole project even though he was not very experienced.",
        "Amir's extensive experience earned him the management of the project.",
        "Because Amir lacked experience, the project was taken away from him.",
        "The project was too large for Amir's level of experience."
      ], answer: 0, level: 1,
      exp: "'Despite X, Y' = Y happened in spite of X. Option A keeps both facts; B cancels the limitation, C reverses the outcome, D adds a claim the sentence never makes.",
      hint: "Two facts: small experience, big responsibility. Which option keeps both?",
      he: {
        text: "למרות ניסיונו המועט, אמיר נבחר לנהל את הפרויקט כולו.",
        options: [
          "אמיר קיבל אחריות על ניהול הפרויקט כולו גם משבה ניסיון מועט.",
          "הניסיון הרב של אמיר הקנה לו את ניהול הפרויקט.",
          "משום שחסר ניסיון, הפרויקט נשלל מאמיר.",
          "הפרויקט היה גדול מדי עבור רמת הניסיון של אמיר."
        ],
        exp: "'למרות X, Y' = Y קרה על אף X. אפשרות A משמרת את שני העובדות; B מבטלת את המגבלה, C הופכת את התוצאה, D מוסיף טענה שהמשפט אינו עושה."
      }
    },
    {
      text: "Few inventions have transformed daily life as profoundly as the smartphone.",
      options: [
        "The smartphone has changed everyday life more than almost any other invention.",
        "The smartphone is the only invention that has changed daily life.",
        "Like most inventions, the smartphone changed daily life only slightly.",
        "Earlier inventions changed daily life more profoundly than the smartphone."
      ], answer: 0, level: 3,
      exp: "'Few X have done Y as much as Z' = Z stands at the very top among X. Option A says exactly that; D reverses the ranking; B and C distort the comparison.",
      hint: "If only a few inventions rival it, where does the smartphone rank?",
      he: {
        text: "מעטות ההמצאות ששינו את חיי היום-יום בעוצמה כזו כמו הסמארטפון.",
        options: [
          "הסמארטפון שינה את חיי היום-יום יותר מכמעט כל המצאה אחרת.",
          "הסמארטפון הוא ההמצאה היחידה ששינתה את חיי היום-יום.",
          "כמו רוב ההמצאות, הסמארטפון שינה את חיי היום-יום במעט בלבד.",
          "המצאות קודמות שינו את חיי היום-יום בעוצמה רבה יותר."
        ],
        exp: "'מעטים מ-X עשו Y כמו Z' = Z נמצא בראש הסולם בין כל ה-X. אפשרות A אומרת בדיוק זאת; D הופכת את הדירוג; B ו-C מעוותות את ההשוואה."
      }
    }
  ]
};

const RC = [
  {
    id: "beekeeping",
    title: "Leafcutter Ants: Farmers by Instinct",
    level: 2,
    paragraphs: [
      "Fifty million years before the first human farm was planted, leafcutter ants were already practising agriculture. In the tropical forests of Central and South America, these ants cut fresh leaves and carry the pieces underground — not to eat, but to feed a fungus that they cultivate in vast underground gardens. The fungus converts the tough plant material into food the ants can actually digest. The ants, in turn, protect their crop: they weed out competing fungi, control the garden's temperature and humidity, and even carry antibiotics on their bodies that suppress harmful bacteria.",
      "This partnership is so precise that neither side can survive without the other. The cultivated fungus exists nowhere except inside ant nests, and the ants, which long ago lost the ability to digest raw leaves, depend wholly on their crop. Scientists study these colonies not only out of curiosity: the ants' system of waste management, disease control and recycling is among the most efficient known in nature, and engineers are already borrowing ideas from it."
    ],
    questions: [
      {
        q: "According to the passage, leafcutter ants carry leaves to their nests in order to",
        options: [
          "feed the fungus they cultivate",
          "feed their young directly",
          "repair the walls of their tunnels",
          "absorb the leaves' moisture"
        ], answer: 0, hl: ["not to eat, but to feed a fungus"],
        exp: "Paragraph 1 states explicitly that the leaves are carried 'not to eat, but to feed a fungus'."
      },
      {
        text: "In the passage, \"converts\" most nearly means",
        options: ["changes", "destroys", "surrounds", "removes"], answer: 0,
        exp: "The fungus 'converts the tough plant material into food the ants can digest' — changes it from one form into another."
      },
      {
        text: "The statement \"neither side can survive without the other\" indicates that the ants and the fungus",
        options: [
          "depend entirely on each other",
          "compete for the same food",
          "are identical in behavior",
          "can survive separately but not together"
        ], answer: 0,
        exp: "The sentence says each requires the other to survive — full mutual dependence."
      },
      {
        text: "According to the passage, engineers are interested in leafcutter ants primarily in order to",
        options: [
          "imitate the ants' efficient natural systems",
          "protect tropical forests from the ants",
          "breed stronger varieties of fungus",
          "develop new insecticides"
        ], answer: 0,
        exp: "The passage states engineers 'are already borrowing ideas' from the ants' highly efficient systems."
      },
      {
        text: "Which of the following best expresses the main idea of the passage?",
        options: [
          "Leafcutter ants have practised an interdependent form of agriculture for millions of years, and their methods now inspire human engineers.",
          "Leafcutter ants destroy tropical forests faster than humans can protect them.",
          "The fungus grown by leafcutter ants is the oldest living organism on Earth.",
          "Scientists have recently taught leafcutter ants to grow new crops."
        ], answer: 0,
        exp: "The passage covers both halves of option A: the ancient ant–fungus farming partnership and its engineering lessons. The other options contradict the passage."
      }
    ]
  },
  {
    id: "sleep",
    title: "Sleep-Deprived Teenagers and School Start Times",
    level: 2,
    paragraphs: [
      "For decades, high schools across the world began classes at eight in the morning or earlier — an arrangement that suited adults' schedules but ignored a quiet revolution in sleep science. Research since the 1990s has shown that during adolescence, the body's internal clock shifts: teenagers naturally fall asleep and wake later than either children or adults. This is not laziness or poor discipline; it is biology. Melatonin, the hormone that induces drowsiness, is released roughly two hours later in a teenager's evening than in an adult's.",
      "The consequences are measurable. Fifteen-year-olds who must reach school by 7:30 commonly arrive having slept far less than the eight to ten hours their bodies require, and chronic sleep loss has been linked to lower grades, higher rates of depression and more road accidents on the morning commute. In response, a number of school districts in the United States and Israel have delayed their start times to 8:30 or 9:00. The early results are striking: attendance improved, grades in first-period classes rose, and students reported fewer depressive symptoms. Critics had warned that a later bell would simply push bedtimes later as well, yet most students kept roughly the same bedtime and simply slept longer. The main obstacles that remain are logistical — bus schedules, parents' working hours and after-school activities — and they weigh unequally on different families."
    ],
    questions: [
      {
        text: "According to the passage, the later sleep patterns of teenagers are caused mainly by",
        options: [
          "biological changes in the body's internal clock",
          "excessive homework and screen use",
          "poor motivation and discipline",
          "early school start times"
        ], answer: 0,
        exp: "Paragraph 1 attributes the shift to the internal clock and delayed melatonin release: 'it is biology'."
      },
      {
        text: "In the passage, \"induces\" most nearly means",
        options: ["brings about", "delays", "measures", "blocks"], answer: 0,
        exp: "Melatonin induces drowsiness — it brings drowsiness about."
      },
      {
        text: "Which of the following was NOT reported as an outcome of delayed start times?",
        options: [
          "Students began going to bed much later.",
          "Grades in early-morning classes rose.",
          "Attendance improved.",
          "Students reported fewer depressive symptoms."
        ], answer: 0,
        exp: "The passage says most students kept 'roughly the same bedtime'; A contradicts this, so it was not reported."
      },
      {
        text: "According to the passage, chronic sleep loss has been linked to all of the following EXCEPT",
        options: [
          "weaker immune systems",
          "lower academic achievement",
          "higher rates of depression",
          "more morning traffic accidents"
        ], answer: 0,
        exp: "Grades, depression and accidents are all mentioned in paragraph 2; the immune system is never mentioned."
      },
      {
        text: "The author's attitude toward delaying school start times can best be described as",
        options: [
          "supportive, while acknowledging practical difficulties",
          "enthusiastic but indifferent to the evidence",
          "openly hostile",
          "neutral — the evidence supports both sides equally"
        ], answer: 0,
        exp: "The author presents strong supporting evidence ('striking' results) yet closes by naming real obstacles — supportive with caveats."
      }
    ]
  },
  {
    id: "quiet",
    title: "“Quiet Quitting” and the Changing Workplace",
    level: 3,
    paragraphs: [
      "When a short video describing \"quiet quitting\" went viral in 2022, the phrase captured a shift that had long been under way in wealthy economies. Quiet quitters do not resign; they simply shrink the job to its formal size — no unpaid overtime, no answering messages at midnight, no volunteering for extra committees. Supporters frame this as healthy boundary-setting in response to burnout; critics see a drift toward disengagement that quietly transfers costs to colleagues who keep contributing.",
      "The data suggest that both camps are partly right. Surveys indicate that only a minority of employees describe themselves as quiet quitters, yet a large majority report a decline in what economists call \"discretionary effort\" — the unpaid extras that once signalled ambition and were often rewarded with promotion. Such effort is notoriously hard to measure and easy to withdraw, and its decline rarely appears in official output statistics. Whether it marks healthier boundaries for workers or a creeping loss of competitiveness for firms — and for whom exactly — is the question that managers and policymakers are only beginning to confront."
    ],
    questions: [
      {
        text: "The main purpose of the passage is to",
        options: [
          "describe a workplace trend and the debate surrounding it",
          "persuade readers to resign from their jobs",
          "prove that quiet quitting raises productivity",
          "trace the history of labour unions"
        ], answer: 0,
        exp: "The passage defines the trend, presents criticisms and support, and ends on open questions — descriptive, not persuasive on either side."
      },
      {
        text: "According to the passage, quiet quitting differs from resigning in that the employee",
        options: [
          "keeps the job but limits effort to what is formally required",
          "works longer hours without extra pay",
          "is promoted faster than voluntary workers",
          "changes departments within the same company"
        ], answer: 0,
        exp: "'They do not resign; they shrink the job to its formal size' — exactly option A."
      },
      {
        text: "In the passage, \"discretionary effort\" is presented as work that is",
        options: [
          "voluntary and beyond formal requirements",
          "monitored by management",
          "required by contract",
          "performed only by managers"
        ], answer: 0,
        exp: "The passage defines it as 'the unpaid extras' — voluntary, beyond the formal job."
      },
      {
        text: "The word \"camp\" as used in the passage refers to",
        options: [
          "groups holding a shared opinion",
          "temporary settlements",
          "private companies",
          "government agencies"
        ], answer: 0,
        exp: "'Both camps' = supporters and critics of quiet quitting — two opinion groups."
      },
      {
        text: "It can be inferred that critics of quiet quitting are most worried about",
        options: [
          "colleagues absorbing the workload of those who withdraw",
          "the illegality of refusing to answer messages",
          "the disappearance of overtime pay",
          "declining sales in consumer industries"
        ], answer: 0,
        exp: "Critics object that disengagement 'transfers costs to colleagues who keep contributing' — i.e., the burden lands on co-workers."
      }
    ]
  },
  {
    id: "noise",
    title: "Turning Down the Volume of the Oceans",
    level: 2,
    paragraphs: [
      "Shipping, seismic surveys and military sonar have made the oceans vastly louder than they were a century ago, and for marine mammals — whose world is built on sound — this is far more than a nuisance. Whales rely on acoustic signals to find food, navigate and mate, and the drone of ship engines can mask those signals across hundreds of kilometres. Researchers have documented whales abandoning rich feeding grounds and dolphins simplifying their calls in busy waters, in effect 'shouting' to be heard above the noise.",
      "Unlike most forms of pollution, noise leaves no residue: it vanishes the instant its source falls silent, which makes it unusually reversible. Simple measures have already shown results — rerouting shipping lanes away from whale habitats, slowing vessels near busy coasts, and fitting ships with quieter propellers. Conservationists caution, however, that truly quiet oceans will require international coordination, because sound travels farther than any national border."
    ],
    questions: [
      {
        text: "According to the passage, whales are harmed by shipping noise mainly because they depend on sound to",
        options: [
          "find food, navigate and reproduce",
          "regulate their body temperature",
          "compete with dolphins for fish",
          "communicate with humans"
        ], answer: 0,
        exp: "Paragraph 1 lists exactly these three functions of whales' acoustic signals."
      },
      {
        text: "In the passage, \"mask\" most nearly means",
        options: ["drown out", "copy", "locate", "record"], answer: 0,
        exp: "Engine noise 'can mask' signals — drown them out so they cannot be heard."
      },
      {
        text: "According to the passage, noise pollution differs from chemical pollution in that it",
        options: [
          "disappears immediately when its source stops",
          "accumulates in the tissue of animals",
          "affects only small fish",
          "cannot be reduced by human action"
        ], answer: 0,
        exp: "'Noise leaves no residue: it vanishes the instant its source falls silent' — unlike residue-leaving chemical pollution."
      },
      {
        text: "It can be inferred from the last sentence that effective reduction of ocean noise requires",
        options: [
          "cooperation between many countries",
          "a complete ban on international shipping",
          "moving whales to quieter waters",
          "replacing all cargo ships within a decade"
        ], answer: 0,
        exp: "'Because sound travels farther than any national border' — coordination among nations is required; none of the others is stated or implied."
      },
      {
        text: "Which of the following best expresses the main idea of the passage?",
        options: [
          "Human-made noise endangers ocean life, but it is a rare case of pollution that can be reversed.",
          "Whales and dolphins are evolving to adapt to noisy oceans.",
          "Shipping companies refuse to adopt quieter technologies.",
          "Military sonar is the loudest and most damaging source of ocean noise."
        ], answer: 0,
        exp: "Option A captures both paragraphs: harm from human noise + unusual reversibility and remedies. B is not discussed, C contradicts the passage, D is never claimed."
      }
    ]
  },
  {
    id: "silk",
    title: "The Silk Road: A Moving Web, Not a Road",
    level: 3,
    paragraphs: [
      "The Silk Road was never a single road. It was a shifting web of caravan routes that, for more than 1,500 years, connected China to the Mediterranean across the deserts and mountains of Central Asia. Silk, spices and glass travelled along it, but so did less visible cargo: technologies such as papermaking, religious ideas including Buddhism and Islam, and — devastatingly — infectious disease. Historians argue that the fourteenth-century plague spread along these same corridors, reaching Europe with a speed no army of the period could have matched.",
      "What made the Silk Road remarkable was not any single merchant but the chain of intermediaries. A bolt of silk might change hands a dozen times between Chang'an and Rome, and no traveller typically walked the entire distance. Each relay town along the way grew wealthy on the passing trade, and each culture translated what it received into its own terms. The road's most lasting legacy, historians contend, was this very habit of exchange — the expectation that distant, unfamiliar worlds were worth trading with."
    ],
    questions: [
      {
        text: "According to the passage, the Silk Road was",
        options: [
          "a changing network of trade routes",
          "a single, well-maintained highway",
          "primarily a maritime trade system",
          "built under one Chinese emperor"
        ], answer: 0,
        exp: "'Never a single road… a shifting web of caravan routes' — option A restates this directly."
      },
      {
        text: "The passage mentions papermaking as an example of",
        options: [
          "a technology that spread along the routes",
          "a product more valuable than silk",
          "a Chinese secret that never left China",
          "a factor in the spread of the plague"
        ], answer: 0,
        exp: "Papermaking is listed among the 'less visible cargo' — technologies — that moved along the routes."
      },
      {
        text: "In the passage, \"devastatingly\" suggests that the spread of disease along the routes was",
        options: [
          "catastrophically harmful",
          "deliberately planned",
          "quickly contained",
          "gradual and mild"
        ], answer: 0,
        exp: "'Devastatingly' marks the disease as catastrophically damaging — the plague that reached Europe."
      },
      {
        text: "According to the passage, most silk that reached Rome",
        options: [
          "had passed through the hands of many traders",
          "was carried by a single merchant from Chang'an",
          "was worth less than the spices shipped with it",
          "was produced in workshops in Rome"
        ], answer: 0,
        exp: "'A bolt of silk might change hands a dozen times' — many intermediaries, not one carrier."
      },
      {
        text: "The author suggests that the Silk Road's most enduring legacy was",
        options: [
          "the lasting habit of exchange between distant cultures",
          "the wealth of a single Chinese capital",
          "the construction of relay towns for soldiers",
          "the complete conversion of Europe to Islam"
        ], answer: 0,
        exp: "The final line names 'the habit of exchange' — the expectation that distant worlds were worth trading with — as the lasting legacy."
      }
    ]
  },
  {
    id: "heat",
    title: "Why Cities Overheat — and Why That Can Be Fixed",
    level: 3,
    paragraphs: [
      "Cities are consistently warmer than the countryside around them — on summer afternoons sometimes by as much as ten degrees. The causes are structural rather than accidental: asphalt and concrete absorb solar energy all day and release it slowly at night, narrow street canyons trap rising warm air, and the machinery of urban life, from air conditioners to traffic, pours out yet more heat. The burden, however, is not distributed evenly. Leafless neighbourhoods — usually the poorest — record the highest temperatures, and researchers note that extreme heat kills more city residents each year than floods and storms combined.",
      "The remedies are mostly low-tech and well documented. Studies in Tel Aviv, Athens and Singapore show that street trees, reflective white roofs and protected night-ventilation corridors can lower peak temperatures by several degrees. The obstacle is rarely knowledge; it is coordination. A tree planted on one street cools four more, yet its shade benefits people who never paid for it — a textbook case, economists note, of why public goods are chronically underfunded."
    ],
    questions: [
      {
        text: "According to the passage, a main cause of urban heat is that building materials",
        options: [
          "absorb heat by day and release it slowly at night",
          "reflect all sunlight back into the atmosphere",
          "prevent wind from reaching the city centre",
          "generate heat through chemical decay"
        ], answer: 0,
        exp: "'Asphalt and concrete absorb solar energy all day and release it slowly at night' — option A restates this."
      },
      {
        text: "In the passage, the word \"burden\" refers to",
        options: [
          "the harmful effects of urban heat",
          "the cost of building materials",
          "the weight of city traffic",
          "the price of electricity"
        ], answer: 0,
        exp: "The 'burden… not distributed evenly' refers to who suffers heat's effects — the harm itself."
      },
      {
        text: "According to the passage, the neighbourhoods most exposed to extreme heat tend to have",
        options: [
          "few trees and poorer residents",
          "the tallest residential buildings",
          "the densest road networks",
          "the newest air-conditioning systems"
        ], answer: 0,
        exp: "'Leafless neighbourhoods — usually the poorest — record the highest temperatures.'"
      },
      {
        text: "It can be inferred that street trees are often under-funded because",
        options: [
          "those who benefit from shade are not only those who pay",
          "municipalities prefer building ventilation corridors",
          "engineers consider trees to be ineffective",
          "trees lower temperatures only by one degree"
        ], answer: 0,
        exp: "The free-rider logic ('cools four more… people who never paid for it') is the passage's own explanation — a public-goods problem."
      },
      {
        text: "The main purpose of the passage is to",
        options: [
          "explain why cities overheat and describe practical responses",
          "compare the climates of Tel Aviv, Athens and Singapore",
          "argue that cities should be abandoned in summer",
          "criticise economists for ignoring urban planning"
        ], answer: 0,
        exp: "Paragraph 1 = causes; paragraph 2 = low-tech remedies and the funding obstacle. Option A covers exactly that."
      }
    ]
  }
];

const VOCAB = [
  { en: "abundant", he: "שופע, רב בכמות", wrong: ["דל", "מזדקן", "נדיר מאוד"], hint: "abound = לשפוע" },
  { en: "ambiguous", he: "עמום, דו-משמעי", wrong: ["חד-משמעי", "מלוכלך", "שאפתני"], hint: "ambi = שתי דרכים" },
  { en: "apparent", he: "גלוי, נראה לעין", wrong: ["נסתר", "שקרי בהכרח", "מאוחר"], hint: "appear" },
  { en: "arbitrary", he: "שרירותי", wrong: ["מבוסס חוק", "נדיב", "מדויק"], hint: "ללא שיקול דעת מסודר" },
  { en: "assess", he: "להעריך, לאמוד", wrong: ["לקנוס", "לפרסם", "להזדרז"], hint: "assessment = הערכה" },
  { en: "assume", he: "להניח (הנחה)", wrong: ["לוותר", "להוכיח", "להתעלם מ"], hint: "assumption = הנחה" },
  { en: "attain", he: "להשיג", wrong: ["לאבד", "לדחות", "להעתיק"], hint: "attainable = בר-השגה" },
  { en: "bias", he: "הטיה, משוא פנים", wrong: ["אובייקטיביות", "יושרה", "סקרנות"], hint: "biased = מוטה" },
  { en: "comply", he: "לציית, להיענות", wrong: ["לסרב", "לדווח", "להתחרות"], hint: "comply with = לציית ל-" },
  { en: "comprehensive", he: "מקיף", wrong: ["חלקי", "יקר", "זמני"], hint: "comprehend = להבין הכול" },
  { en: "conceal", he: "להסתיר", wrong: ["לחשוף", "להראות", "לספר"], hint: "concealment" },
  { en: "conducive", he: "מסייע ל-, מקדם", wrong: ["מזיק ל-", "נפרד מ-", "זהה ל-"], hint: "conducive to learning = תורם ללמידה" },
  { en: "contradict", he: "לסתור", wrong: ["לאשר", "לחזור על", "לצטט"], hint: "contra = נגד" },
  { en: "crucial", he: "מכריע, חיוני", wrong: ["שולי", "אופציונלי", "מפתיע"], hint: "crux = הנקודה המרכזית" },
  { en: "decline", he: "ירידה; לדחות", wrong: ["עלייה", "זינוק", "התחלה"], hint: "הד לכיוון הגרף" },
  { en: "diminish", he: "להקטין, להפחית", wrong: ["להגדיל", "להכפיל", "להחזיר"], hint: "mini = קטן" },
  { en: "distinct", he: "נפרד, מובהק", wrong: ["מעורבב", "דומה מאוד", "שקוף"], hint: "distinct from = שונה מ-" },
  { en: "diverse", he: "מגוון, שונה ביניהם", wrong: ["אחיד", "מבודד", "מרוכז"], hint: "diversity = גיוון" },
  { en: "eliminate", he: "לחסל, להעלים", wrong: ["להוסיף", "לשמר", "לשדרג"], hint: "elimination" },
  { en: "emerge", he: "להתגלות, לצוץ", wrong: ["להיעלם", "להיכנס", "להיסגר"], hint: "emerge from = לצאת מ-" },
  { en: "enhance", he: "לשפר, להעצים", wrong: ["להחליש", "לקצר", "לבטל"], hint: "enhancement = שיפור" },
  { en: "ensure", he: "להבטיח", wrong: ["לסכן", "לשכוח", "להעריך"], hint: "sure = בטוח" },
  { en: "evident", he: "ברור, מובן מאליו", wrong: ["סתום", "נסתר", "חשוד"], hint: "evidence = ראיה" },
  { en: "exceed", he: "לחרוג, לעלות על", wrong: ["להישאר מתחת ל-", "להשוות ל-", "לחזור על"], hint: "exceed the limit = חורג מהמותר" },
  { en: "explicit", he: "מפורש", wrong: ["רמוז בלבד", "מאולתר", "מעורפל"], hint: "explicit ≠ implicit" },
  { en: "fluctuate", he: "להתנדנד, להשתנות בקפיצות", wrong: ["להתמד", "להתייצב", "לצמוח בקביעות"], hint: "גרף זיגזג" },
  { en: "hinder", he: "להפריע, לעכב", wrong: ["לקדם", "לזרז", "להקל"], hint: "hindrance = מכשול" },
  { en: "implement", he: "ליישם", wrong: ["לבטל", "להעלים", "לנסח מחדש"], hint: "implementation = יישום" },
  { en: "inevitable", he: "בלתי נמנע", wrong: ["נמנע בקלות", "בלתי אפשרי", "ספונטני"], hint: "evitable = נמנע; in- שולל" },
  { en: "infer", he: "להסיק (מכלל)", wrong: ["לרמוז", "לציין ישירות", "להכחיש"], hint: "inference = מסקנה" },
  { en: "initiate", he: "ליזום, להתחיל", wrong: ["לסיים", "לעכב", "לחזור על"], hint: "initial = ראשוני" },
  { en: "maintain", he: "לתחזק; לטעון", wrong: ["להזניח", "לפרק", "להודות ש"], hint: "maintenance = תחזוקה" },
  { en: "obscure", he: "מעורפל, מסתיר", wrong: ["בולט מאוד", "שקוף לחלוטין", "מדויק"], hint: "obscurity = עמימות" },
  { en: "omit", he: "להשמיט", wrong: ["לכלול", "להדגיש", "להוסיף"], hint: "omission = השמטה" },
  { en: "prevail", he: "לשרור, לגבור", wrong: ["להיעלם", "להיכשל", "לדהות"], hint: "the prevailing view = הדעה הרווחת" },
  { en: "prohibit", he: "לאסור, למנוע", wrong: ["להתיר", "לעודד", "לדרוש"], hint: "prohibition = איסור" },
  { en: "reluctant", he: "סרבן, שאינו מוכן", wrong: ["נלהב", "מהיר", "מוכן לחלוטין"], hint: "reluctance = סירוב פנימי" },
  { en: "reveal", he: "לחשוף, לגלות", wrong: ["להסתיר", "לעוות", "להערים"], hint: "reveal ≠ conceal" },
  { en: "scrutinize", he: "לבחון בקפידה", wrong: ["להעיף מבט בזהירות", "להתעלם", "לסכם במהירות"], hint: "scrutiny = פיקוח הדוק" },
  { en: "significant", he: "משמעותי", wrong: ["זניח", "מקרי", "רגעי"], hint: "significance = משמעות" },
  { en: "subsequent", he: "עוקב, שלאחר מכן", wrong: ["קודם", "מקביל", "מוקדם"], hint: "sub = אחרי (בזמן)" },
  { en: "sufficient", he: "מספיק", wrong: ["דל", "מופרז", "חסר ערך"], hint: "suffice = להספיק" },
  { en: "summit", he: "פסגה", wrong: ["תחתית", "שיפוע", "עמק"], hint: "sum = סכום הכי גבוה" },
  { en: "undermine", he: "לערער, לחתור תחת", wrong: ["לחזק", "לתמוך ב", "להרים"], hint: "mine תחת היסודות" },
  { en: "vague", he: "מטושטש, לא מוגדר", wrong: ["מדויק וחד", "רשמי", "מהיר"], hint: "vagueness = טשטוש" },
  { en: "verify", he: "לאמת, לוודא", wrong: ["לשלול", "לחשוד ב", "להרכיב"], hint: "verification = אימות" },
  { en: "vital", he: "חיוני", wrong: ["מיותר", "נדיר", "איטי"], hint: "vitality = חיות" },
  { en: "withdraw", he: "לסגת, למשוך (כסף)", wrong: ["להצטרף", "להפקיד", "ללוות"], hint: "withdrawal = נסיגה" },
  { en: "attribute", he: "לייחס (לגורם)", wrong: ["להפריד מ", "לכפור ב", "לשלול מ"], hint: "attribute X to Y = מייחסים X ל-Y" },
  { en: "feasible", he: "אפשרי, בר-ביצוע", wrong: ["בלתי מעשי לחלוטין", "מסוכן", "יקר"], hint: "feasibility study = בדיקת ביצועיות" }
];

/* unified bank access used by the app */
const QUESTIONS = { sc: SC, restate: RESTATES, reading: RC };