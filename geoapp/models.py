from django.db import models
from django.contrib.auth.models import User
from django.contrib.gis.db import models as geomodels
import httpx
from asgiref.sync import sync_to_async

class Location(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)  # NEW
    name = models.CharField(max_length=100)
    point = geomodels.PointField(null=True, blank=True)
    polygon = geomodels.PolygonField(null=True, blank=True)

    def __str__(self):
        return f"{self.name} ({self.user.username})"
