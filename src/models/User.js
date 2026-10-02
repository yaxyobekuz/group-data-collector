const { Schema, model } = require("mongoose");

const ROLES = ["owner", "admin", "teacher", "parent"];

const userSchema = new Schema(
  {
    telegramId: { type: Number, required: true, unique: true, index: true },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    username: { type: String, default: "" },

    // Owner tomonidan belgilanadi; belgilanmagan hamma — ota-ona
    role: { type: String, enum: ROLES, default: "parent", index: true },

    // Rol kim tomonidan va qachon berilgani (audit uchun)
    roleSetBy: { type: Number, default: null },
    roleSetAt: { type: Date, default: null },

    messageCount: { type: Number, default: 0 },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userSchema.methods.displayName = function () {
  const name = [this.firstName, this.lastName].filter(Boolean).join(" ");
  if (name) return name;
  if (this.username) return "@" + this.username;
  return String(this.telegramId);
};

userSchema.statics.ROLES = ROLES;

module.exports = model("User", userSchema);
