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

// CORS configuration
const allowedOrigins = [
  'https://starlitjournals.vercel.app',
  'http://localhost:5173',
  'https://cozyminds-server.vercel.app'
];

app.use(
  cors({
    origin: function(origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  })
);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err.name === 'CORSError') {
    return res.status(403).json({
      message: 'CORS Error',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Not allowed'
    });
  }
  res.status(500).json({
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Handle preflight requests
app.options("*", cors());

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
