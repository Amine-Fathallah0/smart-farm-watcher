# Smart Farm Watcher

Smart Farm Watcher is a web-based platform designed to help users monitor and manage their farms efficiently through an interactive map interface. The system allows each user to create and visualize geospatial elements (polygons, markers) and live camera feeds, with data isolation between users.

## 🌍 Features

- **Interactive Map Interface**
  - Built using **Leaflet** and **leaflet.draw**
  - Users can draw and save **polygons** and **markers** on the map
  - Each user sees only **their own saved locations**
  - Saved locations are accessible through the **"Your Saved Locations"** menu

- **Camera Management**
  - Users can **add cameras** by specifying a name and an RTSP link
  - A **preview stream** appears after ~8 seconds of saving the camera
  - Cameras are **always visible** on the map
  - Video streams are handled using **FFmpeg**

- **Asynchronous Architecture**
  - The backend is powered by **Django** with async support
  - Designed to support real-time video streaming and map updates

## ⚙️ Tech Stack

- **Backend**: Django (Python)  
- **Frontend**: HTML, CSS, JavaScript  
- **Libraries & Tools**:
  - [Leaflet](https://leafletjs.com/)
  - [leaflet.draw](https://github.com/Leaflet/Leaflet.draw)
  - [GDAL](https://gdal.org/)
  - [FFmpeg](https://ffmpeg.org/)

## 🚀 What's Next

- ✅ **WebSocket Integration**  
  Improve real-time performance and data flow for live video feeds.

- ✅ **Multithreading for Video Streams**  
  Enable simultaneous display of multiple camera streams without impacting performance.

- ✅ **YOLO Integration for Fire Detection**  
  Embed a YOLO model to detect fires in camera feeds.

- ✅ **Smart Notifications System**  
  Alert users when fire or other risks are detected by the AI.

## 🛠️ Getting Started

### Prerequisites

- Python 3.12.6
- Django 5.2.1
- GDAL
- FFmpeg

Install system dependencies (Ubuntu example):

```bash
sudo apt update
sudo apt install gdal-bin ffmpeg python3-dev python3-pip
```
Clone the Repository
```bash
git clone https://github.com/your-username/smart-farm-watcher.git
cd smart-farm-watcher
```
Install Python Requirements
```bash
pip install -r requirements.txt
```
Migrate Database
```bash
python manage.py makemigrations
python manage.py migrate
```
Create a Superuser (optional)
```bash
python manage.py createsuperuser
```
Run Development Server (Synchronous)
```bash
python manage.py runserver
```
Run Development Server (Asynchronous)
```bash
uvicorn mysite.asgi:application --reload
```

💡 Notes
- Cameras require an 8-second delay post-save to initialize the stream.

- Only selected saved locations appear on the map unless toggled via the UI.

- The project is under active development — stay tuned for upcoming real-time AI and alerting features!

🧠 Built with purpose to protect and monitor farms intelligently.

---