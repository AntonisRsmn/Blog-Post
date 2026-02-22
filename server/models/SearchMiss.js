const mongoose = require("mongoose");

const retentionDaysRaw = Number(process.env.SEARCH_ANALYTICS_RETENTION_DAYS || 120);
const retentionDays = Number.isFinite(retentionDaysRaw) && retentionDaysRaw > 0
  ? Math.floor(retentionDaysRaw)
  : 120;
const retentionSeconds = retentionDays * 24 * 60 * 60;

const SearchMissSchema = new mongoose.Schema(
  {
    query: { type: String, required: true, trim: true, maxlength: 140 },
    normalizedQuery: { type: String, required: true, trim: true, maxlength: 140 },
    path: { type: String, default: "/", maxlength: 260 },
    resultCount: { type: Number, default: 0, min: 0, max: 999999 },
    userAgent: { type: String, default: "", maxlength: 300 },
    locale: { type: String, default: "", maxlength: 40 }
  },
  { timestamps: true }
);

SearchMissSchema.index({ normalizedQuery: 1, createdAt: -1 });
SearchMissSchema.index({ createdAt: -1 });
SearchMissSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionSeconds });

module.exports = mongoose.model("SearchMiss", SearchMissSchema);
