const Staff = require("./Staff");
const { sendResponse, generateMeta } = require("../../../helperUtils/responseUtil");
const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

const STAFF_SPECIALITIES = [
  "generalNurse",
  "mentalHealth",
  "elderlyCare",
  "learningDisability",
  "pediatric",
  "healthcareAssistant",
  "supportWorker",
];

/**
 * Public discovery endpoint. Location coordinates follow the project's
 * existing convention: [latitude, longitude].
 */
const searchPublicStaff = async (req, res) => {
  const { location, speciality } = req.body || {};
  const coordinates = location?.coordinates;
  const latitude = Number(coordinates?.[0]);
  const longitude = Number(coordinates?.[1]);
  const radiusKm = Number(req.body?.radiusKm ?? 25);
  const page = Math.max(Number.parseInt(req.body?.page, 10) || 1, 1);
  const requestedLimit = Number.parseInt(req.body?.limit, 10) || 20;
  const limit = Math.min(Math.max(requestedLimit, 1), 50);

  if (
    !Array.isArray(coordinates) ||
    coordinates.length !== 2 ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "valid_location_coordinates_required",
    });
  }

  if (!STAFF_SPECIALITIES.includes(speciality)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "valid_staff_speciality_required",
    });
  }

  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 100) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "radius_must_be_between_1_and_100_km",
    });
  }

  try {
    const pipeline = [
      { $match: { status: "active", speciality } },
      {
        $lookup: {
          from: "users",
          let: { staffId: "$staff" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$staffId"] } } },
            {
              $match: {
                "accountState.status": "active",
                "location.coordinates.1": { $exists: true },
              },
            },
            { $project: { name: 1, profileIcon: 1, location: 1 } },
          ],
          as: "staffUser",
        },
      },
      { $unwind: "$staffUser" },
      {
        $addFields: {
          distanceKm: {
            $multiply: [
              6371,
              {
                $acos: {
                  $min: [
                    1,
                    {
                      $add: [
                        {
                          $multiply: [
                            { $sin: { $degreesToRadians: latitude } },
                            {
                              $sin: {
                                $degreesToRadians: {
                                  $arrayElemAt: ["$staffUser.location.coordinates", 0],
                                },
                              },
                            },
                          ],
                        },
                        {
                          $multiply: [
                            { $cos: { $degreesToRadians: latitude } },
                            {
                              $cos: {
                                $degreesToRadians: {
                                  $arrayElemAt: ["$staffUser.location.coordinates", 0],
                                },
                              },
                            },
                            {
                              $cos: {
                                $subtract: [
                                  {
                                    $degreesToRadians: {
                                      $arrayElemAt: ["$staffUser.location.coordinates", 1],
                                    },
                                  },
                                  { $degreesToRadians: longitude },
                                ],
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      },
      { $match: { distanceKm: { $lte: radiusKm } } },
      { $sort: { distanceKm: 1, _id: 1 } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                staff: 1,
                speciality: 1,
                "staffUser.name": 1,
                "staffUser.profileIcon": 1,
                distanceKm: { $round: ["$distanceKm", 1] },
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await Staff.aggregate(pipeline);
    const total = result?.total?.[0]?.count || 0;
    const data = (result?.data || []).map((record) => ({
      staffRecordId: record._id,
      staffId: record.staff,
      name: record.staffUser.name,
      profileIcon: getFullImageUrl(record.staffUser.profileIcon),
      speciality: record.speciality,
    }));

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "public_staff_fetched_successfully",
      data,
      meta: generateMeta(page, limit, total),
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "error_fetching_public_staff",
      error,
    });
  }
};

module.exports = { searchPublicStaff, STAFF_SPECIALITIES };
