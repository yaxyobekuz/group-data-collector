const cron = require("node-cron");
const config = require("../config");
const monitorService = require("./monitorService");
const reportService = require("./reportService");
const teacherService = require("./teacherService");
const dates = require("../utils/dates");
const logger = require("../utils/logger");

const tasks = [];

/**
 * Cron jadvalini ishga tushiradi.
 * Yakshanba cron ifodasida (1-6) chiqarilgan, lekin qo'shimcha
 * himoya sifatida kod ichida ham tekshiramiz.
 */
function start(api) {
  // Kechqurun 23:00 — vazifa va muammolarni tekshirish
  const nightly = cron.schedule(
    config.homeworkCheckCron,
    async () => {
      if (dates.isSunday()) {
        logger.info("Yakshanba — kechqurun tekshiruv o'tkazilmaydi");
        return;
      }
      logger.info("Kechqurun tekshiruv boshlandi");
      try {
        await monitorService.runNightlyCheck();
      } catch (err) {
        logger.error("Kechqurun tekshiruv xatosi:", err);
      }
    },
    { name: "nightly-check", timezone: config.timezone, noOverlap: true }
  );

  // Ertalab 08:00 — hisobotni yuborish
  const morning = cron.schedule(
    config.reportCron,
    async () => {
      if (dates.isSunday()) {
        logger.info("Yakshanba — hisobot yuborilmaydi");
        return;
      }
      logger.info("Ertalabki hisobot yuborilmoqda");
      try {
        // Oxirgi tekshirilgan kun uchun hisobot.
        // Dushanba ertalab bu SHANBA bo'ladi — yakshanba tekshirilmaydi.
        await reportService.sendReport(api, dates.lastCheckedDate());
      } catch (err) {
        logger.error("Hisobot xatosi:", err);
      }
    },
    { name: "morning-report", timezone: config.timezone, noOverlap: true }
  );

  // Dushanba ertalab — o'tgan hafta bo'yicha o'qituvchilar reytingi.
  // Kunlik hisobotdan 15 daqiqa keyin, ikkalasi bir vaqtda kelmasligi uchun.
  const weekly = cron.schedule(
    config.teacherReportCron,
    async () => {
      logger.info("Haftalik o'qituvchi hisoboti tayyorlanmoqda");
      try {
        const range = dates.lastWeekRange();
        const ranking = await teacherService.buildRanking(range.from, range.to);
        await reportService.sendTeacherReport(api, ranking);
      } catch (err) {
        logger.error("Haftalik hisobot xatosi:", err);
      }
    },
    { name: "weekly-teacher-report", timezone: config.timezone, noOverlap: true }
  );

  tasks.push(nightly, morning, weekly);

  logger.info(
    `Jadval ishga tushdi (${config.timezone}): ` +
      `tekshiruv "${config.homeworkCheckCron}", hisobot "${config.reportCron}"`
  );
  logger.info(`Keyingi tekshiruv: ${nightly.getNextRun()?.toLocaleString("en-GB", { timeZone: config.timezone })}`);
  logger.info(`Keyingi hisobot: ${morning.getNextRun()?.toLocaleString("en-GB", { timeZone: config.timezone })}`);
  logger.info(`Keyingi o'qituvchi hisoboti: ${weekly.getNextRun()?.toLocaleString("en-GB", { timeZone: config.timezone })}`);
}

function stop() {
  for (const task of tasks) task.destroy();
  tasks.length = 0;
}

module.exports = { start, stop };
