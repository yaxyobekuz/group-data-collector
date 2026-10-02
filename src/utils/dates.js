const config = require("../config");

/**
 * Mahalliy sanani "YYYY-MM-DD" ko'rinishida qaytaradi.
 * Server qaysi vaqt zonasida bo'lishidan qat'i nazar, maktab vaqt zonasi
 * bo'yicha hisoblaydi — "shu kun" tushunchasi shunga bog'liq.
 */
function localDate(date = new Date()) {
  // en-CA formati "YYYY-MM-DD" beradi
  return date.toLocaleDateString("en-CA", { timeZone: config.timezone });
}

/** Mahalliy vaqt bo'yicha hafta kuni: 0=Yakshanba ... 6=Shanba */
function localWeekday(date = new Date()) {
  const short = date.toLocaleDateString("en-US", {
    timeZone: config.timezone,
    weekday: "short",
  });
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
}

function isSunday(date = new Date()) {
  return localWeekday(date) === 0;
}

/** Hisobotlarda ko'rsatish uchun: "02.10.2026, Juma" */
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  const weekdays = [
    "Yakshanba",
    "Dushanba",
    "Seshanba",
    "Chorshanba",
    "Payshanba",
    "Juma",
    "Shanba",
  ];
  const wd = weekdays[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
  return `${d}.${m}.${y}, ${wd}`;
}

/**
 * Hisobot qaysi kun uchun yuborilishini topadi: eng oxirgi tekshirilgan kun.
 * Tekshiruv yakshanbadan tashqari har kuni 23:00 da bo'ladi, shuning uchun
 * dushanba ertalab hisobot SHANBA uchun bo'ladi (yakshanba tekshirilmaydi).
 */
function lastCheckedDate(now = new Date()) {
  const date = new Date(now);
  // Bir kun orqaga: ertalabki hisobot kechagi tekshiruv natijasi
  date.setUTCDate(date.getUTCDate() - 1);

  // Yakshanbaga tushsa — yana bir kun orqaga (shanbaga)
  while (isSunday(date)) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return localDate(date);
}

module.exports = { localDate, localWeekday, isSunday, formatDate, lastCheckedDate };
