const { Schema, model } = require("mongoose");

const TYPES = ["no_homework", "parent_complaint"];

const issueSchema = new Schema(
  {
    type: { type: String, enum: TYPES, required: true, index: true },
    localDate: { type: String, required: true, index: true },

    chatId: { type: Number, required: true },
    groupTitle: { type: String, default: "" },

    // parent_complaint uchun — yozgan odam; no_homework uchun — o'qituvchi (bo'lsa)
    userId: { type: Number, default: null },
    userName: { type: String, default: "" },

    // 1-5. AI baholaydi; no_homework uchun qat'iy 4
    severity: { type: Number, default: 3, min: 1, max: 5 },

    summary: { type: String, default: "" },
    // Asl xabar matni (qisqartirilgan) — admin kontekstni ko'rishi uchun
    excerpt: { type: String, default: "" },
    messageId: { type: Number, default: null },

    // Ertalabki hisobotga kirgan-kirmagani
    reported: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Bir kun ichida bir guruh uchun bir xil muammo takrorlanmasin
issueSchema.index(
  { type: 1, localDate: 1, chatId: 1, messageId: 1 },
  { unique: true }
);

issueSchema.statics.TYPES = TYPES;

module.exports = model("Issue", issueSchema);
