require("dotenv").config();
const express = require("express");
var jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized: Token not found" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Unauthorized: Invalid token" });
    }
    req.user = decoded;
    next();
  });
};

function calculateProfileProgress(profile) {
  let progress = 0;

  if (profile.headline) progress += 10;
  if (profile.bio) progress += 10;
  if (profile.location) progress += 10;
  if (profile.skills?.length > 0) progress += 10;
  if (profile.experience?.length > 0) progress += 10;
  if (profile.education?.length > 0) progress += 10;
  if (profile.jobPreferences?.jobTypes?.length > 0) progress += 10;
  if (profile.jobPreferences?.locations?.length > 0) progress += 10;
  if (
    profile.jobPreferences?.salary?.min &&
    profile.jobPreferences?.salary?.max
  )
    progress += 10;
  if (profile.careerInfo?.length > 0) progress += 5;
  if (profile.projects?.length > 0) progress += 5;

  return Math.min(progress, 100); // Ensure max 100
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_KEY}@cluster0.pb8np.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("JobSpark");
    const userCollection = db.collection("users");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, `${process.env.JWT_SECRET}`, {
        expiresIn: "1h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: false,
        })
        .send({ success: true });
    });

    app.post("/logout", (req, res) => {
      res.clearCookie("token", {
        httpOnly: true,
        secure: false,
      });
      res.status(200).send({
        success: true,
      });
    });

    // user api here
    app.post("/user", async (req, res) => {
      try {
        const { displayName, email, dbPhoto } = req.body;

        if (!email || !displayName || !dbPhoto) {
          return res
            .status(400)
            .send({ message: "Email and Display Name are required." });
        }

        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
          return res
            .status(201)
            .send({ message: "User already exists with this email." });
        }

        const newUser = {
          name: displayName,
          email,
          dbPhoto: dbPhoto,
          avatar: dbPhoto || "",
          profile: {
            headline: null,
            bio: null,
            location: null,
            skills: [],
            experience: [],
            education: [],
            jobPreferences: {
              jobTypes: [],
              locations: [],
              salary: {
                min: null,
                max: null,
              },
              remote: null,
            },
          },
          applicationStats: {
            applied: 0,
            inProgress: 0,
            interviews: 0,
            offers: 0,
            rejected: 0,
          },
          applications: [],
          role: "user",
          progress: 10,
        };

        const result = await userCollection.insertOne(newUser);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }
    });

    app.get("/users", async (req, res) => {
      try {
        const users = userCollection.find();
        const collections = await users.toArray();
        res.send(collections);
      } catch (error) {
        res.status(201).send("internal server error!");
      }
    });

    app.get("/user/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ message: "Internal server error!" });
      }
    });

    //update user profile
    app.patch("/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const { profile } = req.body;
      console.log("profile", profile);

      if (!email || !profile) {
        return res
          .status(400)
          .json({ success: false, message: "Email or profile data missing." });
      }

      const progress = calculateProfileProgress(profile);
      try {
        const result = await userCollection.updateOne(
          { email: email },
          { $set: { profile: profile, progress: progress } }
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "User not found." });
        }
        const user = await userCollection.findOne({ email });

        res.send({ success: true, message: "Profile updated", result, user });
      } catch (error) {
        console.error("Error updating user:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    console.log("Connected to MongoDB successfully!");
  } catch (err) {
    console.error(err);
    await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("JobSpark server is running");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
