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
  'https://cozyminds-server.vercel.app',
  'https://starlitjournals.vercel.app/',
  'http://localhost:5173/',
  'https://cozyminds-server.vercel.app/'
];

// Logging middleware
app.use((req, res, next) => {
  console.log('Request Origin:', req.headers.origin);
  console.log('Request Method:', req.method);
  console.log('Request Headers:', req.headers);
  next();
});

app.use(
  cors({
    origin: function(origin, callback) {
      console.log('CORS Origin Check:', origin);
      
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        console.log('No origin provided, allowing request');
        return callback(null, true);
      }
      
      // Normalize the origin by removing trailing slashes and converting to lowercase
      const normalizedOrigin = origin.replace(/\/$/, '').toLowerCase();
      const normalizedAllowedOrigins = allowedOrigins.map(o => o.replace(/\/$/, '').toLowerCase());
      
      console.log('Normalized Origin:', normalizedOrigin);
      console.log('Normalized Allowed Origins:', normalizedAllowedOrigins);
      
      if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
        console.log('Origin allowed');
        return callback(null, true);
      }
      
      console.log('Origin not allowed');
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Origin", "Accept"],
    exposedHeaders: ["Content-Length", "X-Foo", "X-Bar"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400 // 24 hours
  })
);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error Details:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    headers: req.headers
  });
  
  if (err.name === 'CORSError') {
    return res.status(403).json({
      message: 'CORS Error',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Not allowed',
      origin: req.headers.origin
    });
  }
  
  res.status(500).json({
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    origin: req.headers.origin
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
