// Phonetic English to Tamil Transliteration Engine & Google Input Tools API integration

(function () {
  const TAMIL_DICTIONARY = {
    // Places
    "chennai": "சென்னை",
    "madurai": "மதுரை",
    "kovai": "கோவை",
    "coimbatore": "கோயம்புத்தூர்",
    "trichy": "திருச்சி",
    "tiruchirappalli": "திருச்சிராப்பள்ளி",
    "thanjavur": "தஞ்சாவூர்",
    "salem": "சேலம்",
    "tirunelveli": "திருநெல்வேலி",
    "theni": "தேனி",
    "dindigul": "திண்டுக்கல்",
    "erode": "ஈரோடு",
    "karur": "கரூர்",
    "vellore": "வேலூர்",
    "tuticorin": "தூத்துக்குடி",
    "thoothukudi": "தூத்துக்குடி",
    "sivagangai": "சிவங்கை",
    "sivakasi": "சிவகாசி",
    "kumbakonam": "கும்பகோணம்",
    "pudukkottai": "புதுக்கோட்டை",
    "cuddalore": "கடலூர்",
    "nagapattinam": "நாகப்பட்டினம்",
    "ramanathapuram": "ராமநாதபுரம்",
    "virudhunagar": "விருதுநகர்",
    "namakkal": "நாமக்கல்",
    "tiruppur": "திருப்பூர்",
    "kanchipuram": "காஞ்சிபுரம்",
    "tiruvallur": "திருவள்ளூர்",
    "villupuram": "விழுப்புரம்",
    "thiruvannamalai": "திருவண்ணாமலை",
    "dharmapuri": "தர்மபுரி",
    "krishnagiri": "கிருஷ்ணகிரி",
    "ariyalur": "அரியலூர்",
    "perambalur": "பெரம்பலூர்",
    "nilgiris": "நீலகிரி",
    "ooty": "ஊட்டி",

    // Names
    "kumar": "குமார்",
    "murugan": "முருகன்",
    "karthik": "கார்த்திக்",
    "karthikeyan": "கார்த்திகேயன்",
    "priya": "பிரியா",
    "raja": "ராஜா",
    "ramesh": "ரமேஷ்",
    "suresh": "சுரேஷ்",
    "selvam": "செல்வம்",
    "vijay": "விஜய்",
    "ajith": "அஜித்",
    "surya": "சூர்யா",
    "saravanan": "சரவணன்",
    "anand": "ஆனந்த்",
    "arun": "அருண்",
    "kannan": "கண்ணன்",
    "gopal": "கோபால்",
    "lakshmi": "லட்சுமி",
    "radha": "ராதா",
    "sangeetha": "சங்கீதா",
    "kavitha": "கவிதா",
    "deepa": "தீபா",
    "divya": "திவ்யா",
    "revathi": "ரேவதி",
    "shanthi": "சாந்தி",
    "babu": "பாபு",
    "balu": "பாலு",
    "mani": "மணி",
    "velu": "வேலு",
    "pandian": "பாண்டியன்",
    "muthu": "முத்து",
    "marugan": "முருகன்",
    "rajan": "ராஜன்",
    "shankar": "சங்கர்",
    "sankar": "சங்கர்",
    "ganesh": "கணேஷ்",
    "dinesh": "தினேஷ்",
    "ram": "ராம்",
    "seetha": "சீதா",

    // Relationships
    "thaimaman": "தாய்மாமன்",
    "nanban": "நண்பர்",
    "pangali": "பங்காளி",
    "maman": "மாமன்",
    "machan": "மச்சான்",
    "machinanchar": "மச்சினன்",
    "annan": "அண்ணன்",
    "thambi": "தம்பி",
    "akka": "அக்கா",
    "thangai": "தங்கை",
    "appaji": "அப்பா",
    "amma": "அம்மா",
    "periyappa": "பெரியப்பா",
    "chithappa": "சிற்றப்பா",
    "athai": "அத்தை",
    "chithi": "சித்தி",
    "son": "மகன்",
    "daughter": "மகள்",

    // Payout reasons
    "betel": "வெத்தலை",
    "betel leaf": "வெத்தலை பாக்கு",
    "flowers": "பூக்கள்",
    "catering": "சமையல் செலவு",
    "hall rent": "மண்டப வாடகை",
    "sound system": "ஒலிபெருக்கி",
    "auto": "ஆட்டோ கட்டணம்",
    "car": "கார் வாடகை",
    "tea": "தேநீர் செலவு",
    "coffee": "காபி செலவு"
  };

  const VOWELS = {
    "aa": "ஆ", "a": "அ", "ee": "ஈ", "e": "எ", "ii": "ஈ", "i": "இ",
    "oo": "ஊ", "o": "ஒ", "uu": "ஊ", "u": "உ", "ai": "ஐ", "au": "ஔ"
  };

  const VOWEL_MATRAS = {
    "aa": "ா", "a": "", "ee": "ீ", "e": "ெ", "ii": "ீ", "i": "ி",
    "oo": "ோ", "o": "ொ", "uu": "ூ", "u": "ு", "ai": "ை", "au": "ௌ"
  };

  const CONSONANTS = {
    "k": "க்", "g": "க்", "kh": "க்", "gh": "க்",
    "ng": "ங்",
    "ch": "ச்", "c": "ச்", "j": "ஜ்", "s": "ஸ்", "sh": "ஷ்",
    "nj": "ஞ்", "ny": "ஞ்",
    "th": "த்", "d": "த்", "dh": "த்",
    "n": "ன்", "nh": "ந்",
    "p": "ப்", "b": "ப்", "f": "ப்",
    "m": "ம்",
    "y": "ய்",
    "r": "ர்",
    "l": "ல்", "lh": "ள்",
    "v": "வ்", "w": "வ்",
    "zh": "ழ்", "z": "ழ்",
    "h": "ஹ்",
    "t": "ட்", "tr": "ட்"
  };

  async function fetchGoogleInputToolsTamil(text) {
    if (!text || !text.trim()) return [];
    const clean = text.trim();
    // Google Input Tools endpoint for Tamil transliteration
    const url = `https://inputtools.google.com/request?text=${encodeURIComponent(clean)}&itc=ta-t-i0-und&num=8&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data[0] === 'SUCCESS' && data[1] && data[1][0] && data[1][0][1]) {
          const suggestions = data[1][0][1];
          return suggestions.map(item => ({
            ta: item,
            en: clean,
            isGoogle: true
          }));
        }
      }
    } catch (err) {
      console.warn('Google Input Tools fetch fallback to local phonetic:', err);
    }
    return [];
  }

  function getDictionarySuggestions(text) {
    if (!text) return [];
    const query = text.toLowerCase().trim();
    const results = [];

    // Exact match
    if (TAMIL_DICTIONARY[query]) {
      results.push({ ta: TAMIL_DICTIONARY[query], en: text, isDict: true });
    }

    // Prefix matches
    for (let key in TAMIL_DICTIONARY) {
      if (key !== query && key.startsWith(query)) {
        results.push({ ta: TAMIL_DICTIONARY[key], en: key, isDict: true });
      }
    }

    return results.slice(0, 5);
  }

  function transliterateText(text) {
    if (!text) return "";
    // If text is already in Tamil Unicode range, return as is
    if (/[\u0B80-\u0BFF]/.test(text)) {
      return text;
    }

    const words = text.split(" ");
    const transliteratedWords = words.map(w => transliterateWord(w));
    return transliteratedWords.join(" ");
  }

  function transliterateWord(word) {
    if (!word) return "";
    const lower = word.toLowerCase();

    // Check exact dictionary match first
    if (TAMIL_DICTIONARY[lower]) {
      return TAMIL_DICTIONARY[lower];
    }

    let i = 0;
    let result = "";

    while (i < lower.length) {
      // Check 3-char consonants (e.g. zh, th, ng, ch, sh)
      let sub3 = lower.substr(i, 3);
      let sub2 = lower.substr(i, 2);
      let sub1 = lower.substr(i, 1);

      let matchedConsonant = null;
      let matchedLength = 0;

      if (CONSONANTS[sub3]) {
        matchedConsonant = sub3;
        matchedLength = 3;
      } else if (CONSONANTS[sub2]) {
        matchedConsonant = sub2;
        matchedLength = 2;
      } else if (CONSONANTS[sub1]) {
        matchedConsonant = sub1;
        matchedLength = 1;
      }

      if (matchedConsonant) {
        i += matchedLength;
        // Check following vowel
        let vsub2 = lower.substr(i, 2);
        let vsub1 = lower.substr(i, 1);

        let matra = null;
        let vowelLength = 0;

        if (VOWEL_MATRAS[vsub2] !== undefined) {
          matra = VOWEL_MATRAS[vsub2];
          vowelLength = 2;
        } else if (VOWEL_MATRAS[vsub1] !== undefined) {
          matra = VOWEL_MATRAS[vsub1];
          vowelLength = 1;
        }

        const basePureConsonant = CONSONANTS[matchedConsonant]; // e.g. க்
        const baseChar = basePureConsonant.replace("்", ""); // e.g. க

        if (matra !== null) {
          result += baseChar + matra;
          i += vowelLength;
        } else {
          // No vowel following: check if it's end of word or consonant cluster
          if (i >= lower.length) {
            result += basePureConsonant; // end of word dot (e.g. ம், ன், ர்)
          } else {
            result += basePureConsonant; // dot consonant
          }
        }
      } else {
        // Handle leading vowels or unmapped chars
        let vsub2 = lower.substr(i, 2);
        let vsub1 = lower.substr(i, 1);

        if (VOWELS[vsub2]) {
          result += VOWELS[vsub2];
          i += 2;
        } else if (VOWELS[vsub1]) {
          result += VOWELS[vsub1];
          i += 1;
        } else {
          result += sub1;
          i += 1;
        }
      }
    }

    return result;
  }

  function getCustomDict() {
    try {
      const saved = localStorage.getItem('aathi_moi_custom_tamil_dict');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  }

  function setCustomDict(dict) {
    try {
      localStorage.setItem('aathi_moi_custom_tamil_dict', JSON.stringify(dict));
    } catch (e) {}
  }

  function addCustomWord(en, ta) {
    if (!en || !ta) return false;
    const cleanEn = en.trim().toLowerCase();
    const cleanTa = ta.trim();
    const dict = getCustomDict();
    dict[cleanEn] = cleanTa;
    setCustomDict(dict);
    TAMIL_DICTIONARY[cleanEn] = cleanTa;
    return true;
  }

  function removeCustomWord(en) {
    if (!en) return false;
    const cleanEn = en.trim().toLowerCase();
    const dict = getCustomDict();
    delete dict[cleanEn];
    setCustomDict(dict);
    delete TAMIL_DICTIONARY[cleanEn];
    return true;
  }

  function getAllDictionaryWords() {
    const custom = getCustomDict();
    const combined = { ...TAMIL_DICTIONARY, ...custom };
    const list = [];
    for (let key in combined) {
      list.push({
        en: key,
        ta: combined[key],
        isCustom: !!custom[key]
      });
    }
    return list.sort((a, b) => a.en.localeCompare(b.en));
  }

  // Load custom dict on initialization
  (function initCustomDict() {
    const custom = getCustomDict();
    for (let key in custom) {
      TAMIL_DICTIONARY[key] = custom[key];
    }
  })();

  window.TamilTransliterate = {
    fetchGoogleInputToolsTamil,
    getDictionarySuggestions,
    transliterateText,
    getCustomDict,
    addCustomWord,
    removeCustomWord,
    getAllDictionaryWords
  };
})();

