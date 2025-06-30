from django.shortcuts import render, redirect, get_object_or_404
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required # Keep this for async-compatible views
from django.contrib.auth import authenticate, login, logout
from django.contrib.gis.geos import Point, GEOSGeometry # Consolidated GEOSGeometry import
from osgeo import ogr # For parsing GeoJSON using OGR (note: OGR operations are synchronous)
import json

from .forms import LocationForm # Ensure this is still needed and compatible
from .models import Location
from django.contrib.auth.models import User

# !!! NEW IMPORT FOR ASYNC OPERATIONS !!!
from asgiref.sync import sync_to_async
import httpx

import logging
logger = logging.getLogger(__name__)

# Helper function to run OGR operations in an async context
# OGR operations are synchronous, so they must be wrapped.
async def _parse_ogr_sync(geojson_str):
    """
    Parses GeoJSON string using OGR and extracts GEOSGeometry.
    This function is synchronous and needs to be called via sync_to_async.
    """
    driver = ogr.GetDriverByName('GeoJSON')
    dataSource = driver.Open(geojson_str)
    if not dataSource:
        raise ValueError("Could not open GeoJSON data.")
    layer = dataSource.GetLayer()
    
    geometries = []
    for feature in layer:
        geom = feature.GetGeometryRef()
        wkt = geom.ExportToWkt()
        geometries.append(GEOSGeometry(wkt))
    return geometries


@login_required
async def map_view(request):
    # Asynchronously fetch locations
    # .filter() builds the queryset, .aall() executes it asynchronously
    user_locations = await sync_to_async(list)(Location.objects.filter(user=request.user).order_by('id'))
    
    context = {
        'user_locations': user_locations
    }
    # render() is a synchronous function, so it must be wrapped
    return await sync_to_async(render)(request, 'geoapp/geo.html', context)

@login_required
@csrf_exempt
async def save_geometry(request):
    if request.method == 'POST':
        # request.user is safe to access directly in async views
        user = request.user 
        
        try:
            data = json.loads(request.body) # json.loads is CPU-bound, no need to await
            
            logger.debug(f"Raw data received from frontend: {data}")
            
            custom_name = data.get('name', 'Unnamed Location') 
            logger.debug(f"Extracted custom_name: {custom_name}")

            # Ensure geometry data exists before proceeding
            if 'geometry' not in data:
                return JsonResponse({'status': 'error', 'message': 'Missing geometry data.'}, status=400)

            geojson_str = json.dumps(data['geometry'])

            # !!! CHANGE: OGR operations are synchronous, wrap them with sync_to_async !!!
            geometries = await _parse_ogr_sync(geojson_str)
            
            # Asynchronously create Location objects
            for geometry in geometries:
                if geometry.geom_type == 'Point':
                    await Location.objects.acreate(user=user, name=custom_name, point=geometry)
                elif geometry.geom_type == 'Polygon':
                    await Location.objects.acreate(user=user, name=custom_name, polygon=geometry)

            return JsonResponse({'status': 'success'})

        except json.JSONDecodeError as e:
            logger.error(f"JSONDecodeError: {e} - Raw body: {request.body.decode()}")
            return JsonResponse({'status': 'error', 'message': 'Invalid JSON in request body.'}, status=400)
        except ValueError as e: # Catch ValueError from _run_ogr_parse
            logger.error(f"GeoJSON Parsing Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)
        except Exception as e:
            import traceback
            traceback.print_exc() # Still useful for broad errors
            logger.error(f"General Error in save_geometry: {e}")
            return JsonResponse({'status': 'error', 'message': f"An internal server error occurred: {str(e)}"}, status=500)
    
    logger.debug("Invalid request method for save_geometry.")
    return JsonResponse({'status': 'error', 'message': 'Invalid request method'}, status=405)


@csrf_exempt # Ensure this is correct for your login form
async def login_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        # !!! CHANGE: authenticate() is synchronous, wrap it !!!
        user = await sync_to_async(authenticate)(request, username=username, password=password)
        
        if user is not None:
            # !!! CHANGE: login() is synchronous, wrap it !!!
            await sync_to_async(login)(request, user)
            # !!! CHANGE: redirect() is synchronous, wrap it !!!
            return await sync_to_async(redirect)('map_view')
        else:
            # !!! CHANGE: render() is synchronous, wrap it !!!
            return await sync_to_async(render)(request, 'registration/login.html', {'error': 'Invalid credentials'})
    # !!! CHANGE: render() is synchronous, wrap it !!!
    return await sync_to_async(render)(request, 'registration/login.html')

async def logout_view(request):
    if request.method == 'POST':
        # !!! CHANGE: logout() is synchronous, wrap it !!!
        await sync_to_async(logout)(request)
    # !!! CHANGE: redirect() is synchronous, wrap it !!!
    return await sync_to_async(redirect)('login')

async def register_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password1 = request.POST.get('password1')
        password2 = request.POST.get('password2')
        
        # !!! CHANGE: .exists() is an ORM query, use async version .aexists() !!!
        if await User.objects.filter(username=username).aexists():
            # !!! CHANGE: render() is synchronous, wrap it !!!
            return await sync_to_async(render)(request, 'registration/register.html', {'error': 'Username already exists'})
        
        if password1 != password2:
            # !!! CHANGE: render() is synchronous, wrap it !!!
            return await sync_to_async(render)(request, 'registration/register.html', {'error': 'Passwords do not match'})
        
        # !!! CHANGE: create_user is a synchronous manager method, wrap it !!!
        user = await sync_to_async(User.objects.create_user)(username=username, email=email, password=password1)
        
        # Optional: make sure user is active (already synchronous in model method, but calling it needs attention if called from async)
        user.is_active = True
        # !!! CHANGE: user.save() is synchronous for model instances, use asave() !!!
        await user.asave()
        
        # !!! CHANGE: authenticate() is synchronous, wrap it !!!
        user = await sync_to_async(authenticate)(request, username=username, password=password1)
        
        if user is not None:
            # !!! CHANGE: login() is synchronous, wrap it !!!
            await sync_to_async(login)(request, user)
            # !!! CHANGE: redirect() is synchronous, wrap it !!!
            return await sync_to_async(redirect)('map_view')
        else:
            # !!! CHANGE: render() is synchronous, wrap it !!!
            return await sync_to_async(render)(request, 'registration/register.html', {'error': 'Authentication failed after registration'})
    
    # !!! CHANGE: render() is synchronous, wrap it !!!
    return await sync_to_async(render)(request, 'registration/register.html')

@login_required
async def get_locations_geojson(request):
    logger.debug("get_locations_geojson view accessed.")
    
    # No need for this check; @login_required handles it
    # if not request.user.is_authenticated:
    #     logger.debug("User not authenticated for get_locations_geojson. Redirecting or returning error.")
    #     return JsonResponse({'status': 'error', 'message': 'Authentication required.'}, status=401)

    if request.method == 'POST':
        try:
            logger.debug(f"Request Content-Type: {request.headers.get('Content-Type')}")

            data = json.loads(request.body) # CPU-bound, no need to await
            logger.debug(f"Received data for get_locations_geojson: {data}")
            selected_ids = data.get('ids', []) 
            logger.debug(f"Selected IDs: {selected_ids}")
            
            if not selected_ids:
                logger.debug("No location IDs provided.")
                return JsonResponse({'status': 'error', 'message': 'No location IDs provided.'}, status=400)
            
            # !!! CHANGE: .filter() and .aall() for async query !!!
            locations_to_visualize = await sync_to_async(list)(
                Location.objects.filter(user=request.user, id__in=selected_ids)
            )
            logger.debug(f"Fetched {len(locations_to_visualize)} locations from DB.") # Use len() instead of .count() after .aall()

            features = []
            for loc in locations_to_visualize:
                geometry_data = None
                if loc.point:
                    # json.loads() is CPU-bound, no need to await
                    geometry_data = json.loads(loc.point.geojson)
                elif loc.polygon:
                    # json.loads() is CPU-bound, no need to await
                    geometry_data = json.loads(loc.polygon.geojson)
                
                if geometry_data:
                    feature = {
                        "type": "Feature",
                        "geometry": geometry_data,
                        "properties": {
                            "id": loc.id,
                            "name": loc.name,
                            "type": loc.point.geom_type if loc.point else loc.polygon.geom_type
                        }
                    }
                    features.append(feature)
            
            geojson_data = {
                "type": "FeatureCollection",
                "features": features
            }
            logger.debug("Returning GeoJSON data.")
            return JsonResponse(geojson_data)

        except json.JSONDecodeError as e:
            logger.error(f"JSONDecodeError: {e} - Raw body: {request.body.decode()}")
            return JsonResponse({'status': 'error', 'message': 'Invalid JSON in request body.'}, status=400)
        except Exception as e:
            logger.error(f"General Error in get_locations_geojson: {e}")
            import traceback
            traceback.print_exc()
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
    
    logger.debug("Invalid request method for get_locations_geojson.")
    return JsonResponse({'status': 'error', 'message': 'Invalid request method.'}, status=405)