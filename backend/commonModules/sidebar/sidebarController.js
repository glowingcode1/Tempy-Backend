const sendServiceResult = require("@helperUtils/sendServiceResult");
const Service = require("./sidebarService");

const getCounts = sendServiceResult(
  async (req) => ({
    data: await Service.getSidebarCounts({
      userId: req.user._id,
      userType: req.user.userType,
    }),
  }),
  "Sidebar_counts_fetched_successfully",
);

const markSeen = sendServiceResult(async (req) => {
  const account = { userId: req.user._id, userType: req.user.userType };

  const marked = await Service.markSectionSeen({
    ...account,
    section: req.body?.section,
  });

  if (!marked) return { error: "Invalid_sidebar_section" };

  return { data: await Service.getSidebarCounts(account) };
}, "Sidebar_section_marked_seen");

module.exports = {
  getCounts,
  markSeen,
};
