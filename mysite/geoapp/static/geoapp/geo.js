// var map = L.map('map', {drawControl: true}).setView([51.505, -0.09], 13);
// var OpenTopoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
//     maxZoom: 17,
//     attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
// }).addTo(map);
// L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
//     maxZoom: 19,
//     attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
// }).addTo(map);
// var marker = L.marker([51.5, -0.09]).addTo(map);
// var circle = L.circle([51.508, -0.11], {
//     color: 'red',
//     fillColor: '#f03',
//     fillOpacity: 0.5,
//     radius: 500
// }).addTo(map);
// var polygon = L.polygon([
//     [51.509, -0.08],
//     [51.503, -0.06],
//     [51.51, -0.047]
// ]).addTo(map);
// marker.bindPopup("<b>Hello world!</b><br>I am a popup.").openPopup();
// circle.bindPopup("I am a circle.");
// polygon.bindPopup("I am a polygon.");
 
     // FeatureGroup is to store editable layers

let map = L.map('map').setView([36.8, 10.2], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(map);

let drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

let drawControl = new L.Control.Draw({
    draw: {
        polyline: true,
        circle: true,
        circlemarker: false
    },
    edit: {
        featureGroup: drawnItems
    }
});
map.addControl(drawControl);

let currentGeometry = null;

map.on('draw:created', function (e) {
    drawnItems.clearLayers();
    let layer = e.layer;
    drawnItems.addLayer(layer);
    currentGeometry = layer.toGeoJSON().geometry;
    document.getElementById("saveBtn").style.display = "inline";
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
            name: customName, // <--- MAKE SURE THIS LINE IS THERE AND UNCOMMENTED
            geometry: currentGeometry 
        })
    })
    .then(res => res.json())
    .then(data => {
        alert("Saved!");
        currentGeometry = null;
        drawnItems.clearLayers();
        document.getElementById("saveBtn").style.display = "none";
        if (customNameInput) {
            customNameInput.value = '';
        }
        location.reload(); // Reload the page to reflect changes
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error saving geometry: ' + error.message); // Ensure you have the catch block for better debugging
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
    const checkboxes = document.querySelectorAll('.form-check-input:checked'); // Correctly targets the input itself
    
    if (checkboxes.length === 0) {
        alert('Please select at least one location to visualize.');
        return;
    }

    checkboxes.forEach(checkbox => {
        selectedIds.push(checkbox.value);
    });

    // Clear previous visualizations before adding new ones
    visualizedLocationsLayer.clearLayers();

    fetch('/get_locations_geojson/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken') // Ensure CSRF token is sent
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
        // Add GeoJSON features to the map
        L.geoJSON(geojson, {
            pointToLayer: function (feature, latlng) {
                // Customize point markers (e.g., using a circleMarker or custom icon)
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
                // Add a popup with location name
                if (feature.properties && feature.properties.name) {
                    layer.bindPopup(`<b>${feature.properties.name}</b><br>Type: ${feature.properties.type}`);
                }
            }
        }).addTo(visualizedLocationsLayer); // Add to the specific layer group

        // Optional: Fit map to the bounds of the newly added features
        if (visualizedLocationsLayer.getLayers().length > 0) {
            map.fitBounds(visualizedLocationsLayer.getBounds());
        }
        
        document.getElementById('clearMapBtn').style.display = 'inline'; // Show clear button
    })
    .catch(error => {
        console.error('Error visualizing locations:', error);
        alert('Failed to visualize locations: ' + error.message);
    });
});

// NEW: Logic for clearing visualized locations
document.getElementById('clearMapBtn').addEventListener('click', function() {
    visualizedLocationsLayer.clearLayers(); // Clear all layers from the visualization group
    document.getElementById('clearMapBtn').style.display = 'none'; // Hide clear button
    // Optional: Uncheck all checkboxes
    document.querySelectorAll('.form-check-input:checked').forEach(checkbox => { // Correctly targets the input itself
        checkbox.checked = false;
    });
    map.setView([36.8, 10.2], 8); // Example: Ras Jebel, Tunisia, zoom level 10

});