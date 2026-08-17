const resolveInitialBookingStatus = ({
  createdByUserType,
  createdByUserId,
  workerId,
}) => {

  if (
    createdByUserType === "nurse" &&
    createdByUserId != null &&
    workerId != null
  ) {
    const createdBy = createdByUserId.toString();
    const worker = workerId.toString();

    if (createdBy && worker && createdBy === worker) {
      return "active";
    }
  }

  return "pending";
};

module.exports = {
  resolveInitialBookingStatus,
};
