const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { exec } = require("child_process");
const { MongoClient, ObjectId } = require("mongodb");
const { Server } = require("socket.io");
const http = require("http");
const axios = require("axios");

const app = express();
const PORT = 3000;
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
// Middleware
app.use(express.json());
app.use(cors());


// MongoDB Atlas Connection
const MONGO_URI = 'mongodb+srv://thomas:tom2005@cluster68.xfydh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster68';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("MongoDB Atlas connection error:", err));


const client = new MongoClient(MONGO_URI);

let db; // Global variable to store DB reference

async function connectDB() {
  try {
    await client.connect();
    db = client.db("test"); // Ensure database name is correct
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
  }
}

// Call the function to connect
connectDB();

// Ensure routes use `db` only after connection is established
app.use((req, res, next) => {
  if (!db) {
    return res.status(500).json({ error: "Database not connected" });
  }
  next();
});

// Enhanced Notification Schema with patient details
const notificationSchema = new mongoose.Schema({
  message: String,
  timestamp: { type: Date, default: Date.now },
  patientName: String,
  patientAge: Number,
  patientContact: String,
  patientLocation: String,
  emergencyDetails: String,
  status: { type: String, default: 'pending' },
  // Store coordinates for mapping
  coordinates: {
    lat: Number,
    lng: Number
  },
  assignedAmbulance: {
    _id: String,
    name: String
  }
});

const Notification = mongoose.model("Notification", notificationSchema);

// Add a new patient notification
app.post("/notifications", async (req, res) => {
  try {
    const { 
      patientName, 
      patientAge, 
      patientContact,
      patientLocation,
      coordinates,
      emergencyDetails
    } = req.body;
    
    // Create message from patient data
    const message = `New patient submitted: ${patientName}, Age: ${patientAge}, Location: ${patientLocation}`;
    
    const newNotification = new Notification({ 
      message,
      patientName, 
      patientAge, 
      patientContact,
      patientLocation,
      coordinates,
      emergencyDetails,
      status: 'pending',
      timestamp: new Date()
    });
    
    const savedNotification = await newNotification.save();
    
    // Emit to all connected admin clients
    io.to('admin-room').emit('newNotification', savedNotification);
    
    res.status(201).json({ 
      success: true,
      notification: savedNotification 
    });
    
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({ error: "Failed to create notification" });
  }
});

// Get all notifications
app.get("/notifications", async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ timestamp: -1 });
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Update a notification (for status changes, assignment, etc.)
app.put("/notifications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const updatedNotification = await Notification.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );
    
    if (!updatedNotification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    
    // Emit update event
    io.emit('notificationUpdated', updatedNotification);
    
    res.json(updatedNotification);
  } catch (error) {
    console.error("Error updating notification:", error);
    res.status(500).json({ error: "Failed to update notification" });
  }
});

// Hospital Schema
const hospitalSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  location: { type: String, required: true },
  contact: { type: String, required: true },
  password: { type: String, required: true },
});

hospitalSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

const Hospital = mongoose.model("Hospital", hospitalSchema, "Hospitals");

// Ambulance Schema
const ambulanceSchema = new mongoose.Schema({
  name: String,
  location: String,
  contact: String,
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  // Add status and current coordinates
  status: { type: String, default: 'available' }, // available, busy, en-route
  coordinates: {
    lat: Number,
    lng: Number
  },
  lastUpdated: { type: Date, default: Date.now }
});

const Ambulance = mongoose.model("Ambulance", ambulanceSchema);
module.exports = Ambulance;

// Add a new hospital
app.post("/hospitals", async (req, res) => {
  try {
    const { name, location, contact, password } = req.body;
    if (!name || !location || !contact || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }
    const newHospital = new Hospital({ name, location, contact, password });
    await newHospital.save();
    res.status(201).json({ message: "Hospital added successfully.", data: newHospital });
  } catch (error) {
    console.error("Error adding hospital:", error);
    res.status(500).json({ error: "Failed to add hospital." });
  }
});

// Assign an ambulance to a notification
app.post("/assign-ambulance", async (req, res) => {
  try {
    const { ambulanceId, notificationId } = req.body;
    if (!ambulanceId || !notificationId) {
      return res.status(400).json({ error: "Ambulance ID and Notification ID are required." });
    }
    
    const ambulance = await Ambulance.findById(ambulanceId);
    if (!ambulance) {
      return res.status(404).json({ error: "Ambulance not found." });
    }
    
    // Update ambulance status
    ambulance.status = 'busy';
    await ambulance.save();
    
    // Update notification with assigned ambulance
    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { 
        status: 'assigned', 
        assignedAmbulance: { 
          _id: ambulance._id, 
          name: ambulance.name 
        } 
      },
      { new: true }
    );
    
    // Emit event with assigned ambulance
    io.emit('requestAccepted', {
      notificationId,
      ambulanceId: ambulance._id,
      ambulanceName: ambulance.name
    });
    
    console.log(`Ambulance ${ambulance.name} assigned for notification ${notificationId}`);
    res.status(200).json({ 
      message: `Ambulance ${ambulance.name} assigned successfully.`,
      notification
    });
  } catch (error) {
    console.error("Error assigning ambulance:", error);
    res.status(500).json({ error: "Failed to assign ambulance." });
  }
});

// Fetch ambulances with enhanced location filtering
app.get("/ambulances", async (req, res) => {
  try {
    const { location, status, nearby } = req.query;
    let filter = {};
    
    // Basic filters
    if (req.query.name) filter.name = { $regex: req.query.name, $options: "i" };
    if (req.query.location) filter.location = { $regex: req.query.location, $options: "i" };
    if (status) filter.status = status;
    
    // If requesting nearby ambulances with coordinates
    if (nearby && req.query.lat && req.query.lng) {
      // If using MongoDB with geospatial queries, you could use $near
      // For this example, we'll return all ambulances and sort later
    }
    
    const ambulances = await Ambulance.find(filter);
    
    // If looking for nearby ambulances, sort by distance
    if (nearby && req.query.lat && req.query.lng) {
      const patientLat = parseFloat(req.query.lat);
      const patientLng = parseFloat(req.query.lng);
      
      // Add distance calculation for each ambulance
      const ambulancesWithDistance = ambulances.map(ambulance => {
        // Skip if ambulance has no coordinates
        if (!ambulance.coordinates || !ambulance.coordinates.lat) {
          return { ...ambulance.toObject(), distance: Infinity };
        }
        
        // Calculate Haversine distance
        const distance = calculateDistance(
          patientLat, patientLng,
          ambulance.coordinates.lat, ambulance.coordinates.lng
        );
        
        return { ...ambulance.toObject(), distance };
      });
      
      // Sort by distance
      ambulancesWithDistance.sort((a, b) => a.distance - b.distance);
      
      return res.status(200).json(ambulancesWithDistance);
    }
    
    res.status(200).json(ambulances);
  } catch (error) {
    console.error("Error fetching ambulances:", error);
    res.status(500).json({ error: "Failed to fetch ambulances." });
  }
});

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const distance = R * c; // Distance in km
  return distance;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// Hospital login
app.post("/login", async (req, res) => {
  const { hospitalName, password } = req.body;
  if (!hospitalName || !password) {
    return res.status(400).json({ error: "Both hospital name and password are required." });
  }
  try {
    const hospital = await Hospital.findOne({ name: hospitalName });
    if (!hospital) {
      return res.status(404).json({ error: "Hospital not found." });
    }
    const isPasswordValid = await bcrypt.compare(password, hospital.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password." });
    }
    res.status(200).json({
      message: "Login successful!",
      hospital: { name: hospital.name, location: hospital.location, contact: hospital.contact },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred during login." });
  }
});

// Notify ambulance driver
app.post("/notify", (req, res) => {
  const { ambulanceId, notificationId, message } = req.body;

  if (!ambulanceId) {
    return res.status(400).json({ error: "Ambulance ID is required" });
  }

  // In a real app, this would trigger push notifications or SMS
  console.log(`Notifying driver of ambulance ${ambulanceId} about patient request ${notificationId}`);
  
  // Emit socket event
  io.emit('ambulanceNotified', {
    ambulanceId,
    notificationId,
    message: message || 'New patient request received'
  });
  
  res.json({ message: `Driver notified for ambulance ${ambulanceId}` });
});

// Notify all ambulances in an area
app.post("/notify-all", async (req, res) => {
  const { location, radius, notificationId } = req.body;

  if (!location || !notificationId) {
    return res.status(400).json({ error: "Location and notification ID are required" });
  }

  try {
    // Update notification status
    await Notification.findByIdAndUpdate(
      notificationId,
      { status: 'notifying' },
      { new: true }
    );
    
    // In a real app, this would query ambulances within the radius
    // and send notifications to each of them
    console.log(`Notifying all ambulances near ${location} about patient request ${notificationId}`);
    
    // Emit socket event
    io.emit('allAmbulancesNotified', {
      location,
      notificationId,
      message: `Emergency at ${location}. Please respond if available.`
    });
    
    res.json({ 
      message: `All ambulances near ${location} have been notified`,
      notificationId
    });
  } catch (error) {
    console.error("Error notifying ambulances:", error);
    res.status(500).json({ error: "Failed to notify ambulances" });
  }
});

// Get hospital by name
app.get("/hospital/:name", async (req, res) => {
  try {
    const hospital = await Hospital.findOne({ name: req.params.name });
    if (hospital) {
      res.json(hospital);
    } else {
      res.status(404).json({ error: "Hospital not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/ambulances", async (req, res) => {
  try {
    const { name, location, contact, hospitalName, coordinates } = req.body;
    
    console.log("Received Data:", req.body);

    if (!name || !location || !contact) {
      return res.status(400).json({ error: "Name, location and contact are required" });
    }

    // Find hospital if provided
    let hospital = null;
    if (hospitalName) {
      hospital = await Hospital.findOne({ name: hospitalName });
    }

    const newAmbulance = new Ambulance({
      name, 
      location, 
      contact,
      hospital: hospital ? hospital._id : null,
      hospitalName,
      status: 'available',
      coordinates,
      lastUpdated: new Date()
    });
    
    await newAmbulance.save();

    console.log("Ambulance Saved:", newAmbulance);

    res.status(201).json({ 
      message: "Ambulance added successfully!", 
      ambulance: newAmbulance 
    });
  } catch (error) {
    console.error("Error adding ambulance:", error);
    res.status(500).json({ error: "Failed to add ambulance." });
  }
});

app.get("/ambulances/:hospitalName", async (req, res) => {
  try {
    const { hospitalName } = req.params; // Get hospital name from URL
    const ambulances = await Ambulance.find({ hospitalName }); // Fetch only matching ambulances

    res.json(ambulances);
  } catch (error) {
    console.error("Error fetching ambulances:", error);
    res.status(500).json({ error: "Server error while fetching ambulances." });
  }
});

// Update ambulance with location
app.put("/ambulances/:id", async (req, res) => {
  try {
    const ambulanceId = req.params.id;

    // Ensure ID is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(ambulanceId)) {
      return res.status(400).json({ error: "Invalid Ambulance ID" });
    }

    console.log("Updating Ambulance ID:", ambulanceId);

    // Always update lastUpdated timestamp
    req.body.lastUpdated = new Date();

    // Use Mongoose's findOneAndUpdate method to update the document
    const updatedAmbulance = await Ambulance.findOneAndUpdate(
      { _id: ambulanceId },
      { $set: req.body },
      { new: true } // Ensure the latest document is returned
    );

    // Check if the document exists
    if (!updatedAmbulance) {
      return res.status(404).json({ error: "Ambulance not found" });
    }

    // Emit ambulance update event for real-time tracking
    io.emit('ambulanceStatusUpdated', updatedAmbulance);

    res.status(200).json({ 
      message: "Ambulance updated successfully", 
      ambulance: updatedAmbulance 
    });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ error: "Error updating ambulance" });
  }
});

// Delete ambulance
app.delete("/ambulances/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Ensure ID is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid Ambulance ID" });
    }

    const deletedAmbulance = await Ambulance.findByIdAndDelete(id);
    
    if (!deletedAmbulance) {
      return res.status(404).json({ error: "Ambulance not found" });
    }

    res.json({ message: "Ambulance removed successfully!" });
  } catch (error) {
    console.error("Error deleting ambulance:", error);
    res.status(500).json({ error: "Failed to remove ambulance." });
  }
});

// Update ambulance location
app.post("/update-location", async (req, res) => {
  try {
    const { ambulanceId, lat, lng } = req.body;

    if (!ambulanceId || !lat || !lng) {
      return res.status(400).json({ error: "Ambulance ID and coordinates are required" });
    }

    const ambulance = await Ambulance.findById(ambulanceId);
    if (!ambulance) {
      return res.status(404).json({ error: "Ambulance not found" });
    }

    // Update coordinates
    ambulance.coordinates = { lat, lng };
    ambulance.lastUpdated = new Date();
    await ambulance.save();

    // Emit update event
    io.emit('ambulanceLocationUpdated', {
      ambulanceId,
      coordinates: { lat, lng },
      timestamp: ambulance.lastUpdated
    });

    res.json({ 
      message: "Location updated successfully",
      ambulance
    });
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ error: "Failed to update location" });
  }
});

// Socket.IO Event Handlers
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join admin room for administrative notifications
  socket.on('joinAdminRoom', (userId) => {
    socket.join('admin-room');
    console.log(`User ${userId} joined admin room`);
  });

  // Join ambulance room for ambulance-specific notifications
  socket.on('joinAmbulanceRoom', (ambulanceId) => {
    socket.join(`ambulance-${ambulanceId}`);
    console.log(`Ambulance ${ambulanceId} connected`);
  });

  // Join patient room for tracking specific notifications
  socket.on('joinPatientRoom', (notificationId) => {
    socket.join(`notification-${notificationId}`);
    console.log(`Joining tracking room for notification ${notificationId}`);
  });

  // Handle ambulance accepting a request
  socket.on('acceptRequest', async (data) => {
    const { ambulanceId, notificationId } = data;
    
    try {
      // Update notification status
      const ambulance = await Ambulance.findById(ambulanceId);
      if (!ambulance) {
        socket.emit('error', { message: 'Ambulance not found' });
        return;
      }

      // Update ambulance status
      ambulance.status = 'busy';
      await ambulance.save();

      // Update notification
      const notification = await Notification.findByIdAndUpdate(
        notificationId,
        { 
          status: 'assigned', 
          assignedAmbulance: { 
            _id: ambulance._id, 
            name: ambulance.name
          } 
        },
        { new: true }
      );

      if (!notification) {
        socket.emit('error', { message: 'Notification not found' });
        return;
      }

      // Broadcast to all admins
      io.to('admin-room').emit('requestAccepted', {
        notificationId,
        ambulanceId: ambulance._id,
        ambulanceName: ambulance.name
      });

      socket.emit('requestAcceptedConfirmation', { success: true });
      
    } catch (error) {
      console.error('Error accepting request:', error);
      socket.emit('error', { message: 'Failed to accept request' });
    }
  });

  // Handle ambulance location updates
  socket.on('updateAmbulanceLocation', async (data) => {
    const { ambulanceId, lat, lng } = data;
    
    try {
      const ambulance = await Ambulance.findById(ambulanceId);
      if (!ambulance) {
        return;
      }

      // Update ambulance coordinates
      ambulance.coordinates = { lat, lng };
      ambulance.lastUpdated = new Date();
      await ambulance.save();

      // Emit to specific tracking rooms
      io.to(`ambulance-${ambulanceId}`).emit('ambulanceLocationUpdated', {
        ambulanceId,
        coordinates: { lat, lng },
        timestamp: ambulance.lastUpdated
      });
      
    } catch (error) {
      console.error('Error updating ambulance location:', error);
    }
  });

  // Handle ambulance status updates
  socket.on('updateAmbulanceStatus', async (data) => {
    const { ambulanceId, status } = data;
    
    try {
      const ambulance = await Ambulance.findById(ambulanceId);
      if (!ambulance) {
        return;
      }

      // Update status
      ambulance.status = status;
      ambulance.lastUpdated = new Date();
      await ambulance.save();

      // Emit to admins
      io.to('admin-room').emit('ambulanceStatusUpdated', ambulance);
      
    } catch (error) {
      console.error('Error updating ambulance status:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Use API Keys for Third-Party Services (Mapbox, etc)
const MAPBOX_API_KEY = "pk.eyJ1IjoidG9tMjYxMSIsImEiOiJjbTdxOXpqcjEwbXp3MmlxeWx5c2c0Ymt1In0.IDbRSRluguViXa6h1_18qA";

// Start the server (using server instead of app for Socket.IO)
server.listen(PORT, () => console.log(`Server running with Socket.IO on http://localhost:${PORT}`));

module.exports = { app, server, io };