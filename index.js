// index.js
import express, { urlencoded } from "express";
import mongoose from "mongoose";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";
import journalRoutes from "./routes/journalRoutes.js";
import mailRoutes from "./routes/mailRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";

const app = express();

const mongoURL =
  "mongodb+srv://madisettydharmadeep:cozyminds@cozyminds.yth43.mongodb.net/?retryWrites=true&w=majority&appName=cozyminds";
app.use(
  cors({
    origin: "https://starlitjournals.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Handle preflight requests
app.options("*", cors());

// const mongoURL = "mongodb://localhost:27017/CozyMind";
app.use(cors());

app.use(express.json());
app.use(urlencoded({ extended: true }));
// Root route
app.get("/", (req, res) => {
  res.send("Hello from Starlit Journals!");
});

// Use routers
app.use("/", userRoutes); // All user routes under /api
app.use("/", journalRoutes); // All journal routes under /api
app.use("/", mailRoutes); // Add mail routes
app.use("/", subscriptionRoutes);
app.use("/", commentRoutes); // Add comment routes

app.get("/proxy-image", async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send("Image URL is required");
  }

  try {
    const response = await axios.get(imageUrl, { responseType: "stream" });
    res.set("Content-Type", response.headers["content-type"]);
    response.data.pipe(res);
  } catch (error) {
    console.error("Error fetching image:", error.message);
    res.status(500).send("Error fetching image");
  }
});

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

export default app;
