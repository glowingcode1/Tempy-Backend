module.exports = {
  "@helperUtils": "backend/helperUtils",
  "@middlewares": "backend/middlewares",
  "@notificationsUtil": "backend/controllers/communicationController.js",
  "@redisCache": "backend/config/redis/redisCache.js",
  "@socketIo": "backend/config/sockets",
  "@UsersModel": "backend/models/UserModel.js",
  "@dbUtils": "backend/helperUtils/dbUtils",
  "@appEngagement": "backend/commonModules/appEngagement",
  "@EngagementEventsModel":
    "backend/commonModules/appEngagement/EngagementEvents.js",
  "@SupportRequestModel": "backend/models/SupportRequest.js",
  "@FaqModel": "backend/roles/admin/settings/models/Faq.js",
  "@NotificationsModel": "backend/models/Notifications.js",
  "@UsersOnboardingResponsesModel":
    "backend/roles/admin/onboardingAndFilters/usersOnboardingResponses/UsersOnboardingResponsesModel.js",
  "@HelpCenterModel": "backend/roles/admin/helpCenter/HelpCenetr.js",
  "@BookingsModel": "backend/roles/careHome/booking/Booking.js",
};
