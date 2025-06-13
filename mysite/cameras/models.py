from django.db import models

# Create your models here.
class Camera(models.Model): 
    user= models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='cameras')
    name = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    location = gis_models.Point(srid=4326, blank=True, null=True) # GeoDjango Point field for map display
    rtsp_url = models.CharField(max_length=500, unique=True, help_text="RTSP URL of the camera (e.g., rtsp://user:pass@ip:port/stream)")
    stream_url = models.CharField(max_length=500, blank=True, null=True, 
                                  help_text="Generated web-friendly stream URL (e.g., HLS .m3u8). This will be managed by your streaming server.")
    is_active = models.BooleanField(default=True) # To indicate if the stream is supposed to be running
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)