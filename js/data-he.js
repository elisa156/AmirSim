/* UI strings — Hebrew (interface language, as the official Hebrew-language option) */

const UI = {
  entryTitle: "כניסה למערכת",
  loginBtn: "להתחלת המבחן",
  importAnswersTitle: "כלל השאלות בקובץ כוללות גם את סימון התשובה הנכונה שלהן (V/X בשוליים או בסוף):",
  importedAnswersFound: "זוהו סימוני תשובות נכונות בתוך שאלון הבחינה עצמו — השתמשתי בהן.",
  importedAnswersNone: "לא זוהו סימוני תשובה בשאלון עצמו.",

  sections: {
    sc:      { he: "השלמת משפטים",     en: "Sentence Completion" },
    reading: { he: "קטע קריאה עם שאלות", en: "Reading Comprehension" },
    restate: { he: "ניסוח מחדש",        en: "Restatement" }
  },

  secNumber: n => "פרק " + n,
  questionsWord: n => n === 1 ? "שאלה אחת" : (n + " שאלות"),
  minutesWord: n => n + " דקות",

  introMeta: (type, q, m) => `${UI.sections[type].he} · ${UI.questionsWord(q)} · ${UI.minutesWord(m)}`,
  introBody: {
    sc: "בכל שאלה בחרי את המילה או המילים המשלימות את המשפט בצורה הטובה ביותר. התשובה שתבחרי תופיע במקומה בתוך המשפט.",
    reading: "קטע הקריאה מוצג מימין והשאלות משמאל. עני על כל השאלות על פי הקטע בלבד. אפשר לעבור בחופשיות בין השאלות ולהחליף תשובות.",
    restate: "בכל שאלה בחרי את המשפט שמשמעותו זהה למשפט הנתון. משפט אחד בלבד משמר את מלוא המשמעות."
  },
  startSection: "התחלי את הפרק",

  showInstructions: "Show Instructions",
  hideInstructions: "Hide Instructions",
  flag: "Flag",
  unflag: "Unflag",
  nextSection: "Next Section",
  prev: "‹ הקודם",
  next: "הבא ›",

  navNote: "בתום הזמן תעברי אוטומטית לפרק הבא",
  navNoteAll: 'כל השאלות נענו — אפשר לעבור לפרק הבא בלחיצה על "Next Section"',

  exitBtn: "סיום",
  exitMsgNone: "לסיים ולצפות בתוצאות?",
  exitMsg: (n, t) => `לסיים ולצפות בתוצאות?\nנענו ${n} מתוך ${t} שאלות בפרק זה.`,
  exitReport: "המבחן הופסק — מציגה דוח חלקי",

  hideQuestions: "Hide Questions",
  showQuestions: "Show Questions",

  sectionOver: "זמן הפרק תם — עוברים לפרק הבא",
  sectionDone: "הפרק הסתיים",
  confirmNextSection: "לא ניתן להמשיך לפרק הבא לפני שנענו כל השאלות. אם אינך יודעת את התשובה — כדאי לנחש!",

  examEnded: "המבחן הסתיים",
  yourScore: "הציון שלך",
  computingScore: "מחשבים את הציון…",

  band140: "פטור מלא מלימודי אנגליה (120–150) — יוצאת מנקודת הפטור בכוח!",
  band120: "פטור מקורסי אנגלית בחלק מהמוסדות (110–133)",
  band100: "מתקדמים ב' (100–119)",
  band85:  "מתקדמים א' (85–99)",
  band50:  "טרום בסיסי / בסיסי (50–84)",
  bandUnknown: "—",

  detailBySection: "פירוט לפי פרקים",
  section: "פרק",
  type: "סוג",
  correct: "נכונות",
  of: "מתוך",
  timeUsed: "זמן שנוצל",

  fullAnswers: "מענה על שאלות עם הסברים",
  yourAnswer: "תשובתך",
  correctAnswer: "התשובה הנכונה",
  notAnswered: "לא נענה",
  explanation: "הסבר",
  backHome: "חזרה לתפריט",
  showWhy: "לחצי להצגת ההסבר",
  reviewOpenAll: "פתחי הכול",
  reviewCloseAll: "סגרי הכול",

  vocab: {
    title: "אימון אוצר מילים",
    wordOf: (i, n) => `מילה ${i} מתוך ${n}`,
    reveal: "רמז (הגדרה חלקית)",
    revealText: "רמז: ",
    correct: "נכון!",
    wrong: "לא מדויק — התשובה מסומנת בירוק",
    done: (r, n) => `סיימת את כל ${n} המילים. נכון: ${r}, טעויות לחזרה: ${n - r}.`,
    restart: "עוד סבב",
    repeatWrong: "חזרה על הטעויות בלבד",
    exit: "יציאה"
  },

  sourceFilterTitle: "מקור השאלות במבחן:",
  sourceBuiltin: "מקוריות בלבד",
  sourceUser: "שאלות שייבאתי בלבד",
  sourceMix: "ערבוב של שתיהן",
  sourceNoteNone: "עדיין לא ייבאת שאלות — המאגר האישי ריק.",

  instrToggle: (lang) => lang === 'he' ? 'English' : 'עברית',
  expHeLabel: "בעברית:",
  origSentence: "משפט מקורי",
  heTranslationLabel: "תרגום לעברית:",

  modes: {
    full: "מבחן סימולציה מלא",
    express: "אימון מהיר",
    practice: "תרגול ללא הגבלת זמן",
    vocab: "אימון אוצר מילים"
  },

  chooseExpress: "בחרי סוג פרק לאימון מהיר:",
  chooseType: {
    sc: "השלמת משפטים (4 דק')",
    reading: "קטע קריאה (15 דק')",
    restate: "ניסוח מחדש (6 דק')"
  },

  percentileNote: p => `שיעור תשובות נכונות: ${p}%`,
  adaptiveUsed: "המבחן בוצע במצב אדפטיבי — הפרקים היו מותאמים לרמתך במהלך הבחינה, כמו במקור.",
  adaptiveOff: "המבחן בוצע במצב סטנדרטי (ללא התאמת קושי).",

  lastResultTitle: "התוצאה האחרונה שלך",
  seeLast: "הצגי את דוח המבחן האחרון",

  a11y: {
    title: "Accessibility",
    night: "Night mode",
    enlarge: "Enlarge",
    mark: "Mark interactive elements",
    cursor: "Enlarged cursor"
  },

  errors: {
    noData: "מאגר השאלות לא נטען — ודאי שקובצי js/data נמצאים ליד האפליקציה."
  }
};