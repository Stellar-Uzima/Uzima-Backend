const mongoose = require("mongoose");
const ensureIndexes = require("../utils/ensureIndexes");

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
});

afterAll(async () => {
  await mongoose.disconnect();
});

test("should create required indexes", async () => {
  await ensureIndexes();
  const indexes = await mongoose.models.User.collection.indexes();
  expect(indexes.some(i => i.key.email)).toBeTruthy();
});
