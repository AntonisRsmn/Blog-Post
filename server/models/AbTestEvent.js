const mongoose = require("mongoose");

const retentionDaysRaw = Number(process.env.AB_TEST_RETENTION_DAYS || 90);
const retentionDays = Number.isFinite(retentionDaysRaw) && retentionDaysRaw > 0
  ? Math.floor(retentionDaysRaw)
  : 90;
const retentionSeconds = retentionDays * 24 * 60 * 60;

const AbTestEventSchema = new mongoose.Schema(
  {
    testKey: { type: String, required: true, trim: true, maxlength: 80 },
    variant: { type: String, required: true, trim: true, maxlength: 20 },
    eventType: { type: String, required: true, trim: true, maxlength: 20 },
    path: { type: String, default: "/", maxlength: 260 },
    targetPostId: { type: String, default: "", maxlength: 80 },
    targetHref: { type: String, default: "", maxlength: 320 },
    userAgent: { type: String, default: "", maxlength: 300 }
  },
  { timestamps: true }
);

AbTestEventSchema.index({ testKey: 1, createdAt: -1 });
AbTestEventSchema.index({ testKey: 1, variant: 1, eventType: 1, createdAt: -1 });
AbTestEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionSeconds });

module.exports = mongoose.model("AbTestEvent", AbTestEventSchema);
