// SFG/geoapp/static/geoapp/js/geo.js

// Make sure all the old commented-out Leaflet code at the very top is GONE.
// It caused "Identifier 'map' has already been declared" errors if left there.
let map = L.map('map').setView([36.8, 10.2], 13); // Map centered on Teboulbou, Gabès Governorate, Tunisia

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(map);

let drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

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
    // *** ADD THIS LINE ***
    statics: {
        TYPE: 'cameraMarker'
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
        marker: false, // If you want the default marker tool
        circlemarker: false
    },
    edit: {
        featureGroup: drawnItems
    }
});

// --- OVERRIDE L.DrawToolbar.include to provide ALL handlers ---
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
                enabled: drawOptions.marker,
                handler: new L.Draw.Marker(map, drawOptions.marker),
                title: 'Draw a Marker'
            },
            // Your Custom Camera Marker Tool
            {
                enabled: true,
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


let currentGeometry = null;

map.on('draw:created', function (e) {
    let layer = e.layer;
    let type = e.layerType;
    // Add this line to log the handler itself for inspection
    console.log('Draw event created! Type:', type, 'Layer:', layer, 'Handler:', e.handler);

    if (type === 'cameraMarker') {
        console.log('Camera marker detected! Calling openCameraInputForm.');
        const latlng = layer.getLatLng();

        // Remove the temporary marker that Leaflet.draw automatically added
        drawnItems.removeLayer(layer); // This layer is the one created by L.Draw.CameraMarker

        // Open your custom input form
        openCameraInputForm(latlng);

        // *** FIX STARTS HERE ***
        // Instead of drawControl.disable(), disable the specific handler
        if (e.handler && e.handler.disable) {
            e.handler.disable(); // Disable the active drawing handler (e.g., L.Draw.CameraMarker instance)
            console.log('Active drawing tool disabled.');
        } else {
            console.warn('Could not disable active drawing tool, handler or disable method not found.');
        }
        // *** FIX ENDS HERE ***

    } else {
        // Standard drawn items (polyline, polygon, rectangle, circle, default marker)
        drawnItems.clearLayers();
        drawnItems.addLayer(layer);
        currentGeometry = layer.toGeoJSON().geometry;
        document.getElementById("saveBtn").style.display = "inline";
    }
});

document.getElementById("saveBtn").onclick = function () {
    if (!currentGeometry) return;

    var customNameInput = document.getElementById('locationName');
    var customName = customNameInput ? customNameInput.value.trim() : '';

    if (!customName) {
        alert('Please enter a name for the location.');
        return;
    }

    fetch('/save/', {
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
        currentGeometry = null;
        drawnItems.clearLayers();
        document.getElementById("saveBtn").style.display = "none";
        if (customNameInput) {
            customNameInput.value = '';
        }
        location.reload();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error saving geometry: ' + error.message);
    });
};

let visualizedLocationsLayer = L.featureGroup().addTo(map);

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

    visualizedLocationsLayer.clearLayers();

    fetch('/get_locations_geojson/', {
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
                    if (feature.properties.is_camera && feature.properties.stream_url) {
                        const streamUrl = feature.properties.stream_url;
                        const cameraName = feature.properties.name;
                        const cameraId = feature.properties.id;
                        const cameraDescription = feature.properties.description || '';

                        let videoHtml = `
                            <h4>${cameraName}</h4>
                            ${streamUrl ? `<video id="camera-video-${cameraId}" controls width="250" height="150" autoplay muted></video>` : `<p>No live stream available for this camera.</p>`}
                            ${cameraDescription ? `<p>${cameraDescription}</p>` : ''}
                        `;

                        layer.bindPopup(videoHtml, {
                            maxWidth: 300,
                            className: 'camera-popup'
                        });

                        layer.on('popupopen', function() {
                            if (streamUrl) {
                                const videoElement = document.getElementById(`camera-video-${cameraId}`);
                                if (videoElement) {
                                    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
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
                                    }
                                    else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                                        videoElement.src = streamUrl;
                                    }
                                    else {
                                        if (videoElement.parentNode) {
                                            videoElement.parentNode.innerHTML = '<p>Your browser does not support HLS playback.</p>';
                                        }
                                    }
                                }
                            }
                        });

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
                        layer.bindPopup(`<b>${feature.properties.name}</b><br>Type: ${feature.properties.type}`);
                    }
                }
            }
        }).addTo(visualizedLocationsLayer);

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

document.getElementById('clearMapBtn').addEventListener('click', function() {
    visualizedLocationsLayer.clearLayers();
    document.getElementById('clearMapBtn').style.display = 'none';
    document.querySelectorAll('.form-check-input:checked').forEach(checkbox => {
        checkbox.checked = false;
    });
    map.setView([36.8, 10.2], 8);
});

let cameraLayer = L.featureGroup().addTo(map);


function loadCameras() {
    fetch('/cameras/api/geojson/', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
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
        cameraLayer.clearLayers();

        L.geoJSON(geojson, {
            pointToLayer: function (feature, latlng) {
                return L.marker(latlng, { icon: cameraIcon });
            },
            onEachFeature: function (feature, layer) {
                const streamUrl = feature.properties.stream_url;
                const cameraName = feature.properties.name;
                const cameraId = feature.properties.id;
                const cameraDescription = feature.properties.description;

                let videoHtml = `
                    <h4>${cameraName}</h4>
                    ${streamUrl ? `<video id="camera-video-${cameraId}" controls width="250" height="150" autoplay muted></video>` : `<p>No live stream available for this camera.</p>`}
                    ${cameraDescription ? `<p>${cameraDescription}</p>` : ''}
                `;

                layer.bindPopup(videoHtml, {
                    maxWidth: 300,
                    className: 'camera-popup'
                });

                layer.on('popupopen', function() {
                    if (streamUrl) {
                        const videoElement = document.getElementById(`camera-video-${cameraId}`);
                        if (videoElement) {
                            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
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
                            }
                            else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                                videoElement.src = streamUrl;
                            }
                            else {
                                if (videoElement.parentNode) {
                                    videoElement.parentNode.innerHTML = '<p>Your browser does not support HLS playback.</p>';
                                }
                            }
                        }
                    }
                });

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
            }
        }).addTo(cameraLayer);
    })
    .catch(error => {
        console.error('Error loading cameras:', error);
        alert('Error loading existing cameras. Please check the console.');
    });
}


let tempCameraMarker = null;

function openCameraInputForm(latlng) {
    if (tempCameraMarker) {
        map.removeLayer(tempCameraMarker);
    }

    tempCameraMarker = L.marker(latlng, { icon: cameraIcon, draggable: true }).addTo(map);

    const formHtml = document.getElementById('camera-input-form').innerHTML;

    tempCameraMarker.bindPopup(formHtml, {
        maxWidth: 300,
        className: 'camera-add-popup'
    }).openPopup();

    tempCameraMarker.latlng = latlng;

    requestAnimationFrame(() => {
        const popupContent = tempCameraMarker.getPopup().getElement();
        const saveBtn = popupContent.querySelector('#saveCameraBtn');
        const cameraNameInput = popupContent.querySelector('#cameraName');
        const rtspUrlInput = popupContent.querySelector('#rtspUrl');

        if (tempCameraMarker.cameraData) {
            cameraNameInput.value = tempCameraMarker.cameraData.name || '';
            rtspUrlInput.value = tempCameraMarker.cameraData.rtsp_url || '';
        }

        saveBtn.onclick = function() {
            const name = cameraNameInput.value.trim();
            const rtsp_url = rtspUrlInput.value.trim();
            const markerLatlng = tempCameraMarker.getLatLng();

            if (name && rtsp_url) {
                tempCameraMarker.cameraData = { name: name, rtsp_url: rtsp_url };
                saveNewCamera(name, rtsp_url, markerLatlng.lng, markerLatlng.lat);
            } else {
                alert('Camera details not complete. Not saving.');
            }
            tempCameraMarker.closePopup();
        };

        tempCameraMarker.on('dragend', function(event) {
            tempCameraMarker.latlng = event.target.getLatLng();
        });
    });

    tempCameraMarker.on('popupclose', function() {
        if (tempCameraMarker) {
            map.removeLayer(tempCameraMarker);
            tempCameraMarker = null;
        }
    });
}

function saveNewCamera(name, rtsp_url, lng, lat) {
    const locationGeoJSON = {
        type: "Point",
        coordinates: [lng, lat]
    };

    fetch('/cameras/add/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({
            name: name,
            rtsp_url: rtsp_url,
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
            alert('Camera added successfully!');
            setTimeout(() => {
            loadCameras();}, 12000);
        } else {
            alert('Failed to add camera: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error adding camera:', error);
        alert('Error adding camera: ' + error.message);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    loadCameras();
});

let player; // Global variable for the Video.js player

// Function to open video modal and play stream
function openVideoModal(streamUrl) {
    const videoModal = document.getElementById('video-modal');
    const videoElement = document.getElementById('my-video');
    
    videoModal.style.display = 'block';

    if (player) {
        player.dispose(); // Dispose of any existing player instance
    }

    player = videojs(videoElement, {
        controls: true,
        autoplay: true,
        preload: 'auto',
        techCanOverrideSources: true,
        html5: {
            hls: {
                withCredentials: false
            }
        },
        sources: [{
            src: streamUrl,
            type: 'application/x-mpegURL' // Mime type for HLS
        }]
    }, function() {
        console.log('Video.js player is ready');
    });
}

// Function to close video modal
document.getElementById('close-video-modal').addEventListener('click', function() {
    const videoModal = document.getElementById('video-modal');
    videoModal.style.display = 'none';
    if (player) {
        player.pause();
        player.reset();
    }
});


// Modify your onEachFeature function to open the video modal
function onEachFeature(feature, layer) {
    if (feature.properties && feature.properties.name) {
        let popupContent = `<b>${feature.properties.name}</b><br>`;
        if (feature.properties.description) {
            popupContent += `Description: ${feature.properties.description}<br>`;
        }
        if (feature.properties.rtsp_url) {
            popupContent += `RTSP URL: ${feature.properties.rtsp_url}<br>`;
        }
        
        // Add a button to view the stream IF a stream_url exists
        if (feature.properties.stream_url) {
            popupContent += `<button class="view-stream-btn" data-stream-url="${feature.properties.stream_url}">View Stream</button>`;
        } else {
             popupContent += `<em>Stream not active/available</em><br>`;
        }

        // Add Edit/Delete buttons (if applicable)
        popupContent += `<button class="edit-camera-btn" data-id="${feature.properties.id}" data-name="${feature.properties.name}" data-rtsp_url="${feature.properties.rtsp_url}" data-description="${feature.properties.description}" data-lat="${feature.geometry.coordinates[1]}" data-lng="${feature.geometry.coordinates[0]}">Edit</button>`;
        popupContent += `<button class="delete-camera-btn" data-id="${feature.properties.id}">Delete</button>`;

        layer.bindPopup(popupContent);

        // Attach event listener for the "View Stream" button inside the popup
        layer.on('popupopen', function() {
            const popupElement = layer.getPopup().getElement();
            const viewStreamBtn = popupElement.querySelector('.view-stream-btn');
            if (viewStreamBtn) {
                viewStreamBtn.onclick = function() {
                    const streamUrl = this.dataset.streamUrl;
                    if (streamUrl) {
                        openVideoModal(streamUrl);
                    } else {
                        alert('Stream URL not available for this camera.');
                    }
                };
            }

            // (Your existing edit/delete button handlers here)
            const editBtn = popupElement.querySelector('.edit-camera-btn');
            if (editBtn) {
                editBtn.onclick = function() {
                    const id = this.dataset.id;
                    const name = this.dataset.name;
                    const rtsp_url = this.dataset.rtsp_url;
                    const description = this.dataset.description;
                    const lat = parseFloat(this.dataset.lat);
                    const lng = parseFloat(this.dataset.lng);
                    openEditCameraForm(id, name, rtsp_url, description, lat, lng);
                };
            }

            const deleteBtn = popupElement.querySelector('.delete-camera-btn');
            if (deleteBtn) {
                deleteBtn.onclick = function() {
                    if (confirm('Are you sure you want to delete this camera?')) {
                        const cameraId = this.dataset.id;
                        deleteCamera(cameraId);
                    }
                };
            }
        });
    }
}