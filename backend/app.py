from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import time
import requests

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

GOOGLE_MAPS_API_KEY = "YOUR_GOOGLE_MAPS_API_KEY"

def get_hospital_coordinates(hospital_name):
    """Fetch latitude & longitude of hospital using Google Maps API."""
    url = f"https://maps.googleapis.com/maps/api/geocode/json?address={hospital_name}&key={GOOGLE_MAPS_API_KEY}"
    response = requests.get(url).json()
    
    if response["status"] == "OK":
        location = response["results"][0]["geometry"]["location"]
        return location["lat"], location["lng"]
    return None, None
@app.route('/notify', methods=['POST'])
def notify_driver():
    try:
        data = request.json
        contact = data.get('contact')
        hospital_name = data.get('hospital')

        if not contact or not hospital_name:
            return jsonify({"error": "Missing contact or hospital name"}), 400

        # Debugging print statements (Check server logs)
        print(f"Notifying driver for: {contact}, Hospital: {hospital_name}")

        # Simulating success response
        return jsonify({"message": f"Notification sent for {contact} to {hospital_name}"}), 200

    except Exception as e:
        print("Error in notify_driver:", str(e))
        return jsonify({"error": "Internal Server Error"}), 500

def simulate_movement(start, dest_lat, dest_lng):
    """Simulate ambulance moving towards hospital"""
    steps = 20
    lat_step = (dest_lat - start["latitude"]) / steps
    lng_step = (dest_lng - start["longitude"]) / steps

    for _ in range(steps):
        start["latitude"] += lat_step
        start["longitude"] += lng_step

        # Send location update to frontend
        socketio.emit("update_location", start)
        time.sleep(2)

    # Notify frontend that ambulance has arrived
    socketio.emit("reached_hospital", {"message": "Ambulance has arrived at the hospital."})

if __name__ == '__main__':
    socketio.run(app, port=3000, debug=True)
