// index.js
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
app.use(cors({ origin: "https://cozyminds.vercel.app" }));

// Handle preflight requests
app.options("*", cors());

// const mongoURL = "mongodb://localhost:27017/CozyMind";
// app.use(cors());

app.use(express.json());
app.use(urlencoded({ extended: true }));
// Root route
app.get("/", (req, res) => {
  res.send("Hello from Cozy Minds!");
});

// Use routers
app.use("/user", userRoutes); // All user routes under /api
app.use("/journal", journalRoutes); // All journal routes under /api
app.use("/mail", mailRoutes); // Add mail routes

// Connect to MongoDB and start the server
mongoose
  .connect(mongoURL)
  .then(() => {
    app.listen(3000, () => {
      console.log("Server is running on port 3000");
    });
  })
  .catch((error) => console.log(error));

// export const handler = serverless(app);
