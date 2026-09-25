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

  // Live Google Tamil Input Tool Suggestion Dropdown Engine
  let activeInputEl = null;
  let activeWordObj = { word: '', start: 0, end: 0 };
  let currentSuggestions = [];
  let selectedIndex = 0;
  let fetchTimer = null;

  function getOrCreateSuggestionBox() {
    let box = document.getElementById('tamil-suggestion-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tamil-suggestion-box';
      box.className = 'fixed z-[9999] bg-slate-900 border border-amber-500/50 rounded-xl shadow-2xl p-1 text-xs text-slate-100 hidden min-w-[200px] max-w-[300px] backdrop-blur-md';
      document.body.appendChild(box);
    }
    return box;
  }

  function hideSuggestionBox() {
    const box = document.getElementById('tamil-suggestion-box');
    if (box) {
      box.classList.add('hidden');
      box.innerHTML = '';
    }
    currentSuggestions = [];
    selectedIndex = 0;
  }

  function positionSuggestionBox(inputEl) {
    const box = getOrCreateSuggestionBox();
    const rect = inputEl.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 4;
    const left = rect.left + window.scrollX;

    box.style.top = `${top}px`;
    box.style.left = `${left}px`;
    box.style.width = `${Math.max(rect.width, 220)}px`;
  }

  function getCurrentWordInfo(inputEl) {
    const val = inputEl.value || '';
    const pos = inputEl.selectionStart || 0;

    let start = pos - 1;
    while (start >= 0 && val[start] !== ' ' && val[start] !== '\n') {
      start--;
    }
    start++;

    let end = pos;
    while (end < val.length && val[end] !== ' ' && val[end] !== '\n') {
      end++;
    }

    const word = val.substring(start, end);
    return { word, start, end };
  }

  async function updateSuggestions(inputEl) {
    if (!inputEl) return;
    const info = getCurrentWordInfo(inputEl);
    activeWordObj = info;
    const rawWord = info.word.trim();

    if (!rawWord || /[\u0B80-\u0BFF]/.test(rawWord)) {
      hideSuggestionBox();
      return;
    }

    let googleItems = await fetchGoogleInputToolsTamil(rawWord);
    let googleList = googleItems.map(item => item.ta);

    let localDict = getDictionarySuggestions(rawWord).map(item => item.ta);
    let phoneticFallback = transliterateWord(rawWord);

    let combined = [];
    if (googleList.length > 0) {
      combined.push(...googleList);
    }
    if (localDict.length > 0) {
      combined.push(...localDict);
    }
    if (phoneticFallback && !combined.includes(phoneticFallback)) {
      combined.push(phoneticFallback);
    }

    const finalCandidates = Array.from(new Set(combined.filter(Boolean))).slice(0, 5);

    if (finalCandidates.length === 0) {
      hideSuggestionBox();
      return;
    }

    currentSuggestions = finalCandidates;
    selectedIndex = 0;
    renderSuggestionBox(inputEl, finalCandidates);
  }

  function renderSuggestionBox(inputEl, suggestions) {
    const box = getOrCreateSuggestionBox();
    positionSuggestionBox(inputEl);

    box.innerHTML = `
      <div class="px-2 py-1 text-[10px] font-bold text-amber-400 border-b border-slate-700/60 flex items-center justify-between bg-slate-950/80 rounded-t-lg">
        <span>🇮🇳 Google Tamil Suggestions</span>
        <span class="text-slate-400 font-normal">Space / Enter / 1-5</span>
      </div>
      <div class="py-1 space-y-0.5">
        ${suggestions.map((item, idx) => `
          <div data-idx="${idx}" class="suggestion-item px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition ${idx === selectedIndex ? 'bg-amber-500 text-slate-950 font-bold' : 'hover:bg-slate-800 text-slate-200'}">
            <span><strong class="text-[11px] opacity-70 mr-1.5">${idx + 1}.</strong> <span class="text-sm font-semibold">${item}</span></span>
            <span class="text-[10px] opacity-60 font-mono">${idx === selectedIndex ? '⏎ Select' : ''}</span>
          </div>
        `).join('')}
      </div>
    `;

    box.classList.remove('hidden');

    box.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idx = parseInt(el.getAttribute('data-idx'), 10);
        applySuggestion(idx);
      });
    });
  }

  function applySuggestion(index) {
    if (!activeInputEl || !currentSuggestions[index]) return;
    const selectedTamil = currentSuggestions[index];
    const val = activeInputEl.value || '';
    const { start, end } = activeWordObj;

    const before = val.substring(0, start);
    const after = val.substring(end);
    const newVal = before + selectedTamil + after;

    activeInputEl.value = newVal;
    const newPos = start + selectedTamil.length;
    activeInputEl.setSelectionRange(newPos, newPos);

    activeInputEl.dispatchEvent(new Event('input', { bubbles: true }));
    hideSuggestionBox();
  }

  function bindInputs() {
    const inputs = document.querySelectorAll('.ta-type-input, input[data-tamil="true"]');
    inputs.forEach(input => {
      if (input.dataset.taBound === 'true') return;
      input.dataset.taBound = 'true';

      input.addEventListener('focus', () => {
        activeInputEl = input;
      });

      input.addEventListener('blur', () => {
        setTimeout(() => {
          hideSuggestionBox();
        }, 220);
      });

      input.addEventListener('input', () => {
        activeInputEl = input;
        if (fetchTimer) clearTimeout(fetchTimer);
        fetchTimer = setTimeout(() => {
          updateSuggestions(input);
        }, 120);
      });

      input.addEventListener('keydown', (e) => {
        activeInputEl = input;
        const box = document.getElementById('tamil-suggestion-box');
        const isBoxVisible = box && !box.classList.contains('hidden') && currentSuggestions.length > 0;

        if (!isBoxVisible) return;

        if (/^[1-5]$/.test(e.key)) {
          const numIdx = parseInt(e.key, 10) - 1;
          if (currentSuggestions[numIdx]) {
            e.preventDefault();
            applySuggestion(numIdx);
            return;
          }
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % currentSuggestions.length;
          renderSuggestionBox(input, currentSuggestions);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
          renderSuggestionBox(input, currentSuggestions);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          applySuggestion(selectedIndex);
        } else if (e.key === ' ') {
          if (selectedIndex >= 0 && currentSuggestions[selectedIndex]) {
            e.preventDefault();
            applySuggestion(selectedIndex);
            const val = activeInputEl.value;
            const pos = activeInputEl.selectionStart;
            activeInputEl.value = val.substring(0, pos) + ' ' + val.substring(pos);
            activeInputEl.setSelectionRange(pos + 1, pos + 1);
          }
        } else if (e.key === 'Escape') {
          hideSuggestionBox();
        }
      });
    });
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
    getAllDictionaryWords,
    bindInputs,
    hideSuggestionBox
  };
})();

