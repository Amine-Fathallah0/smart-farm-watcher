from django.urls import path
from . import views

urlpatterns = [
    path('', views.map_view, name='map_view'),
    path('save/', views.save_geometry, name='save_geometry'),
    path('accounts/login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('register/', views.register_view, name='register'),
    path('get_locations_geojson/', views.get_locations_geojson, name='get_locations_geojson'),

    

]