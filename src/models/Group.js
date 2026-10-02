const { Schema, model } = require("mongoose");

const groupSchema = new Schema(
  {
    chatId: { type: Number, required: true, unique: true, index: true },
    title: { type: String, default: "" },
    type: { type: String, default: "group" },

    // Shu guruhga vazifa yuborishi kerak bo'lgan o'qituvchilar.
    // Bo'sh bo'lsa — guruhdagi har qanday o'qituvchi hisoblanadi.
    teacherIds: { type: [Number], default: [] },

    // Nazoratdan vaqtincha chiqarish (masalan ta'til)
    isMonitored: { type: Boolean, default: true },

    // Bot guruhda hali ham bormi
    isActive: { type: Boolean, default: true },

    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = model("Group", groupSchema);
