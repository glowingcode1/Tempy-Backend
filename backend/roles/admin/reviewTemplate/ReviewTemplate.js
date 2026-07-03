const mongoose = require("mongoose");
const { Schema } = mongoose;

const reviewTemplateSchema = new Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["communication", "personalAdaptation", "problemSolving", "planClarity", "goalAlignment"],
      required: true,
      trim: true,
    },
    userType: {
      type: String,
      enum: ["user", "coach","general"],
      default: "general",
      required: true,
    },
    type: {
      type: String,
      enum: ["single_select", "multi_select", "boolean"],
      required: true,
    },
    options: [
      {
        label: String,
        value: String,
      },
    ],
    order: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("ReviewTemplate", reviewTemplateSchema);
