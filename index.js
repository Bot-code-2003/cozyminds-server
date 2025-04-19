import express, { urlencoded } from "express";
import mongoose from "mongoose";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";
import journalRoutes from "./routes/journalRoutes.js";
import mailRoutes from "./routes/mailRoutes.js";
import dotenv from "dotenv";

dotenv.config();
const app = express();

app.use(cors({ origin: "https://cozyminds.vercel.app" }));
app.options("*", cors());
app.use(express.json());
app.use(urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Hello from Cozy Minds!");
});

app.use("/user", userRoutes);
app.use("/journal", journalRoutes);
app.use("/mail", mailRoutes);

mongoose.connect(process.env.MONGODB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

export default app; // ✅ No app.listen()
