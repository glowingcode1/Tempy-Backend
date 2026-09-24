const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const {
  getEligibleWorkers,
  requestHire,
  getHires,
  acceptHire,
  rejectHire,
  cancelHire,
  getTempToPermSettings,
} = require("./permanentHireController");

const router = express.Router();

router.use(auth);

// Home care company staff can't be hired permanently, so only agencies and
// solo nurses take part on the supplier side.
const careHomeOnly = roleMiddleware(["careHome"]);
const supplierOnly = roleMiddleware(["agency", "nurse"]);

router.get("/settings", getTempToPermSettings);
router.get("/eligible", careHomeOnly, getEligibleWorkers);
router.get(
  "/",
  roleMiddleware(["admin", "careHome", "agency", "nurse"]),
  getHires,
);

router.post("/", careHomeOnly, requestHire);
router.put("/:id/cancel", careHomeOnly, cancelHire);

router.put("/:id/accept", supplierOnly, acceptHire);
router.put("/:id/reject", supplierOnly, rejectHire);

module.exports = router;
