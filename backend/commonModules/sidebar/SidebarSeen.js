const mongoose = require("mongoose");

/*
 * When an account last opened each sidebar section, so its "new" badges are
 * the same on every device. One document per account; a section it has never
 * opened is simply absent.
 */
const SidebarSeenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    seenAt: {
      type: Map,
      of: Date,
      default: {},
    },
  },
  { timestamps: true },
);

const SidebarSeen = mongoose.model("SidebarSeen", SidebarSeenSchema);

module.exports = SidebarSeen;
