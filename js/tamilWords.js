// Tamil Number to Words Converter for Indian Rupee Amounts

(function () {
  const units = ["", "ஒன்று", "இரண்டு", "மூன்று", "நான்கு", "ஐந்து", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது"];
  const teens = ["பத்து", "பதினொன்று", "பன்னிரண்டு", "பதிமூன்று", "பதினான்கு", "பதினைந்து", "பதினாறு", "பதினேழு", "பதினெட்டு", "பத்தொன்பது"];
  const tensBase = ["", "", "இருபது", "முப்பது", "நாற்பது", "ஐம்பது", "அறுபது", "எழுபது", "எண்பது", "தொண்ணூறு"];
  const tensPrefix = ["", "", "இருபத்து ", "முப்பத்து ", "நாற்பத்து ", "ஐம்பத்து ", "அறுபத்து ", "எழுபத்து ", "எண்பத்து ", "தொண்ணூற்று "];
  const hundredsBase = ["", "நூறு", "இருநூறு", "முந்நூறு", "நானூறு", "ஐந்நூறு", "அறுநூறு", "எழுநூறு", "எண்நூறு", "தொள்ளாயிரம்"];
  const hundredsPrefix = ["", "நூற்று ", "இருநூற்று ", "முந்நூற்று ", "நானூற்று ", "ஐந்நூற்று ", "அறுநூற்று ", "எழுநூற்று ", "எண்நூற்று ", "தொள்ளாயிரத்து "];

  function convertLessThanThousand(n) {
    if (n === 0) return "";
    let str = "";
    const h = Math.floor(n / 100);
    const rem = n % 100;

    if (h > 0) {
      if (rem === 0) {
        return hundredsBase[h];
      } else {
        str += hundredsPrefix[h];
      }
    }

    if (rem > 0) {
      if (rem < 10) {
        str += units[rem];
      } else if (rem < 20) {
        str += teens[rem - 10];
      } else {
        const t = Math.floor(rem / 10);
        const u = rem % 10;
        if (u === 0) {
          str += tensBase[t];
        } else {
          str += tensPrefix[t] + units[u];
        }
      }
    }

    return str;
  }

  function numberToTamilWords(num) {
    if (isNaN(num) || num === null || num === undefined) return "";
    const n = Math.floor(Math.abs(num));
    if (n === 0) return "பூஜ்யம்";

    let result = "";

    const crore = Math.floor(n / 10000000);
    let rem = n % 10000000;

    const lakh = Math.floor(rem / 100000);
    rem = rem % 100000;

    const thousand = Math.floor(rem / 1000);
    rem = rem % 1000;

    if (crore > 0) {
      result += convertLessThanThousand(crore) + " கோடி ";
    }
    if (lakh > 0) {
      result += convertLessThanThousand(lakh) + " லட்சம் ";
    }
    if (thousand > 0) {
      result += convertLessThanThousand(thousand) + " ஆயிரம் ";
    }
    if (rem > 0) {
      result += convertLessThanThousand(rem);
    }

    return result.trim();
  }

  function amountToTamilWords(num) {
    const words = numberToTamilWords(num);
    if (!words) return "";
    return words + " ரூபாய் மட்டும்";
  }

  window.TamilWords = {
    numberToTamilWords,
    amountToTamilWords
  };
})();
