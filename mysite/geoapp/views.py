
# Create your views here.
from django.shortcuts import render, redirect
from django.http import HttpResponse

from .forms import LocationForm
from django.contrib.gis.geos import Point

from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from osgeo import ogr
from django.contrib.gis.geos import GEOSGeometry
import json
from django.contrib.auth.decorators import login_required
from django.contrib.auth import authenticate, login,logout
from .models import Location
from django.contrib.auth.models import User

@login_required
def map_view(request):
    user_locations = Location.objects.filter(user=request.user).order_by('id') # Order by latest first
    
    context = {
        'user_locations': user_locations
    }
    return render(request, 'geoapp/geo.html', context)

@login_required
@csrf_exempt
def save_geometry(request):
    if request.method == 'POST':
        user = request.user
        data = json.loads(request.body)
        
        # --- ADD THESE PRINT STATEMENTS HERE ---
        print("DEBUG: Raw data received from frontend:", data)
        
        custom_name = data.get('name', 'Unnamed Location') 
        
        print("DEBUG: Extracted custom_name:", custom_name)
        # --- END ADDED PRINT STATEMENTS ---

        geojson = json.dumps(data['geometry'])

        driver = ogr.GetDriverByName('GeoJSON')
        dataSource = driver.Open(geojson)
        layer = dataSource.GetLayer()

        for feature in layer:
            geom = feature.GetGeometryRef()
            wkt = geom.ExportToWkt()
            geometry = GEOSGeometry(wkt)
            
            if geometry.geom_type == 'Point':
                Location.objects.create(user=user, name=custom_name, point=geometry)
            elif geometry.geom_type == 'Polygon':
                Location.objects.create(user=user, name=custom_name, polygon=geometry)

        return JsonResponse({'status': 'success'})
    return JsonResponse({'status': 'error', 'message': 'Invalid request method'}, status=405)




@csrf_exempt
def login_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user) #
            return redirect('map_view')  # Redirect to your map view
        else:
            return render(request, 'registration/login.html', {'error': 'Invalid credentials'})
    return render(request, 'registration/login.html')

def logout_view(request):
    if request.method == 'POST':
        logout(request)
    return redirect('login')

def register_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password1 = request.POST.get('password1')
        password2 = request.POST.get('password2')
        if User.objects.filter(username=username).exists():
            return render(request, 'registration/register.html', {'error': 'Username already exists'})
        if password1 != password2:
            return render(request, 'registration/register.html', {'error': 'Passwords do not match'})
        user = User.objects.create_user(username=username, email=email, password=password1)
        # Optional: make sure user is active
        user.is_active = True
        user.save()
        user = authenticate(request, username=username, password=password1)
        if user is not None:
            login(request, user)
            return redirect('map_view')
        else:
            return render(request, 'registration/register.html', {'error': 'Authentication failed after registration'})
    return render(request, 'registration/register.html')


def get_locations_geojson(request):
    print("DEBUG: get_locations_geojson view accessed.")
    if not request.user.is_authenticated:
        print("DEBUG: User not authenticated for get_locations_geojson. Redirecting or returning error.")
        # This part shouldn't be reached if @login_required works, but good for debugging
        return JsonResponse({'status': 'error', 'message': 'Authentication required.'}, status=401)

    if request.method == 'POST':
        try:
            # Check content-type header for debugging
            print(f"DEBUG: Request Content-Type: {request.headers.get('Content-Type')}")

            data = json.loads(request.body)
            print(f"DEBUG: Received data for get_locations_geojson: {data}")
            selected_ids = data.get('ids', []) 
            print(f"DEBUG: Selected IDs: {selected_ids}")
            
            if not selected_ids:
                print("DEBUG: No location IDs provided.")
                return JsonResponse({'status': 'error', 'message': 'No location IDs provided.'}, status=400)
            
            locations_to_visualize = Location.objects.filter(
                user=request.user, 
                id__in=selected_ids
            )
            print(f"DEBUG: Fetched {locations_to_visualize.count()} locations from DB.")
            
            features = []
            for loc in locations_to_visualize:
                geometry_data = None
                if loc.point:
                    geometry_data = json.loads(loc.point.geojson)
                elif loc.polygon:
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
            print("DEBUG: Returning GeoJSON data.")
            return JsonResponse(geojson_data)

        except json.JSONDecodeError as e:
            print(f"DEBUG: JSONDecodeError: {e} - Raw body: {request.body.decode()}")
            return JsonResponse({'status': 'error', 'message': 'Invalid JSON in request body.'}, status=400)
        except Exception as e:
            print(f"DEBUG: General Error in get_locations_geojson: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
    
    print("DEBUG: Invalid request method for get_locations_geojson.")
    return JsonResponse({'status': 'error', 'message': 'Invalid request method.'}, status=405)
