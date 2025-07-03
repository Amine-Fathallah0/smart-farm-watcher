# cameras/routing.py

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'cameras/$', consumers.CameraConsumer.as_asgi()),
]
