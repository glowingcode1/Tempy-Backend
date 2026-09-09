const Branches = require("./Branches");
const BranchRepo = require("./branchesRepository");
const formatBranchToTimezone = require("./formator/formatBranchToTimezone");
const reviewRepository = require("../../../commonModules/reviews/reviewRepository");
const {
  getReviewsForObjects,
} = require("../../../commonModules/reviews/reviewRepository");
const reviewService = require("../../../commonModules/reviews/reviewService");

// Newest reviews inlined per row on list endpoints; the full set is paginated
// through GET /reviews/branch/:branchId.
const LIST_REVIEW_LIMIT = 5;

const createBranch = async (data) => {
  const branch = await BranchRepo.createBranch(data);
  return branch;
};

const getBranch = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  summary,
  currentUserId,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  if (summary) {
    const { branch, meta } = await BranchRepo.getBranchSummary({
      page,
      limit,
      keyword,
      status,
      user,
      skip,
    });
    return { branch, meta };
  }

  const { branch, meta } = await BranchRepo.getBranch({
    page,
    limit,
    keyword,
    status,
    user,
    skip,
  });

  // One aggregation for the whole page instead of two per row.
  const reviewsByBranch = await getReviewsForObjects({
    objectIds: branch.map((b) => b._id),
    objectType: "Branches",
    currentUserId,
    limit: LIST_REVIEW_LIMIT,
  });

  const formatedBranch = branch.map((b) => {
    const formattedBranch = formatBranchToTimezone(b, timezone);
    const reviewContext = reviewsByBranch.get(String(b._id));

    return {
      ...formattedBranch,
      reviews: reviewContext?.reviews || [],
      hasReview: reviewContext?.hasReview || false,
      ratingStats: reviewContext?.ratingStats || {
        totalReviews: 0,
        averageRating: 0,
      },
    };
  });

  return { branch: formatedBranch, meta };
};

const updateBranch = async (id, data) => {
  const branch = await BranchRepo.findBranchById_(id);

  if (!branch) {
    return { error: "Branch_not_found" };
  }

  const updateData = Object.fromEntries(
    Object.entries({
      name: data.name,
      location: data.location,
      status: data.status,
      bio: data.bio,
      profileIcon: data.profileIcon,
      "cqc.registrationNumber": data.cqcRegistrationNumber,
      "cqc.certificate": data.cqcCertificate,
      "insurance.certificate": data.insuranceCertificate,
      "insurance.expiryDate": data.insuranceExpiryDate,
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

const getBranchDetails = async (id, timezone, currentUserId) => {
  const branch = await BranchRepo.findBranchById(id);

  if (!branch) {
    return null;
  }

  const ratingStats = await reviewRepository.getRatingStats({
    object: id,
    objectType: "Branches",
  });

  const formatted = formatBranchToTimezone(branch, timezone);
  const { reviews, hasReview } = await reviewService.getReviewsByType({
    reviewType: "branch",
    entityId: id,
    currentUserId,
    timezone,
  });
  formatted.rating = {
    average: ratingStats.averageRating,
    total: ratingStats.totalReviews,
  };
  formatted.reviews = reviews;
  formatted.hasReview = hasReview;
  return formatted;
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
