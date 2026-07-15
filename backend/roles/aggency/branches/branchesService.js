const Branches = require("./Branches");
const BranchRepo = require("./branchesRepository");
const formatBranchToTimezone = require("./formator/formatBranchToTimezone");

const createBranch = async (data) => {
  const branch = await BranchRepo.createBranch(data);
  return branch;
};

const getBranch = async ({ timezone, page, limit, keyword, status, user }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { branch, meta } = await BranchRepo.getBranch({
    page,
    limit,
    keyword,
    status,
    user,
    skip,
  });

  const formatedBranch = branch.map((b) => formatBranchToTimezone(b, timezone));

  return { branch: formatedBranch, meta };
};

const updateBranch = async (id, data) => {
  const branch = await BranchRepo.findBranchById_(id);

  if (!branch) {
    return { error: "Branch_not_found" };
  }

  // Remove undefined values
  const updateData = Object.fromEntries(
    Object.entries({
      name: data.name,
      location: data.location,
      status: data.status,
      user: data.user,
    }).filter(([, value]) => value !== undefined),
  );

  // If restoring a deleted branch, ensure no active/inactive duplicate exists
  if (
    branch.status === "deleted" &&
    updateData.status &&
    updateData.status !== "deleted"
  ) {
    const duplicate = await BranchRepo.findDuplicateBranch({
      user: updateData.user || branch.user,
      name: updateData.name || branch.name,
      excludeId: branch._id,
    });

    if (duplicate) {
      return {
        error: "Branch_already_exists_for_this_user",
      };
    }
  }

  if (Object.keys(updateData).length === 0) {
    return branch;
  }

  Object.assign(branch, updateData);

  await branch.save();

  return branch;
};

const getBranchDetails = async (id, timezone) => {
  const branch = await BranchRepo.findBranchById(id);

  if (!branch) {
    return null;
  }

  return formatBranchToTimezone(branch, timezone);
};

const deleteBranch = async (id) => {
  if (!id) throw new Error("Branch ID is required");
  const deleted = await BranchRepo.deleteBranch(id);
  return !!deleted;
};

module.exports = {
  createBranch,
  getBranch,
  updateBranch,
  deleteBranch,
  getBranchDetails,
};
