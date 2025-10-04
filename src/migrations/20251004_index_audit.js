const mongoose = require("mongoose");
const ensureIndexes = require("../utils/ensureIndexes");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await ensureIndexes();
  await mongoose.disconnect();
})();
