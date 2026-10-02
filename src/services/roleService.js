const User = require("../models/User");
const config = require("../config");

/**
 * Foydalanuvchini bazaga yozadi/yangilaydi va rolini qaytaradi.
 * Owner .env dan keladi — bazadagi roli har qanday bo'lsa ham ustun turadi.
 */
async function touchUser(from, { incMessage = false } = {}) {
  if (!from || from.is_bot) return null;

  const update = {
    $set: {
      firstName: from.first_name || "",
      lastName: from.last_name || "",
      username: from.username || "",
      lastSeenAt: new Date(),
    },
  };
  if (incMessage) update.$inc = { messageCount: 1 };

  const user = await User.findOneAndUpdate({ telegramId: from.id }, update, {
    upsert: true,
    returnDocument: "after",
    setDefaultsOnInsert: true,
  });

  // Owner rolini .env dan majburlaymiz
  if (from.id === config.ownerId && user.role !== "owner") {
    user.role = "owner";
    await user.save();
  }

  return user;
}

function roleOf(user, telegramId) {
  if (telegramId === config.ownerId) return "owner";
  return user?.role || "parent";
}

async function getRole(telegramId) {
  if (telegramId === config.ownerId) return "owner";
  const user = await User.findOne({ telegramId }).lean();
  return user?.role || "parent";
}

function isOwner(telegramId) {
  return Number(telegramId) === config.ownerId;
}

async function isAdminOrOwner(telegramId) {
  if (isOwner(telegramId)) return true;
  const role = await getRole(telegramId);
  return role === "admin";
}

/**
 * Rolni belgilaydi. Owner rolini faqat .env o'zgartiradi.
 * @returns {Promise<{ok:boolean, error?:string, user?:object}>}
 */
async function setRole(telegramId, role, setBy) {
  if (!["admin", "teacher", "parent"].includes(role)) {
    return { ok: false, error: "Noma'lum rol" };
  }
  if (isOwner(telegramId)) {
    return { ok: false, error: "Owner rolini o'zgartirib bo'lmaydi" };
  }

  const user = await User.findOneAndUpdate(
    { telegramId },
    { $set: { role, roleSetBy: setBy, roleSetAt: new Date() } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  return { ok: true, user };
}

async function listByRole(role) {
  return User.find({ role }).sort({ firstName: 1 }).lean();
}

/** Hisobot yuboriladigan odamlar: owner + barcha adminlar */
async function reportRecipients() {
  const admins = await User.find({ role: "admin" }).select("telegramId").lean();
  const ids = admins.map((a) => a.telegramId);
  if (!ids.includes(config.ownerId)) ids.push(config.ownerId);
  return ids;
}

module.exports = {
  touchUser,
  roleOf,
  getRole,
  isOwner,
  isAdminOrOwner,
  setRole,
  listByRole,
  reportRecipients,
};
