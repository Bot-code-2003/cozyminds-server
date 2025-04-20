import express, { urlencoded } from "express";
import mongoose from "mongoose";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";
import journalRoutes from "./routes/journalRoutes.js";
import mailRoutes from "./routes/mailRoutes.js";
import dotenv from "dotenv";

const app = express();
dotenv.config();

const mongoURL = process.env.MONGODB_URL;

// Apply CORS early and properly
app.use(
  cors({
    origin: "https://cozyminds.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.options("*", cors());

// JSON/body parser
app.use(express.json());
app.use(urlencoded({ extended: true }));

// Debug route
app.get("/ping", (req, res) => {
  res.send("Server is alive");
});

// Routes
app.use("/user", userRoutes);
app.use("/journal", journalRoutes);
app.use("/mail", mailRoutes);

// Connect DB
mongoose
  .connect(mongoURL)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB Error:", err));

// Vercel handles the server - do NOT listen here
export default app;
