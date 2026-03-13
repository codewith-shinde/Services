require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
  DB_PATH: process.env.DB_PATH || "./data/app.db",
  SHIFT_HOURS: 9, // total shift including recess
  RECESS_MINUTES: 0, // recess already included in shift
  WORK_HOURS: 9, // net working hours (9h shift, 0 separate recess)
};
