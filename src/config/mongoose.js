import mongoose from "mongoose";
import { envs } from "./index.js";

const mongoDBUrl = `${envs.MONGODB_URI}`;

mongoose.Promise = global.Promise;

const connectDB = async () => {
  try {
    await mongoose.connect(mongoDBUrl, {
      useUnifiedTopology: true,
      useNewUrlParser: true,
      useFindAndModify: false,
      useCreateIndex: true,
    });
    console.log(`Database Connected at ${mongoDBUrl}`);
  } catch (error) {
    console.error("Database connection error:", error);
  }
};

connectDB();

export default mongoose;
