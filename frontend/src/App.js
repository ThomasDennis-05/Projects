import React, { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = "http://localhost:3000";

const App = () => {
  const [hospitals, setHospitals] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [hospitalForm, setHospitalForm] = useState({ name: "", location: "", contact: "", password: "" });
  const [loginForm, setLoginForm] = useState({ hospitalName: "", password: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchHospitals();
    fetchAmbulances();
    fetchNotifications();
  }, []);

  const fetchHospitals = async () => {
    const response = await axios.get(`${API_BASE}/hospitals`);
    setHospitals(response.data);
  };

  const fetchAmbulances = async () => {
    const response = await axios.get(`${API_BASE}/ambulances`);
    setAmbulances(response.data);
  };

  const fetchNotifications = async () => {
    const response = await axios.get(`${API_BASE}/notifications`);
    setNotifications(response.data);
  };

  const registerHospital = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/hospitals`, hospitalForm);
      setMessage("Hospital registered successfully!");
      fetchHospitals();
    } catch (error) {
      setMessage(error.response?.data?.error || "Registration failed.");
    }
  };

  const loginHospital = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_BASE}/login`, loginForm);
      setMessage(response.data.message);
    } catch (error) {
      setMessage(error.response?.data?.error || "Login failed.");
    }
  };

  const sendNotification = async () => {
    if (!message) return;
    await axios.post(`${API_BASE}/notifications`, { message });
    setMessage("Notification sent!");
    fetchNotifications();
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>🚑 Ambulance-TMS</h1>

      <h2>🏥 Register Hospital</h2>
      <form onSubmit={registerHospital}>
        <input type="text" placeholder="Hospital Name" required value={hospitalForm.name} onChange={(e) => setHospitalForm({ ...hospitalForm, name: e.target.value })} />
        <input type="text" placeholder="Location" required value={hospitalForm.location} onChange={(e) => setHospitalForm({ ...hospitalForm, location: e.target.value })} />
        <input type="text" placeholder="Contact" required value={hospitalForm.contact} onChange={(e) => setHospitalForm({ ...hospitalForm, contact: e.target.value })} />
        <input type="password" placeholder="Password" required value={hospitalForm.password} onChange={(e) => setHospitalForm({ ...hospitalForm, password: e.target.value })} />
        <button type="submit">Register</button>
      </form>

      <h2>🔑 Hospital Login</h2>
      <form onSubmit={loginHospital}>
        <input type="text" placeholder="Hospital Name" required value={loginForm.hospitalName} onChange={(e) => setLoginForm({ ...loginForm, hospitalName: e.target.value })} />
        <input type="password" placeholder="Password" required value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
        <button type="submit">Login</button>
      </form>

      <h2>🚑 Available Ambulances</h2>
      <ul>
        {ambulances.length ? ambulances.map((ambulance) => (
          <li key={ambulance._id}>{ambulance.name} - {ambulance.location}</li>
        )) : <p>No ambulances found</p>}
      </ul>

      <h2>📢 Notifications</h2>
      <input type="text" placeholder="Send Notification" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button onClick={sendNotification}>Send</button>
      <ul>
        {notifications.length ? notifications.map((note, index) => (
          <li key={index}>{note.message} ({new Date(note.timestamp).toLocaleTimeString()})</li>
        )) : <p>No notifications</p>}
      </ul>

      {message && <p style={{ color: "green" }}>{message}</p>}
    </div>
  );
};

export default App;
