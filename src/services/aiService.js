const { OpenAI } = require("openai");
const config = require("../config");
const logger = require("../utils/logger");

const client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

/**
 * Bir so'rovda nechta xabar tahlil qilinadi.
 *
 * MUHIM: nano kabi arzon modellar uzun ro'yxatda raqamlarni chalkashtiradi —
 * javobni bir-ikki pozitsiya siljitib yuboradi yoki qatorni tushirib
 * qoldiradi. Shuning uchun bo'lak kichik (8) va javob qat'iy tekshiriladi:
 * har bir xabarning o'z matni javobda qaytariladi va biz uni asl matn bilan
 * solishtiramiz. Mos kelmasa — o'sha bo'lak bittalab qayta tahlil qilinadi.
 */
const BATCH_SIZE = 8;
const MAX_TEXT_LEN = 400;
// Matnni solishtirishda shuncha belgisi mos kelishi yetarli
const ECHO_CHECK_LEN = 12;

function isEnabled() {
  return client !== null;
}

const HOMEWORK_PROMPT = `Sen maktab Telegram guruhlarini tahlil qiluvchi tizimsan.
O'qituvchi yozgan xabarlar berilgan. Har biri uchun aniqla: bu UYGA VAZIFA mi?

Uyga vazifa = o'quvchilar bajarishi kerak bo'lgan aniq topshiriq.
Masalan: mashq/masala raqamlari, betlar, "yodlang", "yozib kelinglar", "tayyorlanglar".

Uyga vazifa EMAS: salomlashish, rahmat, e'lon (yig'ilish bo'ladi, kech kelmang),
savolga javob, suhbat, tabrik, dars jadvali.

Har bir xabar "ID| matn" ko'rinishida berilgan.
Faqat JSON qaytar:
{"items":[{"id":"<ID>","echo":"<xabarning birinchi 12 belgisi>","hw":<true|false>}]}

QAT'IY QOIDA: berilgan HAR BIR ID uchun aynan bitta natija qaytar.
ID larni o'zgartirma, o'rnini almashtirma, birini ham tushirib qoldirma.`;

const COMPLAINT_PROMPT = `Sen maktab Telegram guruhlarini tahlil qiluvchi tizimsan.
Ota-onalar yozgan xabarlar berilgan. Har biri uchun aniqla: bu MUAMMO/SHIKOYAT mi?

Muammo = maktab, o'qituvchi, dars, ovqat, xavfsizlik, to'lov, jihoz yoki
bolaning ahvoli haqida norozilik, tashvish yoki hal qilinishi kerak bo'lgan savol.

Muammo EMAS: rahmat, salomlashish, tabrik, "xo'p bo'ladi", oddiy suhbat,
vazifani tushundim degan javob, stiker/emoji.
Muammo EMAS: oddiy xabar berish — bolam kasal/kelmaydi, kechikadi, ruxsat
so'rash, kelmaganini aytish. Bu maktabga shikoyat emas, shunchaki ma'lumot.
Ammo bolaning holati uchun MAKTABNI ayblasa (masalan maktabda kasal bo'lib
qolgan, maktabda shikastlangan) — bu muammo.

Jiddiylik darajasi (sev):
1 = kichik savol
2 = yengil norozilik
3 = aniq muammo, hal qilish kerak
4 = jiddiy — bola yoki ta'limga ta'sir qiladi
5 = shoshilinch — xavfsizlik, sog'liq, qo'pol muomala

Har bir xabar "ID| matn" ko'rinishida berilgan.
Faqat JSON qaytar:
{"items":[{"id":"<ID>","echo":"<xabarning birinchi 12 belgisi>","issue":<true|false>,"sev":<1-5>,"sum":"<muammo mohiyati 10 so'zgacha o'zbekcha>"}]}
issue=false bo'lsa sev=1 va sum="" bo'ladi.

QAT'IY QOIDA: berilgan HAR BIR ID uchun aynan bitta natija qaytar.
ID larni o'zgartirma, o'rnini almashtirma, birini ham tushirib qoldirma.`;

function truncate(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > MAX_TEXT_LEN ? clean.slice(0, MAX_TEXT_LEN) + "…" : clean;
}

/** Solishtirish uchun matnni normallashtiradi. */
function normalize(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, ECHO_CHECK_LEN);
}

async function callModel(systemPrompt, userContent) {
  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
  });

  const usage = response.usage;
  logger.debug(
    `AI so'rov: ${usage?.prompt_tokens || 0} kirish + ${usage?.completion_tokens || 0} chiqish token`
  );

  const raw = response.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    logger.error("AI JSON qaytarmadi:", raw.slice(0, 200));
    return [];
  }
}

/**
 * Bir bo'lakni tahlil qiladi va javobni tekshiradi.
 * @returns {Promise<Map<string, object>>} ID -> natija (faqat ishonchli javoblar)
 */
async function analyzeChunk(chunk, systemPrompt) {
  const byId = new Map(chunk.map((item) => [item.id, item]));
  const userContent = chunk.map((item) => `${item.id}| ${truncate(item.text)}`).join("\n");

  const items = await callModel(systemPrompt, userContent);
  const verified = new Map();

  for (const item of items) {
    const id = String(item.id ?? "");
    const source = byId.get(id);
    if (!source) {
      logger.warn(`AI noma'lum ID qaytardi: "${id}"`);
      continue;
    }
    if (verified.has(id)) continue; // takrorlangan javob

    // Echo tekshiruvi: model shu xabarni haqiqatan ko'rganini tasdiqlaydi
    const expected = normalize(source.text);
    const got = normalize(item.echo);
    if (expected && got && !expected.startsWith(got) && !got.startsWith(expected)) {
      logger.warn(`AI javobi mos kelmadi (ID ${id}): kutilgan "${expected}", kelgan "${got}"`);
      continue;
    }

    verified.set(id, item);
  }

  return verified;
}

/**
 * Xabarlarni bo'lib tahlil qiladi, javoblarni tekshiradi.
 * Tekshiruvdan o'tmagan yoki tushib qolgan xabarlar BITTALAB qayta so'raladi —
 * bir xabarda model indeksni chalkashtira olmaydi.
 *
 * @param {Array<{text:string}>} messages
 * @returns {Promise<Map<number, object>>} asl massivdagi indeks -> natija
 */
async function analyzeAll(messages, systemPrompt) {
  const results = new Map();
  if (!client || messages.length === 0) return results;

  // Har bir xabarga barqaror ID beramiz (massivdagi o'rni)
  const items = messages.map((m, index) => ({ id: "m" + index, index, text: m.text }));

  const pending = [];

  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const chunk = items.slice(start, start + BATCH_SIZE);
    let verified = new Map();

    try {
      verified = await analyzeChunk(chunk, systemPrompt);
    } catch (err) {
      logger.error(`AI tahlil xatosi (${start}-${start + chunk.length}):`, err.message);
    }

    for (const item of chunk) {
      const answer = verified.get(item.id);
      if (answer) {
        results.set(item.index, answer);
      } else {
        pending.push(item);
      }
    }
  }

  // Ishonchsiz qolganlarni bittalab qayta so'raymiz
  if (pending.length) {
    logger.info(`${pending.length} xabar bittalab qayta tahlil qilinadi`);

    for (const item of pending) {
      try {
        const verified = await analyzeChunk([item], systemPrompt);
        const answer = verified.get(item.id);
        if (answer) {
          results.set(item.index, answer);
        } else {
          logger.warn(`Xabar tahlil qilinmadi (indeks ${item.index})`);
        }
      } catch (err) {
        logger.error(`Qayta tahlil xatosi (indeks ${item.index}):`, err.message);
      }
    }
  }

  return results;
}

/**
 * O'qituvchi xabarlari ichidan vazifa borligini aniqlaydi.
 * @returns {Promise<Set<number>>} vazifa deb topilgan xabarlar indekslari
 */
async function findHomework(messages) {
  const results = await analyzeAll(messages, HOMEWORK_PROMPT);
  const homework = new Set();
  for (const [index, item] of results) {
    if (item.hw === true) homework.add(index);
  }
  return homework;
}

/**
 * Ota-ona xabarlari ichidan muammolarni aniqlaydi.
 * @returns {Promise<Map<number, {severity:number, summary:string}>>}
 */
async function findComplaints(messages) {
  const results = await analyzeAll(messages, COMPLAINT_PROMPT);
  const complaints = new Map();

  for (const [index, item] of results) {
    if (item.issue !== true) continue;
    const severity = Math.min(5, Math.max(1, Number(item.sev) || 3));
    complaints.set(index, {
      severity,
      summary: String(item.sum || "").slice(0, 200),
    });
  }

  return complaints;
}

module.exports = { isEnabled, findHomework, findComplaints, BATCH_SIZE };
