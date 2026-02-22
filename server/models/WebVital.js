const mongoose = require("mongoose");

const retentionDaysRaw = Number(process.env.WEB_VITAL_RETENTION_DAYS || 30);
const retentionDays = Number.isFinite(retentionDaysRaw) && retentionDaysRaw > 0
  ? Math.floor(retentionDaysRaw)
  : 30;
const retentionSeconds = retentionDays * 24 * 60 * 60;

const WebVitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 20 },
    value: { type: Number, required: true },
    rating: { type: String, default: "unknown", maxlength: 20 },
    metricId: { type: String, default: "", maxlength: 120 },
    path: { type: String, default: "/", maxlength: 260 },
    source: { type: String, default: "", maxlength: 120 },
    userAgent: { type: String, default: "", maxlength: 300 }
  },
  { timestamps: true }
);

WebVitalSchema.index({ name: 1, createdAt: -1 });
WebVitalSchema.index({ path: 1, createdAt: -1 });
WebVitalSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionSeconds });

module.exports = mongoose.model("WebVital", WebVitalSchema);
