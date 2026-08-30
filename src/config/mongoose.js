import mongoose from "mongoose";
import { envs } from "./index.js";

const mongoDBUrl = `${envs.MONGODB_URI}`;

mongoose.Promise = global.Promise;

export const connectDB = async () => {
  try {
    await mongoose.connect(mongoDBUrl);
    console.log(`Database Connected at ${mongoDBUrl}`);
  } catch (error) {
    console.error("Database connection error:", error);
  }
};

// Export the startup promise so scripts/tests can wait for the connection
// instead of racing an unawaited module side effect against disconnect().
export const mongooseConnection = connectDB();

export default mongoose;
