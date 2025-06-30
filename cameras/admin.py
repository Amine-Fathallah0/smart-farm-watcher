from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin
from .models import Camera
# Register your models here.

@admin.register(Camera)
class CameraAdmin(GISModelAdmin):
    list_display = ('name', 'user', 'rtsp_url', 'is_active', 'created_at')
    list_filter = ('is_active', 'user')
    search_fields = ('name', 'rtsp_url')