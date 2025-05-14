import random
import time

class Ambulance:
    def __init__(self, ambulance_id, driver_phone):
        self.ambulance_id = ambulance_id
        self.driver_phone = driver_phone
        self.route_log = []

    def generate_location(self, base_latitude, base_longitude):
        # Generate random latitude and longitude variations
        latitude = base_latitude + random.uniform(-0.0001, 0.0001)
        longitude = base_longitude + random.uniform(-0.0001, 0.0001)
        return latitude, longitude

    def update_location(self, latitude, longitude):
        print(f"Ambulance {self.ambulance_id} started moving... Current location: ({latitude}, {longitude})")

    def enter_area(self, area, signal_number):
        self.route_log.append(area)
        print(f"\nAmbulance {self.ambulance_id} entering Area {area}...")
        print(f"Approaching signal {signal_number:03}... Signal turning GREEN.")
        print(f"Signal {signal_number:03} is now GREEN. Ambulance passes through.")
        time.sleep(1)  # Simulate passing through signal
        print(f"Signal {signal_number:03} has turned RED after the ambulance passes.")

    def send_notification(self):
        print("\nNotification sent to the hospital for patient preparation.")

    def finish_route(self):
        print(f"\nAmbulance {self.ambulance_id} reached the hospital.")
        print(f"Route log: {self.route_log}")
        print("Emergency mode deactivated. Signals are back to normal.")

    def generate_random_route(self, num_areas=3):
        # Generate a random list of areas (A, B, C, D, E, ...)
        areas = [chr(i) for i in range(65, 65 + num_areas)]  # ['A', 'B', 'C', ...]
        random.shuffle(areas)  # Shuffle to create a random route
        return sorted(areas)  # Sort in alphabetical order

# Create ambulance instance
ambulance = Ambulance(ambulance_id="AMB001", driver_phone="+1234567890")

# Starting location (near Times Square)
base_latitude = 40.748817
base_longitude = -73.985428

# Generate a random route with 3-6 areas (can be adjusted)
route = ambulance.generate_random_route(num_areas=random.randint(3, 6))

# Driver notified at the beginning
print(f"Driver notified for emergency mode.")

# Simulate ambulance journey
ambulance.update_location(*ambulance.generate_location(base_latitude, base_longitude))

for i, area in enumerate(route, start=1):
    ambulance.enter_area(area, signal_number=i)
    ambulance.update_location(*ambulance.generate_location(base_latitude, base_longitude))

    # Send hospital notification just before reaching the hospital
    if i == len(route) - 1:
        time.sleep(1)  # Wait for a moment before sending the notification
        ambulance.send_notification()

# Final update
ambulance.update_location(*ambulance.generate_location(base_latitude, base_longitude))
ambulance.finish_route()
