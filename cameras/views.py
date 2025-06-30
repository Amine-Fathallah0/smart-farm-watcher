
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt # For API endpoint
import json
from django.contrib.gis.geos import Point
from .models import Camera
from .forms import CameraForm # Import your CameraForm
import logging
from asgiref.sync import sync_to_async
import httpx
# from django.contrib.auth.decorators import async_login_required
logger = logging.getLogger(__name__)
@login_required
@csrf_exempt # Add this decorator if you're sending POST via AJAX without CSRF token in header
async def add_camera(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            name = data.get('name')
            rtsp_url = data.get('rtsp_url')
            description = data.get('description', '')

            coordinates = data.get('location', {}).get('coordinates')
            if not coordinates or len(coordinates) != 2:
                return JsonResponse({'status': 'error', 'message': 'Invalid or missing location coordinates.'}, status=400)
            
            lng, lat = coordinates[0], coordinates[1]

            if not name or not rtsp_url:
                return JsonResponse({'status': 'error', 'message': 'Missing required data (name or RTSP URL).'}, status=400)

            location_point = Point(lng, lat, srid=4326)

            camera = Camera(
                user=request.user,
                name=name,
                rtsp_url=rtsp_url,
                location=location_point,
                description=description,
                is_active=True # Assume active on creation, or pass from frontend
            )
            await camera.asave() # Save the camera first to get an ID

            # Start the stream immediately after saving
            if camera.is_active:
                if not await sync_to_async(camera.start_stream)():
                    # If stream fails to start, you might want to log this or return an error
                    # But for simplicity, we'll let it proceed
                    logger.error(f"Failed to kick off FFmpeg for camera {camera.id}.")

            return JsonResponse({'status': 'success', 'message': 'Camera added successfully!', 'camera_id': camera.id})

        except json.JSONDecodeError:
            return JsonResponse({'status': 'error', 'message': 'Invalid JSON in request body.'}, status=400)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'status': 'error', 'message': f"An internal server error occurred: {str(e)}"}, status=500)
    else:
        form = CameraForm()
        return render(request, 'cameras/add_camera.html', {'form': form})

@login_required
async def edit_camera(request, pk):
    camera = await sync_to_async(get_object_or_404)(Camera, pk=pk, user=request.user)
    if request.method == 'POST':
        form = CameraForm(request.POST, instance=camera)
        if await sync_to_async(form.is_valid)():
            await sync_to_async(form.save)()
            return await sync_to_async(redirect)('cameras:list_cameras')
    else:
        form = CameraForm(instance=camera)
    return await sync_to_async(render)(request, 'cameras/edit_camera.html', {'form': form, 'camera': camera})

@login_required
async def delete_camera(request, pk):
    camera = await sync_to_async(get_object_or_404)(Camera, pk=pk, user=request.user)
    if request.method == 'POST':
        await sync_to_async(camera.delete)()
        # Implement logic to stop the associated FFmpeg stream here if using a simple setup
        return await sync_to_async(redirect)('cameras:list_cameras')
    return await sync_to_async(render)(request, 'cameras/delete_camera.html', {'camera': camera})

@login_required
async def list_cameras(request):
    cameras = await  Camera.objects.filter(user=request.user).order_by('name').aall()
    return await sync_to_async(render)(request, 'cameras/list_cameras.html', {'cameras': cameras})

# API endpoint to fetch camera GeoJSON for map display
@login_required
@csrf_exempt # Important for POST requests from JS without CSRF token in header
async def get_cameras_geojson(request):
    # This API endpoint will respond to GET requests from JavaScript.
    # If you choose to send selected IDs via POST in the future, then keep POST handling.
    # For simply fetching all active cameras for the user, GET is more RESTful.

    # Let's adjust to handle GET or POST for simplicity, if IDs are sent
    if request.method == 'GET':
        cameras = await sync_to_async(list)(Camera.objects.filter(user=request.user, is_active=True))
        selected_ids = [] # No IDs sent in GET
    elif request.method == 'POST': # For future proofing if you send specific IDs
        try:
            data = json.loads(request.body)
            selected_ids = data.get('ids', [])
            if selected_ids:
                cameras = await  Camera.objects.filter(user=request.user, is_active=True, id__in=selected_ids).aall()
            else:
                cameras = await Camera.objects.filter(user=request.user, is_active=True).aall() # All if no IDs
        except json.JSONDecodeError:
            return JsonResponse({'status': 'error', 'message': 'Invalid JSON in request body.'}, status=400)
    else:
        return JsonResponse({'status': 'error', 'message': 'Invalid request method.'}, status=405)

    features = []
    for cam in cameras:
        if cam.location:
            feature = {
                "type": "Feature",
                "geometry": json.loads(cam.location.geojson),
                "properties": {
                    "id": cam.id,
                    "name": cam.name,
                    "stream_url": cam.stream_url, # The HLS/DASH URL for playback
                    "description": cam.description,
                    "type": "Camera" 
                }
            }
            features.append(feature)

    geojson_data = {
        "type": "FeatureCollection",
        "features": features
    }
    return JsonResponse(geojson_data)