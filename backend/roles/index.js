const express = require("express");

const router = express.Router();


router.use("/hospital", require("./hospital/router"));
router.use("/local-authority", require("./localAuthority/router"));
router.use("/care-home", require("./careHome/routes"));
router.use("/user", require("./user/router"));
router.use("/home-care-company", require("./careHomeCompany/routes"));
router.use("/agency", require("./aggency/index"));

router.use("/nurse", require("./nurse/index"));




module.exports = router;