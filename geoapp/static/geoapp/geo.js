// SFG/geoapp/static/geoapp/js/geo.js

// Make sure all the old commented-out Leaflet code at the very top is GONE.
// It caused "Identifier 'map' has already been declared" errors if left there.
let map = L.map('map').setView([36.8, 10.2], 13); // Map centered on Teboulbou, Gabès Governorate, Tunisia
let cameraSocket = null; // Global variable for the WebSocket connection

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(map);

let drawnItems = new L.FeatureGroup(); // For drawing tools (polylines, polygons, etc.)
map.addLayer(drawnItems);

let cameraLayer = L.featureGroup().addTo(map); // For displaying camera markers
let visualizedLocationsLayer = new L.FeatureGroup().addTo(map); // For visualizing selected non-camera locations

// Global variable to hold the temporary marker for input form (used by openCameraInputForm)
let tempCameraMarker = null; 
// --- START CUSTOM CAMERA DRAW HANDLER ---
// Ensure CAMERA_ICON_STATIC_URL is correctly defined in your HTML before this script
const cameraIcon = L.icon({
    iconUrl: CAMERA_ICON_STATIC_URL,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

// Extend L.Draw.Marker to create a custom Camera Marker handler
L.Draw.CameraMarker = L.Draw.Marker.extend({
    options: {
        icon: cameraIcon, // This is the icon for the marker ON THE MAP
        tooltip: {
            start: 'Click map to place a camera'
        }
    },
    statics: {
        TYPE: 'cameraMarker' // Define a static TYPE for easy identification
    },
    initialize: function (map, options) {
        L.Draw.Marker.prototype.initialize.call(this, map, options);
        this.type = 'cameraMarker'; // Explicitly set the type for this instance
        console.log("L.Draw.CameraMarker instance created. type:", this.type); // For debugging
    }
});
// --- END CUSTOM CAMERA DRAW HANDLER ---

// Initialize drawControl FIRST. Its 'draw' options will be used to configure individual handlers.
let drawControl = new L.Control.Draw({
    draw: {
        polyline: true,
        polygon: true,
        rectangle: true,
        circle: true,
        marker: false, // Disable default Leaflet marker tool
        circlemarker: false
    },
    edit: {
        featureGroup: drawnItems // drawnItems is where non-camera shapes will be added
    }
});

// --- OVERRIDE L.DrawToolbar.include to provide ALL handlers ---
// This ensures your custom camera marker tool appears in the drawing toolbar.
L.DrawToolbar.include({
    getModeHandlers: function (map) {
        const drawOptions = drawControl.options.draw;

        return [
            {
                enabled: drawOptions.polyline,
                handler: new L.Draw.Polyline(map, drawOptions.polyline),
                title: 'Draw a Polyline'
            },
            {
                enabled: drawOptions.polygon,
                handler: new L.Draw.Polygon(map, drawOptions.polygon),
                title: 'Draw a Polygon'
            },
            {
                enabled: drawOptions.rectangle,
                handler: new L.Draw.Rectangle(map, drawOptions.rectangle),
                title: 'Draw a Rectangle'
            },
            {
                enabled: drawOptions.circle,
                handler: new L.Draw.Circle(map, drawOptions.circle),
                title: 'Draw a Circle'
            },
            {
                enabled: drawOptions.marker, // This is false by default, but kept for completeness
                handler: new L.Draw.Marker(map, drawOptions.marker),
                title: 'Draw a Marker'
            },
            // Your Custom Camera Marker Tool
            {
                enabled: true, // Enable your custom camera marker
                handler: new L.Draw.CameraMarker(map, { icon: cameraIcon }), // Ensure this uses your cameraIcon
                title: 'Place Camera Marker',
                className: 'leaflet-draw-icon-camera' // This CSS class will be applied to the button
            }
        ];
    }
});
// --- END L.DrawToolbar.include OVERRIDE ---

// Now add the control to the map
map.addControl(drawControl);
let currentGeometry = null; // For non-camera drawn shapes

// Event listener for when a drawing is created on the map
map.on('draw:created', function (e) {
    let layer = e.layer;
    let type = e.layerType;
    console.log('Draw event created! Type:', type, 'Layer:', layer, 'Handler:', e.handler);

    if (type === 'cameraMarker') {
        console.log('Camera marker detected! Calling openCameraInputForm.');
        const latlng = layer.getLatLng();

        // Remove the temporary marker that Leaflet.draw automatically added
        // This marker is replaced by the one created in openCameraInputForm
        drawnItems.removeLayer(layer); 

        // Open your custom input form for camera details
        openCameraInputForm(latlng);

        // Disable the active drawing handler after creation
        if (e.handler && typeof e.handler.disable === 'function') { 
            e.handler.disable(); 
            console.log('Active drawing tool disabled.');
        } else {
            console.warn('Could not disable active drawing tool, handler or disable method not found.');
        }

    } else {
        // Handle standard drawn items (polyline, polygon, rectangle, circle)
        // Clear previous drawn items to only show the latest one
        drawnItems.clearLayers(); 
        drawnItems.addLayer(layer); // Add the new drawn shape to the map
        currentGeometry = layer.toGeoJSON().geometry; // Store its GeoJSON geometry
        document.getElementById("saveBtn").style.display = "inline"; // Show save button for general geometry
    }
});

// Event listener for saving general drawn geometry (not cameras)
document.getElementById("saveBtn").onclick = function () {
    if (!currentGeometry) return; // If no geometry is drawn, do nothing

    var customNameInput = document.getElementById('locationName');
    var customName = customNameInput ? customNameInput.value.trim() : '';

    if (!customName) {
        alert('Please enter a name for the location.');
        return;
    }

    fetch('/save/', { // Assuming this is your endpoint for saving general geometries
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({
            name: customName,
            geometry: currentGeometry
        })
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(error => { throw new Error(error.message || `HTTP error! status: ${res.status}`); });
        }
        return res.json();
    })
    .then(data => {
        alert("Saved!");
        currentGeometry = null; // Clear current geometry
        drawnItems.clearLayers(); // Clear drawn shapes from map
        document.getElementById("saveBtn").style.display = "none"; // Hide save button
        if (customNameInput) {
            customNameInput.value = ''; // Clear input field
        }
        location.reload(); // Reload page after saving general geometry
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error saving geometry: ' + error.message);
    });
};
// Helper function to get CSRF token from cookies
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (const c of cookies) {
            const cookie = c.trim();
            if (cookie.startsWith(name + '=')) {
                cookieValue = decodeURIComponent(cookie.slice(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// Event listener for visualizing selected locations (from the list on the left)
document.getElementById('visualizeSelectedBtn').addEventListener('click', function() {
    const selectedIds = [];
    const checkboxes = document.querySelectorAll('.form-check-input:checked');

    if (checkboxes.length === 0) {
        alert('Please select at least one location to visualize.');
        return;
    }

    checkboxes.forEach(checkbox => {
        selectedIds.push(checkbox.value);
    });

    visualizedLocationsLayer.clearLayers(); // Clear previously visualized layers

    fetch('/get_locations_geojson/', { // Assuming this endpoint returns GeoJSON for selected IDs
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({ ids: selectedIds })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.message || 'Server error'); });
        }
        return response.json();
    })
    .then(geojson => {
        L.geoJSON(geojson, {
            pointToLayer: function (feature, latlng) {
                // Use cameraIcon for camera features, default circle marker for others
                if (feature.properties && feature.properties.is_camera) {
                    return L.marker(latlng, { icon: cameraIcon });
                }
                return L.circleMarker(latlng, {
                    radius: 8,
                    fillColor: "#ff7800",
                    color: "#000",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            },
            onEachFeature: function (feature, layer) {
                if (feature.properties && feature.properties.name) {
                    // If it's a camera with a stream, create the video popup
                    if (feature.properties.is_camera && feature.properties.stream_url) {
                        const streamUrl = feature.properties.stream_url;
                        const cameraName = feature.properties.name;
                        const cameraId = feature.properties.id;
                        const cameraDescription = feature.properties.description || '';

                        // Use the same popup HTML structure as createCameraPopupContent
                        let videoHtml = `
                            <b>${cameraName}</b><br>
                            Description: ${cameraDescription}<br>
                            RTSP URL: ${feature.properties.rtsp_url}<br>
                            <div id="video-container-${cameraId}" style="width: 100%; height: 200px; background-color: black;">
                                ${streamUrl ? `<video id="camera-video-${cameraId}" controls width="250" height="150" autoplay muted></video>` : `<p>No live stream available for this camera.</p>`}
                            </div>
                        `;

                        layer.bindPopup(videoHtml, {
                            maxWidth: 300,
                            className: 'camera-popup'
                        });

                        // Hls.js initialization on popup open for visualized cameras
                        layer.on('popupopen', function() {
                            if (streamUrl) {
                                const videoElement = document.getElementById(`camera-video-${cameraId}`);
                                if (videoElement) {
                                    if (typeof Hls !== 'undefined' && Hls.isSupported() && !videoElement._hlsInstance) {
                                        const hls = new Hls();
                                        hls.loadSource(streamUrl);
                                        hls.attachMedia(videoElement);
                                        hls.on(Hls.Events.ERROR, function(event, data) {
                                            console.error('HLS error:', data);
                                            if (data.fatal) {
                                                switch(data.type) {
                                                    case Hls.ErrorTypes.NETWORK_ERROR:
                                                        console.error("Fatal network error, trying to recover...");
                                                        hls.startLoad();
                                                        break;
                                                    case Hls.ErrorTypes.MEDIA_ERROR:
                                                        console.error("Fatal media error, trying to recover...");
                                                        hls.recoverMediaError();
                                                        break;
                                                    default:
                                                        hls.destroy();
                                                        if (videoElement.parentNode) {
                                                            videoElement.parentNode.innerHTML = '<p>Stream failed to load due to a fatal error.</p>';
                                                        }
                                                        break;
                                                }
                                            }
                                        });
                                        videoElement._hlsInstance = hls; // Store Hls.js instance
                                    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                                        videoElement.src = streamUrl;
                                    } else {
                                        if (videoElement.parentNode) {
                                            videoElement.parentNode.innerHTML = '<p>Your browser does not support HLS playback.</p>';
                                        }
                                    }
                                }
                            }
                        });

                        // Hls.js disposal on popup close for visualized cameras
                        layer.on('popupclose', function() {
                            const videoElement = document.getElementById(`camera-video-${cameraId}`);
                            if (videoElement) {
                                videoElement.pause();
                                videoElement.removeAttribute('src');
                                videoElement.load();
                                if (typeof Hls !== 'undefined' && Hls.isSupported() && videoElement._hlsInstance) {
                                    videoElement._hlsInstance.destroy();
                                    delete videoElement._hlsInstance;
                                }
                            }
                        });

                    } else {
                        // For non-camera features or cameras without stream_url
                        layer.bindPopup(`<b>${feature.properties.name}</b><br>Type: ${feature.properties.type}`);
                    }
                }
            }
        }).addTo(visualizedLocationsLayer); // Add to visualizedLocationsLayer
        
        if (visualizedLocationsLayer.getLayers().length > 0) {
            map.fitBounds(visualizedLocationsLayer.getBounds());
        }

        document.getElementById('clearMapBtn').style.display = 'inline';
    })
    .catch(error => {
        console.error('Error visualizing locations:', error);
        alert('Failed to visualize locations: ' + error.message);
    });
});

// Event listener for clearing visualized locations
document.getElementById('clearMapBtn').addEventListener('click', function() {
    visualizedLocationsLayer.clearLayers();
    document.getElementById('clearMapBtn').style.display = 'none';
    document.querySelectorAll('.form-check-input:checked').forEach(checkbox => {
        checkbox.checked = false;
    });
    map.setView([36.8, 10.2], 8); // Reset map view
});
// Function to open the camera input form popup
function openCameraInputForm(latlng) {
    // Remove any existing temporary marker if one was already placed
    if (tempCameraMarker) {
        map.removeLayer(tempCameraMarker);
    }

    // Create a new temporary marker at the clicked location
    tempCameraMarker = L.marker(latlng, { icon: cameraIcon, draggable: true }).addTo(map);

    // Get the HTML content for the camera input form (assuming it's in a hidden div)
    const formHtml = document.getElementById('camera-input-form').innerHTML;

    // Bind the form HTML to the temporary marker's popup and open it
    tempCameraMarker.bindPopup(formHtml, {
        maxWidth: 300,
        className: 'camera-add-popup'
    }).openPopup();

    // Store the initial latlng on the marker for later use (e.g., if dragged)
    tempCameraMarker.latlng = latlng;

    // Use requestAnimationFrame to ensure the popup is rendered before querying its elements
    requestAnimationFrame(() => {
        const popupContent = tempCameraMarker.getPopup().getElement();
        const saveBtn = popupContent.querySelector('#saveCameraBtn');
        const cameraNameInput = popupContent.querySelector('#cameraName');
        const rtspUrlInput = popupContent.querySelector('#rtspUrl');
        const cameraDescriptionInput = popupContent.querySelector('#cameraDescription'); // Added description input

        // Populate form fields if editing an existing camera (tempCameraMarker.cameraData would be set)
        if (tempCameraMarker.cameraData) {
            cameraNameInput.value = tempCameraMarker.cameraData.name || '';
            rtspUrlInput.value = tempCameraMarker.cameraData.rtsp_url || '';
            if (cameraDescriptionInput) {
                cameraDescriptionInput.value = tempCameraMarker.cameraData.description || '';
            }
        }

        // Event listener for the Save button within the popup
        saveBtn.onclick = function() {
            const name = cameraNameInput.value.trim();
            const rtsp_url = rtspUrlInput.value.trim();
            const description = cameraDescriptionInput ? cameraDescriptionInput.value.trim() : '';
            const markerLatlng = tempCameraMarker.getLatLng(); // Get final latlng (in case marker was dragged)

            if (name && rtsp_url) {
                // Store data on temp marker (useful if editing or for immediate display logic)
                tempCameraMarker.cameraData = { name: name, rtsp_url: rtsp_url, description: description };
                // Call saveNewCamera with all necessary data
                saveNewCamera(name, rtsp_url, description, markerLatlng.lng, markerLatlng.lat);
                // The popup will be closed by the WebSocket message handling after successful save
            } else {
                alert('Camera Name and RTSP URL are required.');
            }
            // No need to closePopup here, it's handled by WebSocket message
        };

        // Event listener for when the temporary marker is dragged
        tempCameraMarker.on('dragend', function(event) {
            tempCameraMarker.latlng = event.target.getLatLng();
        });
    });

    // Event listener for when the temporary marker's popup is closed
    tempCameraMarker.on('popupclose', function() {
        if (tempCameraMarker) {
            map.removeLayer(tempCameraMarker); // Remove the temporary marker from the map
            tempCameraMarker = null; // Clear the reference
        }
    });
}

// Function to save a new camera to the backend
function saveNewCamera(name, rtsp_url, description, lng, lat) {
    const locationGeoJSON = {
        type: "Point",
        coordinates: [lng, lat]
    };

    fetch('/cameras/add/', { // Endpoint to add a new camera
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({
            name: name,
            rtsp_url: rtsp_url,
            description: description, // Include description
            location: locationGeoJSON
        })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(error => {
                throw new Error(error.message || `HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            // alert('Camera added successfully!'); // Alert is now handled by WebSocket message
            // The map update is now handled by the WebSocket message, not loadCameras() directly
            // The setTimeout is moved to the WebSocket onmessage handler
        } else {
            alert('Failed to add camera: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error adding camera:', error);
        alert('Error adding camera: ' + error.message);
    });
}
// Function to set up the WebSocket connection
function setupWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    // The WebSocket URL must match the combined path from mysite/routing.py and cameras/routing.py
    // mysite/routing.py has r'^ws/' and cameras/routing.py has r'cameras/$'
    const wsUrl = wsProtocol + window.location.host + '/ws/cameras/'; 

    cameraSocket = new WebSocket(wsUrl);

    cameraSocket.onopen = function(e) {
        console.log('WebSocket connection established!', e);
    };

    cameraSocket.onmessage = function(e) {
        const data = JSON.parse(e.data);
        console.log('WebSocket message received:', data);

        if (data.type === 'camera_added') {
            const newCamera = data.camera;
            // Add the new camera to the map dynamically after a delay
            // This delay gives FFmpeg time to generate initial HLS segments.
            setTimeout(() => {
                addCameraToMap(newCamera);
                // Optionally, open the popup for the new camera automatically
                // This would require finding the marker by its camera.id and calling .openPopup()
                // For now, it will appear on the map, and user can click it.
            }, 12000); // 12 seconds delay (adjust as needed based on stream startup time)

            // Close the camera input form popup if it's open
            if (tempCameraMarker) {
                tempCameraMarker.closePopup();
            }
            alert(`New camera "${newCamera.name}" added and stream starting.`);
        }
        // You would add more `else if` blocks here for other message types:
        // e.g., 'camera_updated', 'camera_deleted', 'camera_stopped'
        // to dynamically update or remove markers from the map.
    };

    cameraSocket.onclose = function(e) {
        console.error('WebSocket closed unexpectedly:', e);
        // Attempt to reconnect after a delay to maintain real-time updates
        setTimeout(setupWebSocket, 3000); 
    };

    cameraSocket.onerror = function(e) {
        console.error('WebSocket error:', e);
    };
}

// Modified loadCameras function:
// This function is responsible for fetching ALL existing cameras from the backend
// and adding them to the map. It's called on initial page load.
function loadCameras() {
    fetch('/cameras/api/geojson/', { // Fetch from the GeoJSON API endpoint
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            // 'X-CSRFToken': getCookie('csrftoken') // Only needed for POST requests
        }
    })
    .then(response => {
        if (!response.ok) {
            console.error('Failed to fetch cameras GeoJSON:', response.status, response.statusText);
            return response.text().then(text => { throw new Error(`HTTP error! status: ${response.status}\n${text}`); });
        }
        return response.json();
    })
    .then(geojson => {
        cameraLayer.clearLayers(); // Clear existing camera markers

        L.geoJSON(geojson, {
            pointToLayer: function (feature, latlng) {
                // Use the global cameraIcon for markers
                return L.marker(latlng, { icon: cameraIcon });
            },
            onEachFeature: function (feature, layer) {
                // Use createCameraPopupContent helper for consistency and Hls.js management
                layer.bindPopup(createCameraPopupContent(feature.properties), {
                    maxWidth: 300,
                    className: 'camera-popup'
                });

                // Hls.js initialization on popup open
                layer.on('popupopen', function() {
                    const streamUrl = feature.properties.stream_url;
                    const cameraId = feature.properties.id; // Use feature.properties.id
                    if (streamUrl) {
                        const videoElement = document.getElementById(`camera-video-${cameraId}`);
                        if (videoElement) {
                            if (typeof Hls !== 'undefined' && Hls.isSupported() && !videoElement._hlsInstance) {
                                const hls = new Hls();
                                hls.loadSource(streamUrl);
                                hls.attachMedia(videoElement);
                                hls.on(Hls.Events.ERROR, function(event, data) {
                                    console.error('HLS error:', data);
                                    if (data.fatal) {
                                        switch(data.type) {
                                            case Hls.ErrorTypes.NETWORK_ERROR:
                                                console.error("Fatal network error, trying to recover...");
                                                hls.startLoad();
                                                break;
                                            case Hls.ErrorTypes.MEDIA_ERROR:
                                                console.error("Fatal media error, trying to recover...");
                                                hls.recoverMediaError();
                                                break;
                                            default:
                                                hls.destroy();
                                                if (videoElement.parentNode) {
                                                    videoElement.parentNode.innerHTML = '<p>Stream failed to load due to a fatal error.</p>';
                                                }
                                                break;
                                        }
                                    }
                                });
                                videoElement._hlsInstance = hls; // Store Hls.js instance
                            } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                                videoElement.src = streamUrl;
                            } else {
                                if (videoElement.parentNode) {
                                    videoElement.parentNode.innerHTML = '<p>Your browser does not support HLS playback.</p>';
                                }
                            }
                        }
                    }
                });

                // Hls.js disposal on popup close
                layer.on('popupclose', function() {
                    const cameraId = feature.properties.id; // Use feature.properties.id
                    const videoElement = document.getElementById(`camera-video-${cameraId}`);
                    if (videoElement) {
                        videoElement.pause();
                        videoElement.removeAttribute('src');
                        videoElement.load();
                        if (typeof Hls !== 'undefined' && Hls.isSupported() && videoElement._hlsInstance) {
                            videoElement._hlsInstance.destroy();
                            delete videoElement._hlsInstance;
                        }
                    }
                });
            }
        }).addTo(cameraLayer);
    })
    .catch(error => {
        console.error('Error loading cameras:', error);
        alert('Error loading existing cameras. Please check the console.');
    });
}

// NEW: Function to add a single camera marker to the map
// This function is called by loadCameras (for initial load) and by setupWebSocket (for new cameras).
function addCameraToMap(camera) {
    // Check if a marker for this camera already exists to avoid duplicates
    let existingMarker = null;
    cameraLayer.eachLayer(function(layer) { // Check in cameraLayer
        if (layer.cameraData && layer.cameraData.id === camera.id) {
            existingMarker = layer;
        }
    });

    if (existingMarker) {
        // Update existing marker's data and position.
        existingMarker.cameraData = camera;
        existingMarker.setLatLng(L.latLng(camera.location.coordinates[1], camera.location.coordinates[0]));
        console.log(`Updating existing marker for camera ${camera.id}`);
        // If the popup is currently open, update its content to reflect new data.
        if (existingMarker.isPopupOpen()) {
            existingMarker.setPopupContent(createCameraPopupContent(camera));
            // Dispose of the old Hls.js instance if it exists and re-initialize.
            const videoElement = document.getElementById(`camera-video-${camera.id}`);
            if (videoElement && videoElement._hlsInstance) { // Use _hlsInstance for Hls.js
                videoElement._hlsInstance.destroy();
                delete videoElement._hlsInstance; // Remove the reference
            }
            // Manually fire popupopen to re-initialize the Hls.js player with new content
            existingMarker.fire('popupopen');
        }
        return; // Exit as the marker has been updated
    }

    // Create a new Leaflet marker if it doesn't exist.
    const latlng = L.latLng(camera.location.coordinates[1], camera.location.coordinates[0]);
    const marker = L.marker(latlng, { icon: cameraIcon }).addTo(cameraLayer); // Add marker to cameraLayer
    marker.cameraData = camera; // Store the full camera data on the marker

    // Bind the popup content to the marker.
    marker.bindPopup(createCameraPopupContent(camera), {maxWidth: 300, className: 'camera-popup'});

    // Event listener for when the marker's popup is opened.
    marker.on('popupopen', function() {
        const streamUrl = camera.stream_url;
        if (streamUrl) {
            const videoElement = document.getElementById(`camera-video-${camera.id}`); 
            if (videoElement) { 
                if (typeof Hls !== 'undefined' && Hls.isSupported() && !videoElement._hlsInstance) {
                    const hls = new Hls();
                    hls.loadSource(streamUrl);
                    hls.attachMedia(videoElement);
                    
                    hls.on(Hls.Events.ERROR, function(event, data) {
                        console.error('HLS error:', data);
                        if (data.fatal) {
                            switch(data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.error("Fatal network error, trying to recover...");
                                    hls.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.error("Fatal media error, trying to recover...");
                                    hls.recoverMediaError();
                                    break;
                                default:
                                    hls.destroy();
                                    if (videoElement.parentNode) {
                                        videoElement.parentNode.innerHTML = '<p>Stream failed to load due to a fatal error.</p>';
                                    }
                                    break;
                            }
                        }
                    });
                    videoElement._hlsInstance = hls; 
                    console.log('Hls.js player initialized for camera', camera.id);
                } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                    videoElement.src = streamUrl;
                } else {
                    if (videoElement.parentNode) {
                        videoElement.parentNode.innerHTML = '<p>Your browser does not support HLS playback.</p>';
                    }
                }
            }
        }
    });

    // Event listener for when the marker's popup is closed.
    marker.on('popupclose', function() {
        const videoElement = document.getElementById(`camera-video-${camera.id}`); 
        if (videoElement) {
            videoElement.pause(); 
            videoElement.removeAttribute('src'); 
            videoElement.load(); 
            if (typeof Hls !== 'undefined' && Hls.isSupported() && videoElement._hlsInstance) {
                videoElement._hlsInstance.destroy();
                delete videoElement._hlsInstance; 
                console.log('Hls.js player disposed for camera', camera.id);
            }
        }
    });

    cameraLayer.addLayer(marker); // Add the marker to the cameraLayer group
    console.log(`Added new marker for camera ${camera.id}`);
}

// NEW: Helper function to create popup content (reusable for initial load and updates)
function createCameraPopupContent(camera) {
    const streamUrl = camera.stream_url;
    const cameraDescription = camera.description;
    const cameraId = camera.id;

    return `
        <b>${camera.name}</b><br>
        Description: ${cameraDescription || ''}<br>
        RTSP URL: ${camera.rtsp_url}<br>
        <div id="video-container-${cameraId}" style="width: 100%; height: 200px; background-color: black;">
            ${streamUrl ? `<video id="camera-video-${cameraId}" controls width="250" height="150" autoplay muted></video>` : `<p>No live stream available for this camera.</p>`}
        </div>
    `;
}

// Modify DOMContentLoaded to setup WebSocket and load initial cameras
document.addEventListener('DOMContentLoaded', function() {
    setupWebSocket(); // Start WebSocket connection
    loadCameras();    // Load existing cameras on initial page load
});
