const { sendResponse } = require("@helperUtils/responseUtil");
const { getAthleteTypes } = require("../athleteTypes/athleteTypesService");
const { getExperienceLevels } = require("../experienceLevel/experienceLevelRepository");

const getCredentials = require("../credentials/credentialsService").getCredentials;
const getSpecialities = require("../specialities/specialitiesService").getSpecialities;
const getCoachingStyles = require("../coachingStyle/coachingStyleService").getCoachingStyles;
const getPriceRanges = require("../priceRange/priceRangeService").getPriceRanges;
const getTimezones = require("../timezones/timezonesService").getTimezones;
const getDistancesRanges = require("../distancesRange/distancesRangeService").getDistanceRanges;
const getBodyBuildingFederations = require("../bodyBuilding/federations/federationsService").getFederations;
const getBodyBuildingDivisions = require("../bodyBuilding/divisions/divisionsService").getDivisions;
const getPowerLiftingFederations = require("../powerLifting/federations/federationsService").getFederations;
const getPowerLiftingDivisions = require("../powerLifting/divisions/divisionsService").getDivisions;



const getOnboardingData = async (req, res) => {
    try {
        const [
            credentials,
            specialities,
            coachingStyles,
            priceRanges,
            timezones,
            distancesRanges,
            bodyBuildingFederations,
            bodyBuildingDivisions,
            powerLiftingFederations,
            powerLiftingDivisions,
            athleteTypes,
            experienceLevels,
        ] = await Promise.all([
            getCredentials({ status: "active" }),
            getSpecialities({ status: "active" }),
            getCoachingStyles({ status: "active" }),
            getPriceRanges({ status: "active" }),
            getTimezones({ status: "active" }),
            getDistancesRanges({ status: "active" }),
            getBodyBuildingFederations({ status: "active" }),
            getBodyBuildingDivisions({ status: "active" }),
            getPowerLiftingFederations({ status: "active" }),
            getPowerLiftingDivisions({ status: "active" }),
            getAthleteTypes({ status: "active" }),
            getExperienceLevels({ status: "active" }),
        ]);

        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "onboarding_data_found",
            data: {
                credentials: credentials?.credentials || [],
                specialities: specialities.specialities || [],
                coachingStyles: coachingStyles?.coachingStyles || [],
                priceRanges: priceRanges?.priceRanges || [],
                timezones: timezones?.timezones || [],
                distanceRanges: distancesRanges?.distanceRanges || [],
                bodyBuilding: {
                    federations: bodyBuildingFederations?.federations || [],
                    divisions: bodyBuildingDivisions?.divisions || []
                },
                powerLifting: {
                    federations: powerLiftingFederations?.federations || [],
                    divisions: powerLiftingDivisions?.divisions || []
                },
                athleteTypes: athleteTypes?.athleteTypes || [],
                experienceLevels: experienceLevels || [],
            },
        });


    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

module.exports = { getOnboardingData };