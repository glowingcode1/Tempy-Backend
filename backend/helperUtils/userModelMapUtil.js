const USER_MODEL_MAP = {
  careHome: require("../models/CareHomesModel"),
  nurse: require("../models/Nurse"),
  homeCareCompany: require("../models/HomeCareCompanyModel"),
  localAuthority: require("../models/LocalAuthority"),
  hospital: require("../models/HospitalModel"),
  agency: require("../models/AgencyModel"),
  user: require("../models/UserModel").User,
  guest: require("../models/UserModel").User,
  admin: require("../models/UserModel").User,
};

module.exports = { USER_MODEL_MAP };
