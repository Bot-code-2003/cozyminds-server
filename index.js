import express, { urlencoded } from "express";
import mongoose from "mongoose";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";
import journalRoutes from "./routes/journalRoutes.js";
import mailRoutes from "./routes/mailRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import sitemapRoutes from "./routes/sitemapRoutes.js";
import axios from "axios"; // Ensure axios is imported for proxy-image route
import feedbackRoutes from "./routes/feedbackRoutes.js";

const app = express();

// Define allowed origins
const allowedOrigins = [
  "http://localhost:5173", // Development
  "https://starlitjournals.vercel.app", // Production
];

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., Postman, curl) or allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, origin || "*");
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // Allow cookies/credentials
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle preflight requests explicitly (optional, as cors middleware handles it)
app.options("*", cors());

app.use(express.json());
app.use(urlencoded({ extended: true }));

// Root route
app.get("/", (req, res) => {
  res.send("Hello from Starlit Journals!");
});

// Use routers
app.use("/", userRoutes);
app.use("/", journalRoutes);
app.use("/", mailRoutes);
app.use("/", subscriptionRoutes);
app.use("/", commentRoutes);
app.use("/api", sitemapRoutes);
app.use("/", feedbackRoutes);

// Proxy image route
// app.get("/proxy-image", async (req, res) => {
//   const imageUrl = req.query.url;
//   if (!imageUrl) {
//     return res.status(400).send("Image URL is required");
//   }

//   try {
//     const response = await axios.get(imageUrl, { responseType: "stream" });
//     res.set("Content-Type", response.headers["content-type"]);
//     response.data.pipe(res);
//   } catch (error) {
//     console.error("Error fetching image:", error.message);
//     res.status(500).send("Error fetching image");
//   }
// });

// Connect to MongoDB and start the server
// const mongoURL = "mongodb://localhost:27017/CozyMind";
const mongoURL =
  "mongodb+srv://madisettydharmadeep:cozyminds@cozyminds.yth43.mongodb.net/?retryWrites=true&w=majority&appName=cozyminds";

mongoose
  .connect(mongoURL)
  .then(() => {
    app.listen(3000, () => {
      console.log("Server is running on port 3000");
    });
  })
  .catch((error) => console.log("MongoDB connection error:", error));

// export const handler = serverless(app);

export default app;
