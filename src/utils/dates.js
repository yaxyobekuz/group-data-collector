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

/**
 * Ikki sana orasidagi o'quv kunlari soni (yakshanbalar hisobga olinmaydi).
 * Ikkala chegara ham kiritiladi.
 *
 * O'qituvchi reytingida maxraj sifatida ishlatiladi: "6 kundan 5 kun vazifa".
 */
function schoolDaysBetween(from, to) {
  let count = 0;
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);

  while (cursor <= end) {
    // getUTCDay: 0 = Yakshanba. Soat 12:00 UTC olinganligi uchun
    // vaqt zonasi siljishi kun raqamini o'zgartirmaydi.
    if (cursor.getUTCDay() !== 0) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return count;
}

/**
 * O'tgan to'liq haftaning chegaralari (dushanba–shanba).
 * Haftalik hisobot dushanba ertalab o'tgan hafta uchun yuboriladi.
 *
 * @returns {{from:string, to:string}}
 */
function lastWeekRange(now = new Date()) {
  const today = new Date(`${localDate(now)}T12:00:00Z`);

  // Shu haftaning dushanbasiga qaytamiz (0=Yak, 1=Dush, ... 6=Shan)
  const weekday = today.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;

  const thisMonday = new Date(today);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - daysSinceMonday);

  // O'tgan hafta: oldingi dushanbadan shanbagacha
  const from = new Date(thisMonday);
  from.setUTCDate(from.getUTCDate() - 7);

  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 5); // dushanba + 5 = shanba

  return { from: localDate(from), to: localDate(to) };
}

/** Oxirgi N kun (bugun ham kiradi). */
function lastDays(count, now = new Date()) {
  const to = new Date(`${localDate(now)}T12:00:00Z`);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (count - 1));
  return { from: localDate(from), to: localDate(to) };
}

module.exports = {
  localDate,
  localWeekday,
  isSunday,
  formatDate,
  lastCheckedDate,
  schoolDaysBetween,
  lastWeekRange,
  lastDays,
};
