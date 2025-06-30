
from django.urls import path
from . import views

app_name = 'cameras' # <--- IMPORTANT: Add app_name for namespacing

urlpatterns = [
    path('add/', views.add_camera, name='add_camera'),
    path('edit/<int:pk>/', views.edit_camera, name='edit_camera'),
    path('delete/<int:pk>/', views.delete_camera, name='delete_camera'),
    path('list/', views.list_cameras, name='list_cameras'),
    # API endpoint for JavaScript to fetch camera data
    path('api/geojson/', views.get_cameras_geojson, name='get_cameras_geojson_api'),
]