require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`.env faylida ${name} ko'rsatilmagan`);
  return value;
}

const config = {
  botToken: required("BOT_TOKEN"),
  mongodbUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/school_monitor",

  // Maktab vaqt zonasi — "shu kun" va cron shunga bog'liq
  timezone: process.env.TIMEZONE || "Asia/Tashkent",

  // Owner — barcha rollarni belgilaydi, hisobotlarni oladi
  ownerId: Number(process.env.OWNER_ID) || 0,

  openaiApiKey: process.env.OPENAI_API_KEY || "",
  // Nano — eng arzon model; chat matni ko'p bo'lgani uchun shu tanlangan
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.4-nano",

  // Cron jadvali (maktab vaqt zonasida)
  homeworkCheckCron: process.env.HOMEWORK_CHECK_CRON || "0 23 * * 1-6",
  reportCron: process.env.REPORT_CRON || "0 8 * * 1-6",
  // Dushanba 08:15 — o'tgan hafta bo'yicha o'qituvchilar reytingi
  teacherReportCron: process.env.TEACHER_REPORT_CRON || "15 8 * * 1",

  // Har yarim soatda — yangi muammolarni darhol adminlarga yuborish
  quickCheckCron: process.env.QUICK_CHECK_CRON || "*/30 * * * 1-6",
  // Jim soatlar: shu oraliqdan tashqarida shoshilinch xabar yuborilmaydi
  quietHoursEnd: Number(process.env.QUIET_HOURS_END) || 7,
  quietHoursStart: Number(process.env.QUIET_HOURS_START) || 22,

  mode: process.env.BOT_MODE === "webhook" ? "webhook" : "polling",
  webhookUrl: process.env.WEBHOOK_URL || "",
  webhookSecret: process.env.WEBHOOK_SECRET || "",
  port: Number(process.env.PORT) || 8080,
};

if (!config.ownerId) {
  throw new Error(
    ".env faylida OWNER_ID ko'rsatilmagan. O'z Telegram ID ingizni @userinfobot dan oling."
  );
}

module.exports = config;
